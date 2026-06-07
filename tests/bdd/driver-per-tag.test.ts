// FEIP-7094 Phase 3 BDD coverage: per-tag outcomes, runner-contract guard,
// AC.layer auto-discovery on beginCycle, and the tagToRunner doc surface.
// Hermetic: tmpdir-based .tdd/ trees, no shell-outs.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  acLayerToTag,
  readOutcomes,
  recordTagRun,
  tagRunCount,
  writeOutcomes,
  type ExperimentOutcomes,
} from "../../scripts/tdd/experiment";
import {
  beginCycle,
  markGreen,
  readAcLayer,
  readCycleArtifact,
  recordRunnerOutcome,
  type CycleScope,
} from "../../scripts/tdd/run-cycle";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "..", "..");

function mkTempTdd(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `feip7094-p3-${prefix}-`));
}

function rmTempTdd(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

function seedFeatureAndAc(
  tddDir: string,
  opts: { featureId: string; storyId: string; acId: string; layer?: "API" | "E2E" | "Infra" }
): void {
  const acDir = path.join(tddDir, "features", opts.featureId, "stories", opts.storyId, "acs");
  fs.mkdirSync(acDir, { recursive: true });
  const ac: Record<string, unknown> = {
    id: opts.acId,
    given: "x",
    when: "y",
    then: "z",
    status: "draft",
  };
  if (opts.layer) ac.layer = opts.layer;
  fs.writeFileSync(path.join(acDir, `${opts.acId}.json`), JSON.stringify(ac, null, 2));
}

function seedExperiment(tddDir: string, featureId: string, slug: string, storyId = "S1"): void {
  const dir = path.join(tddDir, "experiments", featureId, storyId, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "branch.txt"), "test-branch");
  const outcomes: ExperimentOutcomes = { status: "running" };
  fs.writeFileSync(path.join(dir, "outcomes.json"), JSON.stringify(outcomes, null, 2) + "\n");
}

describe("acLayerToTag", () => {
  it("maps title-case AC.layer to the lowercase substrate tag", () => {
    expect(acLayerToTag("API")).toBe("api");
    expect(acLayerToTag("E2E")).toBe("e2e");
    expect(acLayerToTag("Infra")).toBe("infra");
  });
});

describe("recordTagRun + tagRunCount", () => {
  it("initializes by_tag on first call and updates totals", () => {
    const outcomes: ExperimentOutcomes = { status: "running" };
    recordTagRun(outcomes, "api", true);
    expect(outcomes.by_tag?.api).toEqual({ passed: 1, failed: 0 });
    expect(outcomes.tests_passed).toBe(1);
    expect(outcomes.tests_failed).toBeUndefined();
    expect(tagRunCount(outcomes, "api")).toBe(1);
    expect(tagRunCount(outcomes, "e2e")).toBe(0);
  });

  it("accumulates across passes and failures, keeps tags independent", () => {
    const outcomes: ExperimentOutcomes = { status: "running" };
    recordTagRun(outcomes, "api", true);
    recordTagRun(outcomes, "api", false);
    recordTagRun(outcomes, "e2e", true);
    expect(outcomes.by_tag?.api).toEqual({ passed: 1, failed: 1 });
    expect(outcomes.by_tag?.e2e).toEqual({ passed: 1, failed: 0 });
    expect(outcomes.tests_passed).toBe(2);
    expect(outcomes.tests_failed).toBe(1);
  });
});

describe("readAcLayer", () => {
  let tddDir: string;
  beforeEach(() => {
    tddDir = mkTempTdd("readac");
  });
  afterEach(() => rmTempTdd(tddDir));

  it("returns the layer when the AC declares one", () => {
    seedFeatureAndAc(tddDir, { featureId: "F1", storyId: "S1", acId: "AC1", layer: "E2E" });
    expect(readAcLayer(tddDir, "F1", "AC1")).toBe("E2E");
  });

  it("returns undefined when the AC is missing", () => {
    expect(readAcLayer(tddDir, "F1", "AC1")).toBeUndefined();
  });

  it("returns undefined when the AC has no layer field", () => {
    seedFeatureAndAc(tddDir, { featureId: "F1", storyId: "S1", acId: "AC1" });
    expect(readAcLayer(tddDir, "F1", "AC1")).toBeUndefined();
  });

  it("scans across stories to find the AC", () => {
    seedFeatureAndAc(tddDir, { featureId: "F1", storyId: "S2", acId: "AC42", layer: "API" });
    expect(readAcLayer(tddDir, "F1", "AC42")).toBe("API");
  });
});

