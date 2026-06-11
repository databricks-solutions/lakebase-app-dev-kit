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
  type GreenVerifier,
} from "../../scripts/tdd/cycle-record.js";
import {
  writeEscalation,
  readEscalations,
  firstPendingEscalation,
  escalationsFromSmells,
  recordBlockingSmellFlag,
  BLOCKING_SMELLS,
} from "../../scripts/tdd/escalation.js";
import { writeSmellsLog } from "../../scripts/tdd/smells.js";
import { nextTransition, type DriveState, type WorkflowAction } from "../../scripts/tdd/orchestrator-drive.js";
import { describeAction } from "../../scripts/tdd/orchestrator-logging.js";
import { runDriver, type DriveEffects } from "../../scripts/tdd/orchestrator-run.js";

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
  it("a FAILING verify does NOT mark green, leaves the cycle RED, and raises an escalation", async () => {
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S });
    const r = await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: fail });

    expect(r.recorded).toBe(false);
    expect(r.escalated).toBe(true);
    // Cycle is still RED: no green_at stamped (the false-green that shipped before).
    expect(cycle("AC1").green_at).toBeFalsy();
    expect(cycle("AC1").red_at).toBeTruthy();
    // The test-list item stays pending (not falsely propagated to green).
    expect(storyTestProgress(tdd, F, S).allGreen).toBe(false);
    // An escalation was recorded for the HIL.
    const escs = readEscalations(tdd).filter((e) => !e.resolved_at);
    expect(escs.length).toBe(1);
    expect(escs[0].source).toBe("driver-green");
    expect(escs[0].reason).toMatch(/contradiction/);
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
