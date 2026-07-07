// Honest GREEN + escalate-to-HIL (follow-up).
//
// A live smoke shipped a FALSE-GREEN: greenOpenCycle stamped green without a real
// run (it hardcoded passed:true), so a test that broke a sibling test was marked
// green and only the deploy gate caught it, then the driver STALLED. These tests
// pin the fix: GREEN reflects a real verify run; a failure leaves the cycle RED +
// raises an escalation; the driver routes any unresolved escalation to a single
// raise-to-hil halt (surface + halt) instead of advancing or spinning.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  beginNextPendingCycle,
  greenOpenCycle,
  storyTestProgress,
  reviewAc,
  refactorAc,
  firstRefactorPendingAc,
  replayTrustVerifier,
  greenVerifierForEnv,
  type GreenVerifier,
} from "../../scripts/sftdd/cycle-record.js";
import {
  writeEscalation,
  readEscalations,
  firstPendingEscalation,
  escalationsFromSmells,
  recordBlockingSmellFlag,
  BLOCKING_SMELLS,
} from "../../scripts/sftdd/escalation.js";
import { writeSmellsLog } from "../../scripts/sftdd/smells.js";
import {
  readGreenFailure,
  writeGreenFailure,
  needsGreenAssess,
  writeSupersededTests,
  MAX_REGRESSION_FIX_ATTEMPTS,
} from "../../scripts/sftdd/supersession.js";
import { nextTransition, type DriveState, type WorkflowAction } from "../../scripts/sftdd/orchestrator-drive.js";
import { describeAction } from "../../scripts/sftdd/orchestrator-logging.js";
import { runDriver, type DriveEffects } from "../../scripts/sftdd/orchestrator-run.js";

let tdd: string;
const F = "F1";
const S = "S1";
const writeJson = (file: string, obj: unknown): void => writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
const pass: GreenVerifier = async () => ({ passed: true, summary: "ok" });
const fail: GreenVerifier = async () => ({ passed: false, summary: "T2 returns 201, sibling test T1 expects 303 (contradiction)" });

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-honest-"));
  const acsDir = join(tdd, "features", F, "stories", S, "acs");
  mkdirSync(acsDir, { recursive: true });
  writeJson(join(acsDir, "AC1.json"), { id: "AC1", layer: "API", text: "the API returns" });
  const items = [{ id: "T1", description: "first", ac_id: "AC1", status: "pending" }];
  writeJson(join(tdd, "features", F, "stories", S, "test-list-per-story.json"), { feature_id: F, story_id: S, items });
  writeJson(join(tdd, "features", F, "test-list.json"), { feature_id: F, items });
  const expDir = join(tdd, "experiments", F, S, "exp1");
  mkdirSync(expDir, { recursive: true });
  writeFileSync(join(expDir, "branch.txt"), "experiment-s1-exp1");
  writeJson(join(expDir, "outcomes.json"), { status: "running" });
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

function cycle(ac: string): Record<string, unknown> {
  const dir = join(tdd, "cycles", F, S, ac);
  const f = readdirSync(dir).find((x) => x.endsWith(".json"))!;
  return JSON.parse(readFileSync(join(dir, f), "utf8"));
}