describe("beginCycle stamps layer", () => {
  let tddDir: string;
  beforeEach(() => {
    tddDir = mkTempTdd("begin");
  });
  afterEach(() => rmTempTdd(tddDir));

  it("auto-discovers AC.layer when not provided", () => {
    seedFeatureAndAc(tddDir, { featureId: "F1", storyId: "S1", acId: "AC1", layer: "E2E" });
    const cycle = beginCycle({
      tddDir,
      feature_id: "F1",
      story_id: "S1",
      ac_id: "AC1",
      test_id: "T1",
      test_description: "smoke",
    });
    expect(cycle.layer).toBe("E2E");
  });

  it("honors explicit layer over AC.layer", () => {
    seedFeatureAndAc(tddDir, { featureId: "F1", storyId: "S1", acId: "AC1", layer: "E2E" });
    const cycle = beginCycle({
      tddDir,
      feature_id: "F1",
      story_id: "S1",
      ac_id: "AC1",
      test_id: "T1",
      test_description: "smoke",
      layer: "API",
    });
    expect(cycle.layer).toBe("API");
  });

  it("leaves layer undefined when neither source supplies one", () => {
    const cycle = beginCycle({
      tddDir,
      feature_id: "F1",
      story_id: "S1",
      ac_id: "AC1",
      test_id: "T1",
      test_description: "smoke",
    });
    expect(cycle.layer).toBeUndefined();
  });
});

describe("recordRunnerOutcome", () => {
  let tddDir: string;
  let scope: CycleScope;
  beforeEach(() => {
    tddDir = mkTempTdd("runner");
    scope = {
      tddDir,
      feature_id: "F1",
      story_id: "S1",
      ac_id: "AC1",
      experiment_slug: "exp",
    };
    seedFeatureAndAc(tddDir, { featureId: "F1", storyId: "S1", acId: "AC1", layer: "E2E" });
    seedExperiment(tddDir, "F1", "exp");
  });
  afterEach(() => rmTempTdd(tddDir));

  it("bumps outcomes by_tag for the cycle's layer and returns the count", () => {
    const cycle = beginCycle({
      ...scope,
      test_id: "T1",
      test_description: "smoke",
    });
    const result = recordRunnerOutcome({
      scope,
      cycleId: cycle.cycle_id,
      experimentSlug: "exp",
      passed: true,
    });
    expect(result.tag).toBe("e2e");
    expect(result.runsForTag).toBe(1);
    const outcomes = readOutcomes(tddDir, "F1", "S1", "exp")!;
    expect(outcomes.by_tag?.e2e).toEqual({ passed: 1, failed: 0 });
  });

  it("throws when no layer can be resolved", () => {
    const cycle = beginCycle({
      tddDir,
      feature_id: "F1",
      story_id: "S1",
      ac_id: "AC-missing",
      test_id: "T1",
      test_description: "smoke",
      experiment_slug: "exp",
    });
    expect(() =>
      recordRunnerOutcome({
        scope: { ...scope, ac_id: "AC-missing" },
        cycleId: cycle.cycle_id,
        experimentSlug: "exp",
        passed: true,
      })
    ).toThrow(/no layer/i);
  });

  it("backfills layer onto the cycle when caller supplies one", () => {
    const cycle = beginCycle({
      tddDir,
      feature_id: "F1",
      story_id: "S1",
      ac_id: "AC-bare",
      test_id: "T1",
      test_description: "smoke",
      experiment_slug: "exp",
    });
    expect(cycle.layer).toBeUndefined();
    recordRunnerOutcome({
      scope: { ...scope, ac_id: "AC-bare" },
      cycleId: cycle.cycle_id,
      experimentSlug: "exp",
      passed: true,
      layer: "Infra",
    });
    const reread = readCycleArtifact({ ...scope, ac_id: "AC-bare" }, cycle.cycle_id)!;
    expect(reread.layer).toBe("Infra");
  });
});

