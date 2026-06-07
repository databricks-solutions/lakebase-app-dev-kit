#!/usr/bin/env node

// scripts/util/cli-entry.ts
import { realpathSync } from "fs";
import { fileURLToPath } from "url";
function isCliEntry(importMetaUrl) {
  const invokedRaw = process.argv[1];
  if (!invokedRaw) return false;
  let invokedResolved;
  let moduleResolved;
  try {
    invokedResolved = realpathSync(invokedRaw);
  } catch {
    return false;
  }
  try {
    moduleResolved = realpathSync(fileURLToPath(importMetaUrl));
  } catch {
    return false;
  }
  return invokedResolved === moduleResolved;
}

// scripts/tdd/deploy.ts
import { spawn } from "child_process";
import { existsSync as existsSync2, mkdirSync, readFileSync as readFileSync2, rmSync, writeFileSync as writeFileSync2 } from "fs";
import { dirname, join as join2 } from "path";

// scripts/lakebase/deploy-targets.ts
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
var TARGETS_FILE = "deploy-targets.yaml";
function readTargets(workspaceRoot) {
  const targetsFile = join(workspaceRoot, TARGETS_FILE);
  if (!existsSync(targetsFile)) return null;
  return parseTargetsYaml(readFileSync(targetsFile, "utf-8"));
}
function parseTargetsYaml(content) {
  const targets = {};
  let currentTarget = null;
  for (const rawLine of content.split("\n")) {
    const trimmed = rawLine.trimEnd();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed === "targets:") continue;
    const targetMatch = trimmed.match(/^ {2}(\S+):$/);
    if (targetMatch) {
      currentTarget = targetMatch[1];
      targets[currentTarget] = {};
      continue;
    }
    const kvMatch = trimmed.match(/^ {4}(\S+):\s*"?([^"]*)"?\s*$/);
    if (kvMatch && currentTarget) {
      const key = kvMatch[1];
      targets[currentTarget][key] = kvMatch[2];
    }
  }
  return { targets };
}

// scripts/util/delay.ts
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// scripts/util/poll-until.ts
async function pollUntil(args) {
  const now = args.now ?? (() => /* @__PURE__ */ new Date());
  const sleep = args.sleep ?? delay;
  const startedAt = now().getTime();
  let polls = 0;
  while (true) {
    const elapsedMs = now().getTime() - startedAt;
    if (elapsedMs >= args.timeoutMs && polls > 0) {
      return { outcome: "timeout", polls, elapsedMs };
    }
    polls += 1;
    const result = await args.probe({ pollIndex: polls, elapsedMs });
    const afterProbeElapsed = now().getTime() - startedAt;
    if (args.onPoll) {
      args.onPoll({ pollIndex: polls, elapsedMs: afterProbeElapsed, result });
    } else if (args.label && !result.done) {
      const seconds = Math.round(afterProbeElapsed / 1e3);
      console.log(
        `[${args.label}] still pending after ${seconds}s (poll ${polls})`
      );
    }
    if (result.done) {
      return {
        outcome: "done",
        value: result.value,
        polls,
        elapsedMs: afterProbeElapsed
      };
    }
    if (afterProbeElapsed >= args.timeoutMs) {
      return { outcome: "timeout", polls, elapsedMs: afterProbeElapsed };
    }
    await sleep(args.intervalMs);
  }
}

