#!/usr/bin/env node

// scripts/lakebase/scm-doctor.cli.ts
import * as fs6 from "fs";
import * as path5 from "path";

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

// scripts/lakebase/scm-doctor.ts
import * as fs5 from "fs";
import * as path4 from "path";

// scripts/lakebase/branch-utils.ts
import { execFile } from "child_process";
import { promisify } from "util";

// scripts/lakebase/branch-id.ts
var UID_PATTERN = /^br-[a-z0-9-]+$/;
function looksLikeBranchUid(s) {
  return UID_PATTERN.test(s);
}
function asBranchName(s) {
  if (!s) throw new TypeError("BranchName cannot be empty");
  if (looksLikeBranchUid(s)) {
    throw new TypeError(
      `'${s}' looks like a BranchUid (br-\u2026 pattern), not a BranchName. BranchName is the resource-path leaf (e.g. 'production', 'staging', 'feature-add-orders'); BranchUid is the system identifier returned by list-branches as the 'uid' field. The Lakebase API rejects a BranchUid in any path-shaped field. If you really mean a BranchUid, use asBranchUid() instead \u2013 but verify you're calling a function that takes one.`
    );
  }
  return s;
}
function asBranchUid(s) {
  if (!s) throw new TypeError("BranchUid cannot be empty");
  if (!looksLikeBranchUid(s)) {
    throw new TypeError(
      `'${s}' is not a BranchUid (must match the br-\u2026 pattern). If you have a BranchName (resource-path leaf like 'production'), use asBranchName() instead.`
    );
  }
  return s;
}
function branchNameFromResourcePath(path6) {
  if (!path6.includes("/branches/")) return null;
  const leaf = path6.split("/branches/").pop();
  if (!leaf) return null;
  try {
    return asBranchName(leaf);
  } catch {
    return null;
  }
}

// scripts/lakebase/kit-config.ts
function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}
var DAY_MS = 24 * 60 * 60 * 1e3;
var KIT_TIMEOUTS = {
  cliDefault: intFromEnv("LAKEBASE_KIT_TIMEOUT_CLI_DEFAULT_MS", 3e4),
  cliCreateBranch: intFromEnv("LAKEBASE_KIT_TIMEOUT_CLI_CREATE_BRANCH_MS", 6e4),
  cliCreateEndpoint: intFromEnv("LAKEBASE_KIT_TIMEOUT_CLI_CREATE_ENDPOINT_MS", 6e4),
  readyWait: intFromEnv("LAKEBASE_KIT_TIMEOUT_READY_WAIT_MS", 12e4),
  readyPoll: intFromEnv("LAKEBASE_KIT_TIMEOUT_READY_POLL_MS", 5e3),
  pgConnect: intFromEnv("LAKEBASE_KIT_TIMEOUT_PG_CONNECT_MS", 1e4),
  pgStatement: intFromEnv("LAKEBASE_KIT_TIMEOUT_PG_STATEMENT_MS", 15e3),
  gitDefault: intFromEnv("LAKEBASE_KIT_TIMEOUT_GIT_DEFAULT_MS", 5e3),
  gitCheckout: intFromEnv("LAKEBASE_KIT_TIMEOUT_GIT_CHECKOUT_MS", 1e4),
  gitNetwork: intFromEnv("LAKEBASE_KIT_TIMEOUT_GIT_NETWORK_MS", 15e3),
  gitPush: intFromEnv("LAKEBASE_KIT_TIMEOUT_GIT_PUSH_MS", 3e4),
  cliLong: intFromEnv("LAKEBASE_KIT_TIMEOUT_CLI_LONG_MS", 6e4),
  cmdShort: intFromEnv("LAKEBASE_KIT_TIMEOUT_CMD_SHORT_MS", 5e3),
  initializrCacheTtl: intFromEnv("LAKEBASE_KIT_INITIALIZR_CACHE_TTL_MS", 10 * 60 * 1e3),
  featureBranchTtlMs: intFromEnv("LAKEBASE_KIT_FEATURE_BRANCH_TTL_MS", 30 * DAY_MS),
  testBranchTtlMs: intFromEnv("LAKEBASE_KIT_TEST_BRANCH_TTL_MS", 14 * DAY_MS),
  uatBranchTtlMs: intFromEnv("LAKEBASE_KIT_UAT_BRANCH_TTL_MS", 14 * DAY_MS),
  perfBranchTtlMs: intFromEnv("LAKEBASE_KIT_PERF_BRANCH_TTL_MS", 7 * DAY_MS)
};
function formatLakebaseTtl(ms) {
  return `${Math.floor(ms / 1e3)}s`;
}
function urlFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.replace(/\/+$/, "");
}
var KIT_REGISTRIES = {
  mavenCentral: urlFromEnv("LAKEBASE_KIT_REGISTRY_MAVEN_CENTRAL", "https://repo1.maven.org/maven2"),
  springInitializr: urlFromEnv("LAKEBASE_KIT_REGISTRY_SPRING_INITIALIZR", "https://start.spring.io")
};

// scripts/lakebase/branch-utils.ts
var execFileP = promisify(execFile);
var LakebaseBranchError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "LakebaseBranchError";
  }
};
var LakebaseBranchTtlTooLongError = class extends LakebaseBranchError {
  /** The TTL that was attempted (the value passed to the API). */
  attemptedTtl;
  constructor(attemptedTtl, underlyingMessage) {
    super(
      `Branch create rejected: TTL '${attemptedTtl}' exceeds the workspace's maximum expiration policy. Pass a shorter ttl arg (e.g. "604800s" for 7 days) or set noExpiry: true. The workspace cap is not directly exposed by the Lakebase API; the project's history_retention_duration (from \`databricks postgres get-project\`) is a conservative starting point.

Underlying error: ${underlyingMessage}`
    );
    this.name = "LakebaseBranchTtlTooLongError";
    this.attemptedTtl = attemptedTtl;
  }
};
function isTtlTooLongError(stderr) {
  return /expiration time exceeds the maximum expiration time/i.test(stderr);
}
function parseLakebaseTtl(ttl) {
  if (!ttl) return void 0;
  const m = ttl.trim().match(/^(\d+)s?$/);
  if (!m) return void 0;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : void 0;
}
function minLakebaseTtl(a, b) {
  const sa = parseLakebaseTtl(a);
  const sb = parseLakebaseTtl(b);
  if (sa === void 0 && sb === void 0) return void 0;
  if (sa === void 0) return `${sb}s`;
  if (sb === void 0) return `${sa}s`;
  return `${Math.min(sa, sb)}s`;
}
var RETENTION_CACHE = /* @__PURE__ */ new Map();
function getCachedProjectRetention(instance) {
  return RETENTION_CACHE.get(instance);
}
function cacheProjectRetention(instance, ttl) {
  RETENTION_CACHE.set(instance, ttl);
}
function projectPath(instance) {
  return `projects/${instance}`;
}
async function listBranches(opts) {
  const raw = await dbcli(
    ["postgres", "list-branches", projectPath(opts.instance), "-o", "json"],
    opts.host
  );
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LakebaseBranchError(`Unexpected CLI output: ${raw.slice(0, 200)}`);
  }
  const items = Array.isArray(parsed) ? parsed : parsed.branches ?? parsed.items ?? [];
  return items.map(parseBranch).filter((b) => b !== void 0);
}
async function getBranchByName(branchNameOrUid, opts) {
  const branches = await listBranches(opts);
  return branches.find(
    (b) => b.uid === branchNameOrUid || b.name === branchNameOrUid || b.name.endsWith(`/${branchNameOrUid}`)
  );
}
async function getDefaultBranch(opts) {
  const branches = await listBranches(opts);
  return branches.find((b) => b.isDefault);
}
async function resolveBranchPath(branchNameOrUid, opts) {
  if (branchNameOrUid.startsWith("projects/") && branchNameOrUid.includes("/branches/")) {
    return branchNameOrUid;
  }
  const branch = await getBranchByName(branchNameOrUid, opts);
  return branch?.name;
}
function parseBranch(raw) {
  if (!raw || typeof raw !== "object") return void 0;
  const r = raw;
  const name = r.name ?? "";
  if (!name) return void 0;
  const nameLeaf = branchNameFromResourcePath(name);
  if (!nameLeaf) return void 0;
  if (!r.uid) return void 0;
  let uid;
  try {
    uid = asBranchUid(r.uid);
  } catch {
    return void 0;
  }
  const sourceBranchName = r.status?.source_branch ?? r.spec?.source_branch;
  const sourceBranchId = sourceBranchName ? branchNameFromResourcePath(sourceBranchName) ?? void 0 : void 0;
  return {
    uid,
    nameLeaf,
    name,
    state: r.status?.current_state ?? r.state ?? "UNKNOWN",
    sourceBranchName,
    sourceBranchId,
    isDefault: r.status?.default === true || r.is_default === true,
    expireTime: r.status?.expire_time,
    isProtected: r.status?.is_protected
  };
}
async function dbcli(args, host) {
  const trimmedHost = host?.replace(/\/+$/, "");
  const env = trimmedHost ? { ...process.env, DATABRICKS_HOST: trimmedHost } : process.env;
  try {
    const { stdout } = await execFileP("databricks", args, { env, timeout: KIT_TIMEOUTS.cliDefault });
    return stdout.toString();
  } catch (err) {
    const e = err;
    const stderr = typeof e.stderr === "string" ? e.stderr : Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf8") : "";
    throw new LakebaseBranchError(
      `databricks ${args.join(" ")} failed: ${e.message}${stderr ? `
stderr: ${stderr.trim()}` : ""}`
    );
  }
}

