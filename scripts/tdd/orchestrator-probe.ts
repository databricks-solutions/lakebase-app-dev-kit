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

function storyDir(tddDir: string, featureId: string, story: string): string {
  return path.join(tddDir, "features", featureId, "stories", story);
}

/** The AC ids a story declares (story.json `acs`: a string-id list, or objects
 *  with an `id`). Empty when the story file is absent or malformed. */
function storyAcIds(tddDir: string, featureId: string, story: string): string[] {
  const file = path.join(storyDir(tddDir, featureId, story), "story.json");
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as { acs?: unknown };
    if (!Array.isArray(data.acs)) return [];
    return data.acs
      .map((a) => (typeof a === "string" ? a : (a as { id?: string })?.id))
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
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
  };
}
