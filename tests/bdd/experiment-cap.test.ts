// BDD coverage for the per-experiment cost/timeout cap primitive.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  checkPerExperimentCap,
  clearExperimentCap,
  recordExperimentCap,
} from "../../scripts/tdd/experiment-cap";
import { readOutcomes } from "../../scripts/tdd/experiment";

function mkTempTdd(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `experiment-cap-${prefix}-`));
}

function rm(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

function seedExperiment(
  tddDir: string,
  featureId: string,
  slug: string,
  opts: { cutAt?: string; storyId?: string } = {}
): void {
  const dir = path.join(tddDir, "experiments", featureId, opts.storyId ?? "S1", slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "branch.txt"), `feature-${slug}`);
  fs.writeFileSync(path.join(dir, "outcomes.json"), JSON.stringify({ status: "running" }, null, 2) + "\n");
  const timeline = {
    entries: [{ ts: opts.cutAt ?? "2026-06-02T08:00:00.000Z", kind: "cut", branch: `feature-${slug}` }],
  };
  fs.writeFileSync(path.join(dir, "timeline.json"), JSON.stringify(timeline, null, 2) + "\n");
}

describe("checkPerExperimentCap: no cap configured", () => {
  it("returns capped=false when cap is undefined", () => {
    const result = checkPerExperimentCap({
      tddDir: "/tmp/anywhere",
      featureId: "F1",
      storyId: "S1",
      experimentSlug: "exp",
      cycleCount: 1000,
    });
    expect(result).toEqual({ capped: false });
  });

  it("returns capped=false when cap is an empty object", () => {
    const result = checkPerExperimentCap({
      tddDir: "/tmp/anywhere",
      featureId: "F1",
      storyId: "S1",
      experimentSlug: "exp",
      cap: {},
      cycleCount: 1000,
    });
    expect(result.capped).toBe(false);
  });

  it("treats max_cycles <= 0 as no cap", () => {
    const result = checkPerExperimentCap({
      tddDir: "/tmp/anywhere",
      featureId: "F1",
      storyId: "S1",
      experimentSlug: "exp",
      cap: { max_cycles: 0 },
      cycleCount: 100,
    });
    expect(result.capped).toBe(false);
  });
});

describe("checkPerExperimentCap: max_cycles", () => {
  let tddDir: string;
  beforeEach(() => {
    tddDir = mkTempTdd("cycles");
    seedExperiment(tddDir, "F1", "exp");
  });
  afterEach(() => rm(tddDir));

  it("fires when cycleCount reaches the threshold", () => {
    const result = checkPerExperimentCap({
      tddDir,
      featureId: "F1",
      storyId: "S1",
      experimentSlug: "exp",
      cap: { max_cycles: 10 },
      cycleCount: 10,
    });
    expect(result.capped).toBe(true);
    expect(result.hit?.reason).toBe("max_cycles");
    expect(result.hit?.at_cycle).toBe(10);
    expect(result.hit?.cap_value).toBe(10);
  });

  it("does not fire when cycleCount is below the threshold", () => {
    const result = checkPerExperimentCap({
      tddDir,
      featureId: "F1",
      storyId: "S1",
      experimentSlug: "exp",
      cap: { max_cycles: 10 },
      cycleCount: 9,
    });
    expect(result.capped).toBe(false);
  });

  it("fires deterministically before the wall-clock cap when both could trip", () => {
    const result = checkPerExperimentCap({
      tddDir,
      featureId: "F1",
      storyId: "S1",
      experimentSlug: "exp",
      cap: { max_cycles: 5, max_wall_clock_minutes: 30 },
      cycleCount: 5,
      now: Date.parse("2026-06-02T09:00:00.000Z"), // 1h elapsed from cut
    });
    expect(result.hit?.reason).toBe("max_cycles");
  });
});