// scripts/util/exec.ts
import * as cp from "child_process";
function exec2(command, opts = {}) {
  return new Promise((resolve2, reject) => {
    const options = {
      cwd: opts.cwd,
      timeout: opts.timeout ?? 6e4
    };
    if (opts.env) {
      options.env = { ...process.env, ...opts.env };
    }
    cp.exec(command, options, (err, stdout, stderr) => {
      if (err) {
        const msg = String(stderr || err.message);
        reject(new Error(`${command}: ${msg}`));
        return;
      }
      resolve2(String(stdout).trim());
    });
  });
}

// scripts/git/inspect.ts
async function getCurrentBranch(args) {
  try {
    const name = await exec2("git rev-parse --abbrev-ref HEAD", {
      cwd: args.cwd
    });
    return name === "HEAD" ? "" : name;
  } catch {
    return "";
  }
}

// scripts/lakebase/scm-workflow-state.ts
import * as fs from "fs";
import * as path from "path";
var SCM_STATES = [
  "scaffold-complete",
  "feature-claimed",
  "pr-ready",
  "ci-green",
  "merged"
];
var STATE_INDEX = SCM_STATES.reduce(
  (acc, s, i) => ({ ...acc, [s]: i }),
  {}
);
var STATE_FILE_REL = ".lakebase/workflow-state.json";
function stateFilePath(projectDir) {
  return path.join(projectDir, STATE_FILE_REL);
}
function readWorkflowState(projectDir) {
  const p = stateFilePath(projectDir);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `Failed to parse ${STATE_FILE_REL}: ${e.message}`
    );
  }
  const result = validateWorkflowState(parsed);
  if (!result.ok) {
    const summary = result.errors.map((e) => `  - ${e.path}: ${e.message}`).join("\n");
    throw new Error(
      `Invalid ${STATE_FILE_REL}:
${summary}

Fix the file or delete it to re-init.`
    );
  }
  return result.value;
}
function writeWorkflowState(projectDir, state) {
  const result = validateWorkflowState(state);
  if (!result.ok) {
    const summary = result.errors.map((e) => `  - ${e.path}: ${e.message}`).join("\n");
    throw new Error(`Refusing to write invalid SCM state:
${summary}`);
  }
  const dir = path.join(projectDir, ".lakebase");
  fs.mkdirSync(dir, { recursive: true });
  const target = stateFilePath(projectDir);
  const tmp = `${target}.tmp`;
  const ordered = orderForOutput(result.value);
  fs.writeFileSync(tmp, `${JSON.stringify(ordered, null, 2)}
`, "utf8");
  fs.renameSync(tmp, target);
}
function initWorkflowState(args) {
  return {
    $schema: "./scm-workflow-state.schema.json",
    version: 1,
    state: "scaffold-complete",
    tier_topology: args.tierTopology,
    project_id: args.projectId
  };
}
function validateWorkflowState(value) {
  const errors = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      ok: false,
      errors: [{ path: "$", message: "must be an object" }]
    };
  }
  const v = value;
  if (v.version !== 1) {
    errors.push({ path: "version", message: `must be 1, got ${String(v.version)}` });
  }
  if (typeof v.state !== "string" || !SCM_STATES.includes(v.state)) {
    errors.push({
      path: "state",
      message: `must be one of ${SCM_STATES.join(" | ")}`
    });
  }
  if (v.tier_topology !== 1 && v.tier_topology !== 2 && v.tier_topology !== 3) {
    errors.push({
      path: "tier_topology",
      message: "must be 1, 2, or 3"
    });
  }
  if (typeof v.project_id !== "string" || v.project_id.length === 0) {
    errors.push({
      path: "project_id",
      message: "must be a non-empty string"
    });
  }
  const stringFields = [
    "feature_id",
    "branch",
    "parent_branch",
    "lakebase_branch_uid",
    "claimed_at",
    "pr_url",
    "pushed_at",
    "ci_run_url",
    "ci_green_at",
    "merged_at",
    "migrate_run_url",
    "migrate_completed_at",
    "$schema"
  ];
  for (const key of stringFields) {
    if (v[key] === void 0) continue;
    if (typeof v[key] !== "string" || v[key].length === 0) {
      errors.push({
        path: key,
        message: "must be a non-empty string when present"
      });
    }
  }
  const requiredForState = {
    "scaffold-complete": [],
    "feature-claimed": [
      "feature_id",
      "branch",
      "parent_branch",
      "lakebase_branch_uid",
      "claimed_at"
    ],
    "pr-ready": [
      "feature_id",
      "branch",
      "parent_branch",
      "lakebase_branch_uid",
      "claimed_at",
      "pr_url",
      "pushed_at"
    ],
    "ci-green": [
      "feature_id",
      "branch",
      "parent_branch",
      "lakebase_branch_uid",
      "claimed_at",
      "pr_url",
      "pushed_at",
      "ci_run_url",
      "ci_green_at"
    ],
    merged: [
      "feature_id",
      "branch",
      "parent_branch",
      "lakebase_branch_uid",
      "claimed_at",
      "pr_url",
      "pushed_at",
      "ci_run_url",
      "ci_green_at",
      "merged_at"
    ]
  };
  if (typeof v.state === "string" && SCM_STATES.includes(v.state)) {
    for (const key of requiredForState[v.state]) {
      if (v[key] === void 0) {
        errors.push({
          path: key,
          message: `required when state is "${v.state}"`
        });
      }
    }
  }
  const allowedKeys = /* @__PURE__ */ new Set([
    "$schema",
    "version",
    "state",
    "tier_topology",
    "project_id",
    "feature_id",
    "branch",
    "parent_branch",
    "lakebase_branch_uid",
    "claimed_at",
    "pr_url",
    "pushed_at",
    "ci_run_url",
    "ci_green_at",
    "merged_at",
    "migrate_run_url",
    "migrate_completed_at"
  ]);
  for (const key of Object.keys(v)) {
    if (!allowedKeys.has(key)) {
      errors.push({ path: key, message: "unknown property" });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: v };
}
function orderForOutput(state) {
  const keyOrder = [
    "$schema",
    "version",
    "state",
    "tier_topology",
    "project_id",
    "feature_id",
    "branch",
    "parent_branch",
    "lakebase_branch_uid",
    "claimed_at",
    "pr_url",
    "pushed_at",
    "ci_run_url",
    "ci_green_at",
    "merged_at",
    "migrate_run_url",
    "migrate_completed_at"
  ];
  const out = {};
  for (const k of keyOrder) {
    if (state[k] !== void 0) {
      out[k] = state[k];
    }
  }
  return out;
}

