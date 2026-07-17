#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// scripts/lakebase/ci-resolve-branch.cli.ts
var fs10 = __toESM(require("fs"), 1);

// scripts/lakebase/databricks-cli.ts
var import_node_child_process2 = require("child_process");
var import_node_util = require("util");
var import_node_path = require("path");

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
  cliCreateProject: intFromEnv("LAKEBASE_KIT_TIMEOUT_CLI_CREATE_PROJECT_MS", 18e4),
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
function urlFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.replace(/\/+$/, "");
}
var KIT_REGISTRIES = {
  mavenCentral: urlFromEnv("LAKEBASE_KIT_REGISTRY_MAVEN_CENTRAL", "https://repo1.maven.org/maven2"),
  springInitializr: urlFromEnv("LAKEBASE_KIT_REGISTRY_SPRING_INITIALIZR", "https://start.spring.io")
};

// scripts/lakebase/databricks-profile.ts
var fs = __toESM(require("fs"), 1);
var import_node_child_process = require("child_process");

// scripts/util/exec.ts
var cp = __toESM(require("child_process"), 1);

// scripts/lakebase/databricks-profile.ts
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
function resolveProfileForHostSync(host, timeoutMs = KIT_TIMEOUTS.cliDefault) {
  if (!normalizeHost(host)) return void 0;
  let out;
  try {
    out = (0, import_node_child_process.execFileSync)("databricks", ["auth", "profiles", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs
    });
  } catch {
    return void 0;
  }
  return selectProfileForHost(out, host);
}

// scripts/lakebase/env-file.ts
var fs2 = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);
function readEnvVar(envPath, key) {
  if (!fs2.existsSync(envPath)) return void 0;
  let value;
  for (const line of fs2.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("#") || !trimmed.startsWith(`${key}=`)) continue;
    value = trimmed.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return value && value.length > 0 ? value : void 0;
}

// scripts/lakebase/databricks-cli.ts
var execFileP = (0, import_node_util.promisify)(import_node_child_process2.execFile);
var DatabricksCliError = class extends Error {
  constructor(message, profile, stderr) {
    super(message);
    this.profile = profile;
    this.stderr = stderr;
    this.name = "DatabricksCliError";
  }
  profile;
  stderr;
};
var DatabricksAuthError = class extends DatabricksCliError {
  constructor(profile, detail) {
    const login = `databricks auth login${profile ? ` --profile ${profile}` : ""}`;
    super(
      `Databricks authentication failed${profile ? ` for profile "${profile}"` : ""}: the cached token is missing or expired. Re-authenticate, then re-run:
  ${login}
${detail}`,
      profile,
      detail
    );
    this.name = "DatabricksAuthError";
  }
};
var profileByHost = /* @__PURE__ */ new Map();
var profileByEnvFile = /* @__PURE__ */ new Map();
function isAuthFailure(text) {
  return /refresh token is invalid|auth login|could not be retrieved because|not authenticated|no valid.*(credential|token)|invalid.*(access token|credential)|\b401\b|unauthorized/i.test(
    text
  );
}
function resolveProfile(opts) {
  const base = opts.env ?? process.env;
  if (opts.profile) return opts.profile;
  const envProfile = base.DATABRICKS_CONFIG_PROFILE?.trim();
  if (envProfile) return envProfile;
  const cwd = opts.cwd ?? process.cwd();
  let fromEnvFile;
  if (profileByEnvFile.has(cwd)) {
    fromEnvFile = profileByEnvFile.get(cwd);
  } else {
    fromEnvFile = readEnvVar((0, import_node_path.join)(cwd, ".env"), "DATABRICKS_CONFIG_PROFILE");
    profileByEnvFile.set(cwd, fromEnvFile);
  }
  if (fromEnvFile) return fromEnvFile;
  const host = opts.host?.trim();
  if (!host) return void 0;
  if (profileByHost.has(host)) return profileByHost.get(host);
  const resolved = resolveProfileForHostSync(host, opts.timeout);
  profileByHost.set(host, resolved);
  return resolved;
}
function buildInvocation(args, opts) {
  const base = opts.env ?? process.env;
  const trimmedHost = opts.host?.replace(/\/+$/, "");
  const env = trimmedHost ? { ...base, DATABRICKS_HOST: trimmedHost } : base;
  const profile = resolveProfile(opts);
  const argv = profile && !args.includes("--profile") ? [...args, "--profile", profile] : args;
  return { argv, env, profile };
}
function classifyDatabricksError(err, argv, profile) {
  const e = err;
  const asText = (v) => typeof v === "string" ? v : Buffer.isBuffer(v) ? v.toString("utf8") : "";
  const stderr = asText(e.stderr).trim();
  const stdout = asText(e.stdout).trim();
  const haystack = `${e.message ?? ""}
${stderr}
${stdout}`;
  if (isAuthFailure(haystack)) {
    return new DatabricksAuthError(profile, stderr || stdout || (e.message ?? ""));
  }
  const killed = e.killed === true;
  const signal = e.signal ?? void 0;
  const detail = stderr ? `
stderr: ${stderr}` : stdout ? `
stdout: ${stdout}` : killed || signal ? `
(no output; the CLI was killed${signal ? ` by ${signal}` : ""}, likely a TIMEOUT; raise the budget via the matching LAKEBASE_KIT_TIMEOUT_* env var)` : e.code !== void 0 ? `
(no stderr/stdout; exit ${e.code})` : "";
  return new DatabricksCliError(
    `databricks ${argv.join(" ")} failed: ${e.message}${detail}`,
    profile,
    stderr || stdout
  );
}
async function runDatabricks(args, opts = {}) {
  const { argv, env, profile } = buildInvocation(args, opts);
  try {
    const { stdout } = await execFileP("databricks", argv, {
      env,
      timeout: opts.timeout ?? KIT_TIMEOUTS.cliDefault
    });
    return stdout.toString();
  } catch (err) {
    throw classifyDatabricksError(err, argv, profile);
  }
}
function runDatabricksSync(args, opts = {}) {
  const { argv, env, profile } = buildInvocation(args, opts);
  try {
    return (0, import_node_child_process2.execFileSync)("databricks", argv, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env,
      timeout: opts.timeout ?? KIT_TIMEOUTS.cliDefault
    });
  } catch (err) {
    throw classifyDatabricksError(err, argv, profile);
  }
}

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
function branchNameFromResourcePath(path10) {
  if (!path10.includes("/branches/")) return null;
  const leaf = path10.split("/branches/").pop();
  if (!leaf) return null;
  try {
    return asBranchName(leaf);
  } catch {
    return null;
  }
}

