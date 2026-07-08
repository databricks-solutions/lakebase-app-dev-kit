// Build-level self-heal: a refactor-fixable build smell (layering-violation,
// ux-adherence, import-time-build-coupling) must NOT hard-halt to the HIL while
// the owning AC already has a refactor pending , the Driver's refactor turn is
// the remediation the Navigator's REVIEW prescribed. The escalation is suppressed
// while a refactor is pending; refactorAc resolves the smell on success; and with
// no refactor pending the smell still halts (the bound).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { isBuildRefactorRoutableSmell, writeSmellsLog, readSmellsLog } from "../../scripts/sftdd/smells";
import { diskArtifactProbe } from "../../scripts/sftdd/orchestrator-probe";
import { reviewAc, refactorAc, firstRefactorPendingAc, type GreenVerifier } from "../../scripts/sftdd/cycle-record";
import { writeCycleArtifact } from "../../scripts/sftdd/run-cycle";

const F = "F1";
const S = "S1";
let tdd: string;

const pass: GreenVerifier = async () => ({ passed: true, summary: "verify passed (stub)" });

function writeJson(file: string, obj: unknown): void {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "self-heal-"));
  const items = [{ id: "T1", description: "first", ac_id: "AC1", status: "pending" }];
  writeJson(join(tdd, "features", F, "stories", S, "acs", "AC1.json"), { id: "AC1", layer: "API" });
  writeJson(join(tdd, "features", F, "stories", S, "test-list-per-story.json"), { feature_id: F, story_id: S, items });
  writeJson(join(tdd, "features", F, "test-list.json"), { feature_id: F, items });
  // A cut experiment so refactorAc's storyExperiment + post-verify resolve.
  const expDir = join(tdd, "experiments", F, S, "exp1");
  mkdirSync(expDir, { recursive: true });
  writeFileSync(join(expDir, "branch.txt"), "experiment-s1-exp1");
  writeJson(join(expDir, "outcomes.json"), { status: "running" });
  // One GREEN cycle for T1 so AC1's tests are all green (REVIEW-eligible).
  writeCycleArtifact(
    { sftddDir: tdd, feature_id: F, story_id: S, ac_id: "AC1", experiment_slug: "exp1" },
    { cycle_id: "cycle-001", feature_id: F, story_id: S, ac_id: "AC1", test_id: "T1", test_description: "first", red_at: "2026-01-01T00:00:00Z", green_at: "2026-01-01T00:01:00Z" },
  );
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

/** Put AC1 into "reviewed, refactor requested, not yet refactored" state. */
function requestRefactor(): void {
  writeJson(join(tdd, "cycles", F, S, "AC1", "review-verdict.json"), {
    refactor: true,
    notes: "move app/models.py into app/models/ package per architecture.json",
  });
  reviewAc(tdd, F, S, "AC1");
}

describe("isBuildRefactorRoutableSmell", () => {
  it("flags the refactor-fixable build smells", () => {
    expect(isBuildRefactorRoutableSmell("layering-violation")).toBe(true);
    expect(isBuildRefactorRoutableSmell("ux-adherence")).toBe(true);
    expect(isBuildRefactorRoutableSmell("import-time-build-coupling")).toBe(true);
  });
  it("does NOT flag terminal or spec-level smells", () => {
    for (const s of ["cycle-stall", "scaffold-defect", "ac-overlap", "test-list-drift", "e2e-inline-regex-flag"]) {
      expect(isBuildRefactorRoutableSmell(s)).toBe(false);
    }
  });
});

describe("pendingEscalation: layering-violation self-heals while a refactor is pending", () => {
  it("suppresses the terminal escalation when the owning AC has a refactor pending", () => {
    writeSmellsLog(tdd, [{ smell: "layering-violation", cycle_ids: [], detail: "flat app/models.py vs declared app/models/ package" }]);
    requestRefactor();
    expect(firstRefactorPendingAc(tdd, F, S)).toBe("AC1"); // the driver's refactor turn is queued
    const probe = diskArtifactProbe(tdd, F, S);
    expect(probe.pendingEscalation()).toBeNull(); // NOT a HIL halt , the driver handles it
  });

  it("self-heals on a gate-blocking smell even when the Navigator verdict was refactor:false (the F5 bug)", () => {
    writeSmellsLog(tdd, [{ smell: "layering-violation", cycle_ids: [], detail: "duplicated render/error block across routes" }]);
    // The Navigator REVIEWed AC1 and recorded "looks good" (refactor:false), yet the
    // deterministic layering gate flagged a BLOCKING violation. Before the fix this
    // left no refactor pending, so the blocking smell escalated straight to HIL.
    writeJson(join(tdd, "cycles", F, S, "AC1", "review-verdict.json"), { refactor: false, notes: "AC behavior is correct" });
    reviewAc(tdd, F, S, "AC1");
    // The gate IS the refactor signal: a reviewed-but-unrefactored AC is now treated
    // as refactor-pending, so the Driver's refactor turn is dispatched...
    expect(firstRefactorPendingAc(tdd, F, S)).toBe("AC1");
    // ...and the escalation is suppressed (no HIL halt) while that refactor is pending.
    expect(diskArtifactProbe(tdd, F, S).pendingEscalation()).toBeNull();
  });

  it("still HALTS (terminal) when the same smell has no refactor pending", () => {
    writeSmellsLog(tdd, [{ smell: "layering-violation", cycle_ids: [], detail: "flat app/models.py vs declared app/models/ package" }]);
    // no review / refactor pending
    const probe = diskArtifactProbe(tdd, F, S);
    const e = probe.pendingEscalation();
    expect(e?.source).toBe("smell:layering-violation");
    expect(e?.routable).toBeUndefined(); // build smell, not spec-revise-routable
  });
});

describe("refactorAc: resolves the routable build smell on a successful refactor", () => {
  it("marks an open layering-violation resolved so it never re-escalates", async () => {
    writeSmellsLog(tdd, [{ smell: "layering-violation", cycle_ids: [], detail: "flat app/models.py vs declared app/models/ package" }]);
    requestRefactor();
    const r = await refactorAc(tdd, F, S, "AC1", { verify: pass });
    expect(r.refactored).toBe(true);
    const log = readSmellsLog(tdd);
    const entry = log.detected.find((d) => d.smell === "layering-violation");
    expect(entry?.resolution).toBeTruthy();
    // and after the refactor there is no pending escalation to halt on
    expect(diskArtifactProbe(tdd, F, S).pendingEscalation()).toBeNull();
  });
});