// scripts/lakebase/scm-adopt-state.ts
var ScmAdoptError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "ScmAdoptError";
  }
  code;
};
function inferTierTopology(branches) {
  const names = new Set(
    branches.map((b) => b.name.split("/").pop() ?? "")
  );
  if (names.has("dev") && names.has("staging")) return 3;
  if (names.has("staging")) return 2;
  return 1;
}
function parentForTier(topology, branches) {
  if (topology === 3) return "dev";
  if (topology === 2) return "staging";
  const def = branches.find((b) => b.isDefault === true);
  return def?.name.split("/").pop() ?? "main";
}
var LONG_RUNNING_LEAFS = /* @__PURE__ */ new Set(["staging", "dev", "main", "master"]);
function leafName(b) {
  return b.name.split("/").pop() ?? b.name;
}
async function adoptScmState(args) {
  if (!args.instance) {
    throw new ScmAdoptError(
      "Lakebase project id required (pass --instance or set LAKEBASE_PROJECT_ID in .env).",
      "missing-instance"
    );
  }
  const existing = readWorkflowState(args.projectDir);
  if (existing && !args.force) {
    throw new ScmAdoptError(
      `Workflow state already present at .lakebase/workflow-state.json (state: ${existing.state}). Pass --force to overwrite.`,
      "already-adopted"
    );
  }
  const notes = [];
  const currentBranch = await getCurrentBranch({ cwd: args.projectDir });
  if (!currentBranch) {
    throw new ScmAdoptError(
      "Could not resolve current git branch (detached HEAD?).",
      "missing-current-branch"
    );
  }
  const branches = await listBranches({ instance: args.instance });
  const topology = inferTierTopology(branches);
  notes.push(`Inferred tier_topology=${topology} from Lakebase branches.`);
  const defaultBranch = branches.find((b) => b.isDefault === true);
  const defaultLeaf = defaultBranch ? leafName(defaultBranch) : null;
  const isLongRunningTier = LONG_RUNNING_LEAFS.has(currentBranch) || defaultLeaf !== null && currentBranch === defaultLeaf;
  const base = initWorkflowState({
    projectId: args.instance,
    tierTopology: topology
  });
  if (isLongRunningTier) {
    notes.push(
      `Current git branch "${currentBranch}" is a long-running tier (default / staging / dev). Adopted state: scaffold-complete.`
    );
    writeWorkflowState(args.projectDir, base);
    return { state: base, notes };
  }
  if (!currentBranch.startsWith("feature/")) {
    throw new ScmAdoptError(
      `Current git branch "${currentBranch}" is not a long-running tier or a feature/<slug> branch. The adopter cannot guess the workflow state; switch to the tier you want to seed from, or rename the working branch.`,
      "unrecognized-branch"
    );
  }
  const sanitizedLeaf = currentBranch.replace(/\//g, "-");
  let pair;
  try {
    pair = await getBranchByName(sanitizedLeaf, { instance: args.instance });
  } catch {
    pair = void 0;
  }
  if (!pair) {
    throw new ScmAdoptError(
      `Git branch "${currentBranch}" has no matching Lakebase branch "${sanitizedLeaf}". The orphan must be paired (claim) or deleted before adoption.`,
      "lakebase-pair-missing"
    );
  }
  const now = (args.now ?? (() => /* @__PURE__ */ new Date()))();
  const featureSlug = currentBranch.slice("feature/".length);
  const adopted = {
    ...base,
    state: "feature-claimed",
    feature_id: featureSlug,
    branch: currentBranch,
    parent_branch: parentForTier(topology, branches),
    lakebase_branch_uid: pair.uid,
    claimed_at: now.toISOString()
  };
  writeWorkflowState(args.projectDir, adopted);
  notes.push(
    `Current branch "${currentBranch}" recognized as feature-claimed. Real claim time is unknown; recorded ${adopted.claimed_at} as adoption time.`
  );
  return { state: adopted, notes };
}

// scripts/lakebase/branch-create.ts
import { execFile as execFile3 } from "child_process";
import { promisify as promisify3 } from "util";

// scripts/util/delay.ts
function delay(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
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
async function pollUntilDefined(probe, opts) {
  return pollUntil({
    ...opts,
    probe: async (ctx) => {
      const value = await probe(ctx);
      return value === void 0 ? { done: false } : { done: true, value };
    }
  });
}

// scripts/util/sanitize-branch-name.ts
function sanitizeBranchName(gitBranch) {
  let name = gitBranch.replace(/\//g, "-").toLowerCase().replace(/[^a-z0-9-]/g, "-").substring(0, 63);
  while (name.length < 3) name += "-x";
  return name;
}

// scripts/lakebase/lakebase-project.ts
import { execFile as execFile2 } from "child_process";
import { promisify as promisify2 } from "util";
var execFileP2 = promisify2(execFile2);
var LakebaseProjectError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "LakebaseProjectError";
  }
};
function findHistoryRetentionDuration(parsed) {
  const raw = parsed.history_retention_duration ?? parsed.historyRetentionDuration;
  if (!raw || typeof raw !== "string") return void 0;
  const m = raw.trim().match(/^(\d+)s?$/);
  if (!m) return void 0;
  const seconds = Number.parseInt(m[1], 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return void 0;
  return `${seconds}s`;
}
async function getProjectRetentionDuration(args) {
  const name = args.projectId.startsWith("projects/") ? args.projectId : `projects/${args.projectId}`;
  let raw;
  try {
    raw = await dbcli2(["postgres", "get-project", name, "-o", "json"], args.host);
  } catch {
    return void 0;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return void 0;
  }
  return findHistoryRetentionDuration(parsed);
}
async function dbcli2(args, host) {
  const trimmedHost = host?.replace(/\/+$/, "");
  const env = trimmedHost ? { ...process.env, DATABRICKS_HOST: trimmedHost } : process.env;
  try {
    const { stdout } = await execFileP2("databricks", args, {
      env,
      timeout: KIT_TIMEOUTS.cliDefault
    });
    return stdout.toString();
  } catch (err) {
    const e = err;
    const stderr = typeof e.stderr === "string" ? e.stderr : Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf8") : "";
    throw new LakebaseProjectError(
      `databricks ${args.join(" ")} failed: ${e.message}${stderr ? `
stderr: ${stderr.trim()}` : ""}`
    );
  }
}

// scripts/lakebase/branch-create.ts
var execFileP3 = promisify3(execFile3);
async function createBranch(args) {
  const sanitized = sanitizeBranchName(args.branch);
  const lookup = { instance: args.instance, host: args.host };
  let sourceBranchPath;
  if (args.parentBranch) {
    if (looksLikeBranchUid(args.parentBranch)) {
      throw new LakebaseBranchError(
        `parentBranch '${args.parentBranch}' looks like a BranchUid (br-\u2026 pattern), not a BranchName. Pass the resource-path leaf (e.g. 'production', 'staging', 'feature-add-orders') \u2013 the Lakebase API rejects uids in source_branch fields. If you have a uid and need to resolve it to its name, call resolveBranchId() from branch-utils first.`
      );
    }
    const validated = asBranchName(args.parentBranch);
    const parent = await getBranchByName(validated, lookup);
    if (parent) {
      sourceBranchPath = parent.name;
    } else if (args.strictParent === true) {
      throw new LakebaseBranchError(
        `parentBranch '${validated}' does not exist on project '${args.instance}', and strictParent: true was set. Either create '${validated}' first (e.g. cut it off the project default branch) or drop strictParent: true to fall back to the project default branch.`
      );
    } else {
      const def = await getDefaultBranch(lookup);
      if (!def) {
        throw new LakebaseBranchError(
          `parentBranch '${validated}' does not exist on project '${args.instance}' and the project has no default branch to fall back to.`
        );
      }
      const defaultLeaf = leafOf(def.name) ?? def.name;
      process.stderr.write(
        `[lakebase-branch-create] parentBranch '${validated}' not found on project '${args.instance}'; falling back to default branch '${defaultLeaf}'. Pass strictParent: true to throw instead.
`
      );
      sourceBranchPath = def.name;
    }
  } else if (args.currentBranch && args.currentBranch !== sanitized) {
    const current = await getBranchByName(args.currentBranch, lookup);
    if (current) sourceBranchPath = current.name;
  }
  if (!sourceBranchPath) {
    const def = await getDefaultBranch(lookup);
    if (!def) {
      throw new LakebaseBranchError(
        `Could not find a parent branch for "${sanitized}" \u2013 no parentBranch override, no currentBranch hint, and the project has no default branch.`
      );
    }
    sourceBranchPath = def.name;
  }
  const existing = await getBranchByName(sanitized, lookup);
  if (existing) {
    const existingLeaf = leafOf(existing.sourceBranchName);
    const requestedLeaf = leafOf(sourceBranchPath);
    if (existingLeaf && requestedLeaf && existingLeaf !== requestedLeaf) {
      throw new LakebaseBranchError(
        `Branch "${sanitized}" already exists, but was forked from "${existingLeaf}", not the requested "${requestedLeaf}". Delete the existing branch first, or pick a different target name.`
      );
    }
    return existing;
  }
  if (args.ttl && args.noExpiry === true) {
    throw new LakebaseBranchError(
      `Cannot set both ttl ("${args.ttl}") and noExpiry: true on the same branch \u2013 they are mutually exclusive. Pass one or the other.`
    );
  }
  const specObj = {
    source_branch: sourceBranchPath
  };
  if (args.ttl) {
    specObj.ttl = args.ttl;
  } else if (args.noExpiry ?? true) {
    specObj.no_expiry = true;
  }
  await createWithTtlRecovery(args.instance, sanitized, specObj, args.host);
  return waitForBranchReady({
    instance: args.instance,
    host: args.host,
    branch: sanitized,
    timeoutMs: args.readyTimeoutMs ?? KIT_TIMEOUTS.readyWait,
    pollIntervalMs: args.pollIntervalMs ?? KIT_TIMEOUTS.readyPoll
  });
}
async function waitForBranchReady(args) {
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.readyWait;
  const interval = args.pollIntervalMs ?? KIT_TIMEOUTS.readyPoll;
  const result = await pollUntilDefined(
    async () => {
      const branch = await getBranchByName(args.branch, { instance: args.instance, host: args.host });
      return branch && branch.state === "READY" ? branch : void 0;
    },
    { timeoutMs, intervalMs: interval }
  );
  if (result.outcome === "timeout") {
    throw new LakebaseBranchError(
      `Branch "${args.branch}" did not reach READY within ${timeoutMs}ms`
    );
  }
  return result.value;
}
function leafOf(pathOrName) {
  if (!pathOrName) return void 0;
  const segments = pathOrName.split("/");
  return segments[segments.length - 1] || void 0;
}
async function createWithTtlRecovery(instance, sanitized, specObj, host) {
  const originalTtl = specObj.ttl;
  try {
    await dbcli3(
      ["postgres", "create-branch", projectPath(instance), sanitized, "--json", JSON.stringify({ spec: specObj })],
      host
    );
    return;
  } catch (err) {
    if (!(err instanceof LakebaseBranchError) || !originalTtl || !isTtlTooLongError(err.message)) {
      throw err;
    }
    let retention = getCachedProjectRetention(instance);
    if (retention === void 0) {
      retention = await getProjectRetentionDuration({ projectId: instance, host });
      cacheProjectRetention(instance, retention);
    }
    const FALLBACK_TTL = "604800s";
    const effectiveRetention = retention ?? FALLBACK_TTL;
    const clamped = minLakebaseTtl(originalTtl, effectiveRetention) ?? effectiveRetention;
    if (clamped === originalTtl) {
      throw new LakebaseBranchTtlTooLongError(originalTtl, err.message);
    }
    process.stderr.write(
      `[lakebase-branch-create] workspace TTL cap rejected '${originalTtl}' for project '${instance}'; retrying with ` + (retention ? `retention-clamped '${clamped}'.
` : `hardcoded fallback '${clamped}' (history_retention_duration not discoverable).
`)
    );
    const retrySpec = { ...specObj, ttl: clamped };
    try {
      await dbcli3(
        ["postgres", "create-branch", projectPath(instance), sanitized, "--json", JSON.stringify({ spec: retrySpec })],
        host
      );
    } catch (retryErr) {
      if (retryErr instanceof LakebaseBranchError && isTtlTooLongError(retryErr.message)) {
        throw new LakebaseBranchTtlTooLongError(
          clamped,
          `Workspace rejected retention-clamped TTL '${clamped}' (original '${originalTtl}'): ${retryErr.message}`
        );
      }
      throw retryErr;
    }
  }
}
async function dbcli3(args, host) {
  const trimmedHost = host?.replace(/\/+$/, "");
  const env = trimmedHost ? { ...process.env, DATABRICKS_HOST: trimmedHost } : process.env;
  try {
    const { stdout } = await execFileP3("databricks", args, { env, timeout: KIT_TIMEOUTS.cliCreateBranch });
    return stdout.toString();
  } catch (err) {
    const e = err;
    const stderr = typeof e.stderr === "string" ? e.stderr : Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf8") : "";
    throw new LakebaseBranchError(
      `databricks ${args.join(" ")} failed: ${e.message}${stderr ? `
stderr: ${stderr.trim()}` : ""}`
    );
  }
}

// scripts/lakebase/paired-branch.ts
import * as fs4 from "fs";
import * as path3 from "path";
import { execFileSync as execFileSync3 } from "child_process";

// scripts/lakebase/branch-delete.ts
import { execFile as execFile4 } from "child_process";
import { promisify as promisify4 } from "util";
var execFileP4 = promisify4(execFile4);

// scripts/lakebase/branch-endpoint.ts
import { execFileSync as execFileSync2 } from "child_process";

// scripts/lakebase/get-connection.ts
import { execFileSync } from "child_process";
import { createLakebasePool } from "@databricks/lakebase";
import { Client } from "pg";

// scripts/lakebase/constants.ts
var POSTGRES_PORT = 5432;
var DEFAULT_DATABASE = "databricks_postgres";
var DEFAULT_ENDPOINT = "primary";

// scripts/lakebase/get-connection.ts
async function mintCredential(endpointPath2) {
  const raw = dbcli4(["postgres", "generate-database-credential", endpointPath2, "-o", "json"]);
  const token = JSON.parse(raw)?.token ?? "";
  if (!token) {
    throw new Error(`generate-database-credential returned no token for ${endpointPath2}`);
  }
  const email = await resolveCurrentUser();
  return { token, email };
}
async function resolveCurrentUser() {
  const raw = dbcli4(["current-user", "me", "-o", "json"]);
  const parsed = JSON.parse(raw);
  const email = parsed.userName ?? parsed.emails?.[0]?.value;
  if (!email) {
    throw new Error("Could not resolve current user from `databricks current-user me`");
  }
  return email;
}
function dbcli4(args) {
  try {
    return execFileSync("databricks", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: KIT_TIMEOUTS.cliDefault
    });
  } catch (err) {
    const e = err;
    const stderr = typeof e.stderr === "string" ? e.stderr : Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf8") : "";
    throw new Error(
      `databricks ${args.join(" ")} failed: ${e.message}${stderr ? `
stderr: ${stderr.trim()}` : ""}`
    );
  }
}

// scripts/lakebase/branch-endpoint.ts
async function getEndpoint(args) {
  const branchPath = await resolveBranchPath(args.branch, { instance: args.instance });
  if (!branchPath) {
    return void 0;
  }
  let raw;
  try {
    raw = execFileSync2("databricks", ["postgres", "list-endpoints", branchPath, "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: KIT_TIMEOUTS.cliDefault
    });
  } catch {
    return void 0;
  }
  let endpoints;
  try {
    endpoints = JSON.parse(raw);
  } catch {
    return void 0;
  }
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    return void 0;
  }
  const ep = endpoints[0];
  return {
    host: ep?.status?.hosts?.host ?? "",
    state: ep?.status?.current_state ?? "UNKNOWN"
  };
}
function endpointPath(instance, branch, endpointName = DEFAULT_ENDPOINT) {
  return `projects/${instance}/branches/${branch}/endpoints/${endpointName}`;
}