// scripts/lakebase/branch-utils.ts
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
async function resolveBranchId(args) {
  const { branch, ...opts } = args;
  if (branch.startsWith("projects/") && branch.includes("/branches/")) {
    const leaf2 = branch.split("/branches/").pop();
    if (leaf2) return leaf2;
  }
  if (!branch.startsWith("br-")) {
    return branch;
  }
  const info = await getBranchByName(branch, opts);
  if (!info) {
    throw new LakebaseBranchError(
      `Could not resolve branch "${branch}" in project "${opts.instance}". Pass either the branch_id (e.g. "demo-feature") or the branch uid.`
    );
  }
  const leaf = info.name.split("/branches/").pop();
  if (!leaf) {
    throw new LakebaseBranchError(
      `Branch info for "${branch}" missing a name segment (got "${info.name}").`
    );
  }
  return leaf;
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
function dbcli(args, host) {
  return runDatabricks(args, { host, timeout: KIT_TIMEOUTS.cliDefault });
}

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
var LAKEBASE_BRANCH_NAME_MAX = 63;
function sanitizeBranchName(gitBranch) {
  let name = gitBranch.replace(/\//g, "-").toLowerCase().replace(/[^a-z0-9-]/g, "-").substring(0, LAKEBASE_BRANCH_NAME_MAX);
  while (name.length < 3) name += "-x";
  return name;
}

// scripts/lakebase/lakebase-project.ts
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
function dbcli2(args, host, timeout = KIT_TIMEOUTS.cliDefault) {
  return runDatabricks(args, { host, timeout });
}

// scripts/lakebase/branch-create.ts
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
    assertSourceMatches(existing, sourceBranchPath, sanitized);
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
  try {
    await createWithTtlRecovery(args.instance, sanitized, specObj, args.host);
  } catch (err) {
    if (err instanceof LakebaseBranchTtlTooLongError) throw err;
    const landed = await getBranchByName(sanitized, lookup);
    if (!landed) throw err;
    assertSourceMatches(landed, sourceBranchPath, sanitized);
  }
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
function assertSourceMatches(existing, sourceBranchPath, sanitized) {
  const existingLeaf = leafOf(existing.sourceBranchName);
  const requestedLeaf = leafOf(sourceBranchPath);
  if (existingLeaf && requestedLeaf && existingLeaf !== requestedLeaf) {
    throw new LakebaseBranchError(
      `Branch "${sanitized}" already exists, but was forked from "${existingLeaf}", not the requested "${requestedLeaf}". Delete the existing branch first, or pick a different target name.`
    );
  }
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
    if (!(err instanceof DatabricksCliError) || !originalTtl || !isTtlTooLongError(err.message)) {
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
      if (retryErr instanceof DatabricksCliError && isTtlTooLongError(retryErr.message)) {
        throw new LakebaseBranchTtlTooLongError(
          clamped,
          `Workspace rejected retention-clamped TTL '${clamped}' (original '${originalTtl}'): ${retryErr.message}`
        );
      }
      throw retryErr;
    }
  }
}
function dbcli3(args, host) {
  return runDatabricks(args, { host, timeout: KIT_TIMEOUTS.cliCreateBranch });
}

// scripts/lakebase/branch-delete.ts
async function deleteBranch(args) {
  const fullPath = await resolveBranchPath(args.branch, {
    instance: args.instance,
    host: args.host
  });
  if (!fullPath) {
    throw new LakebaseBranchError(`Branch "${args.branch}" not found in instance "${args.instance}"`);
  }
  if (!args.allowDefault) {
    const info = await getBranchByName(args.branch, {
      instance: args.instance,
      host: args.host
    });
    if (info?.isDefault) {
      const leaf = info.name.split("/branches/").pop() ?? info.uid;
      throw new LakebaseBranchError(
        `Refusing to delete the project's default Lakebase branch "${leaf}". This branch is the trunk every other branch was forked from. Pass allowDefault=true (or --allow-default on the CLI) only when you intend to tear down the entire project.`
      );
    }
  }
  await dbcli4(["postgres", "delete-branch", fullPath], args.host);
}
function dbcli4(args, host) {
  return runDatabricks(args, { host, timeout: KIT_TIMEOUTS.cliDefault });
}

// scripts/lakebase/schema-migrate.ts
var fs9 = __toESM(require("fs"), 1);
var path9 = __toESM(require("path"), 1);

// scripts/lakebase/get-connection.ts
var import_lakebase = require("@databricks/lakebase");
var import_pg = require("pg");

// scripts/lakebase/constants.ts
var POSTGRES_PORT = 5432;
var DEFAULT_DATABASE = "databricks_postgres";
var DEFAULT_ENDPOINT = "primary";

// scripts/lakebase/get-connection.ts
async function getConnection(args) {
  const endpointName = args.endpointName ?? DEFAULT_ENDPOINT;
  const database = args.database ?? process.env.PGDATABASE ?? DEFAULT_DATABASE;
  const branchId = await resolveBranchId({ instance: args.instance, branch: args.branch });
  const endpointPath = `projects/${args.instance}/branches/${branchId}/endpoints/${endpointName}`;
  if (args.output === "dsn") {
    const host2 = await resolveEndpointHost(args.instance, branchId);
    const { token, email: email2 } = await mintCredential(endpointPath);
    const url = buildPostgresUrl({ host: host2, port: POSTGRES_PORT, database, user: email2, password: token });
    return { url, host: host2, port: POSTGRES_PORT, database, user: email2, endpointPath };
  }
  const host = await resolveEndpointHost(args.instance, branchId);
  const email = await resolveCurrentUser();
  return (0, import_lakebase.createLakebasePool)({
    endpoint: endpointPath,
    host,
    database,
    user: email,
    // workspaceClient is passed through verbatim. createLakebasePool falls
    // back to environment / ServiceContext when omitted.
    ...args.workspaceClient !== void 0 ? { workspaceClient: args.workspaceClient } : {}
  });
}
async function resolveEndpointHost(instance, branch) {
  const branchId = await resolveBranchId({ instance, branch });
  const branchPath = `projects/${instance}/branches/${branchId}`;
  const raw = dbcli5(["postgres", "list-endpoints", branchPath, "-o", "json"]);
  const endpoints = JSON.parse(raw);
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    throw new Error(`No endpoints found for branch ${branchPath}`);
  }
  const host = endpoints[0]?.status?.hosts?.host;
  if (!host) {
    throw new Error(`Endpoint exists for ${branchPath} but has no host yet \u2013 wait for it to become ACTIVE`);
  }
  return host;
}
async function mintCredential(endpointPath) {
  const raw = dbcli5(["postgres", "generate-database-credential", endpointPath, "-o", "json"]);
  const token = JSON.parse(raw)?.token ?? "";
  if (!token) {
    throw new Error(`generate-database-credential returned no token for ${endpointPath}`);
  }
  const email = await resolveCurrentUser();
  return { token, email };
}
async function resolveCurrentUser() {
  const raw = dbcli5(["current-user", "me", "-o", "json"]);
  const parsed = JSON.parse(raw);
  const email = parsed.userName ?? parsed.emails?.[0]?.value;
  if (!email) {
    throw new Error("Could not resolve current user from `databricks current-user me`");
  }
  return email;
}
function buildPostgresUrl(parts) {
  const u = new URL(`postgresql://${parts.host}:${parts.port}/${encodeURIComponent(parts.database)}`);
  u.username = encodeURIComponent(parts.user);
  u.password = encodeURIComponent(parts.password);
  u.searchParams.set("sslmode", "require");
  return u.toString();
}
function dbcli5(args) {
  return runDatabricksSync(args, { timeout: KIT_TIMEOUTS.cliDefault });
}