describe("honest GREEN: greenOpenCycle runs a real verify before stamping green", () => {
  it("the FIRST failing verify routes a Navigator ASSESS (no escalation yet), not an immediate HIL halt", async () => {
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S });
    const r = await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: fail });

    expect(r.recorded).toBe(false);
    // Reactive supersession trigger: the break may be a prior test this AC
    // supersedes, so the first failure asks for an assessment instead of halting.
    expect(r.needsAssess).toBe(true);
    expect(r.escalated).toBeFalsy();
    // Cycle is still RED + a green-failure marker is written for the assess turn.
    expect(cycle("AC1").green_at).toBeFalsy();
    expect(needsGreenAssess(tdd, F, S, "AC1")).toBe(true);
    expect(storyTestProgress(tdd, F, S).allGreen).toBe(false);
    // No escalation yet (the Navigator has not assessed).
    expect(readEscalations(tdd).filter((e) => !e.resolved_at).length).toBe(0);
  });

  it("a still-failing repair round RE-ARMS for another assess (refactor-until-clean), not an immediate escalation", async () => {
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S });
    await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: fail }); // 1st -> assess
    // Navigator assessed + gave a driver-fixable directive; the Driver repaired.
    writeGreenFailure(tdd, F, S, "AC1", { assessed: true, summary: "x", fixDirective: "extract shared helper" });
    // The repair's re-verify STILL fails, but rounds remain: re-arm, do NOT escalate.
    const r = await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: fail, repair: true });
    expect(r.escalated).toBeFalsy();
    expect(r.needsAssess).toBe(true);
    // A fresh assess is armed on the RESIDUAL (assessed reset), round counted.
    const gf = readGreenFailure(tdd, F, S, "AC1")!;
    expect(gf.assessed).toBe(false);
    expect(gf.fixAttempts).toBe(1);
    expect(readEscalations(tdd).filter((e) => !e.resolved_at).length).toBe(0);
  });

  it(`escalates only after ${MAX_REGRESSION_FIX_ATTEMPTS} self-heal rounds still fail`, async () => {
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S });
    await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: fail }); // 1st -> assess
    // Simulate having already spent the budget minus one round; the Navigator
    // assessed the residual again with a directive.
    writeGreenFailure(tdd, F, S, "AC1", {
      assessed: true,
      summary: "x",
      fixDirective: "extract shared helper",
      fixAttempts: MAX_REGRESSION_FIX_ATTEMPTS - 1,
    });
    // The final repair round still fails -> now escalate (rounds exhausted).
    const r = await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: fail, repair: true });
    expect(r.escalated).toBe(true);
    const escs = readEscalations(tdd).filter((e) => !e.resolved_at);
    expect(escs.length).toBe(1);
    expect(escs[0].source).toBe("driver-green");
    expect(escs[0].reason).toMatch(/self-heal round/);
  });

  it("after a supersession flag, a PASSING permissive verify marks green + clears the marker", async () => {
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S });
    await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: fail }); // 1st -> assess
    // Navigator assessed + flagged the prior test as superseded; Driver refactored it.
    writeGreenFailure(tdd, F, S, "AC1", { assessed: true, summary: "x" });
    writeSupersededTests(tdd, F, S, "AC1", { tests: ["tests/old_test.py"], reason: "superseded by AC1" });
    const r = await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: pass });
    expect(r.recorded).toBe(true);
    expect(r.escalated).toBeFalsy();
    expect(cycle("AC1").green_at).toBeTruthy();
    // The marker is cleared on a passing verify; the supersession attempt is consumed.
    expect(readGreenFailure(tdd, F, S, "AC1")).toBeUndefined();
    expect(readEscalations(tdd).filter((e) => !e.resolved_at).length).toBe(0);
  });

  it("a PASSING verify marks green + propagates (the happy path is unchanged)", async () => {
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S });
    const r = await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: pass });
    expect(r.recorded).toBe(true);
    expect(r.escalated).toBeFalsy();
    expect(cycle("AC1").green_at).toBeTruthy();
    expect(readEscalations(tdd).filter((e) => !e.resolved_at).length).toBe(0);
  });
});

// in replay-build mode the per-turn honest-GREEN full-suite verify is
// invalid mid-build (a later AC's test is legitimately RED while its code is not
// yet overlaid), so it must NOT fail the cycle. The replay trusts the recorded
// GREEN per turn; the final all-ACs state is still verified at the deploy gate.
describe("replay-build: per-turn green trusts the recorded outcome", () => {
  it("replayTrustVerifier passes without running a real verify (no deploy)", async () => {
    const r = await replayTrustVerifier({ projectDir: "/does/not/exist", tddDir: tdd, featureId: F, story: S });
    expect(r.passed).toBe(true);
    expect(r.summary).toMatch(/replay-build/i);
  });

  it("greenOpenCycle with the replay verifier greens an open RED cycle where a real full-suite verify would fail", async () => {
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S });
    const r = await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: replayTrustVerifier });
    expect(r.recorded).toBe(true);
    expect(r.escalated).toBeFalsy();
    expect(r.needsAssess).toBeFalsy();
    expect(cycle("AC1").green_at).toBeTruthy();
    expect(readEscalations(tdd).filter((e) => !e.resolved_at).length).toBe(0);
  });

  it("greenVerifierForEnv returns the replay verifier ONLY when LAKEBASE_SFTDD_REPLAY_BUILD_DIR is set", async () => {
    expect(greenVerifierForEnv({})).toBeUndefined();
    const v = greenVerifierForEnv({ LAKEBASE_SFTDD_REPLAY_BUILD_DIR: "/corpus" });
    expect(v).toBeDefined();
    const r = await v!({ projectDir: "/x", tddDir: tdd, featureId: F, story: S });
    expect(r.passed).toBe(true);
  });
});