describe("markGreen runner-contract", () => {
  let tddDir: string;
  let scope: CycleScope;
  beforeEach(() => {
    tddDir = mkTempTdd("green");
    scope = {
      tddDir,
      feature_id: "F1",
      story_id: "S1",
      ac_id: "AC1",
      experiment_slug: "exp",
    };
    seedFeatureAndAc(tddDir, { featureId: "F1", storyId: "S1", acId: "AC1", layer: "E2E" });
    seedExperiment(tddDir, "F1", "exp");
  });
  afterEach(() => rmTempTdd(tddDir));

  it("refuses to advance when the layer has zero recorded runs", () => {
    const cycle = beginCycle({
      ...scope,
      test_id: "T1",
      test_description: "smoke",
    });
    expect(() => markGreen(scope, cycle.cycle_id, "no runner fired")).toThrow(
      /zero runs for "e2e"/
    );
  });

  it("advances once recordRunnerOutcome has logged a run", () => {
    const cycle = beginCycle({
      ...scope,
      test_id: "T1",
      test_description: "smoke",
    });
    recordRunnerOutcome({
      scope,
      cycleId: cycle.cycle_id,
      experimentSlug: "exp",
      passed: true,
    });
    const advanced = markGreen(scope, cycle.cycle_id, "playwright ok");
    expect(advanced.green_at).toBeTruthy();
    expect(advanced.navigator_verdict).toBe("passed");
  });

  it("is permissive when the cycle has no layer (brownfield)", () => {
    const bareCycle = beginCycle({
      tddDir,
      feature_id: "F1",
      story_id: "S1",
      ac_id: "AC-bare",
      test_id: "T1",
      test_description: "smoke",
      experiment_slug: "exp",
    });
    const advanced = markGreen({ ...scope, ac_id: "AC-bare" }, bareCycle.cycle_id, "ok");
    expect(advanced.green_at).toBeTruthy();
  });

  it("counts mid-cycle failed runs toward the run total (the guard fires on zero, not on red)", () => {
    const cycle = beginCycle({
      ...scope,
      test_id: "T1",
      test_description: "smoke",
    });
    recordRunnerOutcome({
      scope,
      cycleId: cycle.cycle_id,
      experimentSlug: "exp",
      passed: false,
    });
    // Sanity: by_tag.e2e.failed === 1, total === 1, so markGreen no longer refuses.
    const advanced = markGreen(scope, cycle.cycle_id, "fixed and re-ran");
    expect(advanced.green_at).toBeTruthy();
  });
});

describe("SKILL.md + driver.md: tagToRunner documentation", () => {
  it("SKILL.md includes a tag-to-runner table with API / E2E / Infra rows", () => {
    const skill = fs.readFileSync(
      path.join(REPO_ROOT, "skills", "lakebase-tdd-workflows", "SKILL.md"),
      "utf8"
    );
    expect(skill).toMatch(/tag\s*→?\s*runner map/i);
    expect(skill).toMatch(/`API`/);
    expect(skill).toMatch(/`E2E`/);
    expect(skill).toMatch(/`Infra`/);
    expect(skill).toMatch(/playwright test|test:e2e/);
    expect(skill).toMatch(/recordRunnerOutcome/);
  });

  it("driver.md instructs the Driver to dispatch on AC layer and call recordRunnerOutcome", () => {
    const driver = fs.readFileSync(
      path.join(REPO_ROOT, "skills", "lakebase-tdd-workflows", "agents", "driver.md"),
      "utf8"
    );
    expect(driver).toMatch(/cycle's AC layer|AC\.layer/);
    expect(driver).toMatch(/BASE_URL/);
    expect(driver).toMatch(/recordRunnerOutcome/);
    expect(driver).toMatch(/tagToRunner|tag → runner map|tag-to-runner/i);
  });
});

describe("writeOutcomes pass-through (regression)", () => {
  it("recordTagRun mutation persists when written through writeOutcomes", () => {
    const tddDir = mkTempTdd("write");
    try {
      seedExperiment(tddDir, "F1", "exp");
      const outcomes = readOutcomes(tddDir, "F1", "S1", "exp")!;
      recordTagRun(outcomes, "infra", false);
      writeOutcomes(tddDir, "F1", "S1", "exp", outcomes);
      const reread = readOutcomes(tddDir, "F1", "S1", "exp")!;
      expect(reread.by_tag?.infra).toEqual({ passed: 0, failed: 1 });
      expect(reread.tests_failed).toBe(1);
    } finally {
      rmTempTdd(tddDir);
    }
  });
});
