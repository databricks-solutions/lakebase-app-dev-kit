// Cycle recording is an ORCHESTRATION concern, not a role concern.
//
// The Navigator and Driver are pure: the Navigator writes the next failing
// test, the Driver writes the production code and runs the project's test
// command (uv run pytest / npm test / ./mvnw test, per the AC layer, against
// the experiment branch's .env-pointed DB). NEITHER touches git, the cycle
// artifacts, or the runner-outcome bookkeeping. The deterministic driver calls
// the two functions here (via the lakebase-sftdd-cycle CLI) to RECORD the cycle:
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
import {
  storyTestListJson,
  cyclesRootDir,
  acReviewJson,
  acReviewVerdictJson,
  storyReviewJson,
  storyReviewVerdictJson,
} from "./sftdd-paths.js";
import { markTestItemGreen } from "./test-list.js";
import { listExperiments } from "./experiment.js";
import { ensureDeployedAndVerify } from "./deploy.js";
import { writeEscalation, type Escalation } from "./escalation.js";
import { readSmellsLog, markSmellResolved, isBuildRefactorRoutableSmell, hasOpenBuildRefactorRoutableSmell } from "./smells.js";
import {
  readGreenFailure,
  writeGreenFailure,
  clearGreenFailure,
  readSupersededTests,
  markSupersessionRefactored,
  markRegressionFixAttempted,
} from "./supersession.js";
import { emitAgentLogEvent, type AgentLogEventInput } from "./agent-log.js";
import { commitAllIfChanged } from "../git/commits.js";
import {
  beginCycle,
  recordRunnerOutcome,
  markGreen,
  coveredTestIds,
  readAcLayer,
  type CycleArtifact,
  type CycleScope,
} from "./run-cycle.js";
import type { AcLayer } from "./experiment.js";

/**
 * Commit the working tree (production code + tests + cycle artifacts) on the
 * current experiment branch after a GREEN or a completed REFACTOR, so each TDD
 * transition is its own commit , the canonical "commit when green, commit the
 * refactor" rhythm.
 *
 * This is what makes `accept`'s `git merge <experiment> into <feature>` carry
 * real commits up to the feature branch, and leaves a clean tree for the
 * promote phase's `prepare-pr` (which refuses an uncommitted working tree).
 * Before this, the build wrote code but never committed it, so the experiment
 * merge was vacuous and promote's prepare-pr aborted on a dirty tree.
 *
 * Best-effort: a missing git repo (hermetic unit runs) or a clean tree
 * (nothing to commit) never breaks the cycle transition , mirroring this
 * file's logging resilience. A genuine failure leaves the tree dirty, which
 * prepare-pr catches downstream rather than the build stamping a false state.
 */
async function commitCycleWork(tddDir: string, message: string): Promise<void> {
  try {
    // Code + the stable design corpus. Exclude the churny orchestration metadata
    // (.tdd state churns every turn; .lakebase is SCM state): committing those
    // onto the experiment branch makes their committed copy diverge from the
    // feature branch, which then breaks accept's `git checkout <feature>`.
    // prepare-pr's dirty check ignores the same two prefixes, so this leaves a
    // clean CODE tree for promote.
    //
    // BUT force-include the project-level design + architecture corpora:
    //   `.tdd/design/`        , the design guide + IA (UX Designer).
    //   `.tdd/architecture/`  , the architecture conventions (the canonical
    //                           role -> module layout the first feature pins).
    // Both are written ONCE in the design phase and never touched during build,
    // so they do NOT churn or diverge. Committing them here carries them onto the
    // feature branch's PR to the parent tier, so the NEXT feature (forked from
    // that tier) inherits them , `designGuideReady` skips re-authoring the design
    // system, and `conventionsReady` makes the architect inherit + conform to the
    // established layout instead of re-deriving it. Without this, the broad `.tdd`
    // exclude dropped both and every feature rebuilt them from scratch.
    await commitAllIfChanged({
      cwd: dirname(tddDir),
      message,
      // Also exclude per-agent local memory (.claude/agent-memory/): like .tdd
      // observability it churns every run and is not feature code; committing it
      // onto the experiment branch would diverge from the feature branch (and it
      // already blocks the fork via assertCleanForFork). Gitignored too.
      exclude: [".sftdd", ".tdd", ".lakebase", ".claude/agent-memory"],
      include: [".sftdd/design", ".sftdd/architecture", ".tdd/design", ".tdd/architecture"],
    });
  } catch {
    // swallow: the commit is bookkeeping for the SCM/promote phase; a
    // still-dirty tree is caught by prepare-pr's dirty-working-tree guard.
  }
}

