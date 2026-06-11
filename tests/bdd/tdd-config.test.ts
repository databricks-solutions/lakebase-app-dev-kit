// Unified TDD config (.lakebase/tdd-config.json): one declarative source for the
// per-role/turn model+effort matrix + build/plan/project knobs. Resolution order
// is tdd-config.json -> LAKEBASE_TDD_* env -> code default, per setting.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { resolveTddSettings, loadTddConfig, defaultTddConfig, writeTddConfig, TDD_CONFIG_REL } from "../../scripts/tdd/tdd-config.js";

let proj: string;
const writeConfig = (obj: unknown): void => {
  mkdirSync(join(proj, ".lakebase"), { recursive: true });
  writeFileSync(join(proj, TDD_CONFIG_REL), JSON.stringify(obj, null, 2));
};

beforeEach(() => {
  proj = mkdtempSync(join(tmpdir(), "tdd-config-"));
});
afterEach(() => rmSync(proj, { recursive: true, force: true }));

describe("resolveTddSettings: defaults when no file + no env", () => {
  it("uses recommended models + P6 default (navigator REVIEW low, else model-default)", () => {
    const s = resolveTddSettings({ projectDir: proj, env: {} });
    expect(s.models.navigator).toBe("sonnet");
    expect(s.models["spec-author"]).toBe("opus");
    expect(s.effortFor("navigator", "review")).toBe("low");
    expect(s.effortFor("navigator", "red")).toBe("default");
    expect(s.effortFor("driver", "green")).toBe("default");
    expect(s.build.loopGranularity).toBe("ac");
    expect(s.build.sessionScope).toBe("story");
    expect(s.plan.sizing).toBe(true);
    expect(s.fallbackModels.navigator).toBeUndefined();
    expect(s.budgets.navigator).toBeUndefined();
  });
});

describe("resolveTddSettings: the file drives the per-role/turn matrix", () => {
  it("model + per-turn effort + fallbackModel + maxBudgetUsd from the file", () => {
    writeConfig({
      version: 1,
      roles: {
        navigator: { model: "opus", fallbackModel: "sonnet", maxBudgetUsd: 2.5, effort: { red: "high", review: "low" } },
        driver: { model: "sonnet", effort: "medium" },
      },
      build: { loopGranularity: "hybrid-a", batchCap: 2, sessionScope: "cycle" },
      plan: { sizing: false },
      project: { uiTrack: true },
    });
    const s = resolveTddSettings({ projectDir: proj, env: {} });
    expect(s.models.navigator).toBe("opus");
    expect(s.fallbackModels.navigator).toBe("sonnet");
    expect(s.budgets.navigator).toBe(2.5);
    expect(s.effortFor("navigator", "red")).toBe("high"); // per-turn map
    expect(s.effortFor("navigator", "review")).toBe("low");
    expect(s.effortFor("driver", "green")).toBe("medium"); // scalar applies to all turns
    expect(s.effortFor("driver", "refactor")).toBe("medium");
    expect(s.build.loopGranularity).toBe("hybrid-a");
    expect(s.build.batchCap).toBe(2);
    expect(s.build.sessionScope).toBe("cycle");
    expect(s.plan.sizing).toBe(false);
    expect(s.project.uiTrack).toBe(true);
  });
});

describe("resolveTddSettings: env overrides the file", () => {
  it("LAKEBASE_TDD_LOOP / _BATCH_CAP / _BUILD_SESSION / _REVIEW_EFFORT / _UI win over the file", () => {
    writeConfig({
      version: 1,
      roles: { navigator: { effort: { review: "high" } } },
      build: { loopGranularity: "ac", batchCap: 5, sessionScope: "story" },
      project: { uiTrack: false },
    });
    const s = resolveTddSettings({
      projectDir: proj,
      env: {
        LAKEBASE_TDD_LOOP: "hybrid-a",
        LAKEBASE_TDD_BATCH_CAP: "3",
        LAKEBASE_TDD_BUILD_SESSION: "cycle",
        LAKEBASE_TDD_REVIEW_EFFORT: "low",
        LAKEBASE_TDD_UI: "1",
      },
    });
    expect(s.build.loopGranularity).toBe("hybrid-a");
    expect(s.build.batchCap).toBe(3);
    expect(s.build.sessionScope).toBe("cycle");
    expect(s.effortFor("navigator", "review")).toBe("low"); // env beats the file's "high"
    expect(s.project.uiTrack).toBe(true);
  });

  it("LAKEBASE_TDD_REVIEW_EFFORT=default drops to model-default, overriding the file's level", () => {
    writeConfig({ version: 1, roles: { navigator: { effort: { review: "high" } } } });
    const s = resolveTddSettings({ projectDir: proj, env: { LAKEBASE_TDD_REVIEW_EFFORT: "default" } });
    // Env overrides the file (one-off experiment on top): =default drops the flag.
    expect(s.effortFor("navigator", "review")).toBe("default");
  });
});

describe("legacy agent-config.json is honored below the new file", () => {
  it("falls back to agent-config model override when tdd-config.json is absent", () => {
    mkdirSync(join(proj, ".lakebase"), { recursive: true });
    writeFileSync(
      join(proj, ".lakebase", "agent-config.json"),
      JSON.stringify({ version: 1, roles: { navigator: { recommended: "sonnet", override: "opus" } } }),
    );
    const s = resolveTddSettings({ projectDir: proj, env: {} });
    expect(s.models.navigator).toBe("opus"); // legacy override
  });
});

describe("defaultTddConfig + write/load round-trip", () => {
  it("seeds recommended models + navigator review low, and round-trips", () => {
    const wrote = writeTddConfig(proj, defaultTddConfig());
    expect(wrote).toBe(true);
    const loaded = loadTddConfig(proj);
    expect(loaded?.version).toBe(1);
    expect(loaded?.roles?.navigator?.model).toBe("sonnet");
    expect((loaded?.roles?.navigator?.effort as { review?: string })?.review).toBe("low");
    // Does not overwrite without force.
    expect(writeTddConfig(proj, defaultTddConfig())).toBe(false);
  });
});