// scripts/lakebase/migration-layout.ts
var fs3 = __toESM(require("fs"), 1);
var path2 = __toESM(require("path"), 1);
var MIGRATION_LANGUAGES = [
  "java",
  "kotlin",
  "python",
  "nodejs",
  "unknown"
];
function detectLanguageAt(dir) {
  if (fs3.existsSync(path2.join(dir, "pom.xml"))) {
    const kotlinDir = path2.join(dir, "src", "main", "kotlin");
    if (fs3.existsSync(kotlinDir)) {
      return "kotlin";
    }
    try {
      const pom = fs3.readFileSync(path2.join(dir, "pom.xml"), "utf-8");
      if (pom.includes("kotlin-maven-plugin")) {
        return "kotlin";
      }
    } catch {
    }
    return "java";
  }
  if (fs3.existsSync(path2.join(dir, "pyproject.toml")) || fs3.existsSync(path2.join(dir, "requirements.txt")) || fs3.existsSync(path2.join(dir, "alembic.ini"))) {
    return "python";
  }
  if (fs3.existsSync(path2.join(dir, "package.json"))) {
    return "nodejs";
  }
  return "unknown";
}
function resolveMigrationLanguage(projectDir, configuredMigrationPath, override) {
  const ov = (override ?? "").trim().toLowerCase();
  if (ov && ov !== "auto" && MIGRATION_LANGUAGES.includes(ov)) {
    return ov;
  }
  if (!projectDir) {
    return "unknown";
  }
  const atRoot = detectLanguageAt(projectDir);
  if (atRoot !== "unknown") {
    return atRoot;
  }
  const rel = (configuredMigrationPath ?? "").trim();
  if (!rel) {
    return "unknown";
  }
  const rootResolved = path2.resolve(projectDir);
  let dir = path2.resolve(projectDir, rel);
  while (dir === rootResolved || dir.startsWith(rootResolved + path2.sep)) {
    const lang = detectLanguageAt(dir);
    if (lang !== "unknown") {
      return lang;
    }
    const parent = path2.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return "unknown";
}

// scripts/lakebase/adapters/alembic-adapter.ts
var fs5 = __toESM(require("fs"), 1);
var path4 = __toESM(require("path"), 1);

// scripts/lakebase/schema-migrate-runners/alembic.ts
var import_node_child_process3 = require("child_process");
var fs4 = __toESM(require("fs"), 1);
var path3 = __toESM(require("path"), 1);
function resolveAlembicBin(projectDir) {
  const candidates = [
    path3.join(projectDir, ".venv", "bin", "alembic"),
    path3.join(projectDir, "venv", "bin", "alembic")
  ];
  for (const candidate of candidates) {
    try {
      if (fs4.existsSync(candidate)) return candidate;
    } catch {
    }
  }
  return "alembic";
}
function spawnAlembic(projectDir, args, dsn) {
  return new Promise((resolve2, reject) => {
    const bin = resolveAlembicBin(projectDir);
    const env = { ...process.env };
    env.PYTHONPATH = [projectDir, process.env.PYTHONPATH].filter(Boolean).join(path3.delimiter);
    if (dsn) env.DATABASE_URL = dsn;
    const child = (0, import_node_child_process3.spawn)(bin, args, {
      cwd: projectDir,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      reject(
        new SchemaMigrationError(
          `Could not spawn alembic. Is it installed and on PATH? ${err.message}`,
          err
        )
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve2({ stdout, stderr });
      } else {
        reject(
          new SchemaMigrationError(
            `alembic ${args.join(" ")} exited with code ${code}.
stdout: ${stdout}
stderr: ${stderr}`
          )
        );
      }
    });
  });
}
function runAlembic(ctx, args) {
  return spawnAlembic(ctx.projectDir, args, ctx.dsn);
}
async function createAlembicRevision(opts) {
  const args = ["revision", "--rev-id", opts.revId, "-m", opts.message];
  if (opts.autogenerate) args.push("--autogenerate");
  const { stdout } = await spawnAlembic(opts.projectDir, args, opts.dsn);
  const m = stdout.match(/Generating\s+(\S+\.py)/);
  if (m) return m[1].trim();
  for (const rel of ["migrations/versions", "alembic/versions"]) {
    const dir = path3.join(opts.projectDir, rel);
    if (!fs4.existsSync(dir)) continue;
    const hit = fs4.readdirSync(dir).find((f) => f.startsWith(`${opts.revId}_`) && f.endsWith(".py"));
    if (hit) return path3.join(dir, hit);
  }
  throw new SchemaMigrationError(
    `alembic revision succeeded but the created file could not be located.
stdout: ${stdout}`
  );
}
async function listAlembicHeads(projectDir) {
  const { stdout } = await spawnAlembic(projectDir, ["heads"]);
  const heads = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^([0-9a-f]+)\b/);
    if (m) heads.push(m[1]);
  }
  return heads;
}
async function mergeAlembicHeads(projectDir, message) {
  const { stdout } = await spawnAlembic(projectDir, ["merge", "-m", message, "heads"]);
  const m = stdout.match(/Generating\s+(\S+\.py)/);
  if (!m) {
    throw new SchemaMigrationError(`alembic merge heads created no file.
stdout: ${stdout}`);
  }
  return m[1].trim();
}
async function getCurrentRevision(ctx) {
  const { stdout } = await runAlembic(ctx, ["current"]);
  const m = stdout.match(/^([a-f0-9]+)\b/m);
  return m ? m[1] : void 0;
}
async function getHeadRevision(ctx) {
  const { stdout } = await runAlembic(ctx, ["heads"]);
  const m = stdout.match(/^([a-f0-9]+)\b/m);
  return m ? m[1] : void 0;
}
async function listHistory(ctx, range) {
  const { stdout } = await runAlembic(ctx, ["history", "-r", range]);
  const out = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^(?:<base>|[a-f0-9]+)\s*->\s*([a-f0-9]+)(?:\s*\(head\))?,\s*(.*)$/);
    if (m) out.push({ version: m[1].trim(), description: m[2].trim() });
  }
  return out;
}
async function applyAlembic(ctx) {
  const before = await getCurrentRevision(ctx);
  await runAlembic(ctx, ["upgrade", "head"]);
  const after = await getCurrentRevision(ctx);
  if (!after || before === after) {
    return { applied: [], alreadyAtLatest: true, tool: "alembic" };
  }
  const range = before ? `${before}:${after}` : `base:${after}`;
  const inRange = await listHistory(ctx, range);
  const applied = before ? inRange.filter((a) => a.version !== before) : inRange;
  return { applied, alreadyAtLatest: false, tool: "alembic" };
}
async function rollbackAlembic(ctx) {
  const before = await getCurrentRevision(ctx);
  if (!before) {
    await runAlembic(ctx, ["downgrade", ctx.target]);
    return { rolledBack: [], tool: "alembic" };
  }
  await runAlembic(ctx, ["downgrade", ctx.target]);
  const after = await getCurrentRevision(ctx);
  const range = after ? `${after}:${before}` : `base:${before}`;
  const inRange = await listHistory(ctx, range);
  const rolledBack = after ? inRange.filter((a) => a.version !== after) : inRange;
  return { rolledBack, tool: "alembic" };
}
async function stampAlembic(ctx) {
  await runAlembic(ctx, ["stamp", "--purge", ctx.revision]);
  return { stamped: ctx.revision, tool: "alembic" };
}
async function statusAlembic(ctx) {
  const current = await getCurrentRevision(ctx);
  const head = await getHeadRevision(ctx);
  const pending = [];
  if (head && head !== current) {
    const range = current ? `${current}:head` : `base:head`;
    const inRange = await listHistory(ctx, range);
    for (const rev of inRange) {
      if (current && rev.version === current) continue;
      pending.push({
        version: rev.version,
        filename: `${rev.version}_*.py`,
        description: rev.description
      });
    }
  }
  return { current, pending, tool: "alembic" };
}

// scripts/lakebase/schema-migration-adapter.ts
var REGISTRY = /* @__PURE__ */ new Map();
function registerSchemaMigrationAdapter(adapter) {
  REGISTRY.set(adapter.id, adapter);
}
function resolveSchemaMigrationAdapter(projectDir, override) {
  if (override) {
    const a = REGISTRY.get(override);
    if (!a) {
      throw new UnresolvedSchemaMigrationAdapterError(
        `migration_tool=${override} is not a registered adapter. Registered: ${[...REGISTRY.keys()].join(", ") || "(none)"}`
      );
    }
    return a;
  }
  for (const adapter of REGISTRY.values()) {
    if (adapter.detect(projectDir)) return adapter;
  }
  throw new UnresolvedSchemaMigrationAdapterError(
    `Cannot resolve migration tool for ${projectDir}. Set project.yaml#migration_tool to one of: ${[...REGISTRY.keys()].join(", ") || "(none)"}.`
  );
}
var UnresolvedSchemaMigrationAdapterError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "UnresolvedSchemaMigrationAdapterError";
  }
};

