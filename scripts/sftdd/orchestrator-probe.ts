// The real StoryArtifactProbe (deterministic-driver phase 3b): read the
// per-story design + build facts that live as on-disk artifacts, not in
// pipeline.json, so deriveDriveState can build an accurate DriveState.
//
// Aligned to the substrate's OWN readers/writers so it is self-consistent with
// what the driver's role effects produce:
//   - ACs:        stories/<S>/story.json `acs` (id list, or acs/<AC>.json files)
//   - layers:     stories/<S>/acs/<AC>.json `layer` (via run-cycle's readAcLayer)
//   - test list:  stories/<S>/test-list.json
//   - RED/GREEN:  cycles/<feature>/<S>/<AC>/cycle-NNN.json `red_at`/`green_at`

import * as fs from "node:fs";
import * as path from "node:path";

import { readAcLayer, type CycleArtifact } from "./run-cycle.js";
import { storyTestProgress, firstReviewPendingAc, firstRefactorPendingAc } from "./cycle-record.js";
import { needsGreenAssess, hasPendingRegressionFix } from "./supersession.js";
import { driverPhaseForTdd, type StoryArtifactProbe, type DriveContext } from "./orchestrator-derive.js";
import type { DriveEscalation } from "./orchestrator-drive.js";
import { readGates } from "./gates.js";
import { storyDeployVerified } from "./deploy.js";
import { readWorkflowState, SCM_STATES } from "../lakebase/scm-workflow-state.js";
import { firstPendingEscalation } from "./escalation.js";
import { specLevelSmell, priorReviseCount, isBuildRefactorRoutableSmell } from "./smells.js";
import {
  cyclesRootDir,
  workflowStateJson,
  featureSpecJson,
  featureDeployEvidenceJson,
  featureRequestMd,
  hasEstimates,
  storyAcIds,
  storyTestListJson,
  readAcArchitecturalNotes,
  architectureJson,
} from "./sftdd-paths.js";

/** Every recorded cycle artifact for a story, across all of its ACs. */
function storyCycles(tddDir: string, featureId: string, story: string): CycleArtifact[] {
  const base = path.join(cyclesRootDir(tddDir), featureId, story);
  if (!fs.existsSync(base)) return [];
  const out: CycleArtifact[] = [];
  for (const acDir of fs.readdirSync(base)) {
    const dir = path.join(base, acDir);
    let isDir = false;
    try {
      isDir = fs.statSync(dir).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!/^cycle-\d+\.json$/.test(f)) continue;
      try {
        out.push(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as CycleArtifact);
      } catch {
        /* skip a malformed cycle */
      }
    }
  }
  return out;
}

