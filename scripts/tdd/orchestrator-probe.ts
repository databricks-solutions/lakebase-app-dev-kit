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
import { driverPhaseForTdd, type StoryArtifactProbe, type DriveContext } from "./orchestrator-derive.js";
import { readGates } from "./gates.js";
import { storyDeployVerified } from "./deploy.js";

function storyDir(tddDir: string, featureId: string, story: string): string {
  return path.join(tddDir, "features", featureId, "stories", story);
}

/** The AC ids a story has, read from disk (the source of truth): the union of
 *  story.json `acs` (a string-id list, or objects with an `id`) AND the
 *  `acs/<AC>.json` files on disk. The Spec Author writes acs/<AC>.{md,json} but
 *  does not always backfill story.json `acs`; relying on the pointer alone left
 *  a drafted story looking un-drafted, so the driver stalled re-issuing the same
 *  invoke-role. Empty when neither source has anything. */
function storyAcIds(tddDir: string, featureId: string, story: string): string[] {
  const dir = storyDir(tddDir, featureId, story);
  const ids = new Set<string>();

  // 1. story.json `acs` (id list or {id} objects), when present + well-formed.
  const file = path.join(dir, "story.json");
  if (fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8")) as { acs?: unknown };
      if (Array.isArray(data.acs)) {
        for (const a of data.acs) {
          const id = typeof a === "string" ? a : (a as { id?: string })?.id;
          if (typeof id === "string" && id.length > 0) ids.add(id);
        }
      }
    } catch {
      /* fall through to the on-disk acs/ files */
    }
  }

  // 2. acs/<AC>.json files actually on disk (authoritative: the Spec Author
  //    wrote them whether or not story.json was updated).
  const acsDir = path.join(dir, "acs");
  if (fs.existsSync(acsDir)) {
    try {
      for (const f of fs.readdirSync(acsDir)) {
        const m = /^(.+)\.json$/.exec(f);
        if (m) ids.add(m[1]);
      }
    } catch {
      /* ignore an unreadable acs/ dir */
    }
  }

  return [...ids];
}

/** Every recorded cycle artifact for a story, across all of its ACs. */
function storyCycles(tddDir: string, featureId: string, story: string): CycleArtifact[] {
  const base = path.join(tddDir, "cycles", featureId, story);
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
  const ws = readJson(path.join(tddDir, "workflow-state.json"));
  const tddPhase = typeof ws?.phase === "string" ? (ws.phase as string) : "feature";

  const featureDir = path.join(tddDir, "features", featureId);
  const spec = readJson(path.join(featureDir, "feature-spec.json"));
  const proposed = spec !== undefined;
  const breakdownDone = Array.isArray(spec?.stories) && (spec!.stories as unknown[]).length > 0;
  const requestsAuthored = fs.existsSync(path.join(featureDir, "feature-request.md"));

  // Deploy is "done" once the Release Engineer produced deploy-evidence.json
  // (the deploy actually ran). The deploy gate's approval is read strictly via
  // readGates (the authoritative gate model), tolerant of a missing/legacy file.
  const deployed = fs.existsSync(path.join(featureDir, "deploy-evidence.json"));
  let gateApproved = false;
  try {
    gateApproved = readGates(featureId, { tddDir }).gates.deploy.status === "approved";
  } catch {
    gateApproved = false;
  }

  return {
    phase: driverPhaseForTdd(tddPhase),
    breakdownDone,
    planning: { proposed, requestsAuthored },
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
      const file = path.join(storyDir(tddDir, featureId, story), "test-list.json");
      if (!fs.existsSync(file)) return false;
      try {
        const data = JSON.parse(fs.readFileSync(file, "utf8")) as { tests?: unknown };
        // Present + at least one test entry. A bare {} is not "ready".
        return Array.isArray(data.tests) ? data.tests.length > 0 : true;
      } catch {
        return false;
      }
    },

    testsWritten(story) {
      return storyCycles(tddDir, featureId, story).some((c) => Boolean(c.red_at));
    },

    codeWritten(story) {
      const reds = storyCycles(tddDir, featureId, story).filter((c) => Boolean(c.red_at));
      // Every RED test the Navigator wrote has been turned GREEN by the Driver.
      return reds.length > 0 && reds.every((c) => Boolean(c.green_at));
    },

    storyDeployVerified(story) {
      return storyDeployVerified(tddDir, featureId, story);
    },
  };
}