// scripts/lakebase/env-file.ts
import * as fs2 from "fs";
import * as path2 from "path";
var CONNECTION_KEYS = [
  "DATABASE_URL",
  "DB_USERNAME",
  "DB_PASSWORD",
  "LAKEBASE_BRANCH_ID",
  "LAKEBASE_HOST"
];
function updateEnvConnection(args) {
  const existing = fs2.existsSync(args.envPath) ? fs2.readFileSync(args.envPath, "utf-8") : "";
  const preserved = existing.split("\n").filter((line) => {
    const trimmed = line.trimStart();
    return !CONNECTION_KEYS.some((k) => trimmed.startsWith(`${k}=`));
  }).join("\n").replace(/\n+$/, "");
  const lines = [];
  if (args.comment !== void 0) {
    lines.push(args.comment);
  }
  if (args.endpointHost !== void 0) {
    lines.push(`LAKEBASE_HOST=${args.endpointHost}`);
  }
  lines.push(`LAKEBASE_BRANCH_ID=${args.branchId}`);
  lines.push(`DATABASE_URL=${args.databaseUrl}`);
  lines.push(`DB_USERNAME=${args.username}`);
  lines.push(`DB_PASSWORD=${args.password}`);
  lines.push("");
  const block = lines.join("\n");
  const content = preserved ? `${preserved}
${block}` : block;
  fs2.mkdirSync(path2.dirname(args.envPath), { recursive: true });
  fs2.writeFileSync(args.envPath, content);
}

