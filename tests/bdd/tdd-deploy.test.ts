// /deploy substrate: resolve a target from deploy-targets.yaml and, for
// type:local, start the app + poll until reachable. Remote types are refused.
// Hermetic: process start, reachability, and clock are all injected.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDeployTarget, deployToTarget, stopLocal } from "../../scripts/tdd/deploy";

const TARGETS = [
  "targets:",
  "  local:",
  "    type: local",
  "    run: echo started",
  "    base_url: http://localhost:8000",
  "    health_path: /",
  "    ready_timeout_seconds: 5",
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
    expect(existsSync(join(dir, ".tdd", "deploy", "local.pid"))).toBe(true);
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
    expect(existsSync(join(dir, ".tdd", "deploy", "local.pid"))).toBe(true);
    expect(stopLocal(dir, "local").stopped).toBe(true);
    expect(existsSync(join(dir, ".tdd", "deploy", "local.pid"))).toBe(false);
  });

  it("reports nothing to stop when no pid file exists", () => {
    expect(stopLocal(dir, "local").stopped).toBe(false);
  });
});