// A4: a REFACTOR must be behavior-preserving. refactorAc re-runs the same honest
// verify before stamping refactored_at; a failing verify (the refactor broke a
// sibling test) leaves the AC refactor-pending + raises the same HIL escalation
// channel as a failed GREEN, instead of the old unconditional stamp+commit.
describe("honest REFACTOR: refactorAc re-verifies before stamping refactored_at", () => {
  // Drive AC1 to a refactor-pending state: green its test, then a REVIEW that
  // requested a refactor.
  async function toRefactorPending(): Promise<void> {
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S });
    await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: pass });
    writeJson(join(tdd, "cycles", F, S, "AC1", "review-verdict.json"), { refactor: true, notes: "extract a helper" });
    reviewAc(tdd, F, S, "AC1");
    expect(firstRefactorPendingAc(tdd, F, S)).toBe("AC1");
  }

  it("a FAILING verify does NOT stamp refactored_at, leaves the AC refactor-pending, and raises an escalation", async () => {
    await toRefactorPending();
    const r = await refactorAc(tdd, F, S, "AC1", { verify: fail });

    expect(r.refactored).toBe(false);
    expect(r.escalated).toBe(true);
    // Still refactor-pending: refactored_at was NOT written.
    expect(firstRefactorPendingAc(tdd, F, S)).toBe("AC1");
    const review = JSON.parse(readFileSync(join(tdd, "cycles", F, S, "AC1", "review.json"), "utf8"));
    expect(review.refactored_at).toBeFalsy();
    // An escalation was recorded for the HIL, tagged to the refactor source.
    const escs = readEscalations(tdd).filter((e) => !e.resolved_at);
    expect(escs.length).toBe(1);
    expect(escs[0].source).toBe("driver-refactor");
    expect(escs[0].reason).toMatch(/contradiction/);
  });

  it("a PASSING verify stamps refactored_at + raises no escalation (the happy path)", async () => {
    await toRefactorPending();
    const r = await refactorAc(tdd, F, S, "AC1", { verify: pass });
    expect(r.refactored).toBe(true);
    expect(r.escalated).toBeFalsy();
    expect(firstRefactorPendingAc(tdd, F, S)).toBeNull(); // refactored -> AC done
    expect(readEscalations(tdd).filter((e) => !e.resolved_at).length).toBe(0);
  });
});

describe("escalation module", () => {
  it("writeEscalation is idempotent by id while unresolved; firstPendingEscalation returns it", () => {
    writeEscalation(tdd, { source: "driver-green", reason: "boom", feature_id: F, story_id: S, ac_id: "AC1", raised_at: "2026-06-08T00:00:00.000Z" });
    writeEscalation(tdd, { source: "driver-green", reason: "boom (again, later)", feature_id: F, story_id: S, ac_id: "AC1", raised_at: "2026-06-08T01:00:00.000Z" });
    const all = readEscalations(tdd);
    expect(all.length).toBe(1); // same id -> not duplicated
    expect(all[0].reason).toBe("boom"); // original stands while unresolved
    expect(firstPendingEscalation(tdd, F)?.source).toBe("driver-green");
  });

  it("derives an escalation from an unresolved BLOCKING smell (test-list-drift)", () => {
    expect(BLOCKING_SMELLS.has("test-list-drift")).toBe(true);
    writeSmellsLog(tdd, [{ smell: "test-list-drift", cycle_ids: ["cycle-001"], detail: "T7 contradicts T5/T6" }]);
    const fromSmells = escalationsFromSmells(tdd, F);
    expect(fromSmells.length).toBe(1);
    expect(fromSmells[0].reason).toMatch(/test-list-drift/);
    expect(firstPendingEscalation(tdd, F)?.source).toBe("smell:test-list-drift");
  });

  it("an ADVISORY smell (test-cost-spiral) does NOT escalate", () => {
    expect(BLOCKING_SMELLS.has("test-cost-spiral")).toBe(false);
    writeSmellsLog(tdd, [{ smell: "test-cost-spiral", cycle_ids: ["cycle-002"], detail: "tests doubling" }]);
    expect(escalationsFromSmells(tdd, F).length).toBe(0);
    expect(firstPendingEscalation(tdd, F)).toBeNull();
  });

  describe("born-green fitness guard: a cycle-stall while the next item is fitness is NOT a halt", () => {
    const reseedFirstPendingKind = (kind: "behavior" | "fitness"): void => {
      writeJson(join(tdd, "features", F, "stories", S, "test-list-per-story.json"), {
        feature_id: F,
        story_id: S,
        items: [{ id: "TF", description: "the guard", ac_id: "AC1", status: "pending", kind }],
      });
    };

    it("DROPS a cycle-stall when the story's next pending item is kind:fitness (born-green regression guard)", () => {
      expect(BLOCKING_SMELLS.has("cycle-stall")).toBe(true);
      reseedFirstPendingKind("fitness");
      writeSmellsLog(tdd, [{ smell: "cycle-stall", cycle_ids: ["cycle-003"], detail: "ORM-only test can't go RED", story_id: S }]);
      // The smell is blocking + unresolved, but the pending item is a fitness
      // guard, so it is filtered out: no escalation, the loop proceeds to GREEN.
      expect(escalationsFromSmells(tdd, F).length).toBe(0);
      expect(firstPendingEscalation(tdd, F)).toBeNull();
    });

    it("KEEPS a cycle-stall when the story's next pending item is a behavior test (a genuine stall halts)", () => {
      reseedFirstPendingKind("behavior");
      writeSmellsLog(tdd, [{ smell: "cycle-stall", cycle_ids: ["cycle-004"], detail: "behavior test never goes RED", story_id: S }]);
      const escs = escalationsFromSmells(tdd, F);
      expect(escs.length).toBe(1);
      expect(escs[0].source).toBe("smell:cycle-stall");
      expect(firstPendingEscalation(tdd, F)?.source).toBe("smell:cycle-stall");
    });

    it("KEEPS a cycle-stall with no story scope (cannot prove it is a fitness guard)", () => {
      writeSmellsLog(tdd, [{ smell: "cycle-stall", cycle_ids: ["cycle-005"], detail: "stall, no story id" }]);
      expect(escalationsFromSmells(tdd, F).length).toBe(1);
    });
  });

  describe("recordBlockingSmellFlag (mirror a flagged blocking smell into smells.json so the loop halts)", () => {
    it("persists a BLOCKING smell (scaffold-defect) -> firstPendingEscalation halts", () => {
      expect(BLOCKING_SMELLS.has("scaffold-defect")).toBe(true);
      expect(recordBlockingSmellFlag(tdd, "scaffold-defect", "tests/e2e/conftest.py missing")).toBe(true);
      const e = firstPendingEscalation(tdd, F);
      expect(e?.source).toBe("smell:scaffold-defect");
      expect(e?.reason).toMatch(/conftest\.py missing/);
    });

    it("is idempotent (a still-open dup is not re-written) and ignores advisory/unknown names", () => {
      expect(recordBlockingSmellFlag(tdd, "scaffold-defect", "first")).toBe(true);
      expect(recordBlockingSmellFlag(tdd, "scaffold-defect", "second")).toBe(false); // dup
      expect(recordBlockingSmellFlag(tdd, "test-cost-spiral", "advisory")).toBe(false); // not blocking
      expect(recordBlockingSmellFlag(tdd, "not-a-real-smell", "x")).toBe(false); // unknown
      // Only the one blocking entry made it in.
      expect(escalationsFromSmells(tdd, F).length).toBe(1);
    });
  });
});

