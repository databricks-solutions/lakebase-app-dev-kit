#!/usr/bin/env node

// scripts/lakebase/ci-resolve-branch.cli.ts
import * as fs from "fs";

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
function branchNameFromResourcePath(path) {
  if (!path.includes("/branches/")) return null;
  const leaf = path.split("/branches/").pop();
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

// scripts/lakebase/branch-create.ts
import { execFile as execFile3 } from "child_process";
import { promisify as promisify3 } from "util";

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

// scripts/lakebase/branch-delete.ts
import { execFile as execFile4 } from "child_process";
import { promisify as promisify4 } from "util";
var execFileP4 = promisify4(execFile4);
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
async function dbcli4(args, host) {
  const trimmedHost = host?.replace(/\/+$/, "");
  const env = trimmedHost ? { ...process.env, DATABRICKS_HOST: trimmedHost } : process.env;
  try {
    const { stdout } = await execFileP4("databricks", args, { env, timeout: KIT_TIMEOUTS.cliDefault });
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

// scripts/lakebase/branch-endpoint.ts
import { execFileSync as execFileSync2 } from "child_process";

// scripts/lakebase/get-connection.ts
import { execFileSync } from "child_process";
import { createLakebasePool } from "@databricks/lakebase";
import { Client } from "pg";

// scripts/lakebase/constants.ts
var DEFAULT_ENDPOINT = "primary";

// scripts/lakebase/get-connection.ts
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
function dbcli5(args) {
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
    execFileSync2(
      "databricks",
      ["postgres", "create-endpoint", branchPath, endpointName, "--json", JSON.stringify(spec)],
      { stdio: ["ignore", "pipe", "pipe"], timeout: KIT_TIMEOUTS.cliCreateEndpoint }
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
    if (!actual) {
      status = "UNVERIFIED";
    } else if (actual === expected) {
      status = "VERIFIED";
    } else if (args.recreateOnSourceMismatch) {
      await deleteBranch({
        instance: args.instance,
        branch: lakebaseName,
        // Disposable CI branches (ci-pr-*) only; never the default.
        allowDefault: false
      });
      await waitUntilDeleted(
        args.instance,
        lakebaseName,
        KIT_TIMEOUTS.readyWait
      );
      await createBranch({
        instance: args.instance,
        branch: lakebaseName,
        parentBranch: expected,
        noExpiry: true
      });
      await waitUntilReady(args.instance, lakebaseName, KIT_TIMEOUTS.readyWait);
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
    fs.appendFileSync(ghEnvFile, ghEnvLines, { encoding: "utf8" });
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
//# sourceMappingURL=ci-resolve-branch.cli.js.map