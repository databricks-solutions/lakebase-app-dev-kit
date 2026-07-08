// /deploy substrate: resolve a target from deploy-targets.yaml and, for
// type:local, start the app + poll until reachable. Remote types are refused.
// Hermetic: process start, reachability, and clock are all injected.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveDeployTarget,
  deployToTarget,
  ensureDeployedAndVerify,
  stopLocal,
  storyDeployVerified,
  logReleaseEngineerDeployStart,
  logReleaseEngineerDeployOutcome,
  type DeployResult,
} from "../../scripts/sftdd/deploy";
import { readEscalations } from "../../scripts/sftdd/escalation";
import { readAgentLog } from "../../scripts/sftdd/agent-log";

const TARGETS = [
  "targets:",
  "  local:",
  "    type: local",
  "    run: echo started",
  "    base_url: http://localhost:8000",
  "    health_path: /",
  "    ready_timeout_seconds: 5",
  "  localv:",
  "    type: local",
  "    run: echo started",
  "    base_url: http://localhost:8000",
  "    health_path: /",
  "    ready_timeout_seconds: 5",
  "    verify: run-feature-verify",
  "  prod:",
  "    type: databricks-app",
  "    workspace_profile: x",
  "",
].join("\n");

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "deploy-"));
  writeFileSync(join(dir, "deploy-targets.yaml"), TARGETS);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("resolveDeployTarget", () => {
  it("parses a local target", () => {
    const r = resolveDeployTarget(dir, "local");
    expect(r.kind).toBe("local");
    if (r.kind === "local") {
      expect(r.config.run).toBe("echo started");
      expect(r.config.baseUrl).toBe("http://localhost:8000");
      expect(r.config.readyTimeoutSeconds).toBe(5);
    }
  });

  it("reports a remote type as unsupported", () => {
    const r = resolveDeployTarget(dir, "prod");
    expect(r.kind).toBe("unsupported");
    if (r.kind === "unsupported") expect(r.type).toBe("databricks-app");
  });

  it("reports a missing target", () => {
    expect(resolveDeployTarget(dir, "nope").kind).toBe("missing");
  });

  it("reports a missing deploy-targets.yaml", () => {
    const empty = mkdtempSync(join(tmpdir(), "deploy-empty-"));
    expect(resolveDeployTarget(empty, "local").kind).toBe("missing");
    rmSync(empty, { recursive: true, force: true });
  });
});

