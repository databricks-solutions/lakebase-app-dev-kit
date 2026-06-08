// Cycle recording is an ORCHESTRATION concern: the deterministic driver calls
// beginNextPendingCycle (after the pure Navigator writes the test) and
// greenOpenCycle (after the pure Driver makes it pass). These stamp the SAME
// red_at / green_at the probe reads , the contract the live smoke broke when
// the Navigator hand-wrote a cycle with `status:"red"` (no red_at) and the
// driver re-dispatched it forever.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  beginNextPendingCycle,
  greenOpenCycle,
  storyTestProgress,
  firstReviewPendingAc,
  firstRefactorPendingAc,
  reviewAc,
  refactorAc,
} from "../../scripts/tdd/cycle-record.js";

let tdd: string;
const F = "F1";
const S = "S1";

function writeJson(file: string, obj: unknown): void {
  writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

function cyclesFor(ac: string): Record<string, unknown>[] {
  const dir = join(tdd, "cycles", F, S, ac);
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }
  return files.map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-cyc-"));
  // Minimal feature/story tree the recorders read.
  const acsDir = join(tdd, "features", F, "stories", S, "acs");
  mkdirSync(acsDir, { recursive: true });
  writeJson(join(acsDir, "AC1.json"), { id: "AC1", layer: "API", text: "the API returns" });
  const items = [
    { id: "T1", description: "first thing fails", ac_id: "AC1", status: "pending" },
    { id: "T2", description: "second thing fails", ac_id: "AC1", status: "pending" },
  ];
  writeJson(join(tdd, "features", F, "stories", S, "test-list-per-story.json"), { feature_id: F, story_id: S, items });
  // The MASTER test-list (the single source markTestItemGreen updates; the
  // per-story list is re-derived from it).
  writeJson(join(tdd, "features", F, "test-list.json"), { feature_id: F, items });
  // A cut experiment (slug + branch.txt + outcomes.json) so cycles tie to its DB
  // and markGreen's runner contract can be satisfied via recordRunnerOutcome.
  const expDir = join(tdd, "experiments", F, S, "exp1");
  mkdirSync(expDir, { recursive: true });
  writeFileSync(join(expDir, "branch.txt"), "experiment-s1-exp1");
  writeJson(join(expDir, "outcomes.json"), { status: "running" });
});

afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