/**
 * Best-effort emit of a per-AC cycle event (cycle.review / cycle.refactored) to
 * the centralized agent log. The per-AC review/refactor lane is recorded here
 * (reviewAc/refactorAc), NOT via run-cycle's per-test markRefactored, so the
 * emit must live here too or the central log shows RED/GREEN with no REVIEW or
 * REFACTOR (the gap that left cycle.review/cycle.refactored absent). Mirrors
 * run-cycle's logCycleEvent: observability never breaks a cycle transition.
 */
function logCycleEvent(tddDir: string, event: AgentLogEventInput): void {
  try {
    emitAgentLogEvent(event, { tddDir });
  } catch {
    // swallow: never let logging break a review/refactor record
  }
}

export interface StoryTestItem {
  id: string;
  description: string;
  ac_id: string;
  status?: string;
  /** "behavior" (a pytest-bdd / behavior test, RED-first) or "fitness" (an
   *  architectural constraint test). A fitness test MAY be born-green , a
   *  regression guard that already holds , which is not a stall. Surfaced from
   *  the per-story test-list JSON (the test-strategist writes it). */
  kind?: "behavior" | "fitness";
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
  // A cycle covers one (per-test) or several (P8b batch) test ids; coveredTestIds
  // reads either shape, so progress is correct in both loop-granularity modes.
  const cycledTestIds = new Set(cycles.flatMap((c) => coveredTestIds(c)));
  const greenTestIds = new Set(cycles.filter((c) => c.green_at).flatMap((c) => coveredTestIds(c)));
  const pending = items.filter((i) => !cycledTestIds.has(i.id));
  const openRed = cycles.filter((c) => c.red_at && !c.green_at);
  const allGreen = items.length > 0 && items.every((i) => greenTestIds.has(i.id));
  return { total: items.length, pending, openRed, allGreen };
}

/**
 * The `kind` ("behavior" | "fitness") of the story's FIRST pending test-list item,
 * or undefined when nothing is pending or the item omits it. Used by the
 * escalation layer to recognize that a `cycle-stall` flagged while the next item
 * is a fitness test is a born-green regression guard (not a stuck build), so it
 * must not hard-halt , the GREEN run is the real arbiter.
 */
export function pendingItemKind(
  tddDir: string,
  featureId: string,
  story: string,
): "behavior" | "fitness" | undefined {
  return storyTestProgress(tddDir, featureId, story).pending[0]?.kind;
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

/** Default layer-batch cap (P8b): at most this many test-list items per batch
 *  cycle, so a big homogeneous story does not make one giant GREEN turn. */
export const DEFAULT_BATCH_CAP = 3;

/**
 * P8b (loopGranularity=hybrid-a): stamp ONE RED cycle covering the first pending
 * LAYER's test-list items, capped at `cap` (default 3). The batch unit is the
 * layer because the runner contract is per layer-tag (recordRunnerOutcome ->
 * markGreen): one GREEN turn can only cleanly all-green tests sharing one runner.
 * Items are grouped by their AC's `layer`; the batch is the first pending item's
 * layer, all pending items of that layer (in test-list order), capped.
 *
 * Returns recorded:false when nothing is pending. NEVER stamps an empty batch
 * (the empty-test_ids guard): if a layer somehow yields no ids we do not write a
 * cycle that would green nothing.
 */
/** The test-list items the NEXT layer-batch will cover (P8b): the first pending
 *  layer's pending items, in order, capped. Empty when nothing is pending. The
 *  SINGLE source both beginNextPendingBatch (what it stamps) and the Navigator's
 *  RED directive (what tests to write) read, so they cannot drift. */
export function nextPendingBatch(
  tddDir: string,
  featureId: string,
  story: string,
  cap: number = DEFAULT_BATCH_CAP,
): StoryTestItem[] {
  const effCap = cap > 0 ? cap : DEFAULT_BATCH_CAP;
  const pending = storyTestProgress(tddDir, featureId, story).pending;
  if (pending.length === 0) return [];
  const layerOf = (acId: string): string => readAcLayer(tddDir, featureId, acId) ?? "_nolayer";
  const headLayer = layerOf(pending[0].ac_id);
  return pending.filter((it) => layerOf(it.ac_id) === headLayer).slice(0, effCap);
}

export function beginNextPendingBatch(args: CycleRecordArgs, opts?: { cap?: number }): BeginResult {
  const { tddDir, featureId, story } = args;
  const cap = opts?.cap && opts.cap > 0 ? opts.cap : DEFAULT_BATCH_CAP;
  const batch = nextPendingBatch(tddDir, featureId, story, cap);
  if (batch.length === 0) return { recorded: false }; // nothing pending / empty-batch guard

  const headLayer = readAcLayer(tddDir, featureId, batch[0].ac_id) ?? "_nolayer";
  const head = batch[0];
  const exp = storyExperiment(tddDir, featureId, story);
  // chunk index: how many cycles already exist for this layer in the story, + 1.
  const priorForLayer = storyCycles(tddDir, featureId, story).filter(
    (c) => (c.layer ?? "_nolayer") === headLayer,
  ).length;
  const explicitLayer = headLayer === "_nolayer" ? undefined : (headLayer as AcLayer);
  const art = beginCycle({
    tddDir,
    feature_id: featureId,
    story_id: story,
    ac_id: head.ac_id,
    test_id: head.id,
    test_description: head.description,
    experiment_slug: exp.slug,
    branch_id: exp.branch,
    layer: explicitLayer,
    test_ids: batch.map((b) => b.id),
    chunk: `${headLayer}-${priorForLayer + 1}`,
  });
  return { recorded: true, cycleId: art.cycle_id, testId: head.id, acId: head.ac_id };
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
  /** Set when the verify failed for the FIRST time: the cycle stays RED + a
   *  green-failure marker is written so the orchestration routes a Navigator
   *  assess turn (supersession vs genuine regression) instead of escalating. */
  needsAssess?: boolean;
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
 * Replay-build verifier (FEIP-7702): trust the recorded GREEN for this turn
 * instead of re-running the full-suite honest-GREEN against the overlaid code.
 * During a build replay the project tree at an intermediate turn carries the
 * WHOLE recorded test set while only the current AC's code is in place, so a
 * later AC's test is legitimately RED , re-running the full suite per turn would
 * fail the cycle on a not-yet-built AC, which is not a regression. The corpus is
 * the source of truth that the turn was green when recorded; the final all-ACs
 * state is still honestly verified at the deploy gate. No deploy, no I/O.
 */
export const replayTrustVerifier: GreenVerifier = async () => ({
  passed: true,
  summary: "replay-build: trusting recorded GREEN (per-turn verify skipped; final state verified at the deploy gate)",
});

/**
 * Pick the GREEN/REFACTOR verifier for the current environment: the
 * replay-trust verifier when a build replay is in flight
 * (LAKEBASE_TDD_REPLAY_BUILD_DIR set), else undefined so greenOpenCycle /
 * refactorAc fall back to the real defaultGreenVerifier.
 */
export function greenVerifierForEnv(env: NodeJS.ProcessEnv = process.env): GreenVerifier | undefined {
  return env.LAKEBASE_TDD_REPLAY_BUILD_DIR ? replayTrustVerifier : undefined;
}

/**
 * Record the runner outcome + stamp GREEN on the story's open RED cycle (red_at
 * set, green_at not). Per the "driver runs, orchestration records" contract the
 * Driver already ran the project's test command in its loop; this records that
 * run (recordRunnerOutcome unlocks markGreen's runner contract for
 * layer-tagged cycles) and marks the cycle green. Throws when there is no open
 * RED cycle (the Driver was dispatched with nothing to green , a real defect).
 */
export async function greenOpenCycle(
  args: CycleRecordArgs & { driverChanges?: string; verify?: GreenVerifier; repair?: boolean },
): Promise<GreenResult> {
  const { tddDir, featureId, story } = args;
  const open = storyTestProgress(tddDir, featureId, story).openRed
    .sort((a, b) => (a.red_at! < b.red_at! ? 1 : -1))[0];
  if (!open) {
    throw new Error(`no open RED cycle for ${featureId}/${story}; nothing to mark GREEN`);
  }
  // This green is the Driver's bounded REPAIR re-verify (the Navigator diagnosed a
  // driver-fixable regression). Consume the one repair attempt up front so a still-
  // failing verify escalates instead of routing another repair turn.
  if (args.repair) {
    markRegressionFixAttempted(tddDir, featureId, story, open.ac_id);
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
    const gf = readGreenFailure(tddDir, featureId, story, open.ac_id);
    if (!gf?.assessed) {
      // First failure: the break may be a PRIOR test the new AC legitimately
      // supersedes (only the full-suite verify reveals it). Route a Navigator
      // assess turn instead of escalating; the marker bounds it to one pass.
      writeGreenFailure(tddDir, featureId, story, open.ac_id, { assessed: false, summary: result.summary });
      return { recorded: false, cycleId: open.cycle_id, testId: open.test_id, needsAssess: true, summary: result.summary };
    }
    // Already assessed (the Navigator saw the failing tests) and STILL failing:
    // a genuine regression the permissive refactor / repair could not honestly
    // green, or the Navigator confirmed it was no supersession. Escalate to the
    // HIL, carrying the Navigator's diagnosis when it recorded one (so the human
    // gets the WHY, not just the verify summary).
    const escalation = writeEscalation(tddDir, {
      source: "driver-green",
      reason: `GREEN verify failed for ${open.test_id} (${open.ac_id}) in ${featureId}/${story} after assessment${gf.diagnosis ? ` , ${gf.diagnosis}` : ""}: ${result.summary}`,
      feature_id: featureId,
      story_id: story,
      ac_id: open.ac_id,
    });
    return { recorded: false, cycleId: open.cycle_id, testId: open.test_id, escalated: true, escalation, summary: result.summary };
  }
  // Verify passed: clear the failure marker + consume any supersession attempt.
  clearGreenFailure(tddDir, featureId, story, open.ac_id);
  if (readSupersededTests(tddDir, featureId, story, open.ac_id)) {
    markSupersessionRefactored(tddDir, featureId, story, open.ac_id);
  }
  markGreen(scope, open.cycle_id, args.driverChanges);
  // Propagate green to the artifacts the acceptance/deploy consumers read: the
  // test-list item (master + per-story) and the AC (-> passing when all its
  // tests are green). Without this the cycle is green but the Release Engineer
  // sees the test-list item still `pending` + the AC `draft` and refuses to
  // deploy (the await-acceptance stall). A P8b batch cycle covers SEVERAL test
  // ids; propagate to EACH so every batched item flips green together (a per-test
  // cycle is just the single-element case). Best-effort: never fail a green here.
  for (const tid of coveredTestIds(open)) {
    try {
      markTestItemGreen(tddDir, featureId, story, tid);
    } catch {
      /* status propagation is observability for downstream consumers, not a gate */
    }
  }
  // Commit the now-green increment on the experiment branch (working software
  // at each passing test), so accept can merge real commits up + promote's
  // prepare-pr sees a clean tree.
  const greened = coveredTestIds(open);
  const greenedLabel = greened.length > 1 ? `${greened.join(", ")} (${open.ac_id} batch)` : `${open.test_id} (${open.ac_id})`;
  await commitCycleWork(tddDir, `green: ${greenedLabel}`);
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
  const greenTestIds = new Set(
    storyCycles(tddDir, featureId, story).filter((c) => c.green_at).flatMap((c) => coveredTestIds(c)),
  );
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

/** First AC REVIEWed with a refactor request not yet satisfied (-> Driver REFACTOR).
 *
 * Two sources of "refactor pending":
 *  1. The Navigator's REVIEW verdict explicitly requested it (refactor_requested).
 *  2. A deterministic build-refactor-routable gate (layering-clean / ux-adherence /
 *     import-time-build-coupling) raised a still-open BLOCKING smell for this story.
 *     That gate IS the refactor signal, so a reviewed-but-unrefactored AC must route
 *     to the Driver's REFACTOR even when the Navigator's verdict said refactor:false
 *     (the bug that stalled F5: the gate blocked, the verdict said "looks good", so
 *     no refactor was queued and the smell escalated straight to HIL instead of
 *     self-healing). refactorAc resolves the smell + the post-refactor verify
 *     preserves behavior; one attempt per AC, after which a residual violation
 *     re-surfaces with no refactor pending and escalates (backstop intact).
 */
export function firstRefactorPendingAc(tddDir: string, featureId: string, story: string): string | null {
  const states = acReviewStates(tddDir, featureId, story);
  const explicit = states.find((a) => a.reviewed && a.refactorRequested && !a.refactored);
  if (explicit) return explicit.acId;
  if (hasOpenBuildRefactorRoutableSmell(tddDir, story)) {
    return states.find((a) => a.reviewed && !a.refactored)?.acId ?? null;
  }
  return null;
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
  // The Navigator's review verdict is a first-class cycle transition: emit it so
  // the central log shows REVIEW between GREEN and (optional) REFACTOR.
  logCycleEvent(tddDir, {
    role: "navigator",
    level: "info",
    event: "cycle.review",
    feature_id: featureId,
    slots: {
      ac: acId,
      refactor: refactorRequested,
      rationale: verdict.notes ?? (refactorRequested ? "refactor requested" : "looks good"),
      story,
    },
  });
  return { reviewed: true, refactorRequested };
}

export interface RefactorResult {
  /** The refactor was recorded (refactored_at stamped + committed). */
  refactored: boolean;
  /** Set when the post-refactor verify FAILED: refactored_at was NOT stamped (the
   *  AC stays refactor-pending) + an escalation was raised to the HIL (the driver's
   *  next readState routes to raise-to-hil). */
  escalated?: boolean;
  escalation?: Escalation;
  /** The post-refactor verify summary (pass or the failure reason). */
  summary?: string;
}

/**
 * Record that the Driver completed the requested REFACTOR for an AC.
 *
 * A refactor must be BEHAVIOR-PRESERVING, so before stamping refactored_at we
 * re-run the project's verify suite against the running app (the same honest
 * check greenOpenCycle uses). A refactor commonly edits code shared by sibling
 * tests, so a regression here is real and was previously invisible: the old
 * code stamped refactored_at + committed unconditionally, so a refactor that
 * broke a sibling AC's test advanced anyway. On failure we leave the AC
 * refactor-pending and raise an escalation to the HIL (same channel as a failed
 * GREEN); the orchestration then routes to raise-to-hil rather than advancing.
 */
export async function refactorAc(
  tddDir: string,
  featureId: string,
  story: string,
  acId: string,
  opts?: { verify?: GreenVerifier },
): Promise<RefactorResult> {
  // Honest post-refactor verify against the story's experiment branch.
  const exp = storyExperiment(tddDir, featureId, story);
  const verify = opts?.verify ?? defaultGreenVerifier;
  const result = await verify({ projectDir: dirname(tddDir), tddDir, featureId, story, branchId: exp.branch });
  if (!result.passed) {
    const escalation = writeEscalation(tddDir, {
      source: "driver-refactor",
      reason: `REFACTOR verify failed for ${acId} in ${featureId}/${story}: ${result.summary}`,
      feature_id: featureId,
      story_id: story,
      ac_id: acId,
    });
    return { refactored: false, escalated: true, escalation, summary: result.summary };
  }

  const file = acReviewJson(tddDir, featureId, story, acId);
  const prior = readReview(tddDir, featureId, story, acId);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ ...prior, refactored_at: new Date().toISOString() }, null, 2) + "\n");
  // Build-level self-heal: a refactor-routable build smell (layering-violation,
  // ux-adherence, import-time-build-coupling) that the Navigator flagged + this
  // refactor just addressed is resolved, so it no longer derives a (now
  // refactor-less) terminal escalation on the next readState. The post-refactor
  // verify above preserved behavior; the deploy/promote gate is the final teeth
  // if a residual violation remains.
  for (const d of readSmellsLog(tddDir).detected) {
    if (!d.resolution && isBuildRefactorRoutableSmell(d.smell) && (d.story_id === undefined || d.story_id === story)) {
      markSmellResolved(tddDir, d.smell, { story_id: d.story_id, kind: "accepted", note: `refactored: ${acId}` });
    }
  }
  // The Driver's refactor is a cycle transition: emit it so the central log
  // closes the per-AC RED -> GREEN -> REVIEW -> REFACTOR sequence. The notes the
  // Navigator requested are the closest signal to what changed.
  const change = typeof prior.refactor_notes === "string" && prior.refactor_notes.length > 0
    ? `addressed: ${prior.refactor_notes}`
    : "structure improved";
  logCycleEvent(tddDir, {
    role: "driver",
    level: "info",
    event: "cycle.refactored",
    feature_id: featureId,
    slots: { ac: acId, change, story },
  });
  // Commit the behavior-preserving refactor as its own commit (the second half
  // of the "commit when green, then commit the refactor" rhythm).
  await commitCycleWork(tddDir, `refactor: ${acId} (${change})`);
  return { refactored: true, summary: result.summary };
}