describe("deployToTarget: foreign-port guard (gate deploys)", () => {
  it("refuses + escalates when the port is already serving before deploy (rejectForeignPort)", async () => {
    const sftddDir = join(dir, ".tdd");
    mkdirSync(join(sftddDir, "features", "F1"), { recursive: true });
    let started = false;
    const result = await deployToTarget({
      projectDir: dir,
      targetName: "localv",
      featureId: "F1",
      storyId: "S1",
      lakebaseBranch: "experiment-s1",
      sftddDir,
      rejectForeignPort: true,
      reachable: async () => true, // a foreign/stale app stays on the port (stop does not free it)
      startProcess: () => {
        started = true;
        return 1;
      },
      runVerify: () => true,
      sleep: async () => {},
      now: (() => {
        // Fast-forward the self-heal re-probe clock so the genuinely-foreign
        // path reaches its timeout instantly (no 5s real-time spin).
        let t = 0;
        return () => new Date((t += 1000));
      })(),
    });
    expect(result.ok).toBe(false);
    expect(started).toBe(false); // never started our app onto a busy port
    expect(result.reason).toMatch(/already serving|foreign|stale/i);
    // honest evidence: reachable=false, verify failed (we did NOT verify the foreign app).
    const ev = JSON.parse(
      readFileSync(join(sftddDir, "features", "F1", "stories", "S1", "deploy-evidence.json"), "utf8"),
    );
    expect(ev.reachable).toBe(false);
    expect(ev.verify.passed).toBe(false);
    // and it raised an escalation for the HIL (deploy-verify source).
    const escs = readEscalations(sftddDir).filter((e) => !e.resolved_at);
    expect(escs.some((e) => e.source === "deploy-verify" && e.story_id === "S1")).toBe(true);
  });

  it("self-heals: stops OUR own prior instance on the port, then deploys cleanly (no escalation)", async () => {
    // The per-story await-acceptance deploy leaves our app running on the port
    // for PO review; a re-issued gate deploy must stop that own instance and
    // proceed, NOT refuse it as foreign.
    const sftddDir = join(dir, ".tdd");
    mkdirSync(join(sftddDir, "features", "F1", "stories", "S1"), { recursive: true });
    let occupied = true; // our own prior app is on the port...
    let stopped = false;
    let started = false;
    const result = await deployToTarget({
      projectDir: dir,
      targetName: "localv",
      featureId: "F1",
      storyId: "S1",
      sftddDir,
      rejectForeignPort: true,
      reachable: async () => (started ? true : occupied), // busy until stopped; up once we start
      stop: () => {
        stopped = true;
        occupied = false; // ...stopping it frees the port
      },
      startProcess: () => {
        started = true;
        return 4321;
      },
      runVerify: () => true,
      sleep: async () => {},
      now: () => new Date(),
    });
    expect(stopped).toBe(true); // we stopped our own instance first
    expect(started).toBe(true); // and then deployed cleanly onto the freed port
    expect(result.ok).toBe(true);
    expect(result.verify?.passed).toBe(true);
    // no escalation: this was OUR app, self-healed, not a foreign squatter.
    const escs = readEscalations(sftddDir).filter((e) => !e.resolved_at);
    expect(escs.some((e) => e.source === "deploy-verify")).toBe(false);
  });

  it("does NOT guard when rejectForeignPort is unset (per-cycle reuse path is unaffected)", async () => {
    const result = await deployToTarget({
      projectDir: dir,
      targetName: "local",
      startProcess: () => 4242,
      reachable: async () => true, // already reachable, but no guard -> proceeds + ok
      sleep: async () => {},
      now: () => new Date(),
    });
    expect(result.ok).toBe(true);
  });
});