// scripts/lakebase/adapters/alembic-adapter.ts
async function buildDsn(args) {
  const result = await getConnection({
    output: "dsn",
    instance: args.instance,
    branch: args.branch,
    database: args.database,
    endpointName: args.endpointName
  });
  return result.url;
}
function findVersionsDir(projectDir) {
  const candidates = [
    path4.join(projectDir, "migrations", "versions"),
    path4.join(projectDir, "alembic", "versions")
  ];
  return candidates.find((p) => fs5.existsSync(p));
}
function listAlembicFiles(projectDir) {
  const dir = findVersionsDir(projectDir);
  if (!dir) return [];
  const files = fs5.readdirSync(dir).filter((f) => f.endsWith(".py") && !f.startsWith("__"));
  return files.map((filename) => {
    const stem = filename.replace(/\.py$/, "");
    const sep2 = stem.indexOf("_");
    const version = sep2 === -1 ? stem : stem.slice(0, sep2);
    const description = sep2 === -1 ? "" : stem.slice(sep2 + 1).replace(/_/g, " ");
    return {
      version,
      filename,
      description,
      type: "Python",
      tool: "alembic"
    };
  }).sort((a, b) => a.filename.localeCompare(b.filename));
}
var AlembicAdapter = {
  id: "alembic",
  languages: ["python"],
  /**
   * Detect Alembic-specifically rather than Python-broadly. A project
   * with pyproject.toml but no alembic.ini and no env.py is a Python
   * project that hasn't (yet) adopted Alembic, and should NOT auto-route
   * here. Callers can still force-select via project.yaml#migration_tool.
   */
  detect(projectDir) {
    if (fs5.existsSync(path4.join(projectDir, "alembic.ini"))) return true;
    if (fs5.existsSync(path4.join(projectDir, "migrations", "env.py"))) return true;
    if (fs5.existsSync(path4.join(projectDir, "alembic", "env.py"))) return true;
    return false;
  },
  async apply(args) {
    const dsn = await buildDsn(args);
    try {
      const legacy = await applyAlembic({ projectDir: args.projectDir, dsn });
      return {
        applied_migrations: legacy.applied,
        status: legacy.alreadyAtLatest ? "noop" : "ok",
        tool_specific: {
          alreadyAtLatest: legacy.alreadyAtLatest,
          tool: legacy.tool
        }
      };
    } catch (err) {
      return {
        applied_migrations: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async rollback(args) {
    const dsn = await buildDsn(args);
    try {
      const legacy = await rollbackAlembic({
        projectDir: args.projectDir,
        dsn,
        target: args.target
      });
      return {
        rolled_back: legacy.rolledBack,
        status: legacy.rolledBack.length === 0 ? "noop" : "ok",
        tool_specific: { tool: legacy.tool }
      };
    } catch (err) {
      return {
        rolled_back: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async stamp(args) {
    const dsn = await buildDsn(args);
    try {
      const r = await stampAlembic({ projectDir: args.projectDir, dsn, revision: args.revision });
      return { status: "ok", stamped_revision: r.stamped, tool_specific: { tool: r.tool } };
    } catch (err) {
      return {
        status: "error",
        stamped_revision: null,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async status(args) {
    const dsn = await buildDsn(args);
    try {
      const legacy = await statusAlembic({ projectDir: args.projectDir, dsn });
      return {
        applied_version: legacy.current ?? null,
        pending: legacy.pending,
        // The legacy statusAlembic returns current + pending, not the
        // full applied history. Surface what we have. Backfilling the
        // applied list requires an extra `alembic history -r base:current`
        // call; deferred to a follow-up so this slice stays a pure port.
        applied: [],
        status: "ok",
        tool_specific: { tool: legacy.tool }
      };
    } catch (err) {
      return {
        applied_version: null,
        pending: [],
        applied: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async list(args) {
    return { files: listAlembicFiles(args.projectDir) };
  },
  // baseline intentionally absent in slice 3. Alembic exposes `stamp`
  // as the equivalent operation; deferred to a follow-up.
  async newMigration(args) {
    try {
      if (args.autogenerate && (!args.instance || !args.branch)) {
        throw new Error("autogenerate requires both instance and branch (to diff models vs the branch DB)");
      }
      const revId = migrationTimestamp();
      const dsn = args.autogenerate ? await buildDsn({
        instance: args.instance,
        branch: args.branch,
        database: args.database,
        endpointName: args.endpointName
      }) : void 0;
      const created = await createAlembicRevision({
        projectDir: args.projectDir,
        revId,
        message: args.slug,
        autogenerate: !!args.autogenerate,
        dsn
      });
      return { status: "ok", version: revId, filename: path4.basename(created), path: created };
    } catch (err) {
      return {
        status: "error",
        version: "",
        filename: "",
        path: "",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async collapseHeads(args) {
    try {
      const heads = await listAlembicHeads(args.projectDir);
      if (heads.length <= 1) return { status: "noop", headsBefore: heads };
      if (args.dryRun) return { status: "ok", headsBefore: heads };
      const created = await mergeAlembicHeads(args.projectDir, args.message ?? "merge heads");
      const mergeRevision = path4.basename(created).replace(/\.py$/, "").split("_")[0];
      return { status: "ok", headsBefore: heads, mergeRevision, path: created };
    } catch (err) {
      return {
        status: "error",
        headsBefore: [],
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
};
registerSchemaMigrationAdapter(AlembicAdapter);

// scripts/lakebase/adapters/flyway-adapter.ts
var fs6 = __toESM(require("fs"), 1);
var path6 = __toESM(require("path"), 1);

// scripts/lakebase/schema-migrate-runners/flyway.ts
var import_node_child_process4 = require("child_process");
var path5 = __toESM(require("path"), 1);
function dsnToFlywayEnv(dsn) {
  const u = new URL(dsn);
  const user = decodeURIComponent(u.username);
  const password = decodeURIComponent(u.password);
  const portPart = u.port ? `:${u.port}` : "";
  const url = `jdbc:postgresql://${u.hostname}${portPart}${u.pathname}${u.search}`;
  return { url, user, password };
}
function migrationsLocation(projectDir) {
  return `filesystem:${path5.join(projectDir, "src", "main", "resources", "db", "migration")}`;
}
function runFlyway(ctx, args) {
  const { url, user, password } = dsnToFlywayEnv(ctx.dsn);
  return new Promise((resolve2, reject) => {
    const child = (0, import_node_child_process4.spawn)(
      "flyway",
      ["-outputType=json", `-locations=${migrationsLocation(ctx.projectDir)}`, ...args],
      {
        cwd: ctx.projectDir,
        env: {
          ...process.env,
          FLYWAY_URL: url,
          FLYWAY_USER: user,
          FLYWAY_PASSWORD: password
        },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      reject(
        new SchemaMigrationError(
          `Could not spawn flyway. Is the Flyway Community CLI installed and on PATH? ${err.message}`,
          err
        )
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve2({ stdout, stderr });
      } else {
        reject(
          new SchemaMigrationError(
            `flyway ${args.join(" ")} exited with code ${code}.
stdout: ${stdout}
stderr: ${stderr}`
          )
        );
      }
    });
  });
}
function parseFlywayJson(stdout) {
  const start = stdout.indexOf("{");
  if (start === -1) {
    throw new SchemaMigrationError(`flyway JSON output missing: ${stdout.slice(0, 200)}`);
  }
  try {
    return JSON.parse(stdout.slice(start));
  } catch (err) {
    throw new SchemaMigrationError(
      `flyway JSON parse failed: ${err instanceof Error ? err.message : String(err)}.
Body (first 400 chars): ${stdout.slice(start, start + 400)}`
    );
  }
}
async function applyFlyway(ctx) {
  const { stdout } = await runFlyway(ctx, [
    "-baselineOnMigrate=true",
    "-baselineVersion=0",
    "migrate"
  ]);
  const json = parseFlywayJson(stdout);
  const entries = json.migrations ?? [];
  const applied = [];
  for (const m of entries) {
    if (m.category === "INIT") continue;
    if (m.state && m.state !== "SUCCESS") continue;
    if (!m.version) continue;
    applied.push({
      version: m.version,
      description: m.description ?? "",
      ...typeof m.executionTime === "number" ? { executionTimeMs: m.executionTime } : {}
    });
  }
  return {
    applied,
    alreadyAtLatest: applied.length === 0,
    tool: "flyway"
  };
}
async function statusFlyway(ctx) {
  const { stdout } = await runFlyway(ctx, ["info"]);
  const json = parseFlywayJson(stdout);
  const entries = json.migrations ?? [];
  let current;
  const pending = [];
  for (const m of entries) {
    if (!m.version) continue;
    const state = (m.state ?? "").toUpperCase();
    if (state === "SUCCESS" || state === "BASELINE") {
      current = m.version;
    } else if (state === "PENDING") {
      const filename = m.filepath ? path5.basename(m.filepath) : `V${m.version}__migration.sql`;
      pending.push({
        version: m.version,
        filename,
        description: m.description ?? ""
      });
    }
  }
  return { current, pending, tool: "flyway" };
}

// scripts/lakebase/adapters/flyway-adapter.ts
async function buildDsn2(args) {
  const result = await getConnection({
    output: "dsn",
    instance: args.instance,
    branch: args.branch,
    database: args.database,
    endpointName: args.endpointName
  });
  return result.url;
}
function listFlywayFiles(projectDir) {
  const dir = path6.join(projectDir, "src", "main", "resources", "db", "migration");
  if (!fs6.existsSync(dir)) return [];
  const files = fs6.readdirSync(dir).filter((f) => /^V\d+(\.\d+)*__.+\.sql$/.test(f));
  return files.map((filename) => {
    const m = filename.match(/^V(\d+(?:\.\d+)*)__(.+)\.sql$/);
    const version = m[1];
    const description = m[2].replace(/_/g, " ");
    return { version, filename, description, type: "SQL", tool: "flyway" };
  }).sort((a, b) => versionCompare(a.version, b.version));
}
function versionCompare(a, b) {
  const ax = a.split(".").map(Number);
  const bx = b.split(".").map(Number);
  const len = Math.max(ax.length, bx.length);
  for (let i = 0; i < len; i++) {
    const av = ax[i] ?? 0;
    const bv = bx[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}
var FlywayAdapter = {
  id: "flyway",
  languages: ["java", "kotlin"],
  detect(projectDir) {
    return fs6.existsSync(path6.join(projectDir, "pom.xml"));
  },
  async apply(args) {
    const dsn = await buildDsn2(args);
    try {
      const legacy = await applyFlyway({ projectDir: args.projectDir, dsn });
      return {
        applied_migrations: legacy.applied,
        status: legacy.alreadyAtLatest ? "noop" : "ok",
        tool_specific: {
          alreadyAtLatest: legacy.alreadyAtLatest,
          tool: legacy.tool
        }
      };
    } catch (err) {
      return {
        applied_migrations: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  // rollback intentionally absent: Flyway Community Edition does not
  // support it. Callers MUST property-check (`adapter.rollback?` /
  // `if (adapter.rollback)`) before invoking.
  async status(args) {
    const dsn = await buildDsn2(args);
    try {
      const legacy = await statusFlyway({ projectDir: args.projectDir, dsn });
      return {
        applied_version: legacy.current ?? null,
        pending: legacy.pending,
        // Legacy statusFlyway does not return the applied history; we
        // surface only the currently-applied version + pending. Adapters
        // that complete this (Alembic, future Knex) MAY populate.
        applied: [],
        status: "ok",
        tool_specific: { tool: legacy.tool }
      };
    } catch (err) {
      return {
        applied_version: null,
        pending: [],
        applied: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async list(args) {
    return { files: listFlywayFiles(args.projectDir) };
  },
  // baseline intentionally absent. Flyway DOES support baseline at the
  // tool level, but exposing it cleanly requires plumbing flags into the
  // existing runner. Deferred to a follow-up slice; the adapter's
  // optional-protocol shape makes this additive.
  async newMigration(args) {
    try {
      const dir = path6.join(args.projectDir, "src", "main", "resources", "db", "migration");
      fs6.mkdirSync(dir, { recursive: true });
      const version = migrationTimestamp();
      const slug = migrationSlug2(args.slug);
      const filename = `V${version}__${slug}.sql`;
      const full = path6.join(dir, filename);
      if (fs6.existsSync(full)) throw new Error(`${filename} already exists`);
      fs6.writeFileSync(
        full,
        `-- V${version}: ${args.slug}
-- Flyway migration (write your DDL/DML below).
`,
        "utf8"
      );
      return { status: "ok", version, filename, path: full };
    } catch (err) {
      return {
        status: "error",
        version: "",
        filename: "",
        path: "",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
};
registerSchemaMigrationAdapter(FlywayAdapter);

// scripts/lakebase/adapters/knex-adapter.ts
var fs8 = __toESM(require("fs"), 1);
var path8 = __toESM(require("path"), 1);

// scripts/lakebase/schema-migrate-runners/knex.ts
var import_node_child_process5 = require("child_process");
var fs7 = __toESM(require("fs"), 1);
var path7 = __toESM(require("path"), 1);
var KNEXFILE_VARIANTS = ["knexfile.js", "knexfile.ts", "knexfile.mjs", "knexfile.cjs"];
function findKnexfile(projectDir) {
  for (const name of KNEXFILE_VARIANTS) {
    const p = path7.join(projectDir, name);
    if (fs7.existsSync(p)) return p;
  }
  return void 0;
}
function spawnKnex(projectDir, args, dsn) {
  return new Promise((resolve2, reject) => {
    const knexfile = findKnexfile(projectDir);
    if (!knexfile) {
      reject(
        new SchemaMigrationError(
          `No knexfile found in ${projectDir}. Expected one of: ${KNEXFILE_VARIANTS.join(", ")}.`
        )
      );
      return;
    }
    const child = (0, import_node_child_process5.spawn)("npx", ["--no-install", "knex", "--knexfile", knexfile, ...args], {
      cwd: projectDir,
      env: dsn ? { ...process.env, DATABASE_URL: dsn } : { ...process.env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      reject(
        new SchemaMigrationError(
          `Could not spawn knex via npx. Is Node installed and is 'knex' in the project's node_modules? ${err.message}`,
          err
        )
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve2({ stdout, stderr });
      } else {
        reject(
          new SchemaMigrationError(
            `knex ${args.join(" ")} exited with code ${code}.
stdout: ${stdout}
stderr: ${stderr}`
          )
        );
      }
    });
  });
}
function runKnex(ctx, args) {
  return spawnKnex(ctx.projectDir, args, ctx.dsn);
}
async function createKnexMigration(opts) {
  const { stdout } = await spawnKnex(opts.projectDir, ["migrate:make", opts.slug]);
  const m = stdout.match(/Created Migration:\s*(\S+)/);
  if (m) return m[1].trim();
  throw new SchemaMigrationError(
    `knex migrate:make succeeded but the created file could not be located.
stdout: ${stdout}`
  );
}
function parseKnexStatus(stdout) {
  const completed = [];
  const pending = [];
  let mode = null;
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^Found\s+\d+\s+Completed\s+Migration/i.test(line)) {
      mode = "completed";
      continue;
    }
    if (/^Found\s+\d+\s+Pending\s+Migration/i.test(line)) {
      mode = "pending";
      continue;
    }
    if (/^No\s+Pending\s+Migration\s+files\s+Found/i.test(line)) {
      mode = null;
      continue;
    }
    if (!line) continue;
    if (!/\.(js|ts|mjs|cjs)$/.test(line)) continue;
    if (mode === "completed") completed.push(line);
    if (mode === "pending") pending.push(line);
  }
  return { completed, pending };
}
function parseKnexFilename(filename) {
  const stem = filename.replace(/\.(js|ts|mjs|cjs)$/, "");
  const m = stem.match(/^(\d{14})_(.+)$/);
  const version = m ? m[1] : stem;
  const description = m ? m[2].replace(/[_-]/g, " ") : stem;
  return { version, description };
}
async function applyKnex(ctx) {
  const beforeOut = await runKnex(ctx, ["migrate:status"]);
  const before = parseKnexStatus(beforeOut.stdout);
  await runKnex(ctx, ["migrate:latest"]);
  const afterOut = await runKnex(ctx, ["migrate:status"]);
  const after = parseKnexStatus(afterOut.stdout);
  const newlyCompleted = after.completed.filter((f) => !before.completed.includes(f));
  if (newlyCompleted.length === 0) {
    return { applied: [], alreadyAtLatest: true, tool: "knex" };
  }
  const applied = newlyCompleted.map((filename) => {
    const { version, description } = parseKnexFilename(filename);
    return { version, description };
  });
  return { applied, alreadyAtLatest: false, tool: "knex" };
}
async function rollbackKnex(ctx) {
  const beforeOut = await runKnex(ctx, ["migrate:status"]);
  const before = parseKnexStatus(beforeOut.stdout);
  const rollbackArgs = ["migrate:rollback"];
  if (ctx.target === "all" || ctx.target === "0") {
    rollbackArgs.push("--all");
  }
  await runKnex(ctx, rollbackArgs);
  const afterOut = await runKnex(ctx, ["migrate:status"]);
  const after = parseKnexStatus(afterOut.stdout);
  const rolledBackFiles = before.completed.filter((f) => !after.completed.includes(f));
  const rolledBack = rolledBackFiles.map((filename) => {
    const { version, description } = parseKnexFilename(filename);
    return { version, description };
  });
  return { rolledBack, tool: "knex" };
}
async function statusKnex(ctx) {
  const { stdout } = await runKnex(ctx, ["migrate:status"]);
  const { completed, pending } = parseKnexStatus(stdout);
  const current = completed.length > 0 ? parseKnexFilename(completed[completed.length - 1]).version : void 0;
  const pendingOut = pending.map((filename) => {
    const { version, description } = parseKnexFilename(filename);
    return { version, filename, description };
  });
  return { current, pending: pendingOut, tool: "knex" };
}

// scripts/lakebase/adapters/knex-adapter.ts
async function buildDsn3(args) {
  const result = await getConnection({
    output: "dsn",
    instance: args.instance,
    branch: args.branch,
    database: args.database,
    endpointName: args.endpointName
  });
  return result.url;
}
var KNEXFILE_VARIANTS2 = ["knexfile.js", "knexfile.ts", "knexfile.mjs", "knexfile.cjs"];
function listKnexFiles(projectDir) {
  const dir = path8.join(projectDir, "migrations");
  if (!fs8.existsSync(dir)) return [];
  const files = fs8.readdirSync(dir).filter((f) => (f.endsWith(".js") || f.endsWith(".ts")) && !f.startsWith("."));
  return files.map((filename) => {
    const stem = filename.replace(/\.(js|ts)$/, "");
    const m = stem.match(/^(\d{14})_(.+)$/);
    const version = m ? m[1] : stem;
    const description = m ? m[2].replace(/[_-]/g, " ") : stem;
    const type = filename.endsWith(".ts") ? "TypeScript" : "JavaScript";
    return { version, filename, description, type, tool: "knex" };
  }).sort((a, b) => a.version.localeCompare(b.version));
}
var KnexAdapter = {
  id: "knex",
  languages: ["nodejs"],
  /**
   * A knexfile at the project root is the canonical Knex marker. A bare
   * package.json with no knexfile means "Node.js project, but not Knex"
   * and should NOT auto-route here. Callers can still force-select via
   * project.yaml#migration_tool.
   */
  detect(projectDir) {
    return KNEXFILE_VARIANTS2.some((name) => fs8.existsSync(path8.join(projectDir, name)));
  },
  async apply(args) {
    const dsn = await buildDsn3(args);
    try {
      const legacy = await applyKnex({ projectDir: args.projectDir, dsn });
      return {
        applied_migrations: legacy.applied,
        status: legacy.alreadyAtLatest ? "noop" : "ok",
        tool_specific: {
          alreadyAtLatest: legacy.alreadyAtLatest,
          tool: legacy.tool
        }
      };
    } catch (err) {
      return {
        applied_migrations: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async rollback(args) {
    const dsn = await buildDsn3(args);
    try {
      const legacy = await rollbackKnex({
        projectDir: args.projectDir,
        dsn,
        target: args.target
      });
      return {
        rolled_back: legacy.rolledBack,
        status: legacy.rolledBack.length === 0 ? "noop" : "ok",
        tool_specific: { tool: legacy.tool }
      };
    } catch (err) {
      return {
        rolled_back: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async status(args) {
    const dsn = await buildDsn3(args);
    try {
      const legacy = await statusKnex({ projectDir: args.projectDir, dsn });
      return {
        applied_version: legacy.current ?? null,
        pending: legacy.pending,
        applied: [],
        status: "ok",
        tool_specific: { tool: legacy.tool }
      };
    } catch (err) {
      return {
        applied_version: null,
        pending: [],
        applied: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },
  async list(args) {
    return { files: listKnexFiles(args.projectDir) };
  },
  // baseline intentionally absent. Knex has no native baseline concept;
  // omitting it advertises that correctly via the optional-capability
  // protocol so callers won't attempt the operation.
  async newMigration(args) {
    try {
      const created = await createKnexMigration({ projectDir: args.projectDir, slug: migrationSlug2(args.slug) });
      const stem = path8.basename(created).replace(/\.(js|ts)$/, "");
      const version = stem.match(/^(\d{14})_/)?.[1] ?? stem;
      return { status: "ok", version, filename: path8.basename(created), path: created };
    } catch (err) {
      return {
        status: "error",
        version: "",
        filename: "",
        path: "",
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
};
registerSchemaMigrationAdapter(KnexAdapter);

// scripts/lakebase/schema-migrate.ts
var SchemaMigrationError = class extends Error {
  constructor(message, cause) {
    super(message);
    this.cause = cause;
    this.name = "SchemaMigrationError";
  }
  cause;
};
function detectLanguage(projectDir) {
  const lang = resolveMigrationLanguage(projectDir);
  if (lang === "unknown") {
    throw new SchemaMigrationError(
      `Could not detect project language in ${projectDir}. Expected one of: pom.xml (java/kotlin), pyproject.toml or alembic.ini (python), package.json (nodejs). Pass {language} explicitly to override.`
    );
  }
  return lang;
}
function toolForLanguage(language) {
  switch (language) {
    case "java":
    case "kotlin":
      return "flyway";
    case "python":
      return "alembic";
    case "nodejs":
      return "knex";
  }
}
function listSchemaMigrations(args = {}) {
  const projectDir = args.projectDir ?? process.cwd();
  const language = args.language ?? detectLanguage(projectDir);
  const tool = toolForLanguage(language);
  switch (tool) {
    case "flyway":
      return listFlywayMigrations(projectDir);
    case "alembic":
      return listAlembicMigrations(projectDir);
    case "knex":
      return listKnexMigrations(projectDir);
  }
}
function listFlywayMigrations(projectDir) {
  const dir = path9.join(projectDir, "src", "main", "resources", "db", "migration");
  if (!fs9.existsSync(dir)) return [];
  const files = fs9.readdirSync(dir).filter((f) => /^V\d+(\.\d+)*__.+\.sql$/.test(f));
  return files.map((filename) => {
    const m = filename.match(/^V(\d+(?:\.\d+)*)__(.+)\.sql$/);
    const version = m[1];
    const description = m[2].replace(/_/g, " ");
    return { version, filename, description, type: "SQL", tool: "flyway" };
  }).sort((a, b) => versionCompare2(a.version, b.version));
}
function listAlembicMigrations(projectDir) {
  const candidates = [
    path9.join(projectDir, "migrations", "versions"),
    path9.join(projectDir, "alembic", "versions")
  ];
  const dir = candidates.find((p) => fs9.existsSync(p));
  if (!dir) return [];
  const files = fs9.readdirSync(dir).filter((f) => f.endsWith(".py") && !f.startsWith("__"));
  return files.map((filename) => {
    const stem = filename.replace(/\.py$/, "");
    const sep2 = stem.indexOf("_");
    const version = sep2 === -1 ? stem : stem.slice(0, sep2);
    const description = sep2 === -1 ? "" : stem.slice(sep2 + 1).replace(/_/g, " ");
    return { version, filename, description, type: "Python", tool: "alembic" };
  }).sort((a, b) => a.filename.localeCompare(b.filename));
}
function listKnexMigrations(projectDir) {
  const dir = path9.join(projectDir, "migrations");
  if (!fs9.existsSync(dir)) return [];
  const files = fs9.readdirSync(dir).filter((f) => (f.endsWith(".js") || f.endsWith(".ts")) && !f.startsWith("."));
  return files.map((filename) => {
    const stem = filename.replace(/\.(js|ts)$/, "");
    const m = stem.match(/^(\d{14})_(.+)$/);
    const version = m ? m[1] : stem;
    const description = m ? m[2].replace(/[_-]/g, " ") : stem;
    const type = filename.endsWith(".ts") ? "TypeScript" : "JavaScript";
    return { version, filename, description, type, tool: "knex" };
  }).sort((a, b) => a.version.localeCompare(b.version));
}
function versionCompare2(a, b) {
  const ax = a.split(".").map(Number);
  const bx = b.split(".").map(Number);
  const len = Math.max(ax.length, bx.length);
  for (let i = 0; i < len; i++) {
    const av = ax[i] ?? 0;
    const bv = bx[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}
function adapterFor(projectDir, language) {
  const override = language ? toolForLanguage(language) : void 0;
  return resolveSchemaMigrationAdapter(projectDir, override);
}
function dbRevisionOrphaned(appliedRevision, localRevisionIds) {
  const applied = (appliedRevision ?? "").trim();
  if (!applied) return false;
  return !localRevisionIds.includes(applied);
}
function parseAlembicMissingRevision(stderr) {
  const m = /[Cc]an't locate revision identified by ['"]?([0-9a-f]+)['"]?/.exec(stderr);
  return m ? m[1] : null;
}
async function schemaMigrationStatus(args) {
  const projectDir = args.projectDir ?? process.cwd();
  const adapter = adapterFor(projectDir, args.language);
  const r = await adapter.status({
    instance: args.instance,
    branch: args.branch,
    projectDir,
    database: args.database,
    endpointName: args.endpointName
  });
  if (r.status === "error") {
    throw new SchemaMigrationError(r.error ?? "status failed");
  }
  return {
    current: r.applied_version ?? void 0,
    pending: r.pending,
    tool: adapter.id
  };
}
async function branchRevisionOrphan(args) {
  const projectDir = args.projectDir ?? process.cwd();
  const localIds = listSchemaMigrations({ projectDir, language: args.language }).map((m) => m.version);
  try {
    const status = await schemaMigrationStatus({
      instance: args.instance,
      branch: args.branch,
      projectDir,
      language: args.language
    });
    return dbRevisionOrphaned(status.current, localIds) ? status.current ?? null : null;
  } catch (e) {
    return parseAlembicMissingRevision(e instanceof Error ? e.message : String(e));
  }
}
function migrationTimestamp(now = /* @__PURE__ */ new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
}
function migrationSlug2(description) {
  return description.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "migration";
}

// scripts/lakebase/branch-endpoint.ts
async function getEndpoint(args) {
  const branchPath = await resolveBranchPath(args.branch, { instance: args.instance });
  if (!branchPath) {
    return void 0;
  }
  let raw;
  try {
    raw = runDatabricksSync(["postgres", "list-endpoints", branchPath, "-o", "json"], {
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
async function ensureEndpoint(args) {
  const endpointName = args.endpointName ?? DEFAULT_ENDPOINT;
  const branchId = await resolveBranchId({ instance: args.instance, branch: args.branch });
  const existing = await getEndpoint({ instance: args.instance, branch: branchId, endpointName });
  if (existing?.host) {
    return existing;
  }
  const branchPath = `projects/${args.instance}/branches/${branchId}`;
  const spec = {
    spec: {
      endpoint_type: args.endpointType ?? "ENDPOINT_TYPE_READ_WRITE",
      autoscaling_limit_min_cu: args.autoscalingMinCu ?? 2,
      autoscaling_limit_max_cu: args.autoscalingMaxCu ?? 4
    }
  };
  try {
    runDatabricksSync(
      ["postgres", "create-endpoint", branchPath, endpointName, "--json", JSON.stringify(spec)],
      { timeout: KIT_TIMEOUTS.cliCreateEndpoint }
    );
  } catch (err) {
    const racy = await getEndpoint({ instance: args.instance, branch: branchId, endpointName });
    if (racy?.host) return racy;
    throw err;
  }
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.readyWait;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ep = await getEndpoint({ instance: args.instance, branch: branchId, endpointName });
    if (ep?.host) return ep;
    await new Promise((r) => setTimeout(r, KIT_TIMEOUTS.readyPoll));
  }
  throw new Error(
    `Endpoint for ${branchPath} did not reach ACTIVE within ${timeoutMs}ms (create succeeded but no host yet)`
  );
}
async function getCredential(args) {
  const branchPath = await resolveBranchPath(args.branch, { instance: args.instance });
  if (!branchPath) {
    throw new Error(`Branch "${args.branch}" not found in instance "${args.instance}"`);
  }
  const endpointName = args.endpointName ?? DEFAULT_ENDPOINT;
  return mintCredential(`${branchPath}/endpoints/${endpointName}`);
}

// scripts/lakebase/ci-resolve-branch.ts
var DEFAULT_DATABASE2 = "databricks_postgres";
var STATE_MACHINE_DOC = `
Four cases driven by (does the branch exist?) x (was createFrom given?):
  exists=no,  createFrom=no  \u2192 hard error (nothing to do)
  exists=no,  createFrom=yes \u2192 create + wait. status=CREATED
  exists=yes, createFrom=no  \u2192 use as-is, no verification. status=EXISTS
  exists=yes, createFrom=yes \u2192 verify source matches. status=VERIFIED on match;
                               RECREATED on mismatch + recreateOnSourceMismatch;
                               hard error on mismatch without that flag;
                               UNVERIFIED when API didn't record source.
`.trim();
async function gitToLakebaseName(gitBranch, branches, instance) {
  if (gitBranch === "main" || gitBranch === "master") {
    const def = branches.find((b) => b.isDefault) ?? await getDefaultBranch({ instance });
    if (!def) {
      throw new Error(
        `Could not resolve default Lakebase branch for instance "${instance}"`
      );
    }
    return def.name.split("/branches/").pop() ?? def.uid;
  }
  return sanitizeBranchName(gitBranch);
}
function describeSourceBranchLeaf(info) {
  if (!info) return "";
  if (info.sourceBranchId) return info.sourceBranchId;
  if (info.sourceBranchName) {
    return info.sourceBranchName.split("/branches/").pop() ?? info.sourceBranchName;
  }
  return "";
}
async function waitUntilDeleted(instance, name, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const info = await getBranchByName(name, { instance });
    if (!info) return;
    await new Promise((r) => setTimeout(r, 2e3));
  }
  throw new Error(
    `Lakebase branch "${name}" did not propagate delete within ${timeoutMs}ms`
  );
}
async function waitUntilReady(instance, name, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = "unknown";
  while (Date.now() < deadline) {
    const info = await getBranchByName(name, { instance });
    if (info?.state === "READY") return;
    if (info?.state) last = info.state;
    await new Promise((r) => setTimeout(r, KIT_TIMEOUTS.readyPoll));
  }
  throw new Error(
    `Lakebase branch "${name}" did not reach READY within ${timeoutMs}ms (last state: ${last})`
  );
}
function urlEncodeDsnPart(s) {
  return s.replace(/@/g, "%40").replace(/:/g, "%3A").replace(/\//g, "%2F").replace(/\?/g, "%3F").replace(/#/g, "%23");
}
async function resolveCiBranch(args) {
  if (!args.gitBranch && !args.lakebaseName) {
    throw new Error(
      "resolveCiBranch: either gitBranch or lakebaseName is required"
    );
  }
  const database = args.database ?? DEFAULT_DATABASE2;
  const branches = await listBranches({ instance: args.instance });
  const lakebaseName = args.lakebaseName ? args.lakebaseName : await gitToLakebaseName(args.gitBranch, branches, args.instance);
  if (!lakebaseName) {
    throw new Error(
      `Could not map git branch "${args.gitBranch}" to a Lakebase branch name`
    );
  }
  const branchPath = `projects/${args.instance}/branches/${lakebaseName}`;
  let status;
  let source = "";
  const existing = branches.find(
    (b) => b.uid === lakebaseName || b.name === lakebaseName || b.name.endsWith(`/${lakebaseName}`)
  );
  if (!existing) {
    if (!args.createFrom) {
      throw new Error(
        `Lakebase branch "${lakebaseName}" does not exist and createFrom not given`
      );
    }
    const sourceName = await gitToLakebaseName(
      args.createFrom,
      branches,
      args.instance
    );
    if (!sourceName) {
      throw new Error(
        `Could not resolve source branch for createFrom="${args.createFrom}"`
      );
    }
    await createBranch({
      instance: args.instance,
      branch: lakebaseName,
      parentBranch: sourceName,
      noExpiry: true
    });
    await waitUntilReady(args.instance, lakebaseName, KIT_TIMEOUTS.readyWait);
    status = "CREATED";
    source = sourceName;
  } else if (!args.createFrom) {
    status = "EXISTS";
    source = describeSourceBranchLeaf(existing);
  } else {
    const expected = await gitToLakebaseName(
      args.createFrom,
      branches,
      args.instance
    );
    const actual = describeSourceBranchLeaf(existing);
    source = actual;
    const recreateFrom = async (sourceName) => {
      await deleteBranch({
        instance: args.instance,
        branch: lakebaseName,
        // Disposable CI branches (ci-pr-*) only; never the default.
        allowDefault: false
      });
      await waitUntilDeleted(args.instance, lakebaseName, KIT_TIMEOUTS.readyWait);
      await createBranch({
        instance: args.instance,
        branch: lakebaseName,
        parentBranch: sourceName,
        noExpiry: true
      });
      await waitUntilReady(args.instance, lakebaseName, KIT_TIMEOUTS.readyWait);
    };
    if (!actual) {
      status = "UNVERIFIED";
    } else if (actual === expected) {
      let orphanRev = null;
      if (args.resetOnDbAhead && expected) {
        const probe = args.checkBranchDbAheadOfCode ?? branchRevisionOrphan;
        try {
          orphanRev = await probe({
            instance: args.instance,
            branch: lakebaseName,
            projectDir: args.projectDir ?? process.cwd()
          });
        } catch {
          orphanRev = null;
        }
      }
      if (orphanRev) {
        await recreateFrom(expected);
        status = "RECREATED_DB_AHEAD";
        source = expected;
      } else {
        status = "VERIFIED";
      }
    } else if (args.recreateOnSourceMismatch) {
      await recreateFrom(expected);
      status = "RECREATED";
      source = expected;
    } else {
      throw new Error(
        `Lakebase branch "${lakebaseName}" was forked from "${actual}" but parent "${expected}" was requested. Pass recreateOnSourceMismatch=true to delete and re-fork.`
      );
    }
  }
  let host = "";
  const existingEp = await getEndpoint({
    instance: args.instance,
    branch: lakebaseName
  });
  if (existingEp?.host) {
    host = existingEp.host;
  } else if (args.ensureEndpoint) {
    const ep = await ensureEndpoint({
      instance: args.instance,
      branch: lakebaseName
    });
    host = ep.host;
  } else {
    throw new Error(
      `No endpoint for "${lakebaseName}" (pass ensureEndpoint=true to create)`
    );
  }
  const { token, email } = await getCredential({
    instance: args.instance,
    branch: lakebaseName
  });
  if (!token || !email) {
    throw new Error(
      `Could not mint credentials for "${lakebaseName}" (token or email missing)`
    );
  }
  const encodedUser = urlEncodeDsnPart(email);
  const encodedPass = urlEncodeDsnPart(token);
  const databaseUrl = `postgresql://${encodedUser}:${encodedPass}@${host}:5432/${database}?sslmode=require`;
  const jdbcUrl = `jdbc:postgresql://${host}:5432/${database}?sslmode=require`;
  return {
    lakebaseName,
    branchPath,
    status,
    source,
    host,
    email,
    token,
    databaseUrl,
    jdbcUrl
  };
}

// scripts/lakebase/ci-resolve-branch.cli.ts
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--git-branch":
        out.gitBranch = argv[++i];
        break;
      case "--lakebase-name":
        out.lakebaseName = argv[++i];
        break;
      case "--create-from":
        out.createFrom = argv[++i];
        break;
      case "--recreate-on-source-mismatch":
        out.recreateOnSourceMismatch = true;
        break;
      case "--reset-on-db-ahead":
        out.resetOnDbAhead = true;
        break;
      case "--ensure-endpoint":
        out.ensureEndpoint = true;
        break;
      case "--github-env":
        out.githubEnv = true;
        break;
      case "--database":
        out.database = argv[++i];
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        process.stderr.write(`Unknown flag: ${a}
`);
        process.exit(2);
    }
  }
  return out;
}
var HELP = `lakebase-ci-resolve-branch \u2013 resolve a CI Lakebase branch + endpoint + credentials

Usage:
  lakebase-ci-resolve-branch --git-branch <name> [flags]
  lakebase-ci-resolve-branch --lakebase-name <name> [flags]

Flags:
  --git-branch <name>          Git branch (main/master/staging/feature/x/ci-pr-N/...)
  --lakebase-name <name>       Skip mapping; use this exact Lakebase branch name
  --create-from <parent>       Create the Lakebase branch from <parent>'s Lakebase
                               clone if it doesn't exist. No-op if branch exists.
  --recreate-on-source-mismatch
                               If the branch exists but was forked from a different
                               source than --create-from asks for, delete and re-fork.
                               Intended for disposable CI branches (ci-pr-*).
  --reset-on-db-ahead          If a reused ci-pr's source parentage is correct but
                               its DB is ahead of code (a phantom revision inherited
                               when its source tier was polluted), delete and re-fork
                               from the now-clean source. Intended for ci-pr-*.
  --ensure-endpoint            Create the primary endpoint if it doesn't exist.
  --github-env                 Append vars to $GITHUB_ENV (heredoc for secrets)
                               AND emit NON-SECRET KEY='value' to stdout for the
                               caller to \`eval\` within the same step.
  --database <name>            Database name (default: databricks_postgres).

Requires:
  LAKEBASE_PROJECT_ID env (project id; the CLI inherits this).
  Authenticated databricks CLI on PATH (DATABRICKS_HOST/DATABRICKS_TOKEN or .databrickscfg).

Outputs (KEY='value' shell-eval form, with --github-env also written to $GITHUB_ENV):
  LAKEBASE_BRANCH_NAME    \u2013 e.g. "production" / "feature-foo" / "ci-pr-42"
  LAKEBASE_BRANCH_PATH    \u2013 projects/<id>/branches/<name>
  LAKEBASE_BRANCH_STATUS  \u2013 CREATED | EXISTS | VERIFIED | RECREATED | UNVERIFIED
  LAKEBASE_BRANCH_SOURCE  \u2013 the actual source branch leaf (or empty)
  LAKEBASE_HOST           \u2013 endpoint hostname
  LAKEBASE_USERNAME       \u2013 user email (OAuth "user" for psql)
  LAKEBASE_PASSWORD       \u2013 OAuth token (secret)
  DATABASE_URL            \u2013 postgresql:// URL with embedded creds
  JDBC_URL                \u2013 jdbc:postgresql:// URL (no creds)
`;
function escapeSingleQuotes(s) {
  return s.replace(/'/g, "'\\''");
}
function emitEvalLine(key, value) {
  return `${key}='${escapeSingleQuotes(value)}'
`;
}
function emitGithubEnvScalar(key, value) {
  return `${key}=${value}
`;
}
function emitGithubEnvHeredoc(key, value) {
  return `${key}<<__LB_PW_EOF__
${value}
__LB_PW_EOF__
`;
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const instance = process.env.LAKEBASE_PROJECT_ID;
  if (!instance) {
    process.stderr.write(
      "lakebase-ci-resolve-branch: LAKEBASE_PROJECT_ID env not set\n"
    );
    return 2;
  }
  if (!args.gitBranch && !args.lakebaseName) {
    process.stderr.write(
      "lakebase-ci-resolve-branch: --git-branch or --lakebase-name required\n"
    );
    return 2;
  }
  const result = await resolveCiBranch({
    instance,
    gitBranch: args.gitBranch,
    lakebaseName: args.lakebaseName,
    createFrom: args.createFrom,
    recreateOnSourceMismatch: args.recreateOnSourceMismatch,
    resetOnDbAhead: args.resetOnDbAhead,
    ensureEndpoint: args.ensureEndpoint,
    database: args.database
  });
  if (args.githubEnv) {
    const ghEnvFile = process.env.GITHUB_ENV;
    if (!ghEnvFile) {
      process.stderr.write(
        "lakebase-ci-resolve-branch: --github-env set but GITHUB_ENV env is empty\n"
      );
      return 2;
    }
    const ghEnvLines = emitGithubEnvScalar("LAKEBASE_BRANCH_NAME", result.lakebaseName) + emitGithubEnvScalar("LAKEBASE_BRANCH_PATH", result.branchPath) + emitGithubEnvScalar("LAKEBASE_BRANCH_STATUS", result.status) + emitGithubEnvScalar("LAKEBASE_BRANCH_SOURCE", result.source) + emitGithubEnvScalar("LAKEBASE_HOST", result.host) + emitGithubEnvScalar("LAKEBASE_USERNAME", result.email) + emitGithubEnvHeredoc("LAKEBASE_PASSWORD", result.token) + emitGithubEnvScalar("DATABASE_URL", result.databaseUrl) + emitGithubEnvScalar("JDBC_URL", result.jdbcUrl) + emitGithubEnvScalar("DB_USERNAME", result.email) + emitGithubEnvHeredoc("DB_PASSWORD", result.token) + emitGithubEnvScalar("SPRING_DATASOURCE_URL", result.jdbcUrl) + emitGithubEnvScalar("SPRING_DATASOURCE_USERNAME", result.email) + emitGithubEnvHeredoc("SPRING_DATASOURCE_PASSWORD", result.token);
    fs10.appendFileSync(ghEnvFile, ghEnvLines, { encoding: "utf8" });
    process.stdout.write(emitEvalLine("LAKEBASE_BRANCH_NAME", result.lakebaseName));
    process.stdout.write(emitEvalLine("LAKEBASE_BRANCH_PATH", result.branchPath));
    process.stdout.write(emitEvalLine("LAKEBASE_BRANCH_STATUS", result.status));
    process.stdout.write(emitEvalLine("LAKEBASE_BRANCH_SOURCE", result.source));
    process.stdout.write(emitEvalLine("LAKEBASE_HOST", result.host));
    process.stdout.write(emitEvalLine("LAKEBASE_USERNAME", result.email));
    process.stdout.write(emitEvalLine("JDBC_URL", result.jdbcUrl));
    return 0;
  }
  process.stdout.write(emitEvalLine("LAKEBASE_BRANCH_NAME", result.lakebaseName));
  process.stdout.write(emitEvalLine("LAKEBASE_BRANCH_PATH", result.branchPath));
  process.stdout.write(emitEvalLine("LAKEBASE_BRANCH_STATUS", result.status));
  process.stdout.write(emitEvalLine("LAKEBASE_BRANCH_SOURCE", result.source));
  process.stdout.write(emitEvalLine("LAKEBASE_HOST", result.host));
  process.stdout.write(emitEvalLine("LAKEBASE_USERNAME", result.email));
  process.stdout.write(emitEvalLine("LAKEBASE_PASSWORD", result.token));
  process.stdout.write(emitEvalLine("DATABASE_URL", result.databaseUrl));
  process.stdout.write(emitEvalLine("JDBC_URL", result.jdbcUrl));
  return 0;
}
main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
    process.exit(1);
  }
);
//# sourceMappingURL=ci-resolve-branch.cli.cjs.map