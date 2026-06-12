// Cycle recording is an ORCHESTRATION concern: the deterministic driver calls
// beginNextPendingCycle (after the pure Navigator writes the test) and
// greenOpenCycle (after the pure Driver makes it pass). These stamp the SAME
// red_at / green_at the probe reads , the contract the live smoke broke when
// the Navigator hand-wrote a cycle with `status:"red"` (no red_at) and the
// driver re-dispatched it forever.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from "fs";
import { execSync } from "node:child_process";
import { tmpdir } from "os";
import { join } from "path";
import {
  beginNextPendingCycle,
  greenOpenCycle,
  storyTestProgress,
  pendingItemKind,
  firstReviewPendingAc,
  firstRefactorPendingAc,
  reviewAc,
  refactorAc,
  type GreenVerifier,
} from "../../scripts/tdd/cycle-record.js";
import { readAgentLog } from "../../scripts/tdd/agent-log.js";

// greenOpenCycle now runs an HONEST verify (deploy-during-build) before stamping
// green. These cycle-record unit tests inject a passing verifier so they exercise
// the recording path without a real app; the failing-verifier -> escalation path
// is covered in tdd-honest-green.test.ts.
const pass: GreenVerifier = async () => ({ passed: true, summary: "verify passed (test stub)" });

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

describe("cycle-record: orchestration stamps RED/GREEN the probe can read", async () => {
  it("beginNextPendingCycle stamps red_at (NOT a freehand status) for the first pending test", async () => {
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

  it("greenOpenCycle records the run + stamps green_at on the open RED cycle", async () => {
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S });
    const g = await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: pass });
    expect(g.recorded).toBe(true);
    expect(g.testId).toBe("T1");
    const cycles = cyclesFor("AC1");
    expect(cycles[0].green_at).toBeTruthy();
    // markGreen's runner contract was satisfied: an outcome was recorded.
    const outcomes = JSON.parse(readFileSync(join(tdd, "experiments", F, S, "exp1", "outcomes.json"), "utf8"));
    expect(outcomes.by_tag).toBeTruthy();
  });

  it("sequences one test at a time: begin -> green -> begin advances to the next pending", async () => {
    expect(beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S }).testId).toBe("T1");
    await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: pass });
    expect(beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S }).testId).toBe("T2");
    await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: pass });
    // Both tests have green cycles now , nothing pending.
    const after = beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S });
    expect(after.recorded).toBe(false);
    expect(cyclesFor("AC1").length).toBe(2);
  });

  it("greenOpenCycle propagates green to the master test-list item + flips the AC to `passing`", async () => {
    // The await-acceptance stall: the cycle was green but the test-list items
    // stayed `pending` + the AC `draft`, so the Release Engineer refused to
    // deploy. Greening every test for an AC must mark the items green + the AC passing.
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S }); await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: pass }); // T1
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S }); await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: pass }); // T2
    const master = JSON.parse(readFileSync(join(tdd, "features", F, "test-list.json"), "utf8"));
    expect(master.items.every((i: { status: string }) => i.status === "green")).toBe(true);
    const perStory = JSON.parse(readFileSync(join(tdd, "features", F, "stories", S, "test-list-per-story.json"), "utf8"));
    expect(perStory.items.every((i: { status: string }) => i.status === "green")).toBe(true);
    const ac1 = JSON.parse(readFileSync(join(tdd, "features", F, "stories", S, "acs", "AC1.json"), "utf8"));
    expect(ac1.status).toBe("passing"); // all of AC1's tests are green
  });

  it("per-AC REVIEW/REFACTOR: AC awaits review once all its tests are green; verdict drives refactor", async () => {
    // Green both of AC1's tests.
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S }); await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: pass });
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S }); await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: pass });
    // AC1 now awaits the Navigator REVIEW.
    expect(firstReviewPendingAc(tdd, F, S)).toBe("AC1");
    // Navigator left a verdict requesting a refactor.
    writeJson(join(tdd, "cycles", F, S, "AC1", "review-verdict.json"), { refactor: true, notes: "extract a helper" });
    const r = reviewAc(tdd, F, S, "AC1");
    expect(r.refactorRequested).toBe(true);
    expect(firstReviewPendingAc(tdd, F, S)).toBeNull(); // reviewed
    expect(firstRefactorPendingAc(tdd, F, S)).toBe("AC1"); // refactor pending
    await refactorAc(tdd, F, S, "AC1", { verify: pass });
    expect(firstRefactorPendingAc(tdd, F, S)).toBeNull(); // refactored , AC fully done
  });

  it("REVIEW + REFACTOR emit cycle.review + cycle.refactored to the central log (closes the RED->GREEN->REVIEW->REFACTOR trail)", async () => {
    // Regression: the per-AC review/refactor lane (reviewAc/refactorAc) wrote
    // review.json but emitted NO agent-log event, so a live run's central log
    // showed cycle.red + cycle.green per AC and then went silent through review
    // + refactor. Both transitions must emit their closed-vocabulary event.
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S }); await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: pass });
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S }); await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: pass });
    writeJson(join(tdd, "cycles", F, S, "AC1", "review-verdict.json"), { refactor: true, notes: "extract a helper" });
    reviewAc(tdd, F, S, "AC1");
    await refactorAc(tdd, F, S, "AC1", { verify: pass });

    const log = readAgentLog({ tddDir: tdd });
    const review = log.find((e) => e.event === "cycle.review");
    expect(review, "expected a cycle.review event").toBeTruthy();
    expect(review!.role).toBe("navigator");
    expect((review!.metadata as { ac?: string })?.ac).toBe("AC1");
    expect((review!.metadata as { refactor?: boolean })?.refactor).toBe(true);

    const refactored = log.find((e) => e.event === "cycle.refactored");
    expect(refactored, "expected a cycle.refactored event").toBeTruthy();
    expect(refactored!.role).toBe("driver");
    expect((refactored!.metadata as { ac?: string })?.ac).toBe("AC1");
  });

  it("per-AC REVIEW with no refactor verdict (looks good) does not request a refactor", async () => {
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S }); await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: pass });
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S }); await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: pass });
    const r = reviewAc(tdd, F, S, "AC1"); // no verdict file => looks good
    expect(r.refactorRequested).toBe(false);
    expect(firstRefactorPendingAc(tdd, F, S)).toBeNull();
  });

  it("greenOpenCycle throws when there is no open RED cycle (driver dispatched with nothing to green)", async () => {
    await expect(greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: pass })).rejects.toThrow(
      /no open RED cycle/,
    );
  });

  it("storyTestProgress: after only T1 is green, the loop must CONTINUE (T2 pending, not allGreen)", async () => {
    // The exact regression that stalled the live smoke: the build advanced to
    // await-acceptance after one test because "all RED cycles are green" was
    // true. With test-list-driven progress, T2 is still pending and allGreen is
    // false, so the Navigator is dispatched for T2 instead of awaiting acceptance.
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S }); // RED T1
    await greenOpenCycle({ tddDir: tdd, featureId: F, story: S, verify: pass }); // GREEN T1
    const p = storyTestProgress(tdd, F, S);
    expect(p.total).toBe(2);
    expect(p.openRed.length).toBe(0);
    expect(p.allGreen).toBe(false); // NOT done , T2 unbuilt
    expect(p.pending.map((i) => i.id)).toEqual(["T2"]);
  });

  it("pendingItemKind: reports the next pending item's kind (drives the born-green fitness guard)", async () => {
    // The seeded list has no `kind` on T1/T2 (a behavior AC test): undefined.
    expect(pendingItemKind(tdd, F, S)).toBeUndefined();
    // A fitness-kind item that is already done, then a pending fitness guard,
    // then a pending behavior test , pendingItemKind reads the FIRST pending.
    const perStory = join(tdd, "features", F, "stories", S, "test-list-per-story.json");
    writeJson(perStory, {
      feature_id: F,
      story_id: S,
      items: [
        { id: "TF", description: "service layer owns persistence", ac_id: "AC1", status: "pending", kind: "fitness" },
        { id: "T2", description: "second thing fails", ac_id: "AC1", status: "pending", kind: "behavior" },
      ],
    });
    expect(pendingItemKind(tdd, F, S)).toBe("fitness");
    // pending = "items with no cycle yet". Once TF has a cycle, the next pending
    // item is the behavior test, so the reported kind advances to "behavior".
    beginNextPendingCycle({ tddDir: tdd, featureId: F, story: S }); // RED cycle for TF (the first pending)
    expect(pendingItemKind(tdd, F, S)).toBe("behavior");
  });
});

// Each GREEN and each completed REFACTOR commits the working tree on the
// experiment branch, so accept's git-merge carries real commits up to the
// feature branch and the promote phase's prepare-pr finds a clean tree. The
// live smoke surfaced the gap: the build wrote code but never committed it, so
// promote's prepare-pr aborted with dirty-working-tree.
describe("cycle-record: GREEN + REFACTOR each commit on the experiment branch", () => {
  let proj: string;
  let ptdd: string;
  const gitlog = (): string => execSync("git log --oneline", { cwd: proj }).toString();
  // CODE cleanliness: the build commits code only, leaving .tdd/.lakebase churn
  // uncommitted by design (committing it would break accept's branch checkout).
  const codeDirty = (): string =>
    execSync("git status --porcelain -- . ':(exclude).tdd' ':(exclude).lakebase'", { cwd: proj }).toString().trim();

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), "tdd-commit-proj-"));
    ptdd = join(proj, ".tdd");
    const acsDir = join(ptdd, "features", F, "stories", S, "acs");
    mkdirSync(acsDir, { recursive: true });
    writeJson(join(acsDir, "AC1.json"), { id: "AC1", layer: "API", text: "the API returns" });
    const items = [{ id: "T1", description: "first thing fails", ac_id: "AC1", status: "pending" }];
    writeJson(join(ptdd, "features", F, "stories", S, "test-list-per-story.json"), { feature_id: F, story_id: S, items });
    writeJson(join(ptdd, "features", F, "test-list.json"), { feature_id: F, items });
    const expDir = join(ptdd, "experiments", F, S, "exp1");
    mkdirSync(expDir, { recursive: true });
    writeFileSync(join(expDir, "branch.txt"), "experiment-s1-exp1");
    writeJson(join(expDir, "outcomes.json"), { status: "running" });
    // A real git repo on the experiment branch with a seed commit.
    execSync("git init -q", { cwd: proj });
    execSync("git config user.email t@example.com && git config user.name tester", { cwd: proj });
    execSync("git checkout -q -b experiment-s1-exp1", { cwd: proj });
    writeFileSync(join(proj, "README.md"), "seed\n");
    execSync("git add -A && git commit -q -m seed", { cwd: proj });
  });

  afterEach(() => {
    rmSync(proj, { recursive: true, force: true });
  });

  it("greenOpenCycle commits the green increment + leaves a clean tree", async () => {
    beginNextPendingCycle({ tddDir: ptdd, featureId: F, story: S });
    writeFileSync(join(proj, "app.py"), "x = 1\n"); // the Driver's production code
    await greenOpenCycle({ tddDir: ptdd, featureId: F, story: S, verify: pass });
    expect(gitlog()).toMatch(/green: T1 \(AC1\)/);
    expect(codeDirty()).toBe(""); // code committed => prepare-pr would pass
    // .tdd is intentionally NOT committed by the build (avoids the accept-checkout divergence).
    expect(execSync("git status --porcelain", { cwd: proj }).toString()).toMatch(/\.tdd\//);
  });

  it("commits the project-level .tdd/design corpus (so the next feature inherits it) but NOT the churny .tdd state", async () => {
    // The persistence bug: F1 authored design/design-guide.json but the build's
    // code-only commit excluded ALL of .tdd, so the design guide never rode F1's
    // PR to the parent tier. F2 forked from the tier WITHOUT it, designGuideReady
    // was false, and the UX designer re-authored the whole design system. The
    // fix force-includes the STABLE design corpus while still excluding the
    // churny state that would diverge from the feature branch.
    const designDir = join(ptdd, "design");
    mkdirSync(designDir, { recursive: true });
    writeJson(join(designDir, "design-guide.json"), { tokens: { color: { primary: "#111" } } });
    writeFileSync(join(designDir, "design-guide.md"), "# Design Guide\n");
    writeFileSync(join(designDir, "ia.md"), "# Information Architecture\n");
    // Churny per-run state that must stay OUT of the commit (committing it would
    // diverge from the feature branch and break accept's `git checkout`).
    writeJson(join(ptdd, "workflow-state.json"), { phase: "build" });

    beginNextPendingCycle({ tddDir: ptdd, featureId: F, story: S });
    writeFileSync(join(proj, "app.py"), "x = 1\n");
    await greenOpenCycle({ tddDir: ptdd, featureId: F, story: S, verify: pass });

    const tracked = execSync("git ls-files", { cwd: proj }).toString();
    // The design corpus IS committed (rides the PR to the parent tier). It was
    // created AFTER the seed commit, so its presence proves commitCycleWork
    // force-included it past the broad `.tdd` exclude.
    expect(tracked).toMatch(/\.tdd\/design\/design-guide\.json/);
    expect(tracked).toMatch(/\.tdd\/design\/design-guide\.md/);
    expect(tracked).toMatch(/\.tdd\/design\/ia\.md/);
    // The churny state (also created after the seed) is NOT committed: it stays
    // uncommitted so its copy never diverges from the feature branch.
    expect(tracked).not.toMatch(/\.tdd\/workflow-state\.json/);
    expect(execSync("git status --porcelain", { cwd: proj }).toString()).toMatch(/\.tdd\/workflow-state\.json/);
  });

  it("refactorAc commits the behavior-preserving refactor as its own commit", async () => {
    beginNextPendingCycle({ tddDir: ptdd, featureId: F, story: S });
    writeFileSync(join(proj, "app.py"), "x = 1\n");
    await greenOpenCycle({ tddDir: ptdd, featureId: F, story: S, verify: pass });
    writeJson(join(ptdd, "cycles", F, S, "AC1", "review-verdict.json"), { refactor: true, notes: "extract helper" });
    reviewAc(ptdd, F, S, "AC1");
    writeFileSync(join(proj, "app.py"), "x = 2  # extracted helper\n");
    await refactorAc(ptdd, F, S, "AC1", { verify: pass });
    expect(gitlog()).toMatch(/refactor: AC1/);
    expect(codeDirty()).toBe("");
  });
});
