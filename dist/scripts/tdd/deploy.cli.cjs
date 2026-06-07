#!/usr/bin/env node
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// scripts/tdd/deploy.cli.ts
var deploy_cli_exports = {};
__export(deploy_cli_exports, {
  runDeployCli: () => runDeployCli
});
module.exports = __toCommonJS(deploy_cli_exports);

// node_modules/tsup/assets/cjs_shims.js
var getImportMetaUrl = () => typeof document === "undefined" ? new URL(`file:${__filename}`).href : document.currentScript && document.currentScript.tagName.toUpperCase() === "SCRIPT" ? document.currentScript.src : new URL("main.js", document.baseURI).href;
var importMetaUrl = /* @__PURE__ */ getImportMetaUrl();

// scripts/util/cli-entry.ts
var import_node_fs = require("fs");
var import_node_url = require("url");
function isCliEntry(importMetaUrl2) {
  const invokedRaw = process.argv[1];
  if (!invokedRaw) return false;
  let invokedResolved;
  let moduleResolved;
  try {
    invokedResolved = (0, import_node_fs.realpathSync)(invokedRaw);
  } catch {
    return false;
  }
  try {
    moduleResolved = (0, import_node_fs.realpathSync)((0, import_node_url.fileURLToPath)(importMetaUrl2));
  } catch {
    return false;
  }
  return invokedResolved === moduleResolved;
}

// scripts/tdd/deploy.ts
var import_node_child_process = require("child_process");
var import_node_fs2 = require("fs");
var import_node_path = require("path");

// scripts/lakebase/deploy-targets.ts
var import_fs = require("fs");
var import_path = require("path");
var TARGETS_FILE = "deploy-targets.yaml";
function readTargets(workspaceRoot) {
  const targetsFile = (0, import_path.join)(workspaceRoot, TARGETS_FILE);
  if (!(0, import_fs.existsSync)(targetsFile)) return null;
  return parseTargetsYaml((0, import_fs.readFileSync)(targetsFile, "utf-8"));
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
  return (0, import_node_path.join)(projectDir, ".tdd", "deploy", `${target}.pid`);
}
function defaultStart(cmd, cwd, env) {
  const child = (0, import_node_child_process.spawn)("sh", ["-c", cmd], { cwd, detached: true, stdio: "ignore", env: env ?? process.env });
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
  const env = args.lakebaseBranch ? { ...process.env, LAKEBASE_BRANCH_ID: args.lakebaseBranch } : void 0;
  const pid = start(cfg.run, args.projectDir, env);
  const pf = pidFile(args.projectDir, args.targetName);
  (0, import_node_fs2.mkdirSync)((0, import_node_path.dirname)(pf), { recursive: true });
  (0, import_node_fs2.writeFileSync)(pf, String(pid));
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
  if (!(0, import_node_fs2.existsSync)(pf)) return { stopped: false };
  const pid = Number((0, import_node_fs2.readFileSync)(pf, "utf8").trim());
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
  (0, import_node_fs2.rmSync)(pf, { force: true });
  return { stopped: true };
}

// scripts/tdd/deploy.cli.ts
async function runDeployCli(argv) {
  let target;
  let projectDir = ".";
  let stop = false;
  let json = false;
  let lakebaseBranch;
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--target":
        target = argv[++i];
        break;
      case "--project-dir":
        projectDir = argv[++i];
        break;
      case "--lakebase-branch":
        lakebaseBranch = argv[++i];
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
          "lakebase-tdd-deploy --target <name> [--project-dir <dir>] [--lakebase-branch <branch>] [--stop] [--json]\nShips a built feature to a target and verifies it is reachable. Only 'local' is implemented.\n--lakebase-branch binds the run command to a story's experiment branch DB (per-story deploy).\n"
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
  const result = await deployToTarget({ projectDir, targetName: target, lakebaseBranch });
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
if (isCliEntry(importMetaUrl)) {
  runDeployCli(process.argv.slice(2)).then((code) => process.exit(code));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  runDeployCli
});
//# sourceMappingURL=deploy.cli.cjs.map