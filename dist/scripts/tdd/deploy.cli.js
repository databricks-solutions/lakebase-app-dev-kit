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
import { execSync, spawn } from "child_process";
import { existsSync as existsSync3, mkdirSync as mkdirSync2, readFileSync as readFileSync3, rmSync, writeFileSync as writeFileSync3 } from "fs";
import { dirname, join as join3 } from "path";

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

// scripts/tdd/tdd-paths.ts
import * as fs from "fs";
import { join as join2 } from "path";
var featuresDir = (tdd) => join2(tdd, "features");
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return void 0;
  const exact = join2(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? join2(root, matches[0]) : void 0;
}

// scripts/tdd/deploy.ts
var DEPLOY_EVIDENCE_SCHEMA_VERSION = 1;
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
      readyTimeoutSeconds: Number(raw.ready_timeout_seconds ?? "60") || 60,
      verify: raw.verify || void 0
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
  return join3(projectDir, ".tdd", "deploy", `${target}.pid`);
}
function defaultRunVerify(cmd, cwd, env) {
  try {
    execSync(cmd, { cwd, stdio: "ignore", env: env ?? process.env });
    return true;
  } catch {
    return false;
  }
}
function writeDeployEvidence(tddDir, evidence) {
  const fdir = findFeatureDir(tddDir, evidence.feature_id);
  if (!fdir) return void 0;
  const dir = evidence.story_id ? join3(fdir, "stories", evidence.story_id) : fdir;
  mkdirSync2(dir, { recursive: true });
  const file = join3(dir, "deploy-evidence.json");
  writeFileSync3(file, JSON.stringify(evidence, null, 2) + "\n", "utf8");
  return file;
}
function defaultStart(cmd, cwd, env) {
  const child = spawn("sh", ["-c", cmd], { cwd, detached: true, stdio: "ignore", env: env ?? process.env });
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
  mkdirSync2(dirname(pf), { recursive: true });
  writeFileSync3(pf, String(pid));
  const poll = await pollUntil({
    probe: async () => await reachable(url) ? { done: true, value: true } : { done: false },
    timeoutMs: cfg.readyTimeoutSeconds * 1e3,
    intervalMs: 1e3,
    sleep: args.sleep,
    now: args.now
  });
  const reachableNow = poll.outcome === "done";
  let verify = { passed: false };
  if (reachableNow && cfg.verify) {
    const runVerify = args.runVerify ?? defaultRunVerify;
    const passed = runVerify(cfg.verify, args.projectDir, env);
    verify = {
      passed,
      command: cfg.verify,
      summary: passed ? "feature-verify passed against the running app" : "feature-verify FAILED against the running app"
    };
  } else if (reachableNow) {
    verify = { passed: false, summary: "no verify command configured for this target" };
  }
  let evidencePath;
  if (args.featureId) {
    const tddDir = args.tddDir ?? join3(args.projectDir, ".tdd");
    const at = (args.now ?? (() => /* @__PURE__ */ new Date()))().toISOString();
    evidencePath = writeDeployEvidence(tddDir, {
      schema_version: DEPLOY_EVIDENCE_SCHEMA_VERSION,
      feature_id: args.featureId,
      ...args.storyId ? { story_id: args.storyId } : {},
      target: args.targetName,
      url,
      reachable: reachableNow,
      verify,
      ...args.lakebaseBranch ? { lakebase_branch: args.lakebaseBranch } : {},
      deployed_at: at
    });
  }
  if (!reachableNow) {
    return {
      ok: false,
      pid,
      reason: `app not reachable at ${url} after ${cfg.readyTimeoutSeconds}s`,
      verify,
      evidencePath
    };
  }
  return { ok: true, url, pid, verify, evidencePath };
}
function stopLocal(projectDir, targetName) {
  const pf = pidFile(projectDir, targetName);
  if (!existsSync3(pf)) return { stopped: false };
  const pid = Number(readFileSync3(pf, "utf8").trim());
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
  let lakebaseBranch;
  let featureId;
  let storyId;
  let tddDir;
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
      case "--feature":
        featureId = argv[++i];
        break;
      case "--story":
        storyId = argv[++i];
        break;
      case "--tdd-dir":
        tddDir = argv[++i];
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
          "lakebase-tdd-deploy --target <name> [--project-dir <dir>] [--feature <id>] [--story <id>] [--lakebase-branch <branch>] [--stop] [--json]\nShips a built feature to a target and verifies it is reachable. Only 'local' is implemented.\n--feature writes features/<F>/deploy-evidence.json (the deploy gate's artifact);\n--story (with --feature) writes it at story scope + binds the run to the story's experiment branch;\n--lakebase-branch binds the run command to a story's experiment branch DB (per-story deploy).\n"
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
  const result = await deployToTarget({ projectDir, targetName: target, lakebaseBranch, featureId, storyId, tddDir });
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