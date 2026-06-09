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

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { storyTestListJson, cyclesRootDir, acReviewJson, acReviewVerdictJson } from "./tdd-paths.js";
import { markTestItemGreen } from "./test-list.js";
import { listExperiments } from "./experiment.js";
import { ensureDeployedAndVerify } from "./deploy.js";
import { writeEscalation, type Escalation } from "./escalation.js";
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
  /** Set when the honest GREEN verify FAILED: the cycle stays RED + an escalation
   *  was raised to the HIL (the orchestration will route to raise-to-hil). */
  escalated?: boolean;
  escalation?: Escalation;
  /** The GREEN verify summary (pass or the failure reason). */
  summary?: string;
}

/** Confirm a cycle is genuinely GREEN: returns true only when the project's
 *  verify suite passes against the running app. Injected in tests; the default
 *  is the real deploy-during-build verifier. */
export type GreenVerifier = (args: {
  projectDir: string;
  tddDir: string;
  featureId: string;
  story: string;
  branchId?: string;
}) => Promise<{ passed: boolean; summary: string }>;

const defaultGreenVerifier: GreenVerifier = async ({ projectDir, branchId }) => {
  const r = await ensureDeployedAndVerify({ projectDir, lakebaseBranch: branchId });
  return { passed: r.passed, summary: r.summary };
};

/**
 * Record the runner outcome + stamp GREEN on the story's open RED cycle (red_at
 * set, green_at not). Per the "driver runs, orchestration records" contract the
 * Driver already ran the project's test command in its loop; this records that
 * run (recordRunnerOutcome unlocks markGreen's runner contract for
 * layer-tagged cycles) and marks the cycle green. Throws when there is no open
 * RED cycle (the Driver was dispatched with nothing to green , a real defect).
 */
