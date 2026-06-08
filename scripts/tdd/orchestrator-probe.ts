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
import { storyTestProgress } from "./cycle-record.js";
import { driverPhaseForTdd, type StoryArtifactProbe, type DriveContext } from "./orchestrator-derive.js";
import { readGates } from "./gates.js";
import { storyDeployVerified } from "./deploy.js";
import {
  cyclesRootDir,
  workflowStateJson,
  featureSpecJson,
  featureDeployEvidenceJson,
  featureRequestMd,
  hasEstimates,
  storyAcIds,
  storyTestListJson,
} from "./tdd-paths.js";

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
export function readDriveContext(tddDir: string, featureId: string): DriveContext {
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
  let gateApproved = false;
  try {
    gateApproved = readGates(featureId, { tddDir }).gates.deploy.status === "approved";
  } catch {
    gateApproved = false;
  }

  return {
    phase: driverPhaseForTdd(tddPhase),
    breakdownDone,
    planning: { proposed, estimated: hasEstimates(tddDir), requestsAuthored },
    deploy: { deployed, gateApproved },
  };
}

/** Construct a probe bound to a project's .tdd dir + feature. */
export function diskArtifactProbe(tddDir: string, featureId: string): StoryArtifactProbe {
  return {
    hasAcs(story) {
      return storyAcIds(tddDir, featureId, story).length > 0;
    },

    architectAnnotated(story) {
      const acs = storyAcIds(tddDir, featureId, story);
      // Annotated only once EVERY AC has a layer (API|E2E|Infra). No ACs yet
      // means the Architect has nothing to annotate -> not annotated.
      return acs.length > 0 && acs.every((ac) => readAcLayer(tddDir, featureId, ac) !== undefined);
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
    // with the rest of the list unbuilt (the live FEIP-7422 stall).
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

    storyDeployVerified(story) {
      return storyDeployVerified(tddDir, featureId, story);
    },
  };
}