// scripts/lakebase/databricks-profile.ts
import * as fs3 from "fs";
function normalizeHost(host) {
  return host.trim().replace(/\/+$/, "").toLowerCase();
}
function selectProfileForHost(profilesJson, host) {
  const target = normalizeHost(host);
  if (!target) return void 0;
  const start = profilesJson.indexOf("{");
  if (start < 0) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(profilesJson.slice(start));
  } catch {
    return void 0;
  }
  const profiles = parsed.profiles;
  if (!Array.isArray(profiles)) return void 0;
  const names = profiles.filter((p) => {
    if (!p || typeof p !== "object") return false;
    const rec = p;
    return typeof rec.name === "string" && typeof rec.host === "string" && rec.valid === true && normalizeHost(rec.host) === target;
  }).map((p) => p.name);
  const distinct = Array.from(new Set(names));
  return distinct.length === 1 ? distinct[0] : void 0;
}
async function resolveProfileForHost(host, timeoutMs = KIT_TIMEOUTS.cliDefault) {
  if (!normalizeHost(host)) return void 0;
  let out;
  try {
    out = await exec2("databricks auth profiles -o json", { timeout: timeoutMs });
  } catch {
    return void 0;
  }
  return selectProfileForHost(out, host);
}
async function ensureProfilePinned(args) {
  const { envPath } = args;
  if (!fs3.existsSync(envPath)) return { reason: "no-env" };
  const lines = fs3.readFileSync(envPath, "utf-8").split("\n");
  const startsWithKey = (line, key) => line.trimStart().startsWith(`${key}=`);
  if (lines.some((l) => startsWithKey(l, "DATABRICKS_CONFIG_PROFILE"))) {
    return { reason: "already-pinned" };
  }
  const hostIdx = lines.findIndex((l) => startsWithKey(l, "DATABRICKS_HOST"));
  if (hostIdx < 0) return { reason: "no-host" };
  const hostLine = lines[hostIdx];
  const host = hostLine.slice(hostLine.indexOf("=") + 1).trim();
  if (!host) return { reason: "no-host" };
  const resolve2 = args.resolve ?? ((h) => resolveProfileForHost(h));
  const profile = await resolve2(host);
  if (!profile) return { reason: "no-match" };
  lines.splice(hostIdx + 1, 0, `DATABRICKS_CONFIG_PROFILE=${profile}`);
  fs3.writeFileSync(envPath, lines.join("\n"));
  return { pinned: profile };
}