// ── Story-level review/refactor ("story" loop granularity, the default) ───────
// When the build runs story-scoped turns the Navigator REVIEWs the WHOLE story
// in one turn and the Driver REFACTORs it in one turn, instead of cycling per
// AC. The transition is recorded ONCE at the story's cycles root
// (storyReviewJson), the story-scoped analogue of the per-AC review.json above,
// with the identical producer/consumer split: the Navigator writes
// review-verdict.json ({ refactor, notes }); reviewStory stamps reviewed_at +
// refactor_requested; refactorStory stamps refactored_at after an honest
// behavior-preserving verify. The per-AC functions remain for the opt-in "ac" /
// "hybrid-a" granularities.

export interface StoryReviewState {
  /** Every test-list item in the story has a green cycle (story ready to REVIEW). */
  allTestsGreen: boolean;
  /** review.json has reviewed_at (the Navigator REVIEWed the story). */
  reviewed: boolean;
  /** The REVIEW requested a refactor. */
  refactorRequested: boolean;
  /** review.json has refactored_at (the Driver completed the refactor). */
  refactored: boolean;
}

function readStoryReview(tddDir: string, featureId: string, story: string): ReviewRecord {
  const f = storyReviewJson(tddDir, featureId, story);
  if (!existsSync(f)) return {};
  try {
    return JSON.parse(readFileSync(f, "utf8")) as ReviewRecord;
  } catch {
    return {};
  }
}

