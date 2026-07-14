// Unified TDD config (.lakebase/sftdd-config.json): one declarative source for the
// per-role/turn model+effort matrix + build/plan/project knobs. Resolution is
// sftdd-config.json -> code default, per setting. The file is the SINGLE source of
// truth for project settings; there is NO env override at read time (the env door
// is what let a UI project silently run with the UX lane off).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { resolveSftddSettings, loadSftddConfig, defaultSftddConfig, writeSftddConfig, applyProjectOverrides, TDD_CONFIG_REL, SFTDD_CONFIG_REL, LEGACY_TDD_CONFIG_REL } from "../../scripts/sftdd/sftdd-config.js";
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

  it("loadSftddConfig reads the LEGACY tdd-config.json when only it exists", () => {
    mkdirSync(join(proj, ".lakebase"), { recursive: true });
    writeFileSync(join(proj, LEGACY_TDD_CONFIG_REL), JSON.stringify({ version: 1, roles: { navigator: { model: "haiku" } } }));
    expect(loadSftddConfig(proj)?.roles?.navigator?.model).toBe("haiku");
  });

  it("prefers sftdd-config.json over the legacy file when BOTH exist", () => {
    mkdirSync(join(proj, ".lakebase"), { recursive: true });
    writeFileSync(join(proj, LEGACY_TDD_CONFIG_REL), JSON.stringify({ version: 1, roles: { navigator: { model: "haiku" } } }));
    writeFileSync(join(proj, SFTDD_CONFIG_REL), JSON.stringify({ version: 1, roles: { navigator: { model: "opus" } } }));
    expect(loadSftddConfig(proj)?.roles?.navigator?.model).toBe("opus");
  });

  it("sftddEnv reads LAKEBASE_SFTDD_* and falls back to legacy LAKEBASE_TDD_*", () => {
    expect(sftddEnv("LOOP", { LAKEBASE_SFTDD_LOOP: "ac" })).toBe("ac");
    expect(sftddEnv("LOOP", { LAKEBASE_TDD_LOOP: "story" })).toBe("story"); // legacy fallback
    expect(sftddEnv("LOOP", { LAKEBASE_SFTDD_LOOP: "ac", LAKEBASE_TDD_LOOP: "story" })).toBe("ac"); // new wins
    expect(sftddEnv("LOOP", {})).toBeUndefined();
  });

  // NOTE: env vars no longer drive project settings (single-source refactor). The
  // sftddEnv accessor's legacy fallback (above) still matters for run-mode knobs;
  // that a project setting is NOT env-driven is asserted in the single-source block.
});

describe("resolveSftddSettings: defaults when no file + no env", () => {
  it("uses recommended models + P6 default (navigator REVIEW low, else model-default)", () => {
    const s = resolveSftddSettings({ projectDir: proj });
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

  // Regression: loopGranularity must be honored for EVERY granularity, not just
  // hybrid-a. The drive reads s.build.loopGranularity (this resolver); when a
  // granularity was dropped, a `loop=story` run silently fell back to per-test "ac"
  // and the story-level cadence never engaged live (the hermetic commandsForAction
  // tests missed it because their cfg() left loopGranularity undefined).
  it("loopGranularity honors story | ac | hybrid-a from the FILE (not just hybrid-a)", () => {
    for (const v of ["story", "ac", "hybrid-a"] as const) {
      writeConfig({ version: 1, build: { loopGranularity: v } });
      expect(resolveSftddSettings({ projectDir: proj }).build.loopGranularity).toBe(v);
    }
  });
});

describe("resolveSftddSettings: the file drives the per-role/turn matrix", () => {
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
    const s = resolveSftddSettings({ projectDir: proj });
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

describe("resolveSftddSettings: per-turn model tiering (driver GREEN/REFACTOR cheaper)", () => {
  it("a per-turn `model` map resolves per turn; the base falls to the recommended model", () => {
    writeConfig({
      version: 1,
      roles: { driver: { model: { red: "sonnet", green: "haiku", refactor: "haiku" } } },
    });
    const s = resolveSftddSettings({ projectDir: proj });
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
    const s = resolveSftddSettings({ projectDir: proj });
    expect(s.models.driver).toBe("opus");
    expect(s.modelFor("driver", "green")).toBe("opus");
    expect(s.modelFor("driver")).toBe("opus");
  });

  it("with no file, modelFor returns the recommended base for every turn", () => {
    const s = resolveSftddSettings({ projectDir: proj });
    expect(s.modelFor("driver", "green")).toBe("sonnet");
    expect(s.modelFor("spec-author")).toBe("opus");
  });

  it("defaultSftddConfig seeds the balanced driver tier: RED + GREEN recommended, REFACTOR haiku", () => {
    writeSftddConfig(proj, defaultSftddConfig());
    const s = resolveSftddSettings({ projectDir: proj });
    expect(s.modelFor("driver", "red")).toBe("sonnet");
    // GREEN was haiku, but it thrashed round-trips (recorded 93 calls); the
    // recommended model finishes in fewer round-trips, faster in wall-clock.
    expect(s.modelFor("driver", "green")).toBe("sonnet");
    expect(s.modelFor("driver", "refactor")).toBe("haiku");
    // navigator + design roles keep their scalar recommended model.
    expect(s.modelFor("navigator", "red")).toBe("sonnet");
    expect(s.modelFor("architect-reviewer")).toBe("opus");
  });
});

// Single-source-of-truth contract: the config file is the ONLY door for project
// settings. Env vars (loop / batchCap / sessionScope / review-effort / uiTrack) do
// NOT override the file at read time; that env door is exactly what let a UI
// project silently run with the UX lane off. The conformance guard test enforces
// this structurally; here we prove it behaviorally with real env vars set.
const PROJECT_SETTING_ENV = [
  "LAKEBASE_SFTDD_LOOP",
  "LAKEBASE_SFTDD_BATCH_CAP",
  "LAKEBASE_SFTDD_BUILD_SESSION",
  "LAKEBASE_SFTDD_REVIEW_EFFORT",
  "LAKEBASE_SFTDD_UI",
] as const;

describe("resolveSftddSettings: the file is the single source (env does NOT override)", () => {
  it("ignores the project-setting env vars entirely; every value comes from the file", () => {
    writeConfig({
      version: 1,
      roles: { navigator: { effort: { review: "high" } } },
      build: { loopGranularity: "ac", batchCap: 5, sessionScope: "story" },
      project: { uiTrack: false },
    });
    const saved = PROJECT_SETTING_ENV.map((k) => [k, process.env[k]] as const);
    Object.assign(process.env, {
      LAKEBASE_SFTDD_LOOP: "hybrid-a",
      LAKEBASE_SFTDD_BATCH_CAP: "3",
      LAKEBASE_SFTDD_BUILD_SESSION: "cycle",
      LAKEBASE_SFTDD_REVIEW_EFFORT: "low",
      LAKEBASE_SFTDD_UI: "1",
    });
    try {
      const s = resolveSftddSettings({ projectDir: proj });
      expect(s.build.loopGranularity).toBe("ac"); // file, not env "hybrid-a"
      expect(s.build.batchCap).toBe(5); // file, not env 3
      expect(s.build.sessionScope).toBe("story"); // file, not env "cycle"
      expect(s.effortFor("navigator", "review")).toBe("high"); // file, not env "low"
      expect(s.project.uiTrack).toBe(false); // file, not env "1"
    } finally {
      for (const [k, v] of saved) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it("review effort 'default' in the FILE drops the flag to model-default", () => {
    writeConfig({ version: 1, roles: { navigator: { effort: { review: "default" } } } });
    expect(resolveSftddSettings({ projectDir: proj }).effortFor("navigator", "review")).toBe("default");
  });
});

describe("applyProjectOverrides: deployTarget / sizing write THROUGH; gates never does", () => {
  it("persists deployTarget / sizing into the config, then the resolver reads them", () => {
    applyProjectOverrides(proj, { deployTarget: "cloud", sizing: false });
    // the file is the single source: resolution reflects the written-through values.
    const s = resolveSftddSettings({ projectDir: proj });
    expect(s.project.deployTarget).toBe("cloud");
    expect(s.plan.sizing).toBe(false);
    expect(loadSftddConfig(proj)?.project?.deployTarget).toBe("cloud");
  });

  it("is a no-op when no override is given (a plain run never mutates the file)", () => {
    applyProjectOverrides(proj, {});
    expect(loadSftddConfig(proj)).toBeUndefined(); // no file written
  });

  it("preserves unrelated fields when writing through onto an existing config", () => {
    writeConfig({ version: 1, roles: { navigator: { model: "opus" } }, project: { uiTrack: true } });
    applyProjectOverrides(proj, { deployTarget: "cloud" });
    const loaded = loadSftddConfig(proj);
    expect(loaded?.project?.deployTarget).toBe("cloud"); // written through
    expect(loaded?.project?.uiTrack).toBe(true); // preserved
    expect(loaded?.roles?.navigator?.model).toBe("opus"); // preserved
  });

  it("NEVER writes gates: the HITL policy is run-scoped, so a flag can't flip persisted policy", () => {
    // A project that declares interactive must stay interactive on disk no matter
    // how a headless run is invoked (the --gates flag lives in run-config, not here).
    writeConfig({ version: 1, roles: {}, project: { gates: "interactive" } });
    // applyProjectOverrides has no `gates` channel at all; a deployTarget write
    // must leave project.gates untouched.
    applyProjectOverrides(proj, { deployTarget: "cloud" });
    expect(loadSftddConfig(proj)?.project?.gates).toBe("interactive");
  });
});

describe("gates: HITL-first default", () => {
  it("defaults project.gates to interactive when unset (headless is opt-in)", () => {
    writeConfig({ version: 1, roles: {} });
    expect(resolveSftddSettings({ projectDir: proj }).project.gates).toBe("interactive");
    expect(defaultSftddConfig().project?.gates).toBe("interactive");
  });
});

describe("legacy agent-config.json is honored below the new file", () => {
  it("falls back to agent-config model override when sftdd-config.json is absent", () => {
    mkdirSync(join(proj, ".lakebase"), { recursive: true });
    writeFileSync(
      join(proj, ".lakebase", "agent-config.json"),
      JSON.stringify({ version: 1, roles: { navigator: { recommended: "sonnet", override: "opus" } } }),
    );
    const s = resolveSftddSettings({ projectDir: proj });
    expect(s.models.navigator).toBe("opus"); // legacy override
  });
});

describe("defaultSftddConfig + write/load round-trip", () => {
  it("seeds recommended models + navigator review low, and round-trips", () => {
    const wrote = writeSftddConfig(proj, defaultSftddConfig());
    expect(wrote).toBe(true);
    const loaded = loadSftddConfig(proj);
    expect(loaded?.version).toBe(1);
    expect(loaded?.roles?.navigator?.model).toBe("sonnet");
    expect((loaded?.roles?.navigator?.effort as { review?: string })?.review).toBe("low");
    // Does not overwrite without force.
    expect(writeSftddConfig(proj, defaultSftddConfig())).toBe(false);
  });
});