export async function greenOpenCycle(
  args: CycleRecordArgs & { driverChanges?: string; verify?: GreenVerifier },
): Promise<GreenResult> {
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
  // HONEST GREEN (follow-up): run the project's verify suite against
  // the running app and record the REAL outcome. The old code hardcoded
  // passed:true , which faked the runner contract and shipped a
  // false-green (a test that broke a sibling test was stamped green). A failure
  // here leaves the cycle RED and raises an escalation to the HIL; the
  // orchestration then routes to raise-to-hil rather than advancing.
  const verify = args.verify ?? defaultGreenVerifier;
  const result = await verify({ projectDir: dirname(tddDir), tddDir, featureId, story, branchId: open.branch_id });
  if (open.layer && open.experiment_slug) {
    recordRunnerOutcome({ scope, cycleId: open.cycle_id, experimentSlug: open.experiment_slug, passed: result.passed });
  }
  if (!result.passed) {
    const escalation = writeEscalation(tddDir, {
      source: "driver-green",
      reason: `GREEN verify failed for ${open.test_id} (${open.ac_id}) in ${featureId}/${story}: ${result.summary}`,
      feature_id: featureId,
      story_id: story,
      ac_id: open.ac_id,
    });
    return { recorded: false, cycleId: open.cycle_id, testId: open.test_id, escalated: true, escalation, summary: result.summary };
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
  return { recorded: true, cycleId: open.cycle_id, testId: open.test_id, summary: result.summary };
}

// ─── Per-AC REVIEW / REFACTOR (driver-navigator-tdd handoff) ───────
//
// Once an AC's tests are all GREEN, the Navigator REVIEWs the AC's diff against
// the architecture + design guide and the Driver REFACTORs on request , the
// per-slice handoff from /driver-navigator-tdd, at AC grain. The review verdict
// is the Navigator's output (review-verdict.json: { refactor, notes }); the
// orchestration records the transition (review.json: reviewed_at /
// refactor_requested / refactored_at) , same producer/consumer split as the
// RED/GREEN recording. Both roles read architecture.md + design-guide.md.

export interface AcReviewState {
  acId: string;
  /** Every test-list item for this AC has a green cycle (AC ready to REVIEW). */
  allTestsGreen: boolean;
  /** review.json has reviewed_at (the Navigator REVIEWed this AC). */
  reviewed: boolean;
  /** The REVIEW requested a refactor. */
  refactorRequested: boolean;
  /** review.json has refactored_at (the Driver completed the refactor). */
  refactored: boolean;
}

interface ReviewRecord {
  reviewed_at?: string;
  refactor_requested?: boolean;
  refactor_notes?: string;
  refactored_at?: string;
}

function readReview(tddDir: string, featureId: string, story: string, acId: string): ReviewRecord {
  const f = acReviewJson(tddDir, featureId, story, acId);
  if (!existsSync(f)) return {};
  try {
    return JSON.parse(readFileSync(f, "utf8")) as ReviewRecord;
  } catch {
    return {};
  }
}

/** Per-AC review state, in test-list AC order (first occurrence of each ac_id). */
export function acReviewStates(tddDir: string, featureId: string, story: string): AcReviewState[] {
  let items: StoryTestItem[] = [];
  try {
    items = readStoryItems(tddDir, featureId, story);
  } catch {
    items = [];
  }
  const greenTestIds = new Set(storyCycles(tddDir, featureId, story).filter((c) => c.green_at).map((c) => c.test_id));
  const acOrder: string[] = [];
  const acTests = new Map<string, string[]>();
  for (const it of items) {
    if (!acTests.has(it.ac_id)) {
      acTests.set(it.ac_id, []);
      acOrder.push(it.ac_id);
    }
    acTests.get(it.ac_id)!.push(it.id);
  }
  return acOrder.map((acId) => {
    const tests = acTests.get(acId)!;
    const r = readReview(tddDir, featureId, story, acId);
    return {
      acId,
      allTestsGreen: tests.length > 0 && tests.every((t) => greenTestIds.has(t)),
      reviewed: Boolean(r.reviewed_at),
      refactorRequested: Boolean(r.refactor_requested),
      refactored: Boolean(r.refactored_at),
    };
  });
}

/** First AC whose tests are all green but not yet REVIEWed (-> Navigator REVIEW). */
export function firstReviewPendingAc(tddDir: string, featureId: string, story: string): string | null {
  return acReviewStates(tddDir, featureId, story).find((a) => a.allTestsGreen && !a.reviewed)?.acId ?? null;
}

/** First AC REVIEWed with a refactor request not yet satisfied (-> Driver REFACTOR). */
export function firstRefactorPendingAc(tddDir: string, featureId: string, story: string): string | null {
  return acReviewStates(tddDir, featureId, story).find((a) => a.reviewed && a.refactorRequested && !a.refactored)?.acId ?? null;
}

/**
 * Record the Navigator's REVIEW of an AC: read its verdict (review-verdict.json,
 * the Navigator's output { refactor, notes }) and stamp review.json with
 * reviewed_at + refactor_requested. No verdict present => refactor_requested
 * false ("looks good"), so a Navigator that finds nothing to fix never stalls.
 */
export function reviewAc(tddDir: string, featureId: string, story: string, acId: string): { reviewed: boolean; refactorRequested: boolean } {
  let verdict: { refactor?: boolean; notes?: string } = {};
  const vf = acReviewVerdictJson(tddDir, featureId, story, acId);
  if (existsSync(vf)) {
    try {
      verdict = JSON.parse(readFileSync(vf, "utf8")) as { refactor?: boolean; notes?: string };
    } catch {
      verdict = {};
    }
  }
  const refactorRequested = verdict.refactor === true;
  const file = acReviewJson(tddDir, featureId, story, acId);
  const prior = readReview(tddDir, featureId, story, acId);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    JSON.stringify(
      { ...prior, reviewed_at: new Date().toISOString(), refactor_requested: refactorRequested, ...(verdict.notes ? { refactor_notes: verdict.notes } : {}) },
      null,
      2,
    ) + "\n",
  );
  return { reviewed: true, refactorRequested };
}

/** Record that the Driver completed the requested REFACTOR for an AC. */
export function refactorAc(tddDir: string, featureId: string, story: string, acId: string): void {
  const file = acReviewJson(tddDir, featureId, story, acId);
  const prior = readReview(tddDir, featureId, story, acId);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ ...prior, refactored_at: new Date().toISOString() }, null, 2) + "\n");
}