/** Whether every test-list item in the story is green (story ready to REVIEW).
 *  Mirrors the probe's codeWritten: test-list-driven when a list exists, else a
 *  legacy fallback over the raw RED/GREEN cycles. */
function storyAllTestsGreen(tddDir: string, featureId: string, story: string): boolean {
  const p = storyTestProgress(tddDir, featureId, story);
  if (p.total === 0) {
    const reds = storyCycles(tddDir, featureId, story).filter((c) => Boolean(c.red_at));
    return reds.length > 0 && reds.every((c) => Boolean(c.green_at));
  }
  return p.allGreen;
}

export function storyReviewState(tddDir: string, featureId: string, story: string): StoryReviewState {
  const r = readStoryReview(tddDir, featureId, story);
  return {
    allTestsGreen: storyAllTestsGreen(tddDir, featureId, story),
    reviewed: Boolean(r.reviewed_at),
    refactorRequested: Boolean(r.refactor_requested),
    refactored: Boolean(r.refactored_at),
  };
}

/** The story's REVIEW is pending: all its tests are green but the Navigator has
 *  not yet REVIEWed the story (-> Navigator story-level REVIEW turn). */
export function reviewPending(tddDir: string, featureId: string, story: string): boolean {
  const s = storyReviewState(tddDir, featureId, story);
  return s.allTestsGreen && !s.reviewed;
}

