// Cycle recording is an ORCHESTRATION concern, not a role concern.
//
// The Navigator and Driver are pure: the Navigator writes the next failing
// test, the Driver writes the production code and runs the project's test
// command (uv run pytest / npm test / ./mvnw test, per the AC layer, against
// the experiment branch's .env-pointed DB). NEITHER touches git, the cycle
// artifacts, or the runner-outcome bookkeeping. The deterministic driver calls
// the two functions here (via the lakebase-tdd-cycle CLI) to RECORD the cycle:
//
//   beginNextPendingCycle , after the Navigator: stamp a RED cycle (red_at +
//     layer) for the first test-list item that has no cycle yet.
//   greenOpenCycle , after the Driver: record the runner outcome + stamp GREEN
//     on the open RED cycle. Per the "driver runs, orchestration records"
//     contract, the run already happened in the Driver's loop; this records it.
//
// Both read the SAME per-story test-list (storyTestListJson) + cycle artifacts
// the probe reads, so producer (orchestration) and consumer (probe) cannot
// drift , the bug that stalled the live smoke (the Navigator hand-wrote a
// cycle with `status:"red"` instead of the `red_at` the probe reads).

import { existsSync, readFileSync } from "fs";
import { storyTestListJson } from "./tdd-paths.js";
import { listExperiments } from "./experiment.js";
import {
  beginCycle,
  recordRunnerOutcome,
  markGreen,
  listCycles,
  type CycleArtifact,
  type CycleScope,
} from "./run-cycle.js";

interface StoryTestItem {
  id: string;
  description: string;
  ac_id: string;
  status?: string;
}

function readStoryItems(tddDir: string, featureId: string, story: string): StoryTestItem[] {
  const file = storyTestListJson(tddDir, featureId, story);
  if (!existsSync(file)) {
    throw new Error(`per-story test-list not found for ${featureId}/${story} at ${file}`);
  }
  const data = JSON.parse(readFileSync(file, "utf8")) as { items?: StoryTestItem[] };
  return Array.isArray(data.items) ? data.items : [];
}

/** The story's recorded experiment (slug + branch), so cycles tie to its DB. */
function storyExperiment(tddDir: string, featureId: string, story: string): { slug?: string; branch?: string } {
  const exps = listExperiments(tddDir, featureId, story);
  const e = exps[0];
  return { slug: e?.experiment_slug, branch: e?.branch_id };
}

/** Every cycle artifact for the story, across all of its ACs. */
function storyCycles(tddDir: string, featureId: string, story: string, acIds: string[]): CycleArtifact[] {
  const out: CycleArtifact[] = [];
  for (const ac of new Set(acIds)) {
    out.push(...listCycles({ tddDir, feature_id: featureId, story_id: story, ac_id: ac }));
  }
  return out;
}

export interface CycleRecordArgs {
  tddDir: string;
  featureId: string;
  story: string;
}

export interface BeginResult {
  recorded: boolean;
  cycleId?: string;
  testId?: string;
  acId?: string;
}

/**
 * Stamp a RED cycle for the first test-list item that has no cycle yet (the
 * test the Navigator was just asked to write). Layer is auto-derived from the
 * AC file by beginCycle. Returns recorded:false when every item already has a
 * cycle (nothing pending).
 */
export function beginNextPendingCycle(args: CycleRecordArgs): BeginResult {
  const { tddDir, featureId, story } = args;
  const items = readStoryItems(tddDir, featureId, story);
  const cycles = storyCycles(tddDir, featureId, story, items.map((i) => i.ac_id));
  const cycled = new Set(cycles.map((c) => c.test_id));
  const pending = items.find((i) => !cycled.has(i.id));
  if (!pending) return { recorded: false };

  const exp = storyExperiment(tddDir, featureId, story);
  const art = beginCycle({
    tddDir,
    feature_id: featureId,
    story_id: story,
    ac_id: pending.ac_id,
    test_id: pending.id,
    test_description: pending.description,
    experiment_slug: exp.slug,
    branch_id: exp.branch,
  });
  return { recorded: true, cycleId: art.cycle_id, testId: pending.id, acId: pending.ac_id };
}

export interface GreenResult {
  recorded: boolean;
  cycleId?: string;
  testId?: string;
}

/**
 * Record the runner outcome + stamp GREEN on the story's open RED cycle (red_at
 * set, green_at not). Per the "driver runs, orchestration records" contract the
 * Driver already ran the project's test command in its loop; this records that
 * run (recordRunnerOutcome unlocks markGreen's FEIP-7094 runner contract for
 * layer-tagged cycles) and marks the cycle green. Throws when there is no open
 * RED cycle (the Driver was dispatched with nothing to green , a real defect).
 */
export function greenOpenCycle(args: CycleRecordArgs & { driverChanges?: string }): GreenResult {
  const { tddDir, featureId, story } = args;
  const items = readStoryItems(tddDir, featureId, story);
  const cycles = storyCycles(tddDir, featureId, story, items.map((i) => i.ac_id));
  const open = cycles
    .filter((c) => c.red_at && !c.green_at)
    .sort((a, b) => (a.red_at! < b.red_at! ? 1 : -1))[0];
  if (!open) {
    throw new Error(`no open RED cycle for ${featureId}/${story}; nothing to mark GREEN`);
  }
  const scope: CycleScope = {
    tddDir,
    feature_id: featureId,
    story_id: story,
    ac_id: open.ac_id,
    experiment_slug: open.experiment_slug,
    branch_id: open.branch_id,
  };
  if (open.layer && open.experiment_slug) {
    recordRunnerOutcome({ scope, cycleId: open.cycle_id, experimentSlug: open.experiment_slug, passed: true });
  }
  markGreen(scope, open.cycle_id, args.driverChanges);
  return { recorded: true, cycleId: open.cycle_id, testId: open.test_id };
}