describe("routing: an escalation pre-empts everything with raise-to-hil", () => {
  function baseState(): DriveState {
    return { phase: "feature", breakdownDone: true, storyOrder: ["S1"], stories: {}, buildActive: null };
  }

  it("nextTransition returns raise-to-hil (not advance) when state.escalation is set", () => {
    const state: DriveState = {
      ...baseState(),
      escalation: { id: "e1", source: "driver-green", reason: "GREEN verify failed for T7", story_id: "S1" },
    };
    const action = nextTransition(state);
    expect(action.kind).toBe("raise-to-hil");
    if (action.kind === "raise-to-hil") {
      expect(action.reason).toMatch(/GREEN verify failed/);
      expect(action.story).toBe("S1");
    }
  });

  it("no escalation -> normal transition (does not raise)", () => {
    expect(nextTransition(baseState()).kind).not.toBe("raise-to-hil");
  });

  it("runDriver SURFACES + HALTS on a raise-to-hil (returns escalated, does NOT throw DriverStalledError)", async () => {
    let reads = 0;
    const performed: WorkflowAction[] = [];
    const eff: DriveEffects = {
      async readState() {
        reads++;
        return {
          phase: "feature",
          breakdownDone: true,
          storyOrder: ["S1"],
          stories: {},
          buildActive: null,
          escalation: { id: "e1", source: "smell:test-list-drift", reason: "contradictory test list", story_id: "S1" },
        };
      },
      async perform(a) {
        performed.push(a);
      },
    };
    const result = await runDriver(eff);
    expect(result.escalated).toBe(true);
    expect(result.escalation?.kind).toBe("raise-to-hil");
    // It halted on the first raise-to-hil (one perform), not a stall throw.
    expect(performed).toHaveLength(1);
    expect(performed[0].kind).toBe("raise-to-hil");
    expect(reads).toBe(1);
  });
});

describe("narration: every action gets a human-readable description", () => {
  it("describeAction is non-empty for raise-to-hil + a role dispatch", () => {
    const raise: WorkflowAction = { kind: "raise-to-hil", reason: "GREEN verify failed", source: "driver-green", story: "S1" };
    expect(describeAction(raise)).toMatch(/RAISED TO HIL/);
    const dispatch: WorkflowAction = { kind: "invoke-role", role: "driver", story: "S1" };
    expect(describeAction(dispatch).length).toBeGreaterThan(0);
  });
});