/** The story has a REFACTOR pending (-> Driver story-level REFACTOR turn), from
 *  either source (mirrors firstRefactorPendingAc): the Navigator's REVIEW verdict
 *  requested it, OR a still-open build-refactor-routable smell for the story (the
 *  gate IS the refactor signal, so a reviewed-but-unrefactored story routes to
 *  REFACTOR even when the verdict said refactor:false). One attempt; a residual
 *  violation after refactorStory re-surfaces with no refactor pending + escalates. */
export function refactorPending(tddDir: string, featureId: string, story: string): boolean {
  const s = storyReviewState(tddDir, featureId, story);
  if (!s.reviewed || s.refactored) return false;
  if (s.refactorRequested) return true;
  return hasOpenBuildRefactorRoutableSmell(tddDir, story);
}

/** Record the Navigator's REVIEW of the WHOLE story: read its verdict
 *  (review-verdict.json at the story root) and stamp the story review.json with
 *  reviewed_at + refactor_requested. No verdict present => refactor_requested
 *  false ("looks good"), so a Navigator that finds nothing to fix never stalls.
 *  Story-scoped sibling of reviewAc. */
export function reviewStory(
  tddDir: string,
  featureId: string,
  story: string,
): { reviewed: boolean; refactorRequested: boolean } {
  let verdict: { refactor?: boolean; notes?: string } = {};
  const vf = storyReviewVerdictJson(tddDir, featureId, story);
  if (existsSync(vf)) {
    try {
      verdict = JSON.parse(readFileSync(vf, "utf8")) as { refactor?: boolean; notes?: string };
    } catch {
      verdict = {};
    }
  }
  const refactorRequested = verdict.refactor === true;
  const file = storyReviewJson(tddDir, featureId, story);
  const prior = readStoryReview(tddDir, featureId, story);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    JSON.stringify(
      { ...prior, reviewed_at: new Date().toISOString(), refactor_requested: refactorRequested, ...(verdict.notes ? { refactor_notes: verdict.notes } : {}) },
      null,
      2,
    ) + "\n",
  );
  logCycleEvent(tddDir, {
    role: "navigator",
    level: "info",
    event: "cycle.review",
    feature_id: featureId,
    slots: {
      ac: story,
      refactor: refactorRequested,
      rationale: verdict.notes ?? (refactorRequested ? "refactor requested" : "looks good"),
      story,
    },
  });
  return { reviewed: true, refactorRequested };
}