function readJson(file: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Read the coarse driver context (phase + planning/deploy sub-flags +
 * breakdownDone) from the project's persisted state:
 *   - phase            <- workflow-state.json `phase`, mapped via driverPhaseForTdd
 *   - breakdownDone    <- feature-spec.json has a non-empty `stories`
 *   - planning.proposed         <- feature-spec.json exists (Spec Author proposed)
 *   - planning.requestsAuthored <- feature-request.md exists (PO authored)
 *   - deploy.deployed / gateApproved <- gates.json `deploy` gate (present / approved)
 *
 * Best-effort + tolerant: a missing/malformed file yields the conservative
 * (not-yet-done) reading, so the driver re-derives a safe DriveState.
 */
export function readDriveContext(tddDir: string, featureId: string, projectDir?: string): DriveContext {
  const ws = readJson(workflowStateJson(tddDir));
  const tddPhase = typeof ws?.phase === "string" ? (ws.phase as string) : "feature";

  const spec = readJson(featureSpecJson(tddDir, featureId));
  const proposed = spec !== undefined;
  const breakdownDone = Array.isArray(spec?.stories) && (spec!.stories as unknown[]).length > 0;
  const requestsAuthored = fs.existsSync(featureRequestMd(tddDir, featureId));

  // Deploy is "done" once the Release Engineer produced deploy-evidence.json
  // (the deploy actually ran). The deploy gate's approval is read strictly via
  // readGates (the authoritative gate model), tolerant of a missing/legacy file.
  const deployed = fs.existsSync(featureDeployEvidenceJson(tddDir, featureId));
  const gateApproved = readGateApproved(featureId, tddDir, "deploy");

  // Promote: the SCM workflow-state (.lakebase/workflow-state.json, project root)
  // is the source of truth for prepare-pr / wait-ci / merge (the SCM ladder
  // feature-claimed -> pr-ready -> ci-green -> merged). The `promote` HITL gate
  // (the PR acceptance, BEFORE the merge) lives in the TDD gate model. projectDir
  // defaults to the parent of .tdd.
  const proj = projectDir ?? path.dirname(tddDir);
  let scmState: string | undefined;
  try {
    scmState = readWorkflowState(proj)?.state;
  } catch {
    scmState = undefined;
  }
  const atOrPast = (target: string): boolean => {
    if (!scmState) return false;
    const i = (SCM_STATES as readonly string[]).indexOf(scmState);
    const t = (SCM_STATES as readonly string[]).indexOf(target);
    return i >= 0 && t >= 0 && i >= t;
  };
  const promote = {
    prReady: atOrPast("pr-ready"),
    ciGreen: atOrPast("ci-green"),
    prApproved: readGateApproved(featureId, tddDir, "promote"),
    merged: scmState === "merged",
  };

  return {
    phase: driverPhaseForTdd(tddPhase),
    breakdownDone,
    planning: { proposed, estimated: hasEstimates(tddDir), requestsAuthored },
    deploy: { deployed, gateApproved },
    promote,
  };
}

/** Read one gate's approved-ness from the authoritative gate model, tolerant of
 *  a missing/legacy gates.json (conservative false). */
function readGateApproved(featureId: string, tddDir: string, gate: "deploy" | "promote"): boolean {
  try {
    return readGates(featureId, { tddDir }).gates[gate].status === "approved";
  } catch {
    return false;
  }
}

/** Construct a probe bound to a project's .tdd dir + feature. `buildActive` (the
 *  pipeline's currently-building story) is the fallback story scope for a
 *  smell-derived escalation that did not carry one, so revise-routing knows which
 *  story to send back (FEIP-7626). */
export function diskArtifactProbe(
  tddDir: string,
  featureId: string,
  buildActive?: string | null,
): StoryArtifactProbe {
  return {
    hasAcs(story) {
      return storyAcIds(tddDir, featureId, story).length > 0;
    },

    architectAnnotated(story) {
      const acs = storyAcIds(tddDir, featureId, story);
      if (acs.length === 0) return false; // no ACs yet -> nothing to annotate
      // The Architect is "done" with a story only once its DISTINCTIVE outputs
      // are on disk, NOT merely the AC `layer`. `layer` is a REQUIRED ac.schema
      // field the SPEC-AUTHOR fills, so keying on it made architectAnnotated true
      // the moment the spec-author wrote the ACs -> the architect-reviewer was
      // ALWAYS skipped (no architecture.json, no architectural_notes, and the
      // layering/NFR/service_backed gate checks had nothing to validate). Key on
      // the architect's own products: architectural_notes on every AC + the
      // feature architecture.json (service_backed + layers + nfrs).
      const everyAcNoted = acs.every((ac) => readAcArchitecturalNotes(tddDir, featureId, ac) !== undefined);
      return everyAcNoted && fs.existsSync(architectureJson(tddDir, featureId));
    },

    testListReady(story) {
      // Read the SAME canonical per-story file the Test Strategist's writer
      // produces (storyTestListJson), and check its real field: a StoryTestList
      // is { feature_id, story_id, ordered_for?, items[] }. Ready == at least
      // one scoped test item. Path + field both come from the single source of
      // truth so producer + probe cannot drift (the old code read a different
      // file name AND a non-existent `tests` field, so it never saw the list).
      const file = storyTestListJson(tddDir, featureId, story);
      if (!fs.existsSync(file)) return false;
      try {
        const data = JSON.parse(fs.readFileSync(file, "utf8")) as { items?: unknown };
        return Array.isArray(data.items) && data.items.length > 0;
      } catch {
        return false;
      }
    },

    // The build loop is TEST-LIST-DRIVEN: the Navigator/Driver hand off ONE test
    // at a time (write RED -> make GREEN) until EVERY test-list item is green.
    // `testsWritten` = "the Navigator has nothing to write right now" (a RED
    // already awaits the Driver, OR all tests are green); `codeWritten` = "every
    // test-list item has a GREEN cycle". With nextBuildAction's order
    // (!testsWritten -> navigator; !codeWritten -> driver) this yields the
    // interleaved per-test handoff: RED T1 -> GREEN T1 -> RED T2 -> ... Without
    // it the loop advanced after a single test and stalled at await-acceptance
    // with the rest of the list unbuilt (the live stall).
    testsWritten(story) {
      const p = storyTestProgress(tddDir, featureId, story);
      if (p.total === 0) {
        // Legacy / pre-test-list fallback: any RED counts as "tests written".
        return storyCycles(tddDir, featureId, story).some((c) => Boolean(c.red_at));
      }
      return p.openRed.length > 0 || p.allGreen;
    },

    codeWritten(story) {
      const p = storyTestProgress(tddDir, featureId, story);
      if (p.total === 0) {
        const reds = storyCycles(tddDir, featureId, story).filter((c) => Boolean(c.red_at));
        return reds.length > 0 && reds.every((c) => Boolean(c.green_at));
      }
      return p.allGreen;
    },

    reviewPendingAc(story) {
      return firstReviewPendingAc(tddDir, featureId, story);
    },

    refactorPendingAc(story) {
      return firstRefactorPendingAc(tddDir, featureId, story);
    },

    assessGreenFailureAc(story) {
      // The open RED cycle's AC, when its GREEN verify failed + has NOT yet been
      // assessed by the Navigator (a green-failure marker with assessed:false).
      let acId: string | undefined;
      try {
        acId = storyTestProgress(tddDir, featureId, story).openRed[0]?.ac_id;
      } catch {
        acId = undefined;
      }
      if (!acId) return null;
      return needsGreenAssess(tddDir, featureId, story, acId) ? acId : null;
    },

    repairRegressionFixAc(story) {
      // The open RED cycle's AC, when the Navigator assessed its green-failure as
      // a DRIVER-FIXABLE regression (recorded a fix directive) and the one repair
      // attempt has not been consumed. Routes a bounded Driver repair turn.
      let acId: string | undefined;
      try {
        acId = storyTestProgress(tddDir, featureId, story).openRed[0]?.ac_id;
      } catch {
        acId = undefined;
      }
      if (!acId) return null;
      return hasPendingRegressionFix(tddDir, featureId, story, acId) ? acId : null;
    },

    storyDeployVerified(story) {
      return storyDeployVerified(tddDir, featureId, story);
    },

    pendingEscalation(): DriveEscalation | null {
      const e = firstPendingEscalation(tddDir, featureId);
      if (!e) return null;
      const base: DriveEscalation = {
        id: e.id,
        source: e.source,
        reason: e.reason,
        ...(e.story_id ? { story_id: e.story_id } : {}),
      };
      // FEIP-7626 revise-routing: a smell-derived escalation (`smell:<name>`) for
      // a SPEC-level smell is recoverable IF a story scope is known (the smell's
      // own, else the active build story) AND the one-revise-per-(smell,story)
      // budget is not yet spent. Explicit escalation files + build-level smells
      // are never routable -> they keep the terminal raise-to-hil halt.
      if (e.source.startsWith("smell:")) {
        const name = e.source.slice("smell:".length);
        const story = e.story_id ?? buildActive ?? undefined;
        // Build-level self-heal: a refactor-fixable build smell (layering-violation,
        // ux-adherence, import-time-build-coupling) whose owning AC ALREADY has a
        // refactor pending is NOT a terminal halt , the Driver's refactor turn is
        // the remediation the Navigator's REVIEW just prescribed. Suppress the
        // escalation so the build dispatches that refactor instead of raising to
        // HIL. refactorAc preserves behavior + resolves the smell; if the refactor
        // never lands, the smell re-surfaces with no refactor pending and halts.
        if (isBuildRefactorRoutableSmell(name) && story && firstRefactorPendingAc(tddDir, featureId, story)) {
          return null;
        }
        const spec = specLevelSmell(name);
        if (spec && story && priorReviseCount(tddDir, name, story) < 1) {
          base.routable = { story, owning_role: spec.owning_role, gate: spec.gate_to_rerun };
        }
      }
      return base;
    },
  };
}
