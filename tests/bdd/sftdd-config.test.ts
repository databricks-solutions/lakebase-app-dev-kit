// Unified TDD config (.lakebase/sftdd-config.json): one declarative source for the
// per-role/turn model+effort matrix + build/plan/project knobs. Resolution order
// is sftdd-config.json -> LAKEBASE_SFTDD_* env -> code default, per setting.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { resolveTddSettings, loadTddConfig, defaultTddConfig, writeTddConfig, TDD_CONFIG_REL, SFTDD_CONFIG_REL, LEGACY_TDD_CONFIG_REL } from "../../scripts/sftdd/tdd-config.js";
import { sftddEnv } from "../../scripts/sftdd/sftdd-env.js";

let proj: string;
const writeConfig = (obj: unknown): void => {
  mkdirSync(join(proj, ".lakebase"), { recursive: true });
  writeFileSync(join(proj, TDD_CONFIG_REL), JSON.stringify(obj, null, 2));
};

beforeEach(() => {
  proj = mkdtempSync(join(tmpdir(), "tdd-config-"));
});
afterEach(() => rmSync(proj, { recursive: true, force: true }));

// SFTDD rename back-compat: the config file is now `.lakebase/sftdd-config.json`
// and env vars are `LAKEBASE_SFTDD_*`, but pre-rename projects/shells still use
// `tdd-config.json` / `LAKEBASE_TDD_*`. Both must keep working (new name preferred).
describe("SFTDD rename back-compat (config file + env prefix)", () => {
  it("canonical path is sftdd-config.json; the deprecated alias points at it", () => {
    expect(SFTDD_CONFIG_REL).toBe(join(".lakebase", "sftdd-config.json"));
    expect(LEGACY_TDD_CONFIG_REL).toBe(join(".lakebase", "tdd-config.json"));
    expect(TDD_CONFIG_REL).toBe(SFTDD_CONFIG_REL);
  });

  it("loadTddConfig reads the LEGACY tdd-config.json when only it exists", () => {
    mkdirSync(join(proj, ".lakebase"), { recursive: true });
    writeFileSync(join(proj, LEGACY_TDD_CONFIG_REL), JSON.stringify({ version: 1, roles: { navigator: { model: "haiku" } } }));
    expect(loadTddConfig(proj)?.roles?.navigator?.model).toBe("haiku");
  });

  it("prefers sftdd-config.json over the legacy file when BOTH exist", () => {
    mkdirSync(join(proj, ".lakebase"), { recursive: true });
    writeFileSync(join(proj, LEGACY_TDD_CONFIG_REL), JSON.stringify({ version: 1, roles: { navigator: { model: "haiku" } } }));
    writeFileSync(join(proj, SFTDD_CONFIG_REL), JSON.stringify({ version: 1, roles: { navigator: { model: "opus" } } }));
    expect(loadTddConfig(proj)?.roles?.navigator?.model).toBe("opus");
  });

  it("sftddEnv reads LAKEBASE_SFTDD_* and falls back to legacy LAKEBASE_TDD_*", () => {
    expect(sftddEnv("LOOP", { LAKEBASE_SFTDD_LOOP: "ac" })).toBe("ac");
    expect(sftddEnv("LOOP", { LAKEBASE_TDD_LOOP: "story" })).toBe("story"); // legacy fallback
    expect(sftddEnv("LOOP", { LAKEBASE_SFTDD_LOOP: "ac", LAKEBASE_TDD_LOOP: "story" })).toBe("ac"); // new wins
    expect(sftddEnv("LOOP", {})).toBeUndefined();
  });

  it("resolveTddSettings honors a legacy LAKEBASE_TDD_* env var (via sftddEnv)", () => {
    const s = resolveTddSettings({ projectDir: proj, env: { LAKEBASE_TDD_LOOP: "ac" } });
    expect(s.build.loopGranularity).toBe("ac");
  });
});

describe("resolveTddSettings: defaults when no file + no env", () => {
  it("uses recommended models + P6 default (navigator REVIEW low, else model-default)", () => {
    const s = resolveTddSettings({ projectDir: proj, env: {} });
    expect(s.models.navigator).toBe("sonnet");
    expect(s.models["spec-author"]).toBe("opus");
    expect(s.effortFor("navigator", "review")).toBe("low");
    expect(s.effortFor("navigator", "red")).toBe("default");
    expect(s.effortFor("driver", "green")).toBe("default");
    expect(s.build.loopGranularity).toBe("story"); // default is story-scoped Navigator/Driver turns
    expect(s.build.sessionScope).toBe("story");
    expect(s.plan.sizing).toBe(true);
    expect(s.fallbackModels.navigator).toBeUndefined();
    expect(s.budgets.navigator).toBeUndefined();
  });

  // Regression: LAKEBASE_SFTDD_LOOP must be honored for EVERY granularity, not just
  // hybrid-a. The drive reads s.build.loopGranularity (this resolver) , when the
  // env value was ignored, a `loop=story` run silently fell back to per-test "ac"
  // and the story-level cadence never engaged live (the hermetic commandsForAction
  // tests missed it because their cfg() left loopGranularity undefined).
  it("LAKEBASE_SFTDD_LOOP honors story | ac | hybrid-a (not just hybrid-a)", () => {
    for (const v of ["story", "ac", "hybrid-a"] as const) {
      const s = resolveTddSettings({ projectDir: proj, env: { LAKEBASE_SFTDD_LOOP: v } });
      expect(s.build.loopGranularity).toBe(v);
    }
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

describe("resolveTddSettings: per-turn model tiering (driver GREEN/REFACTOR cheaper)", () => {
  it("a per-turn `model` map resolves per turn; the base falls to the recommended model", () => {
    writeConfig({
      version: 1,
      roles: { driver: { model: { red: "sonnet", green: "haiku", refactor: "haiku" } } },
    });
    const s = resolveTddSettings({ projectDir: proj, env: {} });
    expect(s.modelFor("driver", "red")).toBe("sonnet");
    expect(s.modelFor("driver", "green")).toBe("haiku");
    expect(s.modelFor("driver", "refactor")).toBe("haiku");
    // base (no turn) + a turn absent from the map fall through to the recommended
    // default, NOT to a map entry.
    expect(s.models.driver).toBe("sonnet");
    expect(s.modelFor("driver")).toBe("sonnet");
    expect(s.modelFor("driver", "review")).toBe("sonnet");
  });

  it("a scalar `model` applies to every turn", () => {
    writeConfig({ version: 1, roles: { driver: { model: "opus" } } });
    const s = resolveTddSettings({ projectDir: proj, env: {} });
    expect(s.models.driver).toBe("opus");
    expect(s.modelFor("driver", "green")).toBe("opus");
    expect(s.modelFor("driver")).toBe("opus");
  });

  it("with no file, modelFor returns the recommended base for every turn", () => {
    const s = resolveTddSettings({ projectDir: proj, env: {} });
    expect(s.modelFor("driver", "green")).toBe("sonnet");
    expect(s.modelFor("spec-author")).toBe("opus");
  });

  it("defaultTddConfig seeds the balanced driver tier: RED recommended, GREEN/REFACTOR haiku", () => {
    writeTddConfig(proj, defaultTddConfig());
    const s = resolveTddSettings({ projectDir: proj, env: {} });
    expect(s.modelFor("driver", "red")).toBe("sonnet");
    expect(s.modelFor("driver", "green")).toBe("haiku");
    expect(s.modelFor("driver", "refactor")).toBe("haiku");
    // navigator + design roles keep their scalar recommended model.
    expect(s.modelFor("navigator", "red")).toBe("sonnet");
    expect(s.modelFor("architect-reviewer")).toBe("opus");
  });
});

describe("resolveTddSettings: env overrides the file", () => {
  it("LAKEBASE_SFTDD_LOOP / _BATCH_CAP / _BUILD_SESSION / _REVIEW_EFFORT / _UI win over the file", () => {
    writeConfig({
      version: 1,
      roles: { navigator: { effort: { review: "high" } } },
      build: { loopGranularity: "ac", batchCap: 5, sessionScope: "story" },
      project: { uiTrack: false },
    });
    const s = resolveTddSettings({
      projectDir: proj,
      env: {
        LAKEBASE_SFTDD_LOOP: "hybrid-a",
        LAKEBASE_SFTDD_BATCH_CAP: "3",
        LAKEBASE_SFTDD_BUILD_SESSION: "cycle",
        LAKEBASE_SFTDD_REVIEW_EFFORT: "low",
        LAKEBASE_SFTDD_UI: "1",
      },
    });
    expect(s.build.loopGranularity).toBe("hybrid-a");
    expect(s.build.batchCap).toBe(3);
    expect(s.build.sessionScope).toBe("cycle");
    expect(s.effortFor("navigator", "review")).toBe("low"); // env beats the file's "high"
    expect(s.project.uiTrack).toBe(true);
  });

  it("LAKEBASE_SFTDD_REVIEW_EFFORT=default drops to model-default, overriding the file's level", () => {
    writeConfig({ version: 1, roles: { navigator: { effort: { review: "high" } } } });
    const s = resolveTddSettings({ projectDir: proj, env: { LAKEBASE_SFTDD_REVIEW_EFFORT: "default" } });
    // Env overrides the file (one-off experiment on top): =default drops the flag.
    expect(s.effortFor("navigator", "review")).toBe("default");
  });
});

describe("legacy agent-config.json is honored below the new file", () => {
  it("falls back to agent-config model override when sftdd-config.json is absent", () => {
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