/** Record that the Driver completed the requested REFACTOR for the WHOLE story.
 *  Story-scoped sibling of refactorAc: the same honest behavior-preserving verify
 *  (re-run the project's suite against the story's experiment branch) gates
 *  stamping refactored_at; on failure the story stays refactor-pending and an
 *  escalation is raised to the HIL. */
export async function refactorStory(
  tddDir: string,
  featureId: string,
  story: string,
  opts?: { verify?: GreenVerifier },
): Promise<RefactorResult> {
  const exp = storyExperiment(tddDir, featureId, story);
  const verify = opts?.verify ?? defaultGreenVerifier;
  const result = await verify({ projectDir: dirname(tddDir), tddDir, featureId, story, branchId: exp.branch });
  if (!result.passed) {
    const escalation = writeEscalation(tddDir, {
      source: "driver-refactor",
      reason: `REFACTOR verify failed for story ${featureId}/${story}: ${result.summary}`,
      feature_id: featureId,
      story_id: story,
    });
    return { refactored: false, escalated: true, escalation, summary: result.summary };
  }

  const file = storyReviewJson(tddDir, featureId, story);
  const prior = readStoryReview(tddDir, featureId, story);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ ...prior, refactored_at: new Date().toISOString() }, null, 2) + "\n");
  for (const d of readSmellsLog(tddDir).detected) {
    if (!d.resolution && isBuildRefactorRoutableSmell(d.smell) && (d.story_id === undefined || d.story_id === story)) {
      markSmellResolved(tddDir, d.smell, { story_id: d.story_id, kind: "accepted", note: `refactored story: ${story}` });
    }
  }
  const change = typeof prior.refactor_notes === "string" && prior.refactor_notes.length > 0
    ? `addressed: ${prior.refactor_notes}`
    : "structure improved";
  logCycleEvent(tddDir, {
    role: "driver",
    level: "info",
    event: "cycle.refactored",
    feature_id: featureId,
    slots: { ac: story, change, story },
  });
  await commitCycleWork(tddDir, `refactor: story ${story} (${change})`);
  return { refactored: true, summary: result.summary };
}