describe("cycle-record: orchestration stamps RED/GREEN the probe can read", () => {
  it("beginNextPendingCycle stamps red_at (NOT a freehand status) for the first pending test", () => {
    const r = beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S });
    expect(r.recorded).toBe(true);
    expect(r.testId).toBe("T1");
    const cycles = cyclesFor("AC1");
    expect(cycles.length).toBe(1);
    // The exact field the probe reads (testsWritten = some cycle with red_at).
    expect(cycles[0].red_at).toBeTruthy();
    expect(cycles[0].green_at).toBeFalsy();
    expect(cycles[0].test_id).toBe("T1");
    expect(cycles[0].layer).toBe("API"); // auto-derived from the AC file
    expect(cycles[0].experiment_slug).toBe("exp1");
  });

  it("greenOpenCycle records the run + stamps green_at on the open RED cycle", () => {
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S });
    const g = greenOpenCycle({ tddDir: tdd, featureId: F, story: S });
    expect(g.recorded).toBe(true);
    expect(g.testId).toBe("T1");
    const cycles = cyclesFor("AC1");
    expect(cycles[0].green_at).toBeTruthy();
    // markGreen's FEIP-7094 runner contract was satisfied: an outcome was recorded.
    const outcomes = JSON.parse(readFileSync(join(tdd, "experiments", F, S, "exp1", "outcomes.json"), "utf8"));
    expect(outcomes.by_tag).toBeTruthy();
  });

  it("sequences one test at a time: begin -> green -> begin advances to the next pending", () => {
    expect(beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S }).testId).toBe("T1");
    greenOpenCycle({ tddDir: tdd, featureId: F, story: S });
    expect(beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S }).testId).toBe("T2");
    greenOpenCycle({ tddDir: tdd, featureId: F, story: S });
    // Both tests have green cycles now , nothing pending.
    const after = beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S });
    expect(after.recorded).toBe(false);
    expect(cyclesFor("AC1").length).toBe(2);
  });

  it("greenOpenCycle propagates green to the master test-list item + flips the AC to `passing`", () => {
    // The await-acceptance stall: the cycle was green but the test-list items
    // stayed `pending` + the AC `draft`, so the Release Engineer refused to
    // deploy. Greening every test for an AC must mark the items green + the AC passing.
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S }); greenOpenCycle({ tddDir: tdd, featureId: F, story: S }); // T1
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S }); greenOpenCycle({ tddDir: tdd, featureId: F, story: S }); // T2
    const master = JSON.parse(readFileSync(join(tdd, "features", F, "test-list.json"), "utf8"));
    expect(master.items.every((i: { status: string }) => i.status === "green")).toBe(true);
    const perStory = JSON.parse(readFileSync(join(tdd, "features", F, "stories", S, "test-list-per-story.json"), "utf8"));
    expect(perStory.items.every((i: { status: string }) => i.status === "green")).toBe(true);
    const ac1 = JSON.parse(readFileSync(join(tdd, "features", F, "stories", S, "acs", "AC1.json"), "utf8"));
    expect(ac1.status).toBe("passing"); // all of AC1's tests are green
  });

  it("per-AC REVIEW/REFACTOR: AC awaits review once all its tests are green; verdict drives refactor", () => {
    // Green both of AC1's tests.
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S }); greenOpenCycle({ tddDir: tdd, featureId: F, story: S });
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S }); greenOpenCycle({ tddDir: tdd, featureId: F, story: S });
    // AC1 now awaits the Navigator REVIEW.
    expect(firstReviewPendingAc(tdd, F, S)).toBe("AC1");
    // Navigator left a verdict requesting a refactor.
    writeJson(join(tdd, "cycles", F, S, "AC1", "review-verdict.json"), { refactor: true, notes: "extract a helper" });
    const r = reviewAc(tdd, F, S, "AC1");
    expect(r.refactorRequested).toBe(true);
    expect(firstReviewPendingAc(tdd, F, S)).toBeNull(); // reviewed
    expect(firstRefactorPendingAc(tdd, F, S)).toBe("AC1"); // refactor pending
    refactorAc(tdd, F, S, "AC1");
    expect(firstRefactorPendingAc(tdd, F, S)).toBeNull(); // refactored , AC fully done
  });

  it("per-AC REVIEW with no refactor verdict (looks good) does not request a refactor", () => {
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S }); greenOpenCycle({ tddDir: tdd, featureId: F, story: S });
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S }); greenOpenCycle({ tddDir: tdd, featureId: F, story: S });
    const r = reviewAc(tdd, F, S, "AC1"); // no verdict file => looks good
    expect(r.refactorRequested).toBe(false);
    expect(firstRefactorPendingAc(tdd, F, S)).toBeNull();
  });

  it("greenOpenCycle throws when there is no open RED cycle (driver dispatched with nothing to green)", () => {
    expect(() => greenOpenCycle({ tddDir: tdd, featureId: F, story: S })).toThrow(/no open RED cycle/);
  });

  it("storyTestProgress: after only T1 is green, the loop must CONTINUE (T2 pending, not allGreen)", () => {
    // The exact regression that stalled the live smoke: the build advanced to
    // await-acceptance after one test because "all RED cycles are green" was
    // true. With test-list-driven progress, T2 is still pending and allGreen is
    // false, so the Navigator is dispatched for T2 instead of awaiting acceptance.
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S }); // RED T1
    greenOpenCycle({ tddDir: tdd, featureId: F, story: S }); // GREEN T1
    const p = storyTestProgress(tdd, F, S);
    expect(p.total).toBe(2);
    expect(p.openRed.length).toBe(0);
    expect(p.allGreen).toBe(false); // NOT done , T2 unbuilt
    expect(p.pending.map((i) => i.id)).toEqual(["T2"]);
  });
});