describe("checkPerExperimentCap: max_wall_clock_minutes", () => {
  let tddDir: string;
  beforeEach(() => {
    tddDir = mkTempTdd("wallclock");
    seedExperiment(tddDir, "F1", "exp", { cutAt: "2026-06-02T08:00:00.000Z" });
  });
  afterEach(() => rm(tddDir));

  it("fires when elapsed minutes meet the threshold", () => {
    const result = checkPerExperimentCap({
      tddDir,
      featureId: "F1",
      storyId: "S1",
      experimentSlug: "exp",
      cap: { max_wall_clock_minutes: 30 },
      cycleCount: 1,
      now: Date.parse("2026-06-02T08:30:00.000Z"),
    });
    expect(result.capped).toBe(true);
    expect(result.hit?.reason).toBe("max_wall_clock_minutes");
    expect(result.hit?.cap_value).toBe(30);
    expect(result.hit?.at_minutes).toBeGreaterThanOrEqual(30);
  });

  it("does not fire when elapsed minutes are below the threshold", () => {
    const result = checkPerExperimentCap({
      tddDir,
      featureId: "F1",
      storyId: "S1",
      experimentSlug: "exp",
      cap: { max_wall_clock_minutes: 30 },
      cycleCount: 1,
      now: Date.parse("2026-06-02T08:15:00.000Z"),
    });
    expect(result.capped).toBe(false);
  });

  it("silently skips the wall-clock check when no timeline.json exists", () => {
    const bareTdd = mkTempTdd("bare");
    try {
      fs.mkdirSync(path.join(bareTdd, "experiments", "F1", "S1", "exp"), { recursive: true });
      const result = checkPerExperimentCap({
        tddDir: bareTdd,
        featureId: "F1",
      storyId: "S1",
        experimentSlug: "exp",
        cap: { max_wall_clock_minutes: 1 },
        cycleCount: 1,
        now: Date.parse("2099-01-01T00:00:00.000Z"),
      });
      expect(result.capped).toBe(false);
    } finally {
      rm(bareTdd);
    }
  });
});

describe("recordExperimentCap + clearExperimentCap", () => {
  let tddDir: string;
  beforeEach(() => {
    tddDir = mkTempTdd("record");
    seedExperiment(tddDir, "F1", "exp");
  });
  afterEach(() => rm(tddDir));

  it("persists the cap hit onto outcomes.json", () => {
    recordExperimentCap({
      tddDir,
      featureId: "F1",
      storyId: "S1",
      experimentSlug: "exp",
      hit: { reason: "max_cycles", at_cycle: 10, cap_value: 10 },
    });
    const outcomes = readOutcomes(tddDir, "F1", "S1", "exp")!;
    expect(outcomes.capped).toEqual({ reason: "max_cycles", at_cycle: 10, cap_value: 10 });
  });

  it("overwrites an existing cap on subsequent calls", () => {
    recordExperimentCap({
      tddDir,
      featureId: "F1",
      storyId: "S1",
      experimentSlug: "exp",
      hit: { reason: "max_cycles", at_cycle: 10, cap_value: 10 },
    });
    recordExperimentCap({
      tddDir,
      featureId: "F1",
      storyId: "S1",
      experimentSlug: "exp",
      hit: { reason: "max_wall_clock_minutes", at_cycle: 12, cap_value: 60, at_minutes: 61.2 },
    });
    const outcomes = readOutcomes(tddDir, "F1", "S1", "exp")!;
    expect(outcomes.capped?.reason).toBe("max_wall_clock_minutes");
    expect(outcomes.capped?.at_minutes).toBe(61.2);
  });

  it("throws when outcomes.json does not exist", () => {
    const empty = mkTempTdd("empty");
    try {
      expect(() =>
        recordExperimentCap({
          tddDir: empty,
          featureId: "F1",
      storyId: "S1",
          experimentSlug: "exp",
          hit: { reason: "max_cycles", at_cycle: 1, cap_value: 1 },
        })
      ).toThrow(/outcomes\.json not found/);
    } finally {
      rm(empty);
    }
  });

  it("clearExperimentCap removes the capped field; second call is a no-op", () => {
    recordExperimentCap({
      tddDir,
      featureId: "F1",
      storyId: "S1",
      experimentSlug: "exp",
      hit: { reason: "max_cycles", at_cycle: 10, cap_value: 10 },
    });
    clearExperimentCap({ tddDir, featureId: "F1", storyId: "S1", experimentSlug: "exp" });
    expect(readOutcomes(tddDir, "F1", "S1", "exp")?.capped).toBeUndefined();
    // Idempotent.
    expect(() =>
      clearExperimentCap({ tddDir, featureId: "F1", storyId: "S1", experimentSlug: "exp" })
    ).not.toThrow();
  });
});