// scripts/lakebase/paired-branch.ts
function gitHasLocalBranch(cwd, branch) {
  try {
    execFileSync3("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], {
      cwd,
      stdio: "ignore",
      timeout: KIT_TIMEOUTS.gitDefault
    });
    return true;
  } catch {
    return false;
  }
}
function gitCheckoutNewBranch(cwd, branch) {
  execFileSync3("git", ["checkout", "-b", branch], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitCheckout
  });
}
function gitCheckoutExistingBranch(cwd, branch) {
  execFileSync3("git", ["checkout", branch], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitCheckout
  });
}
function buildDsn(host, database, user, password) {
  const u = new URL(`postgresql://${host}:${POSTGRES_PORT}/${encodeURIComponent(database)}`);
  u.username = encodeURIComponent(user);
  u.password = encodeURIComponent(password);
  u.searchParams.set("sslmode", "require");
  return u.toString();
}
async function createPairedBranch(args) {
  const warnings = [];
  const sanitized = sanitizeBranchName(args.branch);
  const createGitBranch = args.createGitBranch !== false;
  const syncEnv = args.syncEnv !== false;
  const database = args.database ?? process.env.PGDATABASE ?? DEFAULT_DATABASE;
  const branch = await createBranch({
    instance: args.instance,
    branch: args.branch,
    parentBranch: args.parentBranch,
    ttl: args.ttl,
    noExpiry: args.noExpiry
  });
  let ready = branch;
  if (branch.state !== "READY") {
    try {
      ready = await waitForBranchReady({
        instance: args.instance,
        branch: sanitized,
        timeoutMs: args.readyTimeoutMs ?? KIT_TIMEOUTS.readyWait
      });
    } catch (err) {
      warnings.push(
        `Lakebase branch created but did not reach READY: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  let gitBranchCreated = false;
  if (createGitBranch) {
    try {
      if (gitHasLocalBranch(args.cwd, sanitized)) {
        gitCheckoutExistingBranch(args.cwd, sanitized);
      } else {
        gitCheckoutNewBranch(args.cwd, sanitized);
        gitBranchCreated = true;
      }
    } catch (err) {
      warnings.push(
        `Failed to create/switch git branch "${sanitized}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  let envSynced = false;
  if (syncEnv && ready.state === "READY") {
    try {
      const ep = await getEndpoint({ instance: args.instance, branch: sanitized });
      if (!ep?.host) {
        warnings.push(`Endpoint not yet available for "${sanitized}" \u2013 .env not updated`);
      } else {
        const { token, email } = await mintCredential(endpointPath(args.instance, sanitized));
        const dsn = buildDsn(ep.host, database, email, token);
        const envPath = path3.join(args.cwd, ".env");
        updateEnvConnection({
          envPath,
          branchId: sanitized,
          databaseUrl: dsn,
          username: email,
          password: token,
          endpointHost: ep.host
        });
        await ensureProfilePinned({ envPath }).catch(() => void 0);
        envSynced = true;
      }
    } catch (err) {
      warnings.push(
        `.env sync failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return {
    branch: ready,
    gitBranch: sanitized,
    gitBranchCreated,
    envSynced,
    warnings
  };
}

// scripts/lakebase/convention-branches.ts
var CONVENTION_TIER_DEFAULTS = {
  feature: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.featureBranchTtlMs), parentBranch: "staging" },
  test: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.testBranchTtlMs), parentBranch: "staging" },
  uat: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.uatBranchTtlMs), parentBranch: "staging" },
  perf: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.perfBranchTtlMs), parentBranch: "staging" }
};
async function createFeaturePairedBranch(args) {
  return createPairedBranch({
    instance: args.instance,
    branch: args.branch,
    parentBranch: args.parentBranch ?? CONVENTION_TIER_DEFAULTS.feature.parentBranch,
    ttl: args.ttl ?? CONVENTION_TIER_DEFAULTS.feature.ttl,
    cwd: args.cwd,
    createGitBranch: args.createGitBranch,
    syncEnv: args.syncEnv,
    readyTimeoutMs: args.readyTimeoutMs,
    database: args.database
  });
}

// scripts/git/branches.ts
async function currentBranchName(cwd) {
  try {
    return await exec2("git rev-parse --abbrev-ref HEAD", { cwd });
  } catch {
    return "";
  }
}
async function listLocalBranches(args) {
  const { cwd } = args;
  let raw;
  try {
    raw = await exec2(
      'git branch --format="%(refname:short)|%(upstream:short)|%(upstream:track)"',
      { cwd }
    );
  } catch {
    return [];
  }
  if (!raw) return [];
  const current = await currentBranchName(cwd);
  return raw.split("\n").filter(Boolean).map((line) => {
    const [name, tracking, trackInfo] = line.split("|");
    let ahead = 0;
    let behind = 0;
    if (trackInfo) {
      const aheadMatch = trackInfo.match(/ahead (\d+)/);
      const behindMatch = trackInfo.match(/behind (\d+)/);
      if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
      if (behindMatch) behind = parseInt(behindMatch[1], 10);
    }
    return {
      name,
      isCurrent: name === current,
      isRemote: false,
      tracking: tracking || void 0,
      ahead,
      behind
    };
  });
}

// scripts/lakebase/scm-recover-orphans.ts
var ScmRecoverError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "ScmRecoverError";
  }
  code;
};
var TIER_LEAFS = /* @__PURE__ */ new Set(["staging", "dev", "main", "master"]);
async function recoverOrphans(args) {
  if (!args.instance) {
    throw new ScmRecoverError(
      "Lakebase project id required (--instance / LAKEBASE_PROJECT_ID).",
      "missing-instance"
    );
  }
  const lakebaseBranches = await listBranches({ instance: args.instance });
  const tierTopology = inferTierTopology(lakebaseBranches);
  const lakebaseLeafs = new Set(
    lakebaseBranches.map((b) => leafName2(b))
  );
  const defaultLeaf = leafName2(
    lakebaseBranches.find((b) => b.isDefault === true)
  );
  const gitBranches = await listLocalBranches({ cwd: args.projectDir });
  const orphans = [];
  const skipped = [];
  for (const gb of gitBranches) {
    if (gb.isRemote) continue;
    const name = gb.name;
    if (TIER_LEAFS.has(name)) {
      skipped.push({ gitBranch: name, reason: "tier branch" });
      continue;
    }
    if (defaultLeaf && name === defaultLeaf) {
      skipped.push({ gitBranch: name, reason: "default branch" });
      continue;
    }
    const sanitized = sanitizeBranchName(name);
    if (lakebaseLeafs.has(sanitized)) {
      skipped.push({
        gitBranch: name,
        reason: `paired Lakebase branch "${sanitized}" exists`
      });
      continue;
    }
    orphans.push({
      gitBranch: name,
      sanitized,
      isCurrent: gb.isCurrent === true,
      reason: name.startsWith("feature/") ? "feature/<slug> branch with no Lakebase pair" : `non-tier git branch "${name}" with no Lakebase pair`
    });
  }
  const result = {
    tierTopology,
    orphans,
    skipped,
    claimed: []
  };
  if (!args.claim || orphans.length === 0) {
    return result;
  }
  const parentBranch = parentForTopology(tierTopology, defaultLeaf);
  const currentState = readWorkflowState(args.projectDir);
  const candidates = args.onlyBranch ? orphans.filter((o) => o.gitBranch === args.onlyBranch) : orphans;
  if (args.onlyBranch && candidates.length === 0) {
    throw new ScmRecoverError(
      `No orphan found for --only-branch ${args.onlyBranch}.`,
      "claim-conflict"
    );
  }
  const headOrphan = candidates.find((o) => o.isCurrent);
  const stateTargetOrphan = headOrphan ?? candidates[0];
  for (const orphan of candidates) {
    try {
      const paired = await createFeaturePairedBranch({
        instance: args.instance,
        branch: orphan.gitBranch,
        parentBranch,
        cwd: args.projectDir
        // The git branch already exists on disk; the substrate primitive
        // is idempotent on the git side (it'll checkout the existing
        // branch rather than fail) but if the project is not on this
        // branch, we want a no-op git side. Leaving the default true is
        // OK: if the git branch already matches, the checkout is a
        // no-op; if the branch isn't HEAD, the substrate switches to it
        // which is what the user implicitly asked for by including the
        // branch.
      });
      let stateUpdated = false;
      if (orphan === stateTargetOrphan) {
        const next = {
          ...currentState ?? {
            $schema: "./scm-workflow-state.schema.json",
            version: 1,
            state: "scaffold-complete",
            tier_topology: tierTopology,
            project_id: args.instance
          },
          state: "feature-claimed",
          feature_id: orphan.gitBranch.replace(/^feature\//, ""),
          branch: paired.gitBranch,
          parent_branch: parentBranch,
          lakebase_branch_uid: paired.branch.uid,
          claimed_at: (args.now ?? (() => /* @__PURE__ */ new Date()))().toISOString(),
          pr_url: void 0,
          pushed_at: void 0,
          ci_run_url: void 0,
          ci_green_at: void 0,
          merged_at: void 0
        };
        writeWorkflowState(args.projectDir, next);
        stateUpdated = true;
        result.stateUpdatedFor = orphan.gitBranch;
      }
      result.claimed.push({
        candidate: orphan,
        lakebaseBranchUid: paired.branch.uid,
        stateUpdated,
        warnings: paired.warnings
      });
    } catch (err) {
      throw new ScmRecoverError(
        `Substrate claim failed for ${orphan.gitBranch}: ${err instanceof Error ? err.message : String(err)}`,
        "substrate-failure"
      );
    }
  }
  return result;
}
function leafName2(b) {
  if (!b) return "";
  return b.name.split("/").pop() ?? b.name;
}
function parentForTopology(t, defaultLeaf) {
  if (t === 3) return "dev";
  if (t === 2) return "staging";
  return defaultLeaf || "main";
}

// scripts/tdd/stale-branches.ts
import { existsSync as existsSync7, readdirSync as readdirSync3, statSync as statSync2 } from "fs";
import { join as join6 } from "path";

// scripts/tdd/story-pipeline.ts
import { existsSync as existsSync5, readFileSync as readFileSync5, writeFileSync as writeFileSync4, mkdirSync as mkdirSync3, readdirSync } from "fs";
import { dirname as dirname2, join as join4 } from "path";
function initPipeline(featureId) {
  return { version: 1, feature_id: featureId, stories: {}, build_queue: [], build_active: null };
}
function pipelinePath(tddDir, featureId) {
  return join4(tddDir, "features", featureId, "pipeline.json");
}
function readPipeline(tddDir, featureId) {
  const p = pipelinePath(tddDir, featureId);
  if (!existsSync5(p)) return initPipeline(featureId);
  return JSON.parse(readFileSync5(p, "utf8"));
}

// scripts/tdd/spike.ts
import { existsSync as existsSync6, mkdirSync as mkdirSync4, readdirSync as readdirSync2, readFileSync as readFileSync6, statSync, writeFileSync as writeFileSync5 } from "fs";
import { join as join5 } from "path";
function listSpikes(tddDir) {
  const root = join5(tddDir, "spikes");
  if (!existsSync6(root)) return [];
  const out = [];
  for (const slug of readdirSync2(root)) {
    const dir = join5(root, slug);
    if (!statSync(dir).isDirectory()) continue;
    const branchFile = join5(dir, "branch.txt");
    if (!existsSync6(branchFile)) continue;
    out.push({
      spike_slug: slug,
      branch_id: readFileSync6(branchFile, "utf8").trim(),
      created_at: statSync(branchFile).birthtime.toISOString(),
      dir
    });
  }
  return out;
}

// scripts/tdd/stale-branches.ts
function listPipelineFeatures(tddDir) {
  const featuresDir = join6(tddDir, "features");
  if (!existsSync7(featuresDir)) return [];
  return readdirSync3(featuresDir).filter((d) => statSync2(join6(featuresDir, d)).isDirectory()).filter((d) => existsSync7(join6(featuresDir, d, "pipeline.json"))).sort();
}
function findStaleBranches(tddDir) {
  const findings = [];
  for (const featureId of listPipelineFeatures(tddDir)) {
    const pipeline = readPipeline(tddDir, featureId);
    for (const [storyId, story] of Object.entries(pipeline.stories)) {
      const exp = story.experiment;
      if (!exp) continue;
      const storyTerminal = story.status === "done" || story.status === "discarded";
      if (exp.status === "active" && storyTerminal) {
        findings.push({
          kind: "experiment",
          slug: exp.slug,
          feature_id: pipeline.feature_id,
          story_id: storyId,
          branch: exp.branch,
          reason: `story is ${story.status} but its experiment branch is still active (merge/discard teardown likely failed); a paired Lakebase branch may be lingering`
        });
      }
    }
  }
  for (const spike of listSpikes(tddDir)) {
    findings.push({
      kind: "spike",
      slug: spike.spike_slug,
      branch: spike.branch_id,
      reason: "spike has a paired branch; spikes are throwaway (only their learning carries forward), tear it down to reclaim the branch"
    });
  }
  return findings;
}

// scripts/lakebase/scm-doctor.ts
var FEATURE_PREFIX = "feature/";
var TIER_LEAFS2 = /* @__PURE__ */ new Set(["staging", "dev"]);
function readEnv(projectDir) {
  const envPath = path4.join(projectDir, ".env");
  const out = /* @__PURE__ */ new Map();
  if (!fs5.existsSync(envPath)) return out;
  const lines = fs5.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m) out.set(m[1], m[2].replace(/^["']|["']$/g, ""));
  }
  return out;
}
function leafOf2(b) {
  return b.name.split("/").pop() ?? b.name;
}
function worstOf(a, b) {
  const order = ["ok", "warn", "fail"];
  return order[Math.max(order.indexOf(a), order.indexOf(b))];
}
async function runDoctor(args) {
  const projectDir = args.projectDir;
  const findings = [];
  const env = readEnv(projectDir);
  const instance = args.instance ?? env.get("LAKEBASE_PROJECT_ID");
  const state = readWorkflowState(projectDir);
  const workflowStatePresent = state !== null;
  for (const stale of findStaleBranches(path4.join(projectDir, ".tdd"))) {
    const where = stale.feature_id ? ` ${stale.feature_id}/${stale.story_id}` : "";
    findings.push({
      id: `stale-${stale.kind}`,
      severity: "warn",
      message: `Stale ${stale.kind}${where} "${stale.slug}"${stale.branch ? ` (branch ${stale.branch})` : ""}: ${stale.reason}.`,
      suggestion: stale.kind === "experiment" ? `lakebase-tdd-experiment discard --feature ${stale.feature_id} --story ${stale.story_id} --slug ${stale.slug} --instance <id> --approver <you> --reason "doctor: stale experiment"` : "lakebase-tdd-spike teardown (or delete the spike's paired branch) once its learning has carried forward"
    });
  }
  if (!workflowStatePresent) {
    findings.push({
      id: "no-state-file",
      severity: "fail",
      message: "No .lakebase/workflow-state.json. Either the project pre-dates the SCM workflow or scaffold did not seed it.",
      suggestion: "lakebase-scm-adopt-state"
    });
  }
  if (!env.has("LAKEBASE_PROJECT_ID")) {
    findings.push({
      id: "env-missing-project-id",
      severity: "fail",
      message: ".env does not contain LAKEBASE_PROJECT_ID. The post-checkout hook will exit early; workflow CLIs will need an explicit --instance.",
      suggestion: "Set LAKEBASE_PROJECT_ID=<your project id> in .env"
    });
  }
  if (!instance) {
    return finalize({
      projectDir,
      workflowStatePresent,
      state: state ?? void 0,
      findings
    });
  }
  let lakebaseBranches = [];
  try {
    lakebaseBranches = await listBranches({ instance });
  } catch (err) {
    findings.push({
      id: "lakebase-unreachable",
      severity: "fail",
      message: `Could not list Lakebase branches for instance ${instance}: ${err instanceof Error ? err.message : String(err)}`,
      suggestion: "databricks auth login (or check DATABRICKS_CONFIG_PROFILE)."
    });
    return finalize({
      projectDir,
      workflowStatePresent,
      state: state ?? void 0,
      findings
    });
  }
  const inferredTopology = inferTierTopology(lakebaseBranches);
  if (state && state.tier_topology !== inferredTopology) {
    findings.push({
      id: "tier-topology-mismatch",
      severity: "warn",
      message: `workflow-state records tier_topology=${state.tier_topology}, but the Lakebase tier inventory suggests ${inferredTopology}.`,
      suggestion: "lakebase-scm-adopt-state --force"
    });
  }
  const headBranch = await getCurrentBranch({ cwd: projectDir });
  if (state && state.state === "feature-claimed") {
    if (state.branch && headBranch && headBranch !== state.branch) {
      findings.push({
        id: "head-branch-drift",
        severity: "warn",
        message: `workflow says feature-claimed for "${state.branch}", but HEAD is on "${headBranch}".`,
        suggestion: `git checkout '${state.branch}'`
      });
    }
    if (state.branch) {
      const sanitized = sanitizeBranchName(state.branch);
      let pair;
      try {
        pair = await getBranchByName(sanitized, { instance });
      } catch {
        pair = void 0;
      }
      if (!pair) {
        findings.push({
          id: "lakebase-pair-missing",
          severity: "fail",
          message: `workflow says feature-claimed for "${state.branch}", but no Lakebase branch "${sanitized}" exists.`,
          suggestion: `lakebase-scm-abandon-feature  # reset state; re-claim if needed`
        });
      } else if (state.lakebase_branch_uid && pair.uid !== state.lakebase_branch_uid) {
        findings.push({
          id: "lakebase-uid-drift",
          severity: "warn",
          message: `workflow records lakebase_branch_uid=${state.lakebase_branch_uid}, but the live branch reports ${pair.uid}.`,
          suggestion: "lakebase-scm-adopt-state --force"
        });
      }
    }
  }
  if (state && state.state === "feature-claimed" && state.branch) {
    const envBranchId = env.get("LAKEBASE_BRANCH_ID");
    const sanitized = sanitizeBranchName(state.branch);
    if (envBranchId && envBranchId !== sanitized) {
      findings.push({
        id: "env-branch-drift",
        severity: "warn",
        message: `.env LAKEBASE_BRANCH_ID=${envBranchId} but workflow says ${sanitized}. The post-checkout hook may not have run since the last branch switch.`,
        suggestion: `git checkout '${state.branch}'  # re-fires post-checkout`
      });
    }
  }
  if (headBranch && !TIER_LEAFS2.has(headBranch) && headBranch.startsWith(FEATURE_PREFIX)) {
    const sanitized = sanitizeBranchName(headBranch);
    const paired = lakebaseBranches.some((b) => leafOf2(b) === sanitized);
    if (!paired) {
      findings.push({
        id: "orphan-current-branch",
        severity: "fail",
        message: `Current git branch "${headBranch}" has no Lakebase pair (post-checkout fallback retired in phase C).`,
        suggestion: `lakebase-scm-recover-orphans --claim --only-branch '${headBranch}'`
      });
    }
  }
  return finalize({
    projectDir,
    workflowStatePresent,
    state: state ?? void 0,
    inferredTierTopology: inferredTopology,
    findings
  });
}
function finalize(report) {
  let worst = "ok";
  for (const f of report.findings) {
    worst = worstOf(worst, f.severity);
  }
  return { ...report, worstSeverity: worst };
}
var ScmDoctorFixError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "ScmDoctorFixError";
  }
  code;
};
var FIXABLE_FINDING_IDS = [
  "env-branch-drift",
  "head-branch-drift",
  "tier-topology-mismatch",
  "orphan-current-branch"
];
async function fixFinding(args) {
  if (!FIXABLE_FINDING_IDS.includes(args.findingId)) {
    throw new ScmDoctorFixError(
      `Finding "${args.findingId}" is not supported by --fix. Supported: ${FIXABLE_FINDING_IDS.join(", ")}.`,
      "unsupported-finding"
    );
  }
  const report = args.report ?? await runDoctor({ projectDir: args.projectDir, instance: args.instance });
  const present = report.findings.find((f) => f.id === args.findingId);
  if (!present) {
    throw new ScmDoctorFixError(
      `Finding "${args.findingId}" is not present in the current report. Re-run lakebase-scm-doctor to see what needs fixing.`,
      "finding-not-present"
    );
  }
  let action = "";
  try {
    switch (args.findingId) {
      case "env-branch-drift": {
        const branch = report.state?.branch;
        if (!branch) {
          throw new ScmDoctorFixError(
            "Cannot fix: workflow state has no branch field.",
            "fix-failed"
          );
        }
        const sanitized = sanitizeBranchName(branch);
        updateEnvConnection({
          envPath: path4.join(args.projectDir, ".env"),
          branchId: sanitized,
          databaseUrl: "",
          username: "",
          password: ""
        });
        action = `rewrote .env LAKEBASE_BRANCH_ID=${sanitized} (credentials left empty; next post-checkout or manual mint refreshes them)`;
        break;
      }
      case "head-branch-drift": {
        const branch = report.state?.branch;
        if (!branch) {
          throw new ScmDoctorFixError(
            "Cannot fix: workflow state has no branch field.",
            "fix-failed"
          );
        }
        await exec2(`git checkout ${shellEscape(branch)}`, {
          cwd: args.projectDir,
          timeout: 15e3
        });
        action = `git checkout ${branch} (re-fires post-checkout to resync HEAD)`;
        break;
      }
      case "tier-topology-mismatch": {
        const instance = args.instance ?? report.state?.project_id;
        if (!instance) {
          throw new ScmDoctorFixError(
            "Cannot fix: missing Lakebase project id.",
            "fix-failed"
          );
        }
        await adoptScmState({
          projectDir: args.projectDir,
          instance,
          force: true
        });
        action = `adopted state with --force to re-infer tier_topology`;
        break;
      }
      case "orphan-current-branch": {
        const instance = args.instance ?? report.state?.project_id;
        if (!instance) {
          throw new ScmDoctorFixError(
            "Cannot fix: missing Lakebase project id.",
            "fix-failed"
          );
        }
        const headBranch = await getCurrentBranch({ cwd: args.projectDir });
        if (!headBranch) {
          throw new ScmDoctorFixError(
            "Cannot fix: detached HEAD or no current branch.",
            "fix-failed"
          );
        }
        await recoverOrphans({
          projectDir: args.projectDir,
          instance,
          claim: true,
          onlyBranch: headBranch
        });
        action = `recovered orphan ${headBranch} via createFeaturePairedBranch`;
        break;
      }
    }
  } catch (err) {
    if (err instanceof ScmDoctorFixError) throw err;
    throw new ScmDoctorFixError(
      `Remediation failed: ${err instanceof Error ? err.message : String(err)}`,
      "fix-failed"
    );
  }
  const postReport = await runDoctor({
    projectDir: args.projectDir,
    instance: args.instance
  });
  return { findingId: args.findingId, action, postReport };
}
function shellEscape(s) {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

// scripts/lakebase/scm-doctor.cli.ts
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--project-dir":
      case "--cwd":
        out.projectDir = argv[++i];
        break;
      case "--instance":
        out.instance = argv[++i];
        break;
      case "--fix":
        out.fix = argv[++i];
        break;
      case "--json":
        out.json = true;
        break;
      case "--pretty":
        out.pretty = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
    }
  }
  return out;
}
var HELP = `lakebase-scm-doctor (FEIP-7458 phase C)

Read-only diagnostic. Cross-checks .lakebase/workflow-state.json,
.env, the current git branch, and the Lakebase tier inventory.
Reports inconsistencies + suggests a remediation command per finding.

Usage:
  lakebase-scm-doctor [flags]

Flags:
  --project-dir <dir>   Project root (default: cwd)
  --instance <id>       Lakebase project id (default: from .env)
  --fix <finding-id>    Apply the targeted remediation for one finding.
                        Supported: env-branch-drift, head-branch-drift,
                        tier-topology-mismatch, orphan-current-branch.
  --json                Machine-readable JSON report
  --pretty              Pretty-print JSON
  -h, --help            Show this help

Exit codes (diagnostic mode):
  0 = no findings (or only "ok" findings)
  1 = warnings present (state usable but drifting)
  2 = failures present (state broken; remediation required)

Exit codes (--fix mode):
  0 = fix applied; post-fix report attached
  2 = finding not present in current report, or unsupported finding id
  3 = fix executed but the underlying command failed
`;
function readEnvProjectId(projectDir) {
  const envPath = path5.join(projectDir, ".env");
  if (!fs6.existsSync(envPath)) return void 0;
  const lines = fs6.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*LAKEBASE_PROJECT_ID\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return void 0;
}
function renderHuman(report) {
  const lines = [];
  lines.push(`SCM workflow doctor: ${report.projectDir}`);
  lines.push("");
  lines.push(
    `  workflow_state_present : ${report.workflowStatePresent ? "yes" : "no"}`
  );
  if (report.state) {
    lines.push(`  current_state          : ${report.state.state}`);
    lines.push(
      `  tier_topology          : ${report.state.tier_topology}${report.inferredTierTopology && report.inferredTierTopology !== report.state.tier_topology ? ` (lakebase suggests ${report.inferredTierTopology})` : ""}`
    );
  }
  lines.push(`  worst_severity         : ${report.worstSeverity}`);
  lines.push("");
  if (report.findings.length === 0) {
    lines.push("No findings.");
  } else {
    lines.push("Findings:");
    for (const f of report.findings) {
      lines.push(`  [${f.severity.toUpperCase()}] ${f.id}`);
      lines.push(`    ${f.message}`);
      if (f.suggestion) {
        lines.push(`    suggest: ${f.suggestion}`);
      }
    }
  }
  return lines.join("\n");
}
function exitCodeFor(report) {
  if (report.worstSeverity === "fail") return 2;
  if (report.worstSeverity === "warn") return 1;
  return 0;
}
function renderFixResult(result) {
  const lines = [];
  lines.push(`Fix applied: ${result.findingId}`);
  lines.push(`  action       : ${result.action}`);
  lines.push("");
  lines.push("Post-fix doctor report:");
  lines.push("");
  for (const line of renderHuman(result.postReport).split("\n")) {
    lines.push(`  ${line}`);
  }
  return lines.join("\n");
}
async function runScmDoctorCli(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP}
`);
    return 0;
  }
  const projectDir = path5.resolve(args.projectDir ?? process.cwd());
  const instance = args.instance ?? readEnvProjectId(projectDir);
  if (args.fix) {
    if (!FIXABLE_FINDING_IDS.includes(args.fix)) {
      const msg = `Unsupported --fix value "${args.fix}". Supported: ${FIXABLE_FINDING_IDS.join(", ")}.`;
      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({ ok: false, error: { code: "unsupported-finding", message: msg } }, null, args.pretty ? 2 : 0)}
`
        );
      } else {
        process.stderr.write(`lakebase-scm-doctor: ${msg}
`);
      }
      return 2;
    }
    try {
      const result = await fixFinding({
        projectDir,
        instance,
        findingId: args.fix
      });
      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({ ok: true, ...result }, null, args.pretty ? 2 : 0)}
`
        );
      } else {
        process.stdout.write(`${renderFixResult(result)}
`);
      }
      return 0;
    } catch (e) {
      const err = e;
      const code = err instanceof ScmDoctorFixError ? err.code : "fix-failed";
      const message = err.message;
      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({ ok: false, error: { code, message } }, null, args.pretty ? 2 : 0)}
`
        );
      } else {
        process.stderr.write(`lakebase-scm-doctor: ${code}

  ${message}
`);
      }
      if (err instanceof ScmDoctorFixError) {
        if (err.code === "fix-failed") return 3;
        return 2;
      }
      return 3;
    }
  }
  const report = await runDoctor({ projectDir, instance });
  if (args.json) {
    const indent = args.pretty ? 2 : 0;
    process.stdout.write(`${JSON.stringify(report, null, indent)}
`);
  } else {
    process.stdout.write(`${renderHuman(report)}
`);
  }
  return exitCodeFor(report);
}
if (isCliEntry(import.meta.url)) {
  void runScmDoctorCli(process.argv.slice(2)).then((c) => process.exit(c));
}
export {
  runScmDoctorCli
};
//# sourceMappingURL=scm-doctor.cli.js.map