describe("deployToTarget (local)", () => {
  // A clock that advances 200ms per read, well under the 5s timeout.
  function fastClock() {
    let t = 0;
    return () => new Date((t += 200));
  }

  it("starts the app, polls until reachable, records the pid", async () => {
    let calls = 0;
    const result = await deployToTarget({
      projectDir: dir,
      targetName: "local",
      startProcess: () => 4242,
      reachable: async () => ++calls >= 3, // up on the 3rd probe
      sleep: async () => {},
      now: fastClock(),
    });
    expect(result.ok).toBe(true);
    expect(result.pid).toBe(4242);
    expect(result.url).toBe("http://localhost:8000/");
    expect(existsSync(join(dir, ".sftdd", "deploy", "local.pid"))).toBe(true);
  });

  it("binds LAKEBASE_BRANCH_ID to the experiment branch for a per-story deploy", async () => {
    let seenEnv: NodeJS.ProcessEnv | undefined;
    const result = await deployToTarget({
      projectDir: dir,
      targetName: "local",
      lakebaseBranch: "exp/F1/S1-submit",
      startProcess: (_cmd, _cwd, env) => {
        seenEnv = env;
        return 4242;
      },
      reachable: async () => true,
      sleep: async () => {},
      now: fastClock(),
    });
    expect(result.ok).toBe(true);
    expect(seenEnv?.LAKEBASE_BRANCH_ID).toBe("exp/F1/S1-submit");
  });

  it("leaves the ambient env (no LAKEBASE_BRANCH_ID override) for a feature deploy", async () => {
    let envPassed: NodeJS.ProcessEnv | undefined | "unset" = "unset";
    await deployToTarget({
      projectDir: dir,
      targetName: "local",
      startProcess: (_cmd, _cwd, env) => {
        envPassed = env;
        return 4242;
      },
      reachable: async () => true,
      sleep: async () => {},
      now: fastClock(),
    });
    expect(envPassed).toBeUndefined(); // ambient env: defaultStart falls back to process.env
  });

  it("fails when the app never becomes reachable (timeout)", async () => {
    // Clock jumps past the 5s budget so the poll times out quickly.
    let t = 0;
    const result = await deployToTarget({
      projectDir: dir,
      targetName: "local",
      startProcess: () => 4242,
      reachable: async () => false,
      sleep: async () => {},
      now: () => new Date((t += 6000)),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not reachable/);
  });

  it("refuses an unsupported target type without starting anything", async () => {
    let started = false;
    const result = await deployToTarget({
      projectDir: dir,
      targetName: "prod",
      startProcess: () => {
        started = true;
        return 1;
      },
      reachable: async () => true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/unsupported target type/);
    expect(started).toBe(false);
  });
});

describe("ensureDeployedAndVerify: GREEN-verify failure diagnostic", () => {
  function fastClock() {
    let t = 0;
    return () => new Date((t += 200));
  }

  it("enriches a verify FAILURE with the e2e-inline-regex-flag cause + file:line", async () => {
    // A project whose E2E test uses a Playwright matcher built from an inline-flag
    // regex , the exact un-greenable shape that raises to HIL with a generic message.
    mkdirSync(join(dir, "tests", "e2e"), { recursive: true });
    writeFileSync(
      join(dir, "tests", "e2e", "test_file_bug.py"),
      `import re\nexpect(e).to_contain_text(re.compile(r"(?i)summary"))\n`,
    );
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv", // has a verify command
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: () => false, // honest GREEN verify failed against the running app
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(false);
    expect(res.summary).toContain("e2e-inline-regex-flag");
    expect(res.summary).toContain("tests/e2e/test_file_bug.py:2");
    expect(res.summary).toMatch(/re\.IGNORECASE/);
  });

  it("leaves the generic message when a verify failure has no inline-flag regex", async () => {
    mkdirSync(join(dir, "tests", "e2e"), { recursive: true });
    writeFileSync(
      join(dir, "tests", "e2e", "test_ok.py"),
      `import re\nexpect(e).to_contain_text(re.compile("summary", re.IGNORECASE))\n`,
    );
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: () => false,
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(false);
    expect(res.summary).toBe("GREEN verify FAILED against the running app");
  });

  it("does not run the lint on a PASSING verify", async () => {
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: () => true,
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(true);
    expect(res.summary).toBe("GREEN verify passed against the running app");
  });
});

describe("stopLocal", () => {
  it("removes the pid file (best-effort kill)", async () => {
    await deployToTarget({
      projectDir: dir,
      targetName: "local",
      startProcess: () => 999999, // nonexistent pid; kill is caught
      reachable: async () => true,
      sleep: async () => {},
      now: (() => { let t = 0; return () => new Date((t += 100)); })(),
    });
    expect(existsSync(join(dir, ".sftdd", "deploy", "local.pid"))).toBe(true);
    expect(stopLocal(dir, "local").stopped).toBe(true);
    expect(existsSync(join(dir, ".sftdd", "deploy", "local.pid"))).toBe(false);
  });

  it("reports nothing to stop when no pid file exists", () => {
    expect(stopLocal(dir, "local").stopped).toBe(false);
  });
});

describe("deployToTarget: deploy-evidence.json (deploy gate artifact)", () => {
  const FEATURE = "F1-initial-domain";
  function fastClock() {
    let t = 0;
    return () => new Date((t += 200));
  }
  function featureDir(root: string): string {
    return join(root, ".tdd", "features", FEATURE);
  }
  function readEvidence(root: string): Record<string, unknown> {
    return JSON.parse(require("node:fs").readFileSync(join(featureDir(root), "deploy-evidence.json"), "utf8"));
  }

  beforeEach(() => mkdirSync(featureDir(dir), { recursive: true }));

  it("writes reachable=true + verify.passed=true when the feature-verify exits 0", async () => {
    const result = await deployToTarget({
      projectDir: dir, targetName: "localv", featureId: FEATURE,
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: () => true,
      sleep: async () => {}, now: fastClock(),
    });
    expect(result.ok).toBe(true);
    expect(result.verify?.passed).toBe(true);
    expect(result.evidencePath).toBeDefined();
    const ev = readEvidence(dir);
    expect(ev.reachable).toBe(true);
    expect((ev.verify as { passed: boolean }).passed).toBe(true);
    expect(ev.target).toBe("localv");
    expect(ev.feature_id).toBe(FEATURE);
  });

  it("records verify.passed=false when the feature-verify fails", async () => {
    const result = await deployToTarget({
      projectDir: dir, targetName: "localv", featureId: FEATURE,
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: () => false,
      sleep: async () => {}, now: fastClock(),
    });
    expect(result.ok).toBe(true); // reachable, but verify failed
    expect(result.verify?.passed).toBe(false);
    expect((readEvidence(dir).verify as { passed: boolean }).passed).toBe(false);
  });

  it("records reachable=false in the evidence when the app never comes up", async () => {
    let t = 0;
    const result = await deployToTarget({
      projectDir: dir, targetName: "localv", featureId: FEATURE,
      startProcess: () => 4242,
      reachable: async () => false,
      runVerify: () => true,
      sleep: async () => {}, now: () => new Date((t += 6000)),
    });
    expect(result.ok).toBe(false);
    const ev = readEvidence(dir);
    expect(ev.reachable).toBe(false);
    expect((ev.verify as { passed: boolean }).passed).toBe(false); // verify not run when unreachable
  });

  it("writes NO evidence for a feature-less deploy", async () => {
    const result = await deployToTarget({
      projectDir: dir, targetName: "localv",
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: () => true,
      sleep: async () => {}, now: fastClock(),
    });
    expect(result.ok).toBe(true);
    expect(result.evidencePath).toBeUndefined();
  });
});

describe("deployToTarget: STORY-scoped deploy evidence + storyDeployVerified", () => {
  const FEATURE = "F1-initial-domain";
  const STORY = "S1-submit";
  function fastClock() {
    let t = 0;
    return () => new Date((t += 200));
  }
  function featureDir(root: string): string {
    return join(root, ".tdd", "features", FEATURE);
  }
  beforeEach(() => mkdirSync(join(featureDir(dir), "stories", STORY), { recursive: true }));

  it("writes evidence at story scope + storyDeployVerified is true when reachable + verify pass", async () => {
    const result = await deployToTarget({
      projectDir: dir, targetName: "localv", featureId: FEATURE, storyId: STORY,
      lakebaseBranch: "exp/F1/S1",
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: () => true,
      sleep: async () => {}, now: fastClock(),
    });
    expect(result.ok).toBe(true);
    // Evidence is under the STORY dir, not the feature dir.
    expect(result.evidencePath).toBe(join(featureDir(dir), "stories", STORY, "deploy-evidence.json"));
    expect(existsSync(join(featureDir(dir), "deploy-evidence.json"))).toBe(false);
    expect(storyDeployVerified(join(dir, ".tdd"), FEATURE, STORY)).toBe(true);
  });

  it("storyDeployVerified is false when the story verify failed", async () => {
    await deployToTarget({
      projectDir: dir, targetName: "localv", featureId: FEATURE, storyId: STORY,
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: () => false,
      sleep: async () => {}, now: fastClock(),
    });
    expect(storyDeployVerified(join(dir, ".tdd"), FEATURE, STORY)).toBe(false);
  });

  it("storyDeployVerified is false when no story evidence exists", () => {
    expect(storyDeployVerified(join(dir, ".tdd"), FEATURE, STORY)).toBe(false);
  });
});

describe("Release Engineer deploy lifecycle -> central agent log", () => {
  let tdd: string;
  const FEATURE = "F1-file-bug";
  const STORY = "S1-create-bug";
  const clock = () => new Date("2026-06-09T19:38:20.000Z");
  beforeEach(() => {
    tdd = mkdtempSync(join(tmpdir(), "re-deploylog-"));
  });
  afterEach(() => rmSync(tdd, { recursive: true, force: true }));

  it("emits release-engineer deploy.start + deploy.verified + phase.end for a successful deploy", () => {
    const ctx = { featureId: FEATURE, storyId: STORY, target: "local", sftddDir: tdd, now: clock };
    logReleaseEngineerDeployStart(ctx);
    const ok: DeployResult = { ok: true, url: "http://localhost:8000/", pid: 123, verify: { passed: true, summary: "feature-verify passed" } };
    logReleaseEngineerDeployOutcome(ctx, ok);

    const re = readAgentLog({ sftddDir: tdd }).filter((e) => e.role === "release-engineer");
    expect(re.map((e) => e.event)).toEqual(["deploy.start", "deploy.verified", "phase.end"]);
    const verified = re.find((e) => e.event === "deploy.verified")!;
    expect(verified.metadata?.feature_id).toBe(FEATURE);
    expect(verified.metadata?.story).toBe(STORY);
    expect(verified.metadata?.url).toBe("http://localhost:8000/");
    expect(verified.metadata?.reachable).toBe(true);
    expect(verified.metadata?.verify_passed).toBe(true);
    expect(re.every((e) => e.role === "release-engineer")).toBe(true);
  });

  it("emits a deploy.failed (error) + phase.end for a failed deploy, carrying the reason", () => {
    const ctx = { featureId: FEATURE, storyId: STORY, target: "local", sftddDir: tdd, now: clock };
    const bad: DeployResult = { ok: false, reason: "not reachable within timeout", verify: { passed: false, summary: "n/a" } };
    logReleaseEngineerDeployOutcome(ctx, bad);

    const re = readAgentLog({ sftddDir: tdd }).filter((e) => e.role === "release-engineer");
    expect(re.map((e) => e.event)).toEqual(["deploy.failed", "phase.end"]);
    const failed = re.find((e) => e.event === "deploy.failed")!;
    expect(failed.level).toBe("error");
    expect(String(failed.metadata?.reason)).toMatch(/not reachable/);
  });
});

describe("ensureDeployedAndVerify: migration-isolation two-pass (Python)", () => {
  function fastClock() {
    let t = 0;
    return () => new Date((t += 200));
  }

  it("runs the main (not migration) pass then the migration pass on separate branches", async () => {
    writeFileSync(join(dir, "pyproject.toml"), "[project]\nname = 'x'\n");
    const markers: string[] = [];
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: (_cmd, _cwd, env) => {
        markers.push(env?.SFTDD_PYTEST_MARKER ?? "<unset>");
        return true;
      },
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(true);
    expect(markers).toEqual(["not migration", "migration"]);
  });

  it("surfaces a migration-pass failure distinctly", async () => {
    writeFileSync(join(dir, "pyproject.toml"), "[project]\nname = 'x'\n");
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: (_cmd, _cwd, env) => env?.SFTDD_PYTEST_MARKER !== "migration",
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(false);
    expect(res.summary).toMatch(/migration pass/i);
  });

  it("skips the migration pass when the main pass already failed", async () => {
    writeFileSync(join(dir, "pyproject.toml"), "[project]\nname = 'x'\n");
    const markers: string[] = [];
    const res = await ensureDeployedAndVerify({
      projectDir: dir,
      targetName: "localv",
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: (_cmd, _cwd, env) => {
        markers.push(env?.SFTDD_PYTEST_MARKER ?? "<unset>");
        return false;
      },
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(false);
    expect(markers).toEqual(["not migration"]); // migration pass not attempted
  });

  it("a non-Python project keeps ONE full pass (no marker split, no double run)", async () => {
    const markers: string[] = [];
    const res = await ensureDeployedAndVerify({
      projectDir: dir, // no pyproject.toml / requirements.txt
      targetName: "localv",
      startProcess: () => 4242,
      reachable: async () => true,
      runVerify: (_cmd, _cwd, env) => {
        markers.push(env?.SFTDD_PYTEST_MARKER ?? "<unset>");
        return true;
      },
      stop: () => {},
      sleep: async () => {},
      now: fastClock(),
    });
    expect(res.passed).toBe(true);
    expect(markers).toEqual(["<unset>"]);
  });
});
