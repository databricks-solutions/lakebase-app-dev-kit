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

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { storyTestListJson, cyclesRootDir } from "./tdd-paths.js";
import { markTestItemGreen } from "./test-list.js";
import { listExperiments } from "./experiment.js";
import {
  beginCycle,
  recordRunnerOutcome,
  markGreen,
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

/**
 * Every cycle artifact for the story, scanned straight off disk
 * (cycles/<F>/<S>/<AC>/cycle-NNN.json across ALL ACs). Scanning the dir, not
 * iterating a test-list's ac_ids, means progress is correct even before / apart
 * from the test-list (and matches the probe's own scan).
 */
export function storyCycles(tddDir: string, featureId: string, story: string): CycleArtifact[] {
  const base = join(cyclesRootDir(tddDir), featureId, story);
  if (!existsSync(base)) return [];
  const out: CycleArtifact[] = [];
  for (const acDir of readdirSync(base)) {
    const dir = join(base, acDir);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const f of readdirSync(dir)) {
      if (!/^cycle-\d+\.json$/.test(f)) continue;
      try {
        out.push(JSON.parse(readFileSync(join(dir, f), "utf8")) as CycleArtifact);
      } catch {
        /* skip a malformed cycle */
      }
    }
  }
  return out;
}

export interface StoryTestProgress {
  /** Test-list item count (0 if no per-story list yet). */
  total: number;
  /** Test-list items with NO cycle yet (the Navigator's queue). */
  pending: StoryTestItem[];
  /** Cycles that are RED (red_at) but not yet GREEN (green_at) , the Driver's queue. */
  openRed: CycleArtifact[];
  /** Every test-list item has a GREEN cycle (and there is at least one item). */
  allGreen: boolean;
}

/**
 * The story's build progress against its test-list: what the Navigator still
 * owes (pending), what the Driver still owes (openRed), and whether the whole
 * list is green. The SINGLE source the build loop reads, so the orchestration's
 * "navigator vs driver vs done" decision and the cycle CLI's "which test next"
 * can never drift. Tolerant of a missing test-list (returns total:0).
 */
export function storyTestProgress(tddDir: string, featureId: string, story: string): StoryTestProgress {
  let items: StoryTestItem[] = [];
  try {
    items = readStoryItems(tddDir, featureId, story);
  } catch {
    items = [];
  }
  const cycles = storyCycles(tddDir, featureId, story);
  const cycledTestIds = new Set(cycles.map((c) => c.test_id));
  const greenTestIds = new Set(cycles.filter((c) => c.green_at).map((c) => c.test_id));
  const pending = items.filter((i) => !cycledTestIds.has(i.id));
  const openRed = cycles.filter((c) => c.red_at && !c.green_at);
  const allGreen = items.length > 0 && items.every((i) => greenTestIds.has(i.id));
  return { total: items.length, pending, openRed, allGreen };
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
  const pending = storyTestProgress(tddDir, featureId, story).pending[0];
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
  const open = storyTestProgress(tddDir, featureId, story).openRed
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
  // Propagate green to the artifacts the acceptance/deploy consumers read: the
  // test-list item (master + per-story) and the AC (-> passing when all its
  // tests are green). Without this the cycle is green but the Release Engineer
  // sees the test-list item still `pending` + the AC `draft` and refuses to
  // deploy (the await-acceptance stall). Best-effort: never fail a green here.
  try {
    markTestItemGreen(tddDir, featureId, story, open.test_id);
  } catch {
    /* status propagation is observability for downstream consumers, not a gate */
  }
  return { recorded: true, cycleId: open.cycle_id, testId: open.test_id };
}