describe("analyzeForGate populates a default per-experiment cap", () => {
  it("proposed_plan.budget.per_experiment carries default max_cycles + max_wall_clock_minutes", async () => {
    const { analyzeForGate } = await import("../../scripts/tdd/design-spec-gate");
    const { writeMasterTestList } = await import("../../scripts/tdd/test-list");
    const tddDir = mkTempTdd("analyze");
    try {
      fs.mkdirSync(path.join(tddDir, "features", "F1"), { recursive: true });
      writeMasterTestList(tddDir, {
        feature_id: "F1",
        items: [{ id: "T1", description: "any", ac_id: "AC1", status: "pending" }],
      });
      const analysis = analyzeForGate(tddDir, "F1", "S1");
      expect(analysis.proposed_plan.budget.per_experiment).toBeDefined();
      expect(analysis.proposed_plan.budget.per_experiment?.max_cycles).toBeGreaterThan(0);
      expect(analysis.proposed_plan.budget.per_experiment?.max_wall_clock_minutes).toBeGreaterThan(0);
    } finally {
      rm(tddDir);
    }
  });
});

describe("compareExperiments surfaces capped outcomes", () => {
  it("classifies signal as 'capped' and copies the cap onto the experiment row", async () => {
    const { compareExperiments } = await import("../../scripts/tdd/compare-experiments");
    const tddDir = mkTempTdd("compare");
    try {
      seedExperiment(tddDir, "F1", "exp-a");
      recordExperimentCap({
        tddDir,
        featureId: "F1",
      storyId: "S1",
        experimentSlug: "exp-a",
        hit: { reason: "max_cycles", at_cycle: 30, cap_value: 30 },
      });
      const report = compareExperiments(tddDir, "F1", "S1");
      const row = report.rows.find((r) => r.experiment_slug === "exp-a")!;
      expect(row.signal).toBe("capped");
      expect(row.capped?.reason).toBe("max_cycles");
    } finally {
      rm(tddDir);
    }
  });
});

describe("comparison-report renders the cap status", () => {
  it("includes a Cap column in the per-experiment table and a remediation line in the decision block", async () => {
    const { renderComparisonReport } = await import("../../scripts/tdd/comparison-report");
    const md = renderComparisonReport({
      feature_id: "F1",
      story_id: "S1",
      generated_at: "2026-06-02T08:15:00.000Z",
      rows: [
        {
          experiment_slug: "exp-cap",
          branch_id: "feature-x",
          status: "running",
          signal: "capped",
          capped: { reason: "max_cycles", at_cycle: 30, cap_value: 30 },
          cycle_count: 30,
          artifact_count: 0,
        },
      ],
      matrix: [],
      recommendation: "continue",
      rationale: "experiment capped, awaiting remediation",
    });
    expect(md).toMatch(/\| Cap \|/);
    expect(md).toMatch(/max_cycles \(>=30 @ cycle 30\)/);
    expect(md).toMatch(/Capped experiment\(s\) awaiting PO remediation: `exp-cap`/);
    expect(md).toMatch(/`extend`|`abandon`|`continue-suite`/);
  });
});
