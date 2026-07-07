// The forever guard (anti-recurrence). A UI project once ran its entire build with
// NO UX lane because `uiTrack` had a second door: an env var that resolved to a
// value contradicting the on-disk config. The fix single-sourced every PROJECT
// setting into sftdd-config.json (file -> code default, no env / flag at read).
//
// This suite is the structural teeth so a second door can NEVER silently reappear:
//   1. SOURCE guard: the resolver module reads NO env for project settings. This
//      catches even a FUTURE setting given an env door , the behavioral suite in
//      sftdd-config.test.ts can only cover settings that exist today.
//   2. BEHAVIORAL guard: with EVERY known project-setting env var set to a value
//      that contradicts the file, resolution still returns the FILE's values.
//
// Run-mode knobs (record/replay/headless/debug) are NOT project settings; they stay
// explicit env inputs read elsewhere via sftddEnv, one door each, and are out of
// scope here on purpose.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";

import { resolveSftddSettings, SFTDD_CONFIG_REL } from "../../scripts/sftdd/sftdd-config.js";

const RESOLVER_SRC = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
  "scripts",
  "sftdd",
  "sftdd-config.ts",
);

describe("single-source guard (SOURCE): the resolver module reads no env", () => {
  const src = readFileSync(RESOLVER_SRC, "utf8");
  // Strip line + block comments so a comment that merely NAMES process.env / an
  // env var (explaining why it is absent) doesn't trip the guard , only real code
  // references count.
  const code = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

  it("never references process.env (project settings come from the file only)", () => {
    expect(code).not.toMatch(/process\.env/);
  });

  it("never imports the sftddEnv accessor (that surface is for run-mode knobs)", () => {
    expect(code).not.toMatch(/sftdd-env/);
    expect(code).not.toMatch(/\bsftddEnv\b/);
  });
});

describe("single-source guard (BEHAVIORAL): env never overrides the file", () => {
  // Every env var that has EVER fronted a project setting, plus the two write-through
  // fields, in both the canonical LAKEBASE_SFTDD_* and legacy LAKEBASE_TDD_* forms.
  // If any of these silently reappears as a read door, this test fails.
  const PROJECT_SETTING_ENV = [
    "LAKEBASE_SFTDD_UI",
    "LAKEBASE_SFTDD_LOOP",
    "LAKEBASE_SFTDD_BATCH_CAP",
    "LAKEBASE_SFTDD_BUILD_SESSION",
    "LAKEBASE_SFTDD_REVIEW_EFFORT",
    "LAKEBASE_SFTDD_GATES",
    "LAKEBASE_SFTDD_DEPLOY_TARGET",
    "LAKEBASE_SFTDD_SIZING",
    "LAKEBASE_TDD_UI",
    "LAKEBASE_TDD_LOOP",
    "LAKEBASE_TDD_BATCH_CAP",
    "LAKEBASE_TDD_BUILD_SESSION",
    "LAKEBASE_TDD_REVIEW_EFFORT",
    "LAKEBASE_TDD_GATES",
    "LAKEBASE_TDD_DEPLOY_TARGET",
    "LAKEBASE_TDD_SIZING",
  ] as const;

  let proj: string;
  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), "sftdd-single-source-"));
  });
  afterEach(() => rmSync(proj, { recursive: true, force: true }));

  it("resolves every project setting from the file even when contradicting env is set", () => {
    // The file declares one coherent set of values.
    mkdirSync(join(proj, ".lakebase"), { recursive: true });
    writeFileSync(
      join(proj, SFTDD_CONFIG_REL),
      JSON.stringify({
        version: 1,
        roles: { navigator: { model: "sonnet", effort: { review: "high" } } },
        build: { loopGranularity: "ac", batchCap: 7, sessionScope: "story" },
        plan: { sizing: false },
        project: { uiTrack: true, gates: "interactive", deployTarget: "workspace" },
      }),
    );

    // Every env door is set to the OPPOSITE of the file.
    const saved = PROJECT_SETTING_ENV.map((k) => [k, process.env[k]] as const);
    for (const k of PROJECT_SETTING_ENV) process.env[k] = k.includes("SIZING") ? "1" : "CONTRADICT";
    process.env.LAKEBASE_SFTDD_UI = "0";
    process.env.LAKEBASE_SFTDD_LOOP = "hybrid-a";
    process.env.LAKEBASE_SFTDD_BATCH_CAP = "99";
    process.env.LAKEBASE_SFTDD_BUILD_SESSION = "cycle";
    process.env.LAKEBASE_SFTDD_REVIEW_EFFORT = "low";
    process.env.LAKEBASE_SFTDD_GATES = "proxy";
    process.env.LAKEBASE_SFTDD_DEPLOY_TARGET = "local";
    process.env.LAKEBASE_SFTDD_SIZING = "1";

    try {
      const s = resolveSftddSettings({ projectDir: proj });
      // Every value is the FILE's, none is the env's.
      expect(s.project.uiTrack).toBe(true); // file, not env "0"
      expect(s.project.gates).toBe("interactive"); // file, not env "proxy"
      expect(s.project.deployTarget).toBe("workspace"); // file, not env "local"
      expect(s.build.loopGranularity).toBe("ac"); // file, not env "hybrid-a"
      expect(s.build.batchCap).toBe(7); // file, not env 99
      expect(s.build.sessionScope).toBe("story"); // file, not env "cycle"
      expect(s.plan.sizing).toBe(false); // file, not env "1"
      expect(s.effortFor("navigator", "review")).toBe("high"); // file, not env "low"
    } finally {
      for (const [k, v] of saved) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