// scripts/tdd/deploy.ts
function resolveDeployTarget(projectDir, name) {
  const cfg = readTargets(projectDir);
  if (!cfg) return { kind: "missing", reason: "deploy-targets.yaml not found in project root" };
  const raw = cfg.targets[name];
  if (!raw) return { kind: "missing", reason: `target '${name}' not found in deploy-targets.yaml` };
  const type = raw.type ?? "";
  if (type !== "local") return { kind: "unsupported", type: type || "(no type)" };
  return {
    kind: "local",
    config: {
      type: "local",
      run: raw.run ?? "",
      baseUrl: (raw.base_url ?? "http://localhost:8000").replace(/\/+$/, ""),
      healthPath: raw.health_path ?? "/",
      readyTimeoutSeconds: Number(raw.ready_timeout_seconds ?? "60") || 60
    }
  };
}
async function probeReachable(url) {
  try {
    await fetch(url, { method: "GET" });
    return true;
  } catch {
    return false;
  }
}
function pidFile(projectDir, target) {
  return join2(projectDir, ".tdd", "deploy", `${target}.pid`);
}
function defaultStart(cmd, cwd) {
  const child = spawn("sh", ["-c", cmd], { cwd, detached: true, stdio: "ignore" });
  child.unref();
  return child.pid ?? -1;
}
async function deployToTarget(args) {
  const resolved = resolveDeployTarget(args.projectDir, args.targetName);
  if (resolved.kind === "missing") return { ok: false, reason: resolved.reason };
  if (resolved.kind === "unsupported") {
    return { ok: false, reason: `unsupported target type: ${resolved.type} (only 'local' is implemented)` };
  }
  const cfg = resolved.config;
  if (!cfg.run) return { ok: false, reason: `target '${args.targetName}' has no run command` };
  const start = args.startProcess ?? defaultStart;
  const reachable = args.reachable ?? probeReachable;
  const url = cfg.baseUrl + cfg.healthPath;
  const pid = start(cfg.run, args.projectDir);
  const pf = pidFile(args.projectDir, args.targetName);
  mkdirSync(dirname(pf), { recursive: true });
  writeFileSync2(pf, String(pid));
  const poll = await pollUntil({
    probe: async () => await reachable(url) ? { done: true, value: true } : { done: false },
    timeoutMs: cfg.readyTimeoutSeconds * 1e3,
    intervalMs: 1e3,
    sleep: args.sleep,
    now: args.now
  });
  if (poll.outcome !== "done") {
    return { ok: false, pid, reason: `app not reachable at ${url} after ${cfg.readyTimeoutSeconds}s` };
  }
  return { ok: true, url, pid };
}
function stopLocal(projectDir, targetName) {
  const pf = pidFile(projectDir, targetName);
  if (!existsSync2(pf)) return { stopped: false };
  const pid = Number(readFileSync2(pf, "utf8").trim());
  if (Number.isFinite(pid) && pid > 0) {
    try {
      process.kill(-pid);
    } catch {
      try {
        process.kill(pid);
      } catch {
      }
    }
  }
  rmSync(pf, { force: true });
  return { stopped: true };
}

// scripts/tdd/deploy.cli.ts
async function runDeployCli(argv) {
  let target;
  let projectDir = ".";
  let stop = false;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--target":
        target = argv[++i];
        break;
      case "--project-dir":
        projectDir = argv[++i];
        break;
      case "--stop":
        stop = true;
        break;
      case "--json":
        json = true;
        break;
      case "-h":
      case "--help":
        process.stdout.write(
          "lakebase-tdd-deploy --target <name> [--project-dir <dir>] [--stop] [--json]\nShips a built feature to a target and verifies it is reachable. Only 'local' is implemented.\n"
        );
        return 0;
    }
  }
  if (!target) {
    process.stderr.write("Error: --target is required.\n");
    return 2;
  }
  if (stop) {
    const r = stopLocal(projectDir, target);
    process.stdout.write(`lakebase-tdd-deploy: ${r.stopped ? "stopped" : "nothing to stop"} (${target})
`);
    return 0;
  }
  const result = await deployToTarget({ projectDir, targetName: target });
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}
`);
  } else if (result.ok) {
    process.stdout.write(`lakebase-tdd-deploy: ${target} reachable at ${result.url} (pid ${result.pid})
`);
  } else {
    process.stderr.write(`lakebase-tdd-deploy: ${target} deploy failed: ${result.reason}
`);
  }
  return result.ok ? 0 : 6;
}
if (isCliEntry(import.meta.url)) {
  runDeployCli(process.argv.slice(2)).then((code) => process.exit(code));
}
export {
  runDeployCli
};
//# sourceMappingURL=deploy.cli.js.map