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

// node_modules/tsup/assets/cjs_shims.js
var getImportMetaUrl = () => typeof document === "undefined" ? new URL(`file:${__filename}`).href : document.currentScript && document.currentScript.tagName.toUpperCase() === "SCRIPT" ? document.currentScript.src : new URL("main.js", document.baseURI).href;
var importMetaUrl = /* @__PURE__ */ getImportMetaUrl();

// scripts/lakebase/get-connection.ts
var import_node_child_process2 = require("child_process");
var import_lakebase = require("@databricks/lakebase");
var import_pg = require("pg");

// scripts/lakebase/branch-utils.ts
var import_node_child_process = require("child_process");
var import_node_util = require("util");

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
function branchNameFromResourcePath(path24) {
  if (!path24.includes("/branches/")) return null;
  const leaf = path24.split("/branches/").pop();
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
var execFileP = (0, import_node_util.promisify)(import_node_child_process.execFile);
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
function isLongRunningTierBranch(b) {
  return !b.isDefault && !b.expireTime;
}
function isTier(name, branches) {
  if (!name) {
    return false;
  }
  return branches.some((b) => isLongRunningTierBranch(b) && b.nameLeaf === name);
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

// scripts/lakebase/constants.ts
var POSTGRES_PORT = 5432;
var DEFAULT_DATABASE = "databricks_postgres";
var DEFAULT_ENDPOINT = "primary";

// scripts/lakebase/get-connection.ts
async function getConnection(args) {
  const endpointName = args.endpointName ?? DEFAULT_ENDPOINT;
  const database = args.database ?? process.env.PGDATABASE ?? DEFAULT_DATABASE;
  const branchId = await resolveBranchId({ instance: args.instance, branch: args.branch });
  const endpointPath2 = `projects/${args.instance}/branches/${branchId}/endpoints/${endpointName}`;
  if (args.output === "dsn") {
    const host2 = await resolveEndpointHost(args.instance, branchId);
    const { token, email: email2 } = await mintCredential(endpointPath2);
    const url = buildPostgresUrl({ host: host2, port: POSTGRES_PORT, database, user: email2, password: token });
    return { url, host: host2, port: POSTGRES_PORT, database, user: email2, endpointPath: endpointPath2 };
  }
  const host = await resolveEndpointHost(args.instance, branchId);
  const email = await resolveCurrentUser();
  return (0, import_lakebase.createLakebasePool)({
    endpoint: endpointPath2,
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
  const raw = dbcli2(["postgres", "list-endpoints", branchPath, "-o", "json"]);
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
async function mintCredential(endpointPath2) {
  const raw = dbcli2(["postgres", "generate-database-credential", endpointPath2, "-o", "json"]);
  const token = JSON.parse(raw)?.token ?? "";
  if (!token) {
    throw new Error(`generate-database-credential returned no token for ${endpointPath2}`);
  }
  const email = await resolveCurrentUser();
  return { token, email };
}
async function resolveCurrentUser() {
  const raw = dbcli2(["current-user", "me", "-o", "json"]);
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
function dbcli2(args) {
  try {
    return (0, import_node_child_process2.execFileSync)("databricks", args, {
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

// scripts/lakebase/schema-diff.ts
var import_node_child_process3 = require("child_process");
var IGNORED_TABLES = /* @__PURE__ */ new Set(["flyway_schema_history"]);
var SCHEMA_QUERY = "SELECT c.table_name, c.column_name, c.data_type FROM information_schema.columns c JOIN pg_tables t ON c.table_name = t.tablename WHERE c.table_schema='public' AND t.schemaname='public' ORDER BY c.table_name, c.ordinal_position";
async function getSchemaDiff(args) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const baseResult = {
    branchName: args.branch,
    comparisonBranchName: "",
    timestamp,
    migrations: [],
    created: [],
    modified: [],
    removed: [],
    branchTables: [],
    inSync: false
  };
  const comparisonBranch = args.comparisonBranch ?? resolveComparisonBranch(args.instance, args.branch);
  if (!comparisonBranch) {
    return { ...baseResult, error: "Could not resolve a comparison target Lakebase branch" };
  }
  if (comparisonBranch === args.branch) {
    return { ...baseResult, comparisonBranchName: comparisonBranch, inSync: true };
  }
  let targetPool;
  let comparisonPool;
  try {
    targetPool = await getConnection({
      output: "pool",
      instance: args.instance,
      branch: args.branch,
      database: args.database,
      workspaceClient: args.workspaceClient
    });
    comparisonPool = await getConnection({
      output: "pool",
      instance: args.instance,
      branch: comparisonBranch,
      database: args.database,
      workspaceClient: args.workspaceClient
    });
    const targetTables = await listTables(targetPool);
    const comparisonTables = await listTables(comparisonPool);
    return diffSchemas(args.branch, comparisonBranch, targetTables, comparisonTables, timestamp);
  } catch (err) {
    return {
      ...baseResult,
      comparisonBranchName: comparisonBranch,
      error: err instanceof Error ? err.message : String(err)
    };
  } finally {
    if (targetPool) await targetPool.end().catch(() => void 0);
    if (comparisonPool) await comparisonPool.end().catch(() => void 0);
  }
}
async function listTables(pool) {
  const { rows } = await pool.query(SCHEMA_QUERY);
  const tables = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (!r.table_name || IGNORED_TABLES.has(r.table_name)) continue;
    if (!tables.has(r.table_name)) tables.set(r.table_name, []);
    tables.get(r.table_name).push({ name: r.column_name, dataType: r.data_type });
  }
  return tables;
}
function diffSchemas(branch, comparisonBranch, target, comparison, timestamp) {
  const created = [];
  const removed = [];
  const modified = [];
  for (const [name, columns] of target) {
    if (!comparison.has(name)) {
      created.push({ type: "TABLE", name, columns });
    }
  }
  for (const [name, columns] of comparison) {
    if (!target.has(name)) {
      removed.push({ type: "TABLE", name, columns });
    }
  }
  for (const [name, targetCols] of target) {
    const comparisonCols = comparison.get(name);
    if (!comparisonCols) continue;
    const comparisonKeys = new Set(comparisonCols.map(colKey));
    const targetKeys = new Set(targetCols.map(colKey));
    const addedColumns = targetCols.filter((c) => !comparisonKeys.has(colKey(c)));
    const removedColumns = comparisonCols.filter((c) => !targetKeys.has(colKey(c)));
    if (addedColumns.length > 0 || removedColumns.length > 0) {
      modified.push({
        type: "TABLE",
        name,
        columns: targetCols,
        addedColumns,
        removedColumns,
        prodColumns: comparisonCols
      });
    }
  }
  const branchTables = [...target.entries()].map(([name, columns]) => ({ type: "TABLE", name, columns })).sort((a, b) => a.name.localeCompare(b.name));
  return {
    branchName: branch,
    comparisonBranchName: comparisonBranch,
    timestamp,
    migrations: [],
    created: created.sort((a, b) => a.name.localeCompare(b.name)),
    modified: modified.sort((a, b) => a.name.localeCompare(b.name)),
    removed: removed.sort((a, b) => a.name.localeCompare(b.name)),
    branchTables,
    inSync: created.length === 0 && modified.length === 0 && removed.length === 0
  };
}
var colKey = (c) => `${c.name}:${c.dataType}`;
function resolveComparisonBranch(instance, branch) {
  const branchInfo = describeBranch(instance, branch);
  const sourceBranch = branchInfo?.status?.source_branch ?? branchInfo?.spec?.source_branch;
  if (sourceBranch && typeof sourceBranch === "string") {
    const leaf = sourceBranch.split("/branches/").pop();
    if (leaf) return leaf;
  }
  const def = findDefaultBranch(instance);
  if (def) return def;
  return void 0;
}
function describeBranch(instance, branch) {
  const branchPath = `projects/${instance}/branches/${branch}`;
  try {
    const raw = dbcli3(["postgres", "get-branch", branchPath, "-o", "json"]);
    return JSON.parse(raw);
  } catch {
    try {
      const raw = dbcli3(["postgres", "list-branches", `projects/${instance}`, "-o", "json"]);
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : parsed.branches ?? parsed.items ?? [];
      return items.find((b) => b.uid === branch || b.name?.endsWith(`/branches/${branch}`));
    } catch {
      return void 0;
    }
  }
}
function findDefaultBranch(instance) {
  try {
    const raw = dbcli3(["postgres", "list-branches", `projects/${instance}`, "-o", "json"]);
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : parsed.branches ?? parsed.items ?? [];
    const def = items.find((b) => b.status?.default === true || b.is_default === true);
    if (!def) return void 0;
    return def.name?.split("/branches/").pop() ?? def.uid ?? void 0;
  } catch {
    return void 0;
  }
}
function dbcli3(args) {
  return (0, import_node_child_process3.execFileSync)("databricks", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.cliDefault
  });
}

// scripts/lakebase/create-project.ts
var fs14 = __toESM(require("fs"), 1);
var path13 = __toESM(require("path"), 1);

// scripts/lakebase/env-file.ts
var fs = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);
var CONNECTION_KEYS = [
  "DATABASE_URL",
  "DB_USERNAME",
  "DB_PASSWORD",
  "LAKEBASE_BRANCH_ID",
  "LAKEBASE_HOST"
];
function updateEnvConnection(args) {
  const existing = fs.existsSync(args.envPath) ? fs.readFileSync(args.envPath, "utf-8") : "";
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
  fs.mkdirSync(path.dirname(args.envPath), { recursive: true });
  fs.writeFileSync(args.envPath, content);
}

// scripts/lakebase/project-verify.ts
var fs2 = __toESM(require("fs"), 1);
var path2 = __toESM(require("path"), 1);
function verifyHooks(projectDir) {
  const hooksDir = path2.join(projectDir, ".git", "hooks");
  return {
    postCheckout: fs2.existsSync(path2.join(hooksDir, "post-checkout")),
    prepareCommitMsg: fs2.existsSync(path2.join(hooksDir, "prepare-commit-msg")),
    prePush: fs2.existsSync(path2.join(hooksDir, "pre-push"))
  };
}
function verifyWorkflows(projectDir) {
  const wfDir = path2.join(projectDir, ".github", "workflows");
  return {
    pr: fs2.existsSync(path2.join(wfDir, "pr.yml")),
    merge: fs2.existsSync(path2.join(wfDir, "merge.yml"))
  };
}
function verifyProject(projectDir) {
  const hooks = verifyHooks(projectDir);
  const workflows = verifyWorkflows(projectDir);
  const warnings = [];
  if (!hooks.postCheckout || !hooks.prepareCommitMsg || !hooks.prePush) {
    warnings.push("Some git hooks not installed (post-checkout / prepare-commit-msg / pre-push)");
  }
  if (!workflows.pr || !workflows.merge) {
    warnings.push("Some GitHub Actions workflows missing (pr.yml / merge.yml)");
  }
  return { hooks, workflows, warnings };
}

// scripts/github/repo.ts
var import_octokit = require("octokit");

// scripts/github/auth.ts
var import_node_child_process4 = require("child_process");
var GITHUB_SCOPES = ["repo", "workflow", "delete_repo"];
async function resolveGitHubToken(scopes = GITHUB_SCOPES) {
  const fromEnv = process.env.GITHUB_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const fromVsCode = await tryVsCodeSession({ scopes });
  if (fromVsCode) return fromVsCode;
  const fromGh = tryGhAuthToken();
  if (fromGh) return fromGh;
  throw new Error(
    "No GitHub auth available. Set GITHUB_TOKEN, sign in to GitHub in VS Code, or run `gh auth login`."
  );
}
async function tryVsCodeSession(opts = {}) {
  const scopes = opts.scopes ?? GITHUB_SCOPES;
  try {
    const vscode = await import("vscode");
    if (!vscode?.authentication?.getSession) return void 0;
    const session = await vscode.authentication.getSession("github", [...scopes], {
      createIfNone: !!opts.createIfNone
    });
    return session?.accessToken;
  } catch {
    return void 0;
  }
}
function tryGhAuthToken() {
  try {
    const raw = (0, import_node_child_process4.execFileSync)("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5e3
    });
    const token = raw.trim();
    return token || void 0;
  } catch {
    return void 0;
  }
}
async function diagnoseGitHubAuth() {
  const envSet = !!process.env.GITHUB_TOKEN?.trim();
  const vscodeAvailable = await tryVsCodeSession().then(Boolean).catch(() => false);
  const ghAvailable = !!tryGhAuthToken();
  const sources = [];
  if (envSet) sources.push("env");
  if (vscodeAvailable) sources.push("vscode");
  if (ghAvailable) sources.push("gh");
  return {
    sources,
    primary: sources[0],
    scopes: [...GITHUB_SCOPES]
  };
}

// scripts/util/parse-owner-repo.ts
function parseOwnerRepo(urlOrSlug) {
  const trimmed = urlOrSlug.trim().replace(/\.git$/, "");
  if (trimmed.includes("/")) {
    const slugMatch = trimmed.match(/github\.com[/:]([^/]+)\/([^/]+)/);
    if (slugMatch) {
      return { owner: slugMatch[1], repo: slugMatch[2] };
    }
    const parts = trimmed.split("/");
    if (parts.length >= 2) {
      return {
        owner: parts[parts.length - 2],
        repo: parts[parts.length - 1]
      };
    }
  }
  throw new Error(`Invalid GitHub repo reference: ${urlOrSlug}`);
}
function formatOwnerRepo(owner, repo) {
  return `${owner}/${repo}`;
}

// scripts/github/repo.ts
var GitHubRepoError = class extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.name = "GitHubRepoError";
    this.status = status;
  }
};
async function newContext() {
  const token = await resolveGitHubToken();
  return { octokit: new import_octokit.Octokit({ auth: token }) };
}
function wrap(err, context) {
  if (err instanceof import_octokit.RequestError) {
    throw new GitHubRepoError(`${context}: ${err.message}`, err.status);
  }
  if (err instanceof Error) {
    throw new GitHubRepoError(`${context}: ${err.message}`);
  }
  throw new GitHubRepoError(context);
}
async function getLogin(ctx) {
  if (!ctx.loginPromise) {
    ctx.loginPromise = ctx.octokit.rest.users.getAuthenticated().then(({ data }) => data.login);
  }
  return ctx.loginPromise;
}
async function getCurrentUser() {
  try {
    const ctx = await newContext();
    return await getLogin(ctx);
  } catch (err) {
    wrap(err, "GitHub authentication failed");
  }
}
async function createRepo(name, opts = {}) {
  try {
    const ctx = await newContext();
    const isPrivate = opts.private !== false;
    const description = opts.description;
    if (name.includes("/")) {
      const { owner, repo } = parseOwnerRepo(name);
      const login = await getLogin(ctx);
      let data2;
      if (owner.toLowerCase() === login.toLowerCase()) {
        ({ data: data2 } = await ctx.octokit.rest.repos.createForAuthenticatedUser({
          name: repo,
          private: isPrivate,
          description
        }));
      } else {
        ({ data: data2 } = await ctx.octokit.rest.repos.createInOrg({
          org: owner,
          name: repo,
          private: isPrivate,
          description
        }));
      }
      return data2.html_url || `https://github.com/${formatOwnerRepo(owner, repo)}`;
    }
    const { data } = await ctx.octokit.rest.repos.createForAuthenticatedUser({
      name,
      private: isPrivate,
      description
    });
    return data.html_url || `https://github.com/${data.full_name}`;
  } catch (err) {
    wrap(err, `Failed to create repository "${name}"`);
  }
}
async function getRepoFullName(name) {
  try {
    const { owner, repo } = parseOwnerRepo(name);
    const ctx = await newContext();
    const { data } = await ctx.octokit.rest.repos.get({ owner, repo });
    return data.full_name || formatOwnerRepo(owner, repo);
  } catch (err) {
    wrap(err, `Repository "${name}" is not visible`);
  }
}

// scripts/util/exec.ts
var cp = __toESM(require("child_process"), 1);
function shq(s) {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
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

// scripts/git/clone.ts
async function cloneRepo(args) {
  await exec2(`git clone ${shq(args.repoUrl)}`, {
    cwd: args.parentDir,
    timeout: args.timeoutMs ?? 6e4
  });
}

// scripts/git/init.ts
async function gitInit(projectDir) {
  await exec2("git init -b main", { cwd: projectDir, timeout: 15e3 });
}

// scripts/git/commit-push.ts
var WorkflowScopeError = class extends Error {
  constructor(projectDir) {
    super(
      `Push rejected: GitHub token lacks the \`workflow\` OAuth scope required for commits touching \`.github/workflows/*\`. The project on disk is fine; only the initial push failed.

To finish:
  1. Re-sign in to GitHub in VS Code and grant the workflow scope (or set      GITHUB_TOKEN to a token with workflow scope)
  2. Then from the project dir:  cd ${projectDir} && git push -u origin main`
    );
    this.name = "WorkflowScopeError";
  }
};
async function commitAndPush(args) {
  await exec2("git add -A", { cwd: args.projectDir });
  await exec2(`git commit -m ${JSON.stringify(args.message)}`, {
    cwd: args.projectDir,
    timeout: 3e4
  });
  if (args.push === false) return;
  const remote = args.remote ?? "origin";
  const branch = args.branch ?? "main";
  try {
    await exec2(`git push -u ${remote} ${branch}`, {
      cwd: args.projectDir,
      timeout: 3e4
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/without `?workflow`? scope|workflow scope/i.test(msg)) {
      throw new WorkflowScopeError(args.projectDir);
    }
    throw err;
  }
}

// scripts/lakebase/lakebase-project.ts
var import_node_child_process5 = require("child_process");
var import_node_util2 = require("util");
var execFileP2 = (0, import_node_util2.promisify)(import_node_child_process5.execFile);
var LakebaseProjectError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "LakebaseProjectError";
  }
};
async function createLakebaseProject(args) {
  const raw = await dbcli4(["postgres", "create-project", args.projectId, "-o", "json"], args.host);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LakebaseProjectError(`Unexpected CLI output (not JSON): ${raw.slice(0, 200)}`);
  }
  const result = parsed.response ?? parsed.result ?? parsed;
  const status = result.status ?? void 0;
  return {
    uid: result.uid ?? args.projectId,
    name: result.name ?? `projects/${args.projectId}`,
    state: status?.current_state ?? result.state ?? "READY"
  };
}
function findDefaultBranchName(items) {
  const def = items.find((b) => b.status?.default === true || b.is_default === true);
  if (!def || !def.name) return null;
  return branchNameFromResourcePath(def.name);
}
async function getDefaultBranchName(args) {
  try {
    const raw = await dbcli4(
      ["postgres", "list-branches", `projects/${args.projectId}`, "-o", "json"],
      args.host
    );
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : parsed.branches ?? parsed.items ?? [];
    return findDefaultBranchName(items);
  } catch {
    return null;
  }
}
async function getDefaultBranchId(args) {
  const name = await getDefaultBranchName(args);
  return name ?? "";
}
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
    raw = await dbcli4(["postgres", "get-project", name, "-o", "json"], args.host);
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
async function dbcli4(args, host) {
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

// scripts/lakebase/scaffold.ts
var cp2 = __toESM(require("child_process"), 1);
var fs8 = __toESM(require("fs"), 1);
var path7 = __toESM(require("path"), 1);
var import_node_url3 = require("url");

// scripts/lakebase/scaffold-language.ts
var fs7 = __toESM(require("fs"), 1);
var path6 = __toESM(require("path"), 1);
var import_node_url2 = require("url");

// scripts/util/copy-dir-substituted.ts
var fs3 = __toESM(require("fs"), 1);
var path3 = __toESM(require("path"), 1);
var SKIP_ENTRIES = /* @__PURE__ */ new Set([".gitignore.extra", "fallback"]);
function copyDirSubstituted(srcDir, destDir, args = {}) {
  const skip = args.skipEntries ?? SKIP_ENTRIES;
  fs3.mkdirSync(destDir, { recursive: true });
  for (const file of fs3.readdirSync(srcDir)) {
    if (skip.has(file)) continue;
    const srcPath = path3.join(srcDir, file);
    const destPath = path3.join(destDir, file);
    if (fs3.statSync(srcPath).isDirectory()) {
      copyDirSubstituted(srcPath, destPath, { projectName: args.projectName, skipEntries: /* @__PURE__ */ new Set() });
    } else {
      let content = fs3.readFileSync(srcPath, "utf-8");
      if (args.projectName) {
        content = content.replace(/\{\{PROJECT_NAME\}\}/g, args.projectName);
      }
      fs3.writeFileSync(destPath, content);
    }
  }
}

// scripts/lakebase/spring-initializr.ts
var fs6 = __toESM(require("fs"), 1);
var path5 = __toESM(require("path"), 1);
var import_node_url = require("url");

// scripts/util/maven-coords.ts
function sanitizeArtifactId(name) {
  let id = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!id) {
    id = "demo";
  }
  if (/^[0-9]/.test(id)) {
    id = `app-${id}`;
  }
  return id;
}

// scripts/util/zip-extract.ts
var fs4 = __toESM(require("fs"), 1);
var path4 = __toESM(require("path"), 1);
var import_adm_zip = __toESM(require("adm-zip"), 1);
function extractZipToDir(zipBuffer, targetDir) {
  fs4.mkdirSync(targetDir, { recursive: true });
  const zip = new import_adm_zip.default(zipBuffer);
  const tempDir = path4.join(targetDir, `.initializr-extract-${Date.now()}`);
  zip.extractAllTo(tempDir, true);
  const entries = fs4.readdirSync(tempDir).filter((e) => e !== "__MACOSX");
  const sourceDir = entries.length === 1 && fs4.statSync(path4.join(tempDir, entries[0])).isDirectory() ? path4.join(tempDir, entries[0]) : tempDir;
  copyDirRecursive(sourceDir, targetDir);
  fs4.rmSync(tempDir, { recursive: true, force: true });
}
function copyDirRecursive(src, dest) {
  fs4.mkdirSync(dest, { recursive: true });
  for (const entry of fs4.readdirSync(src)) {
    const srcPath = path4.join(src, entry);
    const destPath = path4.join(dest, entry);
    if (fs4.statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs4.copyFileSync(srcPath, destPath);
    }
  }
}

// scripts/util/pom-patch.ts
var fs5 = __toESM(require("fs"), 1);
var FLYWAY_PG_DEPENDENCY = `
        <dependency>
            <groupId>org.flywaydb</groupId>
            <artifactId>flyway-database-postgresql</artifactId>
        </dependency>`;
var LAKEBASE_PLUGINS = `
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <configuration>
                    <argLine>--enable-native-access=ALL-UNNAMED -XX:+EnableDynamicAgentLoading</argLine>
                </configuration>
            </plugin>
            <plugin>
                <groupId>org.flywaydb</groupId>
                <artifactId>flyway-maven-plugin</artifactId>
                <configuration>
                    <url>\${env.SPRING_DATASOURCE_URL}</url>
                    <user>\${env.SPRING_DATASOURCE_USERNAME}</user>
                    <password>\${env.SPRING_DATASOURCE_PASSWORD}</password>
                    <baselineOnMigrate>true</baselineOnMigrate>
                </configuration>
            </plugin>`;
function patchPomForLakebase(pomPath) {
  if (!fs5.existsSync(pomPath)) {
    throw new Error(`pom.xml not found at ${pomPath}`);
  }
  let pom = fs5.readFileSync(pomPath, "utf-8");
  if (!pom.includes("flyway-database-postgresql")) {
    pom = pom.replace("</dependencies>", `${FLYWAY_PG_DEPENDENCY}
    </dependencies>`);
  }
  if (!pom.includes("flyway-maven-plugin")) {
    if (pom.includes("<artifactId>spring-boot-maven-plugin</artifactId>")) {
      pom = pom.replace(
        /(<plugin>\s*<groupId>org\.springframework\.boot<\/groupId>\s*<artifactId>spring-boot-maven-plugin<\/artifactId>\s*<\/plugin>)/,
        `$1${LAKEBASE_PLUGINS}`
      );
    } else if (pom.includes("</plugins>")) {
      pom = pom.replace("</plugins>", `${LAKEBASE_PLUGINS}
        </plugins>`);
    }
  } else if (!pom.includes("maven-surefire-plugin")) {
    pom = pom.replace(
      "</plugins>",
      `
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <configuration>
                    <argLine>--enable-native-access=ALL-UNNAMED -XX:+EnableDynamicAgentLoading</argLine>
                </configuration>
            </plugin>
        </plugins>`
    );
  }
  fs5.writeFileSync(pomPath, pom);
}

// scripts/lakebase/spring-initializr.ts
var InitializrNetworkError = class extends Error {
  cause;
  constructor(message, cause) {
    super(message);
    this.name = "InitializrNetworkError";
    this.cause = cause;
  }
};
var InitializrParseError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "InitializrParseError";
  }
};
var METADATA_ACCEPT = "application/vnd.initializr.v2.3+json";
var CACHE_TTL_MS = KIT_TIMEOUTS.initializrCacheTtl;
var DEFAULT_BASE_URL = KIT_REGISTRIES.springInitializr;
var DEPENDENCIES = "web,data-jpa,postgresql,flyway";
function isPrereleaseBootVersion(version) {
  const upper = version.toUpperCase();
  return upper.includes("SNAPSHOT") || /-(RC|M)\d/i.test(version) || /-(ALPHA|BETA)\d/i.test(version);
}
function resolveLatestBootVersion(section) {
  if (!section || typeof section !== "object") {
    throw new InitializrParseError("Missing bootVersion in Spring Initializr metadata");
  }
  const bootSection = section;
  const values = bootSection.values || [];
  for (const entry of values) {
    if (typeof entry.id === "string" && entry.id && !isPrereleaseBootVersion(entry.id)) {
      return entry.id;
    }
  }
  if (typeof bootSection.default === "string" && bootSection.default) {
    return bootSection.default;
  }
  throw new InitializrParseError("No Spring Boot version found in Initializr metadata");
}
function isLtsJavaVersion(version) {
  const n = Number.parseInt(version, 10);
  if (Number.isNaN(n)) return false;
  if (n === 8 || n === 11) return true;
  return n >= 17 && (n - 17) % 4 === 0;
}
function resolveLatestLtsJavaVersion(section) {
  if (!section || typeof section !== "object") {
    throw new InitializrParseError("Missing javaVersion in Spring Initializr metadata");
  }
  const javaSection = section;
  const available = /* @__PURE__ */ new Set();
  if (typeof javaSection.default === "string" && javaSection.default) {
    available.add(javaSection.default);
  }
  for (const entry of javaSection.values || []) {
    if (typeof entry.id === "string" && entry.id) {
      available.add(entry.id);
    }
  }
  let latest = -1;
  let latestId = "";
  for (const id of available) {
    if (!isLtsJavaVersion(id)) continue;
    const n = Number.parseInt(id, 10);
    if (n > latest) {
      latest = n;
      latestId = id;
    }
  }
  if (latestId) return latestId;
  if (typeof javaSection.default === "string" && javaSection.default) {
    return javaSection.default;
  }
  throw new InitializrParseError("No Java version found in Initializr metadata");
}
var SpringInitializrClient = class {
  metadataCache;
  baseUrl;
  fetchFn;
  constructor(baseUrl = DEFAULT_BASE_URL, fetchFn = globalThis.fetch.bind(globalThis)) {
    this.baseUrl = baseUrl;
    this.fetchFn = fetchFn;
  }
  async getMetadata(forceRefresh = false) {
    if (!forceRefresh && this.metadataCache && Date.now() - this.metadataCache.fetchedAt < CACHE_TTL_MS) {
      return this.metadataCache.metadata;
    }
    const url = this.baseUrl.replace(/\/$/, "") + "/";
    let response;
    try {
      response = await this.fetchFn(url, { headers: { Accept: METADATA_ACCEPT } });
    } catch (err) {
      throw new InitializrNetworkError(`Failed to reach Spring Initializr at ${this.baseUrl}`, err);
    }
    if (!response.ok) {
      throw new InitializrNetworkError(`Spring Initializr metadata request failed (${response.status})`);
    }
    let body;
    try {
      body = await response.json();
    } catch {
      throw new InitializrParseError("Spring Initializr metadata response was not valid JSON");
    }
    const metadata = parseMetadata(body);
    this.metadataCache = { metadata, fetchedAt: Date.now() };
    return metadata;
  }
  async generateMavenProject(opts) {
    const metadata = await this.getMetadata(true);
    const artifactId = sanitizeArtifactId(opts.artifactId);
    const params = new URLSearchParams({
      type: "maven-project",
      language: opts.language,
      bootVersion: metadata.bootVersion,
      javaVersion: metadata.javaVersion,
      packaging: "jar",
      dependencies: DEPENDENCIES,
      groupId: opts.groupId || "com.example",
      artifactId,
      name: opts.name || artifactId,
      packageName: opts.packageName || "com.example.demo",
      description: opts.description || "Spring Boot + JPA + PostgreSQL with Flyway; database branches via Lakebase.",
      version: "1.0.0-SNAPSHOT"
    });
    const url = `${this.baseUrl.replace(/\/$/, "")}/starter.zip?${params.toString()}`;
    let response;
    try {
      response = await this.fetchFn(url);
    } catch (err) {
      throw new InitializrNetworkError("Failed to download project from Spring Initializr", err);
    }
    if (!response.ok) {
      throw new InitializrNetworkError(`Spring Initializr project generation failed (${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
};
function parseMetadata(body) {
  if (!body || typeof body !== "object") {
    throw new InitializrParseError("Spring Initializr metadata response was empty");
  }
  const doc = body;
  return {
    bootVersion: resolveLatestBootVersion(doc.bootVersion),
    javaVersion: resolveLatestLtsJavaVersion(doc.javaVersion)
  };
}
var cachedTemplatesDir;
function findTemplatesDir() {
  if (cachedTemplatesDir) return cachedTemplatesDir;
  const here = path5.dirname((0, import_node_url.fileURLToPath)(importMetaUrl));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = path5.join(dir, "templates", "project");
    if (fs6.existsSync(path5.join(candidate, "common", ".gitignore.base"))) {
      cachedTemplatesDir = candidate;
      return cachedTemplatesDir;
    }
    const parent = path5.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate templates/project tree");
}
async function deploySpringStarter(args) {
  const language = args.language;
  const label = language === "kotlin" ? "Kotlin" : "Java";
  const report = args.report ?? (() => {
  });
  const templatesDir = args.templatesDir ?? findTemplatesDir();
  const useFallback = process.env.LAKEBASE_SCAFFOLD_FALLBACK === "1";
  if (useFallback) {
    report(`Using bundled ${label} template (LAKEBASE_SCAFFOLD_FALLBACK).`);
    deploySpringFallback(args.targetDir, language, args.projectName, templatesDir);
    deploySpringOverlays(args.targetDir, templatesDir);
    return;
  }
  report(`Fetching Spring Boot project from start.spring.io (${label}).`);
  let initializrExtracted = false;
  try {
    const client = args.initializrClient ?? new SpringInitializrClient();
    const metadata = await client.getMetadata();
    report(
      `Scaffolding Spring Boot ${metadata.bootVersion} (JVM ${metadata.javaVersion}, ${label}).`,
      `bootVersion=${metadata.bootVersion}`
    );
    const zip = await client.generateMavenProject({
      language,
      artifactId: args.projectName || "demo",
      name: args.projectName
    });
    extractZipToDir(zip, args.targetDir);
    initializrExtracted = true;
    const pomPath = path5.join(args.targetDir, "pom.xml");
    if (!fs6.existsSync(pomPath)) {
      throw new Error("Spring Initializr did not produce a Maven project (missing pom.xml)");
    }
    const mvnw = path5.join(args.targetDir, "mvnw");
    if (fs6.existsSync(mvnw)) fs6.chmodSync(mvnw, 493);
    deploySpringOverlays(args.targetDir, templatesDir);
    patchPomForLakebase(pomPath);
  } catch (err) {
    if (initializrExtracted) {
      throw new Error(
        `Spring Initializr project was extracted but post-processing failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    const reason = err instanceof InitializrNetworkError ? err.message : String(err);
    report(`Spring Initializr unavailable; using bundled ${label} template.`, reason);
    clearScaffoldArtifacts(args.targetDir);
    deploySpringFallback(args.targetDir, language, args.projectName, templatesDir);
    deploySpringOverlays(args.targetDir, templatesDir);
  }
}
function deploySpringFallback(targetDir, language, projectName, templatesDir) {
  const fallbackDir = path5.join(templatesDir, language, "fallback");
  if (!fs6.existsSync(fallbackDir)) {
    throw new Error(`No fallback template found for language: ${language}`);
  }
  copyDirSubstituted(fallbackDir, targetDir, { projectName });
  const mvnw = path5.join(targetDir, "mvnw");
  if (fs6.existsSync(mvnw)) fs6.chmodSync(mvnw, 493);
}
function deploySpringOverlays(targetDir, templatesDir) {
  const overlayDir = path5.join(templatesDir, "spring");
  if (!fs6.existsSync(overlayDir)) {
    throw new Error(`Spring overlay template not found at ${overlayDir}`);
  }
  copyDirSubstituted(overlayDir, targetDir);
}
function clearScaffoldArtifacts(targetDir) {
  if (!fs6.existsSync(targetDir)) return;
  for (const entry of fs6.readdirSync(targetDir)) {
    if (entry === ".git") continue;
    fs6.rmSync(path5.join(targetDir, entry), { recursive: true, force: true });
  }
}

// scripts/lakebase/scaffold-language.ts
var cachedTemplatesDir2;
function findTemplatesDir2() {
  if (cachedTemplatesDir2) return cachedTemplatesDir2;
  const here = path6.dirname((0, import_node_url2.fileURLToPath)(importMetaUrl));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = path6.join(dir, "templates", "project");
    if (fs7.existsSync(path6.join(candidate, "common", ".gitignore.base"))) {
      cachedTemplatesDir2 = candidate;
      return cachedTemplatesDir2;
    }
    const parent = path6.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate templates/project tree");
}
async function deployLanguageProject(args) {
  if (args.language === "java" || args.language === "kotlin") {
    await deploySpringStarter({
      targetDir: args.targetDir,
      language: args.language,
      projectName: args.projectName,
      templatesDir: args.templatesDir,
      initializrClient: args.initializrClient,
      report: args.report
    });
    return;
  }
  const templatesDir = args.templatesDir ?? findTemplatesDir2();
  const langSrc = path6.join(templatesDir, args.language);
  if (!fs7.existsSync(langSrc)) {
    throw new Error(`No template found for language: ${args.language}`);
  }
  copyDirSubstituted(langSrc, args.targetDir, { projectName: args.projectName });
}

// scripts/lakebase/scaffold.ts
var cachedTemplatesDir3;
function findTemplatesDir3() {
  if (cachedTemplatesDir3) return cachedTemplatesDir3;
  const here = path7.dirname((0, import_node_url3.fileURLToPath)(importMetaUrl));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = path7.join(dir, "templates", "project");
    if (fs8.existsSync(path7.join(candidate, "common", ".gitignore.base"))) {
      cachedTemplatesDir3 = candidate;
      return cachedTemplatesDir3;
    }
    const parent = path7.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/project tree relative to ${here}. Pass explicit { templatesDir } to override.`
  );
}
function templatesRoot(opts) {
  return opts?.templatesDir ?? findTemplatesDir3();
}
function commonDir(opts) {
  return path7.join(templatesRoot(opts), "common");
}
function langDir(language, opts) {
  return path7.join(templatesRoot(opts), language);
}
function copyDir(srcDir, destDir, makeExecutable, relPrefix = "") {
  if (!fs8.existsSync(srcDir)) {
    throw new Error(`Source directory not found: ${srcDir}`);
  }
  fs8.mkdirSync(destDir, { recursive: true });
  const out = [];
  for (const entry of fs8.readdirSync(srcDir)) {
    const srcPath = path7.join(srcDir, entry);
    const destPath = path7.join(destDir, entry);
    const relPath = relPrefix ? path7.join(relPrefix, entry) : entry;
    if (fs8.statSync(srcPath).isDirectory()) {
      out.push(...copyDir(srcPath, destPath, makeExecutable, relPath));
    } else {
      fs8.copyFileSync(srcPath, destPath);
      if (makeExecutable) {
        fs8.chmodSync(destPath, 493);
      }
      out.push(relPath);
    }
  }
  return out;
}
async function deployScripts(targetDir, opts) {
  return copyDir(path7.join(commonDir(opts), "scripts"), path7.join(targetDir, "scripts"), true);
}
async function deployClaudeCommands(targetDir, opts) {
  const src = path7.join(commonDir(opts), ".claude", "commands");
  if (!fs8.existsSync(src)) {
    return { written: [], skipped: [] };
  }
  const destDir = path7.join(targetDir, ".claude", "commands");
  fs8.mkdirSync(destDir, { recursive: true });
  const version = kitVersion(opts);
  const written = [];
  const skipped = [];
  for (const entry of fs8.readdirSync(src)) {
    if (!entry.endsWith(".md")) continue;
    const relDest = path7.join(".claude", "commands", entry);
    const destPath = path7.join(targetDir, relDest);
    if (fs8.existsSync(destPath) && !opts?.force) {
      skipped.push(relDest);
      continue;
    }
    const before = fs8.readFileSync(path7.join(src, entry), "utf-8");
    const after = before.replace(/\$\{KIT_VERSION_AT_SCAFFOLD\}/g, version);
    fs8.writeFileSync(destPath, after);
    written.push(relDest);
  }
  return { written, skipped };
}
async function deployWorkflows(targetDir, opts) {
  const written = copyDir(
    path7.join(commonDir(opts), ".github", "workflows"),
    path7.join(targetDir, ".github", "workflows"),
    false
  );
  substituteWorkflowPlaceholders(
    path7.join(targetDir, ".github", "workflows"),
    opts
  );
  return written;
}
function kitVersion(opts) {
  try {
    const kitRoot = path7.dirname(path7.dirname(templatesRoot(opts)));
    const raw = fs8.readFileSync(path7.join(kitRoot, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}
function substituteWorkflowPlaceholders(workflowDir, opts) {
  if (!fs8.existsSync(workflowDir)) return;
  const version = kitVersion(opts);
  for (const entry of fs8.readdirSync(workflowDir)) {
    if (!entry.endsWith(".yml") && !entry.endsWith(".yaml")) continue;
    const filePath = path7.join(workflowDir, entry);
    const before = fs8.readFileSync(filePath, "utf-8");
    const after = before.replace(/\{\{LAKEBASE_KIT_VERSION\}\}/g, version);
    if (after !== before) fs8.writeFileSync(filePath, after);
  }
}
async function installHooks(targetDir) {
  const scriptsDir = path7.join(targetDir, "scripts");
  const gitHooksDir = path7.join(targetDir, ".git", "hooks");
  if (!fs8.existsSync(path7.join(targetDir, ".git"))) {
    throw new Error(`Not a git repo root: ${targetDir}`);
  }
  fs8.mkdirSync(gitHooksDir, { recursive: true });
  cp2.execSync("git config --local core.hooksPath .git/hooks", {
    cwd: targetDir,
    stdio: "pipe"
  });
  const hookPairs = [
    ["post-checkout.sh", "post-checkout"],
    ["prepare-commit-msg.sh", "prepare-commit-msg"],
    ["pre-push.sh", "pre-push"],
    ["post-merge.sh", "post-merge"]
  ];
  const installed = [];
  for (const [srcName, hookName] of hookPairs) {
    const src = path7.join(scriptsDir, srcName);
    if (!fs8.existsSync(src)) continue;
    const dest = path7.join(gitHooksDir, hookName);
    fs8.copyFileSync(src, dest);
    fs8.chmodSync(dest, 493);
    installed.push(hookName);
  }
  return `Installed hooks: ${installed.join(", ") || "none"}`;
}
function renderEnvFromTemplate(args) {
  const src = path7.join(commonDir(args), ".env.example");
  let content = fs8.readFileSync(src, "utf-8");
  if (args.databricksHost) {
    content = content.replace(/DATABRICKS_HOST=.*/, `DATABRICKS_HOST=${args.databricksHost}`);
  }
  if (args.lakebaseProjectId) {
    content = content.replace(/LAKEBASE_PROJECT_ID=.*/, `LAKEBASE_PROJECT_ID=${args.lakebaseProjectId}`);
  }
  return content;
}
async function deployEnvExample(targetDir, args = {}) {
  fs8.writeFileSync(path7.join(targetDir, ".env.example"), renderEnvFromTemplate(args));
}
async function deployEnv(targetDir, args = {}) {
  fs8.writeFileSync(path7.join(targetDir, ".env"), renderEnvFromTemplate(args));
}
async function deployDeployTargets(targetDir, projectName, opts) {
  const src = path7.join(commonDir(opts), "deploy-targets.yaml");
  const dest = path7.join(targetDir, "deploy-targets.yaml");
  if (!fs8.existsSync(src)) return;
  let content = fs8.readFileSync(src, "utf-8");
  if (projectName) {
    content = content.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
  }
  fs8.writeFileSync(dest, content);
}
async function deployVscodeSettings(targetDir, opts) {
  const src = path7.join(commonDir(opts), ".vscode", "settings.json");
  const destDir = path7.join(targetDir, ".vscode");
  fs8.mkdirSync(destDir, { recursive: true });
  fs8.copyFileSync(src, path7.join(destDir, "settings.json"));
}
async function deployGitignore(targetDir, language = "java", opts) {
  const base = fs8.readFileSync(path7.join(commonDir(opts), ".gitignore.base"), "utf-8");
  const extraPath = path7.join(langDir(language, opts), ".gitignore.extra");
  const extra = fs8.existsSync(extraPath) ? fs8.readFileSync(extraPath, "utf-8") : "";
  fs8.writeFileSync(path7.join(targetDir, ".gitignore"), base + "\n" + extra);
}
async function patchWorkflowsForRunnerType(targetDir, runnerType) {
  const workflowDir = path7.join(targetDir, ".github", "workflows");
  if (runnerType === "github-hosted") {
    for (const file of fs8.existsSync(workflowDir) ? fs8.readdirSync(workflowDir) : []) {
      if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
      const filePath = path7.join(workflowDir, file);
      let content = fs8.readFileSync(filePath, "utf-8");
      content = content.replace(/runs-on: self-hosted/g, "runs-on: ubuntu-latest");
      fs8.writeFileSync(filePath, content);
    }
    return;
  }
  const localJdkStep = [
    "- name: Set up JDK (probe local)",
    "        id: jdk-probe",
    "        if: steps.detect-lang.outputs.lang == 'java'",
    "        run: |",
    "          if command -v java >/dev/null 2>&1 && java -version >/dev/null 2>&1; then",
    '            JH="$(/usr/libexec/java_home 2>/dev/null || dirname $(dirname $(readlink -f $(which java))))"',
    '            echo "JAVA_HOME=$JH" >> $GITHUB_ENV',
    '            echo "local_jdk=found" >> $GITHUB_OUTPUT',
    '            echo "Using local JDK: $JH"',
    "            java -version",
    "          else",
    '            echo "local_jdk=missing" >> $GITHUB_OUTPUT',
    '            echo "No local JDK; will fall back to actions/setup-java in the next step."',
    "          fi",
    "",
    "      - name: Set up JDK (download via actions/setup-java fallback)",
    "        if: steps.detect-lang.outputs.lang == 'java' && steps.jdk-probe.outputs.local_jdk == 'missing'",
    "        uses: actions/setup-java@v4",
    "        with:",
    "          java-version: '25'",
    "          distribution: 'temurin'",
    ""
  ].join("\n");
  for (const file of ["pr.yml", "merge.yml"]) {
    const filePath = path7.join(workflowDir, file);
    if (!fs8.existsSync(filePath)) continue;
    let content = fs8.readFileSync(filePath, "utf-8");
    content = content.replace(
      /- name: Set up JDK\n(?:\s+[\w-]+:.*\n)*\s+uses: actions\/setup-java@v4\n\s+with:\n(?:\s+#[^\n]*\n)*(?:\s+[\w-]+:.*\n)+/g,
      localJdkStep
    );
    fs8.writeFileSync(filePath, content);
  }
}
async function scaffoldStaticAll(args) {
  const report = args.report ?? (() => {
  });
  const language = args.language ?? "java";
  const runnerType = args.runnerType ?? "self-hosted";
  const opts = { templatesDir: args.templatesDir };
  report("Deploying .env.example");
  await deployEnvExample(args.targetDir, {
    ...opts,
    databricksHost: args.databricksHost,
    lakebaseProjectId: args.lakebaseProjectId
  });
  report("Deploying .env");
  await deployEnv(args.targetDir, {
    ...opts,
    databricksHost: args.databricksHost,
    lakebaseProjectId: args.lakebaseProjectId
  });
  report("Deploying .vscode/settings.json");
  await deployVscodeSettings(args.targetDir, opts);
  report("Deploying deploy-targets.yaml");
  await deployDeployTargets(args.targetDir, args.lakebaseProjectId, opts);
  report("Deploying .gitignore", language);
  await deployGitignore(args.targetDir, language, opts);
  report("Deploying scripts/");
  const scripts = await deployScripts(args.targetDir, opts);
  report("Deploying .github/workflows/");
  const workflows = await deployWorkflows(args.targetDir, opts);
  report("Patching workflows for runner type", runnerType);
  await patchWorkflowsForRunnerType(args.targetDir, runnerType);
  report("Installing git hooks");
  const hooksInstalled = await installHooks(args.targetDir);
  let claudeCommands = [];
  if (!args.skipCommands) {
    report("Deploying .claude/commands/");
    const cmd = await deployClaudeCommands(args.targetDir, opts);
    claudeCommands = cmd.written;
  }
  return { scripts, workflows, hooksInstalled, claudeCommands };
}
async function scaffoldAll(args) {
  const report = args.report ?? (() => {
  });
  const language = args.language ?? "java";
  const projectName = args.lakebaseProjectId;
  const staticResult = await scaffoldStaticAll(args);
  report(`Deploying language project (${language})`);
  await deployLanguageProject({
    targetDir: args.targetDir,
    language,
    projectName,
    templatesDir: args.templatesDir,
    initializrClient: args.initializrClient,
    report
  });
  await deployGitignore(args.targetDir, language, { templatesDir: args.templatesDir });
  return staticResult;
}

// scripts/lakebase/long-running-branch.ts
var cp3 = __toESM(require("child_process"), 1);

// scripts/lakebase/branch-create.ts
var import_node_child_process6 = require("child_process");
var import_node_util3 = require("util");

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

// scripts/lakebase/branch-create.ts
var execFileP3 = (0, import_node_util3.promisify)(import_node_child_process6.execFile);
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
    await dbcli5(
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
      await dbcli5(
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
async function dbcli5(args, host) {
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

// scripts/lakebase/long-running-branch.ts
async function createLongRunningBranch(args) {
  const created = await createBranch({
    instance: args.projectId,
    branch: args.name,
    // Long-running tiers (staging, uat, perf, ...) are permanent by
    // definition; without this they'd inherit Lakebase's default
    // expiry and silently disappear.
    noExpiry: true
  });
  const opts = { cwd: args.workTreeDir, stdio: "pipe" };
  cp3.execSync(`git fetch origin ${args.forkFromBranch}`, opts);
  cp3.execSync(`git checkout ${args.forkFromBranch}`, opts);
  cp3.execSync(`git pull --ff-only origin ${args.forkFromBranch}`, opts);
  cp3.execSync(`git branch -f ${args.name} ${args.forkFromBranch}`, opts);
  cp3.execSync(`git push -u origin ${args.name}`, opts);
  cp3.execSync(`git checkout ${args.name}`, opts);
  return {
    lakebaseBranchName: created.name ?? `projects/${args.projectId}/branches/${args.name}`,
    gitBranch: args.name,
    lakebase: created
  };
}

// scripts/lakebase/enable-e2e.ts
var fs10 = __toESM(require("fs"), 1);
var path9 = __toESM(require("path"), 1);

// scripts/lakebase/install-playwright.ts
var fs9 = __toESM(require("fs"), 1);
var path8 = __toESM(require("path"), 1);
var import_node_url4 = require("url");
var cachedTemplatesDir4;
function findTemplatesDir4() {
  if (cachedTemplatesDir4) return cachedTemplatesDir4;
  const here = path8.dirname((0, import_node_url4.fileURLToPath)(importMetaUrl));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = path8.join(dir, "templates", "project");
    if (fs9.existsSync(path8.join(candidate, "common", ".gitignore.base"))) {
      cachedTemplatesDir4 = candidate;
      return cachedTemplatesDir4;
    }
    const parent = path8.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/project tree relative to ${here}. Pass explicit { templatesDir } to override.`
  );
}
function commonDir2(opts) {
  return path8.join(opts?.templatesDir ?? findTemplatesDir4(), "common");
}
var PLAYWRIGHT_TEMPLATE_FILES = [
  "playwright.config.ts",
  path8.join("tests", "e2e", "smoke.spec.ts")
];
function writePlaywrightTemplates(args) {
  const src = commonDir2(args);
  const written = [];
  const skipped = [];
  for (const rel of PLAYWRIGHT_TEMPLATE_FILES) {
    const from = path8.join(src, rel);
    if (!fs9.existsSync(from)) {
      throw new Error(`Kit template missing: ${from}`);
    }
    const to = path8.join(args.projectDir, rel);
    if (fs9.existsSync(to) && !args.force) {
      skipped.push(rel);
      continue;
    }
    fs9.mkdirSync(path8.dirname(to), { recursive: true });
    fs9.copyFileSync(from, to);
    written.push(rel);
  }
  return { written, skipped };
}

// scripts/lakebase/enable-e2e.ts
var PLAYWRIGHT_TEST_VERSION_RANGE = "^1.49.0";
function addPlaywrightToPackageJson(args) {
  const pkgPath = path9.join(args.projectDir, "package.json");
  if (!fs10.existsSync(pkgPath)) {
    return { patched: false, scriptAdded: false, depAdded: false };
  }
  const range = args.versionRange ?? PLAYWRIGHT_TEST_VERSION_RANGE;
  const raw = fs10.readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw);
  const scripts = pkg.scripts ?? {};
  const devDependencies = pkg.devDependencies ?? {};
  let scriptAdded = false;
  if (!scripts["test:e2e"]) {
    scripts["test:e2e"] = "playwright test";
    scriptAdded = true;
  }
  let depAdded = false;
  if (!devDependencies["@playwright/test"]) {
    devDependencies["@playwright/test"] = range;
    depAdded = true;
  }
  pkg.scripts = scripts;
  pkg.devDependencies = devDependencies;
  if (scriptAdded || depAdded) {
    const trailingNewline = raw.endsWith("\n") ? "\n" : "";
    fs10.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + trailingNewline, "utf8");
  }
  return { patched: true, scriptAdded, depAdded };
}
var RUN_TESTS_E2E_MARKER = "# FEIP-7094: run Playwright E2E suite when configured";
function addE2eToRunTestsScript(args) {
  const scriptPath = path9.join(args.projectDir, "scripts", "run-tests.sh");
  if (!fs10.existsSync(scriptPath)) {
    return { patched: false, inserted: false };
  }
  const original = fs10.readFileSync(scriptPath, "utf8");
  if (original.includes(RUN_TESTS_E2E_MARKER)) {
    return { patched: true, inserted: false };
  }
  const trimmed = original.replace(/\n+$/, "\n");
  const block = [
    "",
    RUN_TESTS_E2E_MARKER,
    'if [ -f "$REPO_ROOT/playwright.config.ts" ] || [ -f "$REPO_ROOT/playwright.config.js" ]; then',
    '  echo "Running Playwright E2E tests..."',
    '  if [ -f "$REPO_ROOT/package.json" ] && command -v npm >/dev/null 2>&1; then',
    '    (cd "$REPO_ROOT" && npm run test:e2e)',
    "  else",
    '    (cd "$REPO_ROOT" && npx --yes playwright test)',
    "  fi",
    "fi",
    ""
  ].join("\n");
  fs10.writeFileSync(scriptPath, trimmed + block, "utf8");
  return { patched: true, inserted: true };
}
function enableE2eForProject(args) {
  const rootPkg = path9.join(args.projectDir, "package.json");
  if (!fs10.existsSync(rootPkg)) {
    return {
      templatesWritten: [],
      // Same shape as writePlaywrightTemplates would have returned; the
      // template paths show up under skipped with the npm-wiring caveat
      // captured in packageJson.patched=false.
      templatesSkipped: [...PLAYWRIGHT_TEMPLATE_FILES],
      packageJson: { patched: false, scriptAdded: false, depAdded: false },
      runTestsScript: addE2eToRunTestsScript({ projectDir: args.projectDir })
    };
  }
  const templates = writePlaywrightTemplates({
    projectDir: args.projectDir,
    force: args.force,
    templatesDir: args.templatesDir
  });
  const packageJson = addPlaywrightToPackageJson({
    projectDir: args.projectDir,
    versionRange: args.versionRange
  });
  const runTestsScript = addE2eToRunTestsScript({ projectDir: args.projectDir });
  return {
    templatesWritten: templates.written,
    templatesSkipped: templates.skipped,
    packageJson,
    runTestsScript
  };
}

// scripts/lakebase/enable-infra.ts
var fs11 = __toESM(require("fs"), 1);
var path10 = __toESM(require("path"), 1);
var RUN_TESTS_INFRA_MARKER = "# Run Lakebase [Infra]-tag suite when wired";
function addInfraToPackageJson(args) {
  const pkgPath = path10.join(args.projectDir, "package.json");
  if (!fs11.existsSync(pkgPath)) {
    return { patched: false, scriptAdded: false };
  }
  const scriptValue = args.scriptValue ?? "npx --yes lakebase-infra-runner";
  const raw = fs11.readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw);
  const scripts = pkg.scripts ?? {};
  let scriptAdded = false;
  if (!scripts["test:infra"]) {
    scripts["test:infra"] = scriptValue;
    scriptAdded = true;
  }
  pkg.scripts = scripts;
  if (scriptAdded) {
    const trailing = raw.endsWith("\n") ? "\n" : "";
    fs11.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + trailing, "utf8");
  }
  return { patched: true, scriptAdded };
}
function addInfraToRunTestsScript(args) {
  const scriptPath = path10.join(args.projectDir, "scripts", "run-tests.sh");
  if (!fs11.existsSync(scriptPath)) {
    return { patched: false, inserted: false };
  }
  const original = fs11.readFileSync(scriptPath, "utf8");
  if (original.includes(RUN_TESTS_INFRA_MARKER)) {
    return { patched: true, inserted: false };
  }
  const trimmed = original.replace(/\n+$/, "\n");
  const block = [
    "",
    RUN_TESTS_INFRA_MARKER,
    'if [ -f "$REPO_ROOT/package.json" ] && command -v npm >/dev/null 2>&1; then',
    `  if node -e "process.exit(!(require('./package.json').scripts && require('./package.json').scripts['test:infra']))" 2>/dev/null; then`,
    '    echo "Running Lakebase [Infra] suite..."',
    '    (cd "$REPO_ROOT" && npm run test:infra)',
    "  fi",
    "fi",
    ""
  ].join("\n");
  fs11.writeFileSync(scriptPath, trimmed + block, "utf8");
  return { patched: true, inserted: true };
}
function enableInfraForProject(args) {
  const packageJson = addInfraToPackageJson({
    projectDir: args.projectDir,
    scriptValue: args.scriptValue
  });
  const runTestsScript = addInfraToRunTestsScript({ projectDir: args.projectDir });
  return { packageJson, runTestsScript };
}

// scripts/lakebase/runner-setup.ts
var fs12 = __toESM(require("fs"), 1);
var os = __toESM(require("os"), 1);
var path11 = __toESM(require("path"), 1);
var cp4 = __toESM(require("child_process"), 1);
var tar = __toESM(require("tar"), 1);
var import_find_java_home = __toESM(require("find-java-home"), 1);
var import_tree_kill = __toESM(require("tree-kill"), 1);

// scripts/github/runner.ts
var import_octokit2 = require("octokit");
var GitHubRunnerError = class extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.name = "GitHubRunnerError";
    this.status = status;
  }
};
async function getOctokit() {
  const token = await resolveGitHubToken();
  return new import_octokit2.Octokit({ auth: token });
}
function wrap2(err, context) {
  if (err instanceof import_octokit2.RequestError) {
    throw new GitHubRunnerError(`${context}: ${err.message}`, err.status);
  }
  if (err instanceof Error) {
    throw new GitHubRunnerError(`${context}: ${err.message}`);
  }
  throw new GitHubRunnerError(context);
}
async function createRegistrationToken(ownerRepo) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const octokit2 = await getOctokit();
    const { data } = await octokit2.rest.actions.createRegistrationTokenForRepo({ owner, repo });
    if (!data.token) {
      throw new GitHubRunnerError("Registration token missing from GitHub response");
    }
    return data.token;
  } catch (err) {
    if (err instanceof GitHubRunnerError) throw err;
    if (err instanceof import_octokit2.RequestError && err.status === 404) {
      throw new GitHubRunnerError(
        `GitHub returned 404 for "${ownerRepo}". The signed-in user can't see this repo \u2013 it's likely private and owned by a different account. Sign in to GitHub as the repo owner (or set GITHUB_TOKEN to a token with access) and retry.`,
        404
      );
    }
    wrap2(err, "Failed to create runner registration token");
  }
}
async function listRepoRunners(ownerRepo) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const octokit2 = await getOctokit();
    const { data } = await octokit2.rest.actions.listSelfHostedRunnersForRepo({ owner, repo });
    return (data.runners ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status
    }));
  } catch (err) {
    wrap2(err, `Failed to list runners for "${ownerRepo}"`);
  }
}
async function getRunnerIdByName(ownerRepo, runnerName2) {
  const runners = await listRepoRunners(ownerRepo);
  return runners.find((r) => r.name === runnerName2)?.id;
}
async function getRunnerStatus(ownerRepo, runnerName2) {
  const runners = await listRepoRunners(ownerRepo);
  return runners.find((r) => r.name === runnerName2)?.status;
}

// scripts/lakebase/runner-setup.ts
var RUNNER_VERSION = "2.333.1";
var RUNNER_ARCH = process.arch === "arm64" ? "arm64" : "x64";
var RUNNER_OS = process.platform === "darwin" ? "osx" : "linux";
var RUNNER_ARCHIVE = `actions-runner-${RUNNER_OS}-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz`;
var RUNNER_URL = `https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_ARCHIVE}`;
function cacheDir() {
  return path11.join(os.homedir(), ".cache", "github-actions-runner");
}
function runnersDir() {
  return path11.join(os.homedir(), ".lakebase", "runners");
}
function runnerDir(projectName) {
  return path11.join(runnersDir(), projectName);
}
function runnerName(projectName) {
  return `lakebase-${projectName}`;
}
async function ensureCachedArchive() {
  const dir = cacheDir();
  fs12.mkdirSync(dir, { recursive: true });
  const cachedPath = path11.join(dir, RUNNER_ARCHIVE);
  if (fs12.existsSync(cachedPath)) return cachedPath;
  const response = await fetch(RUNNER_URL);
  if (!response.ok) {
    throw new Error(`Failed to download runner: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs12.writeFileSync(cachedPath, buffer);
  return cachedPath;
}
async function resolveJavaHome() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  return new Promise((resolve2) => {
    (0, import_find_java_home.default)((err, javaHome) => resolve2(err ? void 0 : javaHome));
  });
}
var lastRunnerPid;
function stopRunner(projectName) {
  const dir = runnerDir(projectName);
  const pidFile = path11.join(dir, ".pid");
  let pid = lastRunnerPid;
  if (fs12.existsSync(pidFile)) {
    pid = parseInt(fs12.readFileSync(pidFile, "utf-8").trim(), 10);
    try {
      fs12.unlinkSync(pidFile);
    } catch {
    }
  }
  if (pid) {
    try {
      (0, import_tree_kill.default)(pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
      }
    }
  } else if (fs12.existsSync(dir)) {
    try {
      cp4.execSync(`pkill -9 -f "${dir.replace(/\//g, "\\/")}.*Runner" 2>/dev/null || true`, {
        timeout: KIT_TIMEOUTS.cmdShort
      });
    } catch {
    }
  }
  lastRunnerPid = void 0;
  for (const stale of ["_diag/pages", "_work/_temp", "_work/_actions"]) {
    const full = path11.join(dir, stale);
    if (fs12.existsSync(full)) {
      try {
        fs12.rmSync(full, { recursive: true, force: true });
      } catch {
      }
    }
  }
  try {
    fs12.mkdirSync(path11.join(dir, "_diag", "pages"), { recursive: true });
  } catch {
  }
}
function resetRunnerConfig(dir, projectName) {
  const stateFiles = [
    ".runner",
    ".credentials",
    ".credentials_rsaparams",
    ".path",
    ".service",
    "svc.sh",
    ".runner_migrated"
  ];
  for (const f of stateFiles) {
    try {
      fs12.unlinkSync(path11.join(dir, f));
    } catch {
    }
  }
  if (process.platform === "darwin") {
    const plist = path11.join(
      os.homedir(),
      "Library",
      "LaunchAgents",
      `actions.runner.${projectName}.plist`
    );
    if (fs12.existsSync(plist)) {
      try {
        cp4.execFileSync("launchctl", ["unload", plist], { stdio: "ignore" });
      } catch {
      }
      try {
        fs12.unlinkSync(plist);
      } catch {
      }
    }
  }
}
async function setupRunner(args) {
  const report = args.report ?? (() => {
  });
  const dir = runnerDir(args.projectName);
  const name = runnerName(args.projectName);
  stopRunner(args.projectName);
  report("Downloading runner binary...");
  const archive = await ensureCachedArchive();
  fs12.mkdirSync(dir, { recursive: true });
  if (!fs12.existsSync(path11.join(dir, "config.sh"))) {
    report("Extracting runner...");
    await tar.extract({ file: archive, cwd: dir });
  }
  const diagPages = path11.join(dir, "_diag", "pages");
  if (fs12.existsSync(diagPages)) {
    fs12.rmSync(diagPages, { recursive: true, force: true });
    fs12.mkdirSync(diagPages, { recursive: true });
  }
  const runnerFile = path11.join(dir, ".runner");
  let needsConfig = !fs12.existsSync(runnerFile);
  if (needsConfig) {
    resetRunnerConfig(dir, args.projectName);
  } else {
    let urlMismatch = false;
    try {
      const runnerJson = JSON.parse(fs12.readFileSync(runnerFile, "utf-8"));
      const configuredUrl = runnerJson.gitHubUrl || runnerJson.serverUrl || runnerJson.agentUrl || "";
      const expectedUrl = `https://github.com/${args.fullRepoName}`;
      urlMismatch = !!configuredUrl && !configuredUrl.startsWith(expectedUrl);
    } catch {
      urlMismatch = true;
    }
    if (urlMismatch) {
      report("Runner configured against a different repo \u2013 resetting...");
      resetRunnerConfig(dir, args.projectName);
      needsConfig = true;
    } else {
      try {
        const id = await getRunnerIdByName(args.fullRepoName, name);
        if (!id) {
          report("Runner registration stale \u2013 reconfiguring...");
          resetRunnerConfig(dir, args.projectName);
          needsConfig = true;
        } else {
          report("Runner already configured \u2013 restarting...");
        }
      } catch {
        report("Could not verify runner \u2013 reconfiguring...");
        resetRunnerConfig(dir, args.projectName);
        needsConfig = true;
      }
    }
  }
  if (needsConfig) {
    report("Registering runner with GitHub...");
    const regToken = await createRegistrationToken(args.fullRepoName);
    cp4.execSync(
      `./config.sh --url "https://github.com/${args.fullRepoName}" --token "${regToken}" --name "${name}" --labels self-hosted --unattended --replace`,
      { cwd: dir, timeout: KIT_TIMEOUTS.cliLong }
    );
  }
  report("Starting runner...");
  const env = { ...process.env };
  const javaHome = await resolveJavaHome();
  if (javaHome && !env.JAVA_HOME) env.JAVA_HOME = javaHome;
  const child = cp4.spawn("./run.sh", [], {
    cwd: dir,
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env
  });
  child.unref();
  lastRunnerPid = child.pid;
  if (child.pid) {
    fs12.writeFileSync(path11.join(dir, ".pid"), String(child.pid));
  }
  report("Waiting for runner to come online...");
  let online = false;
  for (let i = 0; i < 12; i++) {
    try {
      const status = await getRunnerStatus(args.fullRepoName, name);
      if (status === "online") {
        online = true;
        break;
      }
    } catch {
    }
    await delay(5e3);
  }
  if (!online) {
    throw new Error(`Runner "${name}" did not come online within 60 seconds`);
  }
  report("Runner is online.");
  return { name, dir, pid: child.pid, online: true };
}

// scripts/github/secrets.ts
var import_octokit3 = require("octokit");
var import_tweetsodium = __toESM(require("tweetsodium"), 1);
var GitHubSecretsError = class extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.name = "GitHubSecretsError";
    this.status = status;
  }
};
async function getOctokit2() {
  const token = await resolveGitHubToken();
  return new import_octokit3.Octokit({ auth: token });
}
function wrap3(err, context) {
  if (err instanceof import_octokit3.RequestError) {
    throw new GitHubSecretsError(`${context}: ${err.message}`, err.status);
  }
  if (err instanceof Error) {
    throw new GitHubSecretsError(`${context}: ${err.message}`);
  }
  throw new GitHubSecretsError(context);
}
function encryptSecret(publicKey, secretValue) {
  const keyBytes = Buffer.from(publicKey, "base64");
  const messageBytes = Buffer.from(secretValue);
  const encryptedBytes = import_tweetsodium.default.seal(messageBytes, keyBytes);
  return Buffer.from(encryptedBytes).toString("base64");
}
async function setRepoSecret(ownerRepo, secretName, secretValue) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const octokit2 = await getOctokit2();
    const { data: keyData } = await octokit2.rest.actions.getRepoPublicKey({ owner, repo });
    const encryptedValue = encryptSecret(keyData.key, secretValue);
    await octokit2.rest.actions.createOrUpdateRepoSecret({
      owner,
      repo,
      secret_name: secretName,
      encrypted_value: encryptedValue,
      key_id: keyData.key_id
    });
  } catch (err) {
    if (err instanceof GitHubSecretsError) throw err;
    wrap3(err, `Failed to set secret ${secretName} on ${ownerRepo}`);
  }
}
async function setRepoSecrets(ownerRepo, secrets) {
  for (const [name, value] of Object.entries(secrets)) {
    if (!value) {
      throw new GitHubSecretsError(`Missing value for secret ${name}`);
    }
  }
  for (const [name, value] of Object.entries(secrets)) {
    await setRepoSecret(ownerRepo, name, value);
  }
}

// scripts/git/remote.ts
async function getGitHubUrl(cwd) {
  try {
    const url = (await exec2("git remote get-url origin", { cwd, timeout: 5e3 })).trim();
    return url.replace(/\.git$/, "").replace(/^git@github\.com:/, "https://github.com/").replace(/^ssh:\/\/git@github\.com\//, "https://github.com/");
  } catch {
    return "";
  }
}
async function getOwnerRepo(cwd) {
  const url = await getGitHubUrl(cwd);
  if (!url) return "";
  try {
    const { owner, repo } = parseOwnerRepo(url);
    return formatOwnerRepo(owner, repo);
  } catch {
    return "";
  }
}

// scripts/util/ci-secrets.ts
async function syncCiSecrets(args) {
  const lifetime = args.lifetimeSeconds ?? 86400;
  const comment = args.comment ?? "GitHub Actions CI";
  const ownerRepo = args.ownerRepo ?? await getOwnerRepo(args.projectDir);
  if (!ownerRepo) {
    throw new Error("Could not resolve GitHub repository from git remote");
  }
  if (!args.databricksHost) {
    throw new Error("syncCiSecrets: databricksHost is required");
  }
  if (!args.lakebaseProjectId) {
    throw new Error("syncCiSecrets: lakebaseProjectId is required");
  }
  const secrets = {
    DATABRICKS_HOST: args.databricksHost,
    LAKEBASE_PROJECT_ID: args.lakebaseProjectId
  };
  try {
    const tokenRaw = await exec2(
      `databricks tokens create --comment "${comment}" --lifetime-seconds ${lifetime} -o json`,
      { cwd: args.projectDir, timeout: 3e4, env: { DATABRICKS_HOST: args.databricksHost } }
    );
    const parsed = JSON.parse(tokenRaw);
    const token = parsed.token_value || parsed.token || "";
    if (token) secrets.DATABRICKS_TOKEN = token;
  } catch {
  }
  await setRepoSecrets(ownerRepo, secrets);
}

// scripts/lakebase/scm-workflow-state.ts
var fs13 = __toESM(require("fs"), 1);
var path12 = __toESM(require("path"), 1);
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
  return path12.join(projectDir, STATE_FILE_REL);
}
function writeWorkflowState(projectDir, state) {
  const result = validateWorkflowState(state);
  if (!result.ok) {
    const summary = result.errors.map((e) => `  - ${e.path}: ${e.message}`).join("\n");
    throw new Error(`Refusing to write invalid SCM state:
${summary}`);
  }
  const dir = path12.join(projectDir, ".lakebase");
  fs13.mkdirSync(dir, { recursive: true });
  const target = stateFilePath(projectDir);
  const tmp = `${target}.tmp`;
  const ordered = orderForOutput(result.value);
  fs13.writeFileSync(tmp, `${JSON.stringify(ordered, null, 2)}
`, "utf8");
  fs13.renameSync(tmp, target);
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

// scripts/lakebase/create-project.ts
async function createProject(input, progress) {
  const report = progress ?? (() => {
  });
  const projectDir = path13.join(input.parentDir, input.projectName);
  const lakebaseProjectId = input.projectName;
  const host = input.databricksHost.replace(/\/+$/, "");
  const useGithub = input.createGithubRepo !== false;
  const language = input.language ?? "java";
  const runnerType = input.runnerType ?? "self-hosted";
  const enableTdd = input.enableTdd !== false;
  const enableE2e = input.enableE2e !== void 0 ? input.enableE2e : language === "nodejs";
  const enableInfra = input.enableInfra !== void 0 ? input.enableInfra : language === "nodejs";
  const skipCommands = input.skipCommands === true;
  const tiers = input.tiers;
  const warnings = [];
  if (useGithub && !input.githubOwner) {
    throw new Error("GitHub owner is required when creating a GitHub repository");
  }
  const fullRepoName = input.githubOwner ? `${input.githubOwner}/${input.projectName}` : "";
  if (useGithub) {
    report("Creating GitHub repository...", fullRepoName);
    await createRepo(fullRepoName, {
      private: input.privateRepo !== false,
      description: `Lakebase project: ${input.projectName}`
    });
    report("Waiting for GitHub repo to be visible...", fullRepoName);
    const probeDelays = [1e3, 2e3, 3e3, 5e3, 8e3];
    let probeErr = "";
    let visible = false;
    for (const waitMs of probeDelays) {
      try {
        await getRepoFullName(fullRepoName);
        visible = true;
        break;
      } catch (err) {
        probeErr = err instanceof Error ? err.message : String(err);
        await delay(waitMs);
      }
    }
    if (!visible) {
      let activeUser = "";
      try {
        activeUser = await getCurrentUser();
      } catch {
      }
      const samlHint = /SAML|scope does not match|sso/i.test(probeErr) ? "\n\nThe error mentions SAML \u2013 re-sign in to GitHub and authorize SSO for this org." : "";
      const userHint = activeUser && activeUser !== input.githubOwner ? `

Note: signed in as "${activeUser}", but the repo was created under "${input.githubOwner}".` : "";
      throw new Error(
        `GitHub repo "${fullRepoName}" was created but isn't visible after ~19s of polling.${samlHint}${userHint}

Last probe error:
  ${probeErr.split("\n")[0].slice(0, 200)}`
      );
    }
    report("Cloning repository...", projectDir);
    await cloneRepo({
      repoUrl: `https://github.com/${fullRepoName}.git`,
      parentDir: input.parentDir
    });
  } else {
    report("Creating local project directory...", projectDir);
    if (fs14.existsSync(projectDir)) {
      throw new Error(`Directory already exists: ${projectDir}`);
    }
    fs14.mkdirSync(projectDir, { recursive: true });
    await gitInit(projectDir);
  }
  report("Creating Lakebase database...", lakebaseProjectId);
  await createLakebaseProject({ projectId: lakebaseProjectId, host });
  report("Resolving database endpoint...");
  const defaultBranchId = await getDefaultBranchId({
    projectId: lakebaseProjectId,
    host
  });
  report("Scaffolding project files...");
  await scaffoldAll({
    targetDir: projectDir,
    databricksHost: host,
    lakebaseProjectId,
    language,
    runnerType,
    skipCommands,
    report: (m, d) => report(m, d)
  });
  if (enableTdd) {
    report("Scaffolding .tdd/ workflow directory...");
    layDownTddScaffold(projectDir);
  }
  if (enableE2e) {
    report("Wiring Playwright E2E support...");
    const e2e = enableE2eForProject({ projectDir });
    if (e2e.templatesWritten.length > 0) {
      report(`  wrote ${e2e.templatesWritten.length} Playwright template(s)`);
    }
    if (e2e.packageJson.patched && (e2e.packageJson.scriptAdded || e2e.packageJson.depAdded)) {
      report("  patched package.json (test:e2e + @playwright/test)");
    } else if (!e2e.packageJson.patched) {
      report("  package.json absent, skipped npm wiring (non-Node project)");
    }
    if (e2e.runTestsScript.inserted) {
      report("  patched scripts/run-tests.sh");
    }
  }
  if (enableInfra) {
    report("Wiring [Infra]-tag runner support...");
    const infra = enableInfraForProject({ projectDir });
    if (infra.packageJson.patched && infra.packageJson.scriptAdded) {
      report("  patched package.json (test:infra)");
    } else if (!infra.packageJson.patched) {
      report("  package.json absent, skipped npm wiring (non-Node project)");
    }
    if (infra.runTestsScript.inserted) {
      report("  patched scripts/run-tests.sh (infra block)");
    }
  }
  if (useGithub) {
    report("Setting up CI auth (service principal)...");
    try {
      await syncCiSecrets({
        projectDir,
        databricksHost: host,
        lakebaseProjectId,
        comment: "GitHub Actions CI",
        lifetimeSeconds: 86400,
        ownerRepo: fullRepoName
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`CI auth setup failed: ${msg}`);
      report(`Warning: CI auth setup failed (${msg})`);
    }
  }
  if (useGithub && runnerType === "self-hosted") {
    report("Setting up self-hosted runner...");
    try {
      await setupRunner({
        fullRepoName,
        projectName: input.projectName,
        report: (m) => report(m)
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Runner setup failed: ${msg}`);
      report(`Warning: runner setup failed (${msg}). CI workflows will queue until a runner is available.`);
    }
  } else if (useGithub) {
    report("Using GitHub-hosted runners \u2013 no local runner needed.");
  } else {
    report("Skipping runner setup (no GitHub repository).");
  }
  const langLabels = {
    java: "Java/Spring Boot",
    kotlin: "Kotlin/Spring Boot",
    python: "Python/FastAPI",
    nodejs: "Node.js/Express"
  };
  const langLabel = langLabels[language] ?? language;
  report("Creating initial commit...");
  await commitAndPush({
    projectDir,
    message: `Initial project scaffold (${langLabel} + Lakebase)`,
    push: useGithub
  });
  if (tiers === 2 || tiers === 3) {
    if (!useGithub) {
      warnings.push(
        `tiers === ${tiers} requires a GitHub repository (createLongRunningBranch pushes the tier's git side to origin). Extra tiers were NOT cut.`
      );
    } else {
      report(`Cutting staging tier (tiers=${tiers}) via createLongRunningBranch...`);
      try {
        await createLongRunningBranch({
          name: "staging",
          forkFromBranch: "main",
          projectId: lakebaseProjectId,
          workTreeDir: projectDir,
          databricksHost: host
        });
      } catch (err) {
        warnings.push(
          `tiers === ${tiers} requested but createLongRunningBranch for staging failed: ${err instanceof Error ? err.message : String(err)}.`
        );
      }
      if (tiers === 3) {
        report("Cutting dev tier (tiers=3) via createLongRunningBranch (off staging)...");
        try {
          await createLongRunningBranch({
            name: "dev",
            forkFromBranch: "staging",
            projectId: lakebaseProjectId,
            workTreeDir: projectDir,
            databricksHost: host
          });
        } catch (err) {
          warnings.push(
            `tiers === 3 requested but createLongRunningBranch for dev failed: ${err instanceof Error ? err.message : String(err)}.`
          );
        }
      }
    }
  }
  try {
    writeWorkflowState(
      projectDir,
      initWorkflowState({
        projectId: lakebaseProjectId,
        tierTopology: tiers ?? 1
      })
    );
  } catch (err) {
    warnings.push(
      `SCM workflow-state seed failed (advisory): ${err instanceof Error ? err.message : String(err)}. Run lakebase-scm-state to inspect.`
    );
  }
  report("Verifying project...");
  const health = verifyProject(projectDir);
  for (const w of health.warnings) {
    warnings.push(w);
    report(`Warning: ${w}`);
  }
  report("Project created successfully!");
  return {
    projectDir,
    githubRepoUrl: useGithub ? `https://github.com/${fullRepoName}` : void 0,
    lakebaseProjectId,
    lakebaseDefaultBranch: defaultBranchId,
    warnings
  };
}
function layDownTddScaffold(targetDir) {
  const candidates = [
    path13.resolve(__dirname, "../../templates/tdd-bootstrap/.tdd"),
    path13.resolve(__dirname, "../../../templates/tdd-bootstrap/.tdd")
  ];
  const source = candidates.find((c) => fs14.existsSync(c));
  if (!source) {
    throw new Error(`tdd-bootstrap template not found; looked in: ${candidates.join(", ")}`);
  }
  const dest = path13.join(targetDir, ".tdd");
  if (fs14.existsSync(dest)) {
    return;
  }
  fs14.cpSync(source, dest, { recursive: true });
}

// scripts/lakebase/schema-migrate.ts
var fs20 = __toESM(require("fs"), 1);
var path20 = __toESM(require("path"), 1);

// scripts/lakebase/adapters/alembic-adapter.ts
var fs16 = __toESM(require("fs"), 1);
var path15 = __toESM(require("path"), 1);

// scripts/lakebase/schema-migrate-runners/alembic.ts
var import_node_child_process7 = require("child_process");
var fs15 = __toESM(require("fs"), 1);
var path14 = __toESM(require("path"), 1);
function resolveAlembicBin(projectDir) {
  const candidates = [
    path14.join(projectDir, ".venv", "bin", "alembic"),
    path14.join(projectDir, "venv", "bin", "alembic")
  ];
  for (const candidate of candidates) {
    try {
      if (fs15.existsSync(candidate)) return candidate;
    } catch {
    }
  }
  return "alembic";
}
function runAlembic(ctx, args) {
  return new Promise((resolve2, reject) => {
    const bin = resolveAlembicBin(ctx.projectDir);
    const child = (0, import_node_child_process7.spawn)(bin, args, {
      cwd: ctx.projectDir,
      env: { ...process.env, DATABASE_URL: ctx.dsn },
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
    path15.join(projectDir, "migrations", "versions"),
    path15.join(projectDir, "alembic", "versions")
  ];
  return candidates.find((p) => fs16.existsSync(p));
}
function listAlembicFiles(projectDir) {
  const dir = findVersionsDir(projectDir);
  if (!dir) return [];
  const files = fs16.readdirSync(dir).filter((f) => f.endsWith(".py") && !f.startsWith("__"));
  return files.map((filename) => {
    const stem = filename.replace(/\.py$/, "");
    const sep = stem.indexOf("_");
    const version = sep === -1 ? stem : stem.slice(0, sep);
    const description = sep === -1 ? "" : stem.slice(sep + 1).replace(/_/g, " ");
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
    if (fs16.existsSync(path15.join(projectDir, "alembic.ini"))) return true;
    if (fs16.existsSync(path15.join(projectDir, "migrations", "env.py"))) return true;
    if (fs16.existsSync(path15.join(projectDir, "alembic", "env.py"))) return true;
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
  }
  // baseline intentionally absent in slice 3. Alembic exposes `stamp`
  // as the equivalent operation; deferred to a follow-up.
};
registerSchemaMigrationAdapter(AlembicAdapter);

// scripts/lakebase/adapters/flyway-adapter.ts
var fs17 = __toESM(require("fs"), 1);
var path17 = __toESM(require("path"), 1);

// scripts/lakebase/schema-migrate-runners/flyway.ts
var import_node_child_process8 = require("child_process");
var path16 = __toESM(require("path"), 1);
function dsnToFlywayEnv(dsn) {
  const u = new URL(dsn);
  const user = decodeURIComponent(u.username);
  const password = decodeURIComponent(u.password);
  const portPart = u.port ? `:${u.port}` : "";
  const url = `jdbc:postgresql://${u.hostname}${portPart}${u.pathname}${u.search}`;
  return { url, user, password };
}
function migrationsLocation(projectDir) {
  return `filesystem:${path16.join(projectDir, "src", "main", "resources", "db", "migration")}`;
}
function runFlyway(ctx, args) {
  const { url, user, password } = dsnToFlywayEnv(ctx.dsn);
  return new Promise((resolve2, reject) => {
    const child = (0, import_node_child_process8.spawn)(
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
      const filename = m.filepath ? path16.basename(m.filepath) : `V${m.version}__migration.sql`;
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
  const dir = path17.join(projectDir, "src", "main", "resources", "db", "migration");
  if (!fs17.existsSync(dir)) return [];
  const files = fs17.readdirSync(dir).filter((f) => /^V\d+(\.\d+)*__.+\.sql$/.test(f));
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
    return fs17.existsSync(path17.join(projectDir, "pom.xml"));
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
  }
  // baseline intentionally absent. Flyway DOES support baseline at the
  // tool level, but exposing it cleanly requires plumbing flags into the
  // existing runner. Deferred to a follow-up slice; the adapter's
  // optional-protocol shape makes this additive.
};
registerSchemaMigrationAdapter(FlywayAdapter);

// scripts/lakebase/adapters/knex-adapter.ts
var fs19 = __toESM(require("fs"), 1);
var path19 = __toESM(require("path"), 1);

// scripts/lakebase/schema-migrate-runners/knex.ts
var import_node_child_process9 = require("child_process");
var fs18 = __toESM(require("fs"), 1);
var path18 = __toESM(require("path"), 1);
var KNEXFILE_VARIANTS = ["knexfile.js", "knexfile.ts", "knexfile.mjs", "knexfile.cjs"];
function findKnexfile(projectDir) {
  for (const name of KNEXFILE_VARIANTS) {
    const p = path18.join(projectDir, name);
    if (fs18.existsSync(p)) return p;
  }
  return void 0;
}
function runKnex(ctx, args) {
  return new Promise((resolve2, reject) => {
    const knexfile = findKnexfile(ctx.projectDir);
    if (!knexfile) {
      reject(
        new SchemaMigrationError(
          `No knexfile found in ${ctx.projectDir}. Expected one of: ${KNEXFILE_VARIANTS.join(", ")}.`
        )
      );
      return;
    }
    const child = (0, import_node_child_process9.spawn)("npx", ["--no-install", "knex", "--knexfile", knexfile, ...args], {
      cwd: ctx.projectDir,
      env: { ...process.env, DATABASE_URL: ctx.dsn },
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
  const dir = path19.join(projectDir, "migrations");
  if (!fs19.existsSync(dir)) return [];
  const files = fs19.readdirSync(dir).filter((f) => (f.endsWith(".js") || f.endsWith(".ts")) && !f.startsWith("."));
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
    return KNEXFILE_VARIANTS2.some((name) => fs19.existsSync(path19.join(projectDir, name)));
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
  }
  // baseline intentionally absent. Knex has no native baseline concept;
  // omitting it advertises that correctly via the optional-capability
  // protocol so callers won't attempt the operation.
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
  if (fs20.existsSync(path20.join(projectDir, "pom.xml"))) {
    return "java";
  }
  if (fs20.existsSync(path20.join(projectDir, "pyproject.toml")) || fs20.existsSync(path20.join(projectDir, "requirements.txt")) || fs20.existsSync(path20.join(projectDir, "alembic.ini"))) {
    return "python";
  }
  if (fs20.existsSync(path20.join(projectDir, "package.json"))) {
    return "nodejs";
  }
  throw new SchemaMigrationError(
    `Could not detect project language in ${projectDir}. Expected one of: pom.xml (java/kotlin), pyproject.toml or alembic.ini (python), package.json (nodejs). Pass {language} explicitly to override.`
  );
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
  const dir = path20.join(projectDir, "src", "main", "resources", "db", "migration");
  if (!fs20.existsSync(dir)) return [];
  const files = fs20.readdirSync(dir).filter((f) => /^V\d+(\.\d+)*__.+\.sql$/.test(f));
  return files.map((filename) => {
    const m = filename.match(/^V(\d+(?:\.\d+)*)__(.+)\.sql$/);
    const version = m[1];
    const description = m[2].replace(/_/g, " ");
    return { version, filename, description, type: "SQL", tool: "flyway" };
  }).sort((a, b) => versionCompare2(a.version, b.version));
}
function listAlembicMigrations(projectDir) {
  const candidates = [
    path20.join(projectDir, "migrations", "versions"),
    path20.join(projectDir, "alembic", "versions")
  ];
  const dir = candidates.find((p) => fs20.existsSync(p));
  if (!dir) return [];
  const files = fs20.readdirSync(dir).filter((f) => f.endsWith(".py") && !f.startsWith("__"));
  return files.map((filename) => {
    const stem = filename.replace(/\.py$/, "");
    const sep = stem.indexOf("_");
    const version = sep === -1 ? stem : stem.slice(0, sep);
    const description = sep === -1 ? "" : stem.slice(sep + 1).replace(/_/g, " ");
    return { version, filename, description, type: "Python", tool: "alembic" };
  }).sort((a, b) => a.filename.localeCompare(b.filename));
}
function listKnexMigrations(projectDir) {
  const dir = path20.join(projectDir, "migrations");
  if (!fs20.existsSync(dir)) return [];
  const files = fs20.readdirSync(dir).filter((f) => (f.endsWith(".js") || f.endsWith(".ts")) && !f.startsWith("."));
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
async function applySchemaMigrations(args) {
  const projectDir = args.projectDir ?? process.cwd();
  const adapter = adapterFor(projectDir, args.language);
  const r = await adapter.apply({
    instance: args.instance,
    branch: args.branch,
    projectDir,
    database: args.database,
    endpointName: args.endpointName
  });
  if (r.status === "error") {
    throw new SchemaMigrationError(r.error ?? "apply failed");
  }
  return {
    applied: r.applied_migrations,
    alreadyAtLatest: r.status === "noop",
    tool: adapter.id
  };
}
async function rollbackSchemaMigration(args) {
  const projectDir = args.projectDir ?? process.cwd();
  const adapter = adapterFor(projectDir, args.language);
  if (!adapter.rollback) {
    throw new SchemaMigrationError(
      `Adapter '${adapter.id}' does not support rollback. (Flyway Community Edition has no \`undo\`; other adapters may omit rollback by design.)`
    );
  }
  const r = await adapter.rollback({
    instance: args.instance,
    branch: args.branch,
    projectDir,
    target: args.target,
    database: args.database,
    endpointName: args.endpointName
  });
  if (r.status === "error") {
    throw new SchemaMigrationError(r.error ?? "rollback failed");
  }
  return {
    rolledBack: r.rolled_back,
    tool: adapter.id
  };
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

// scripts/tdd/feature-status.ts
var import_fs6 = require("fs");
var import_path6 = require("path");

// scripts/tdd/test-list.ts
var import_fs = require("fs");
var import_path = require("path");
function readMasterTestList(tddDir, featureId) {
  const dir = findFeatureDir(tddDir, featureId);
  const file = (0, import_path.join)(dir, "test-list.json");
  if (!(0, import_fs.existsSync)(file)) {
    throw new Error(`master test-list.json not found for ${featureId} at ${file}`);
  }
  return JSON.parse((0, import_fs.readFileSync)(file, "utf8"));
}
function findFeatureDir(tddDir, featureId) {
  const featuresDir = (0, import_path.join)(tddDir, "features");
  if (!(0, import_fs.existsSync)(featuresDir)) {
    throw new Error(`${featuresDir} does not exist`);
  }
  const candidates = (0, import_fs.readdirSync)(featuresDir).filter((d) => d.startsWith(featureId));
  if (candidates.length === 0) {
    throw new Error(`feature ${featureId} not found under ${featuresDir}`);
  }
  return (0, import_path.join)(featuresDir, candidates[0]);
}

// scripts/tdd/design-spec-gate.ts
var import_fs3 = require("fs");
var import_path3 = require("path");

// scripts/tdd/experiment.ts
var import_fs2 = require("fs");
var import_path2 = require("path");

// scripts/lakebase/paired-branch.ts
var fs21 = __toESM(require("fs"), 1);
var path21 = __toESM(require("path"), 1);
var import_node_child_process12 = require("child_process");

// scripts/lakebase/branch-delete.ts
var import_node_child_process10 = require("child_process");
var import_node_util4 = require("util");
var execFileP4 = (0, import_node_util4.promisify)(import_node_child_process10.execFile);
async function deleteBranch(args) {
  const fullPath = await resolveBranchPath(args.branch, {
    instance: args.instance,
    host: args.host
  });
  if (!fullPath) {
    throw new LakebaseBranchError(`Branch "${args.branch}" not found in instance "${args.instance}"`);
  }
  await dbcli6(["postgres", "delete-branch", fullPath], args.host);
}
async function dbcli6(args, host) {
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
var import_node_child_process11 = require("child_process");
async function getEndpoint(args) {
  const branchPath = await resolveBranchPath(args.branch, { instance: args.instance });
  if (!branchPath) {
    return void 0;
  }
  let raw;
  try {
    raw = (0, import_node_child_process11.execFileSync)("databricks", ["postgres", "list-endpoints", branchPath, "-o", "json"], {
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
    (0, import_node_child_process11.execFileSync)(
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

// scripts/lakebase/paired-branch.ts
function gitCurrentBranch(cwd) {
  return (0, import_node_child_process12.execFileSync)("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitDefault
  }).trim();
}
function gitHasLocalBranch(cwd, branch) {
  try {
    (0, import_node_child_process12.execFileSync)("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], {
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
  (0, import_node_child_process12.execFileSync)("git", ["checkout", "-b", branch], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitCheckout
  });
}
function gitCheckoutExistingBranch(cwd, branch) {
  (0, import_node_child_process12.execFileSync)("git", ["checkout", branch], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitCheckout
  });
}
function gitDeleteLocalBranch(cwd, branch, force = true) {
  (0, import_node_child_process12.execFileSync)("git", ["branch", force ? "-D" : "-d", branch], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitDefault
  });
}
function gitHasRemoteBranch(cwd, remote, branch) {
  try {
    const out = (0, import_node_child_process12.execFileSync)(
      "git",
      ["ls-remote", "--exit-code", "--heads", remote, branch],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: KIT_TIMEOUTS.gitNetwork }
    );
    return out.trim().length > 0;
  } catch {
    return false;
  }
}
function gitDeleteRemoteBranch(cwd, remote, branch) {
  (0, import_node_child_process12.execFileSync)("git", ["push", remote, "--delete", branch], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.gitPush
  });
}
function readEnvVar(envPath, key) {
  if (!fs21.existsSync(envPath)) return void 0;
  const content = fs21.readFileSync(envPath, "utf-8");
  const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!match) return void 0;
  return match[1].trim().replace(/^["']|["']$/g, "");
}
function buildDsn4(host, database, user, password) {
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
        const dsn = buildDsn4(ep.host, database, email, token);
        updateEnvConnection({
          envPath: path21.join(args.cwd, ".env"),
          branchId: sanitized,
          databaseUrl: dsn,
          username: email,
          password: token,
          endpointHost: ep.host
        });
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
async function deletePairedBranch(args) {
  const warnings = [];
  const sanitized = sanitizeBranchName(args.branch);
  const deleteGitLocal = args.deleteGitLocal !== false;
  const deleteGitRemote = args.deleteGitRemote !== false;
  const gitRemote = args.gitRemote ?? "origin";
  let lakebaseDeleted = false;
  try {
    await deleteBranch({ instance: args.instance, branch: sanitized });
    lakebaseDeleted = true;
  } catch (err) {
    warnings.push(
      `Lakebase delete failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  let gitLocalDeleted = false;
  if (deleteGitLocal) {
    try {
      const current = gitCurrentBranch(args.cwd);
      if (current === sanitized) {
        warnings.push(`Skipped local git delete: branch "${sanitized}" is currently checked out`);
      } else if (!gitHasLocalBranch(args.cwd, sanitized)) {
        gitLocalDeleted = true;
      } else {
        gitDeleteLocalBranch(args.cwd, sanitized, true);
        gitLocalDeleted = true;
      }
    } catch (err) {
      warnings.push(
        `Local git delete failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  let gitRemoteDeleted = false;
  if (deleteGitRemote) {
    try {
      if (gitHasRemoteBranch(args.cwd, gitRemote, sanitized)) {
        gitDeleteRemoteBranch(args.cwd, gitRemote, sanitized);
        gitRemoteDeleted = true;
      } else {
        gitRemoteDeleted = true;
      }
    } catch (err) {
      warnings.push(
        `Remote git delete failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return { lakebaseDeleted, gitLocalDeleted, gitRemoteDeleted, warnings };
}
async function syncEnvToCurrentBranch(args) {
  const envPath = path21.join(args.cwd, ".env");
  const instance = args.instance ?? readEnvVar(envPath, "LAKEBASE_PROJECT_ID");
  if (!instance) {
    throw new Error(
      `Could not resolve Lakebase instance id (set LAKEBASE_PROJECT_ID in .env or pass --instance)`
    );
  }
  const rawBranch = args.branch ?? gitCurrentBranch(args.cwd);
  const sanitized = sanitizeBranchName(rawBranch);
  const database = args.database ?? process.env.PGDATABASE ?? DEFAULT_DATABASE;
  const ep = await getEndpoint({ instance, branch: sanitized });
  if (!ep?.host) {
    throw new Error(
      `No endpoint host yet for branch "${sanitized}" in instance "${instance}" \u2013 branch may still be provisioning`
    );
  }
  const { token, email } = await getCredential({ instance, branch: sanitized });
  const dsn = buildDsn4(ep.host, database, email, token);
  updateEnvConnection({
    envPath,
    branchId: sanitized,
    databaseUrl: dsn,
    username: email,
    password: token,
    endpointHost: ep.host
  });
  return { branchId: sanitized, endpointHost: ep.host, databaseUrl: dsn };
}
async function checkoutPaired(args) {
  const warnings = [];
  const envPath = path21.join(args.cwd, ".env");
  const instance = args.instance ?? readEnvVar(envPath, "LAKEBASE_PROJECT_ID");
  if (!instance) {
    throw new Error(
      `Could not resolve Lakebase instance (set LAKEBASE_PROJECT_ID in .env or pass --instance)`
    );
  }
  const rawBranch = args.branch ?? gitCurrentBranch(args.cwd);
  if (!rawBranch || rawBranch === "HEAD") {
    throw new Error(
      `Cannot resolve current git branch (detached HEAD or not a git repo at ${args.cwd})`
    );
  }
  const branchId = sanitizeBranchName(rawBranch);
  const database = args.database ?? process.env.PGDATABASE ?? DEFAULT_DATABASE;
  const previousBranch = args.previousBranch ?? readEnvVar(envPath, "LAKEBASE_BRANCH_ID") ?? "";
  const trunkAlias = args.trunkAlias?.trim();
  let mode = "feature";
  let lakebaseBranch = branchId;
  const isTrunkAlias = trunkAlias && rawBranch === trunkAlias;
  const isMainOrMaster = !trunkAlias && (rawBranch === "main" || rawBranch === "master");
  const lakebaseBranches = await listBranches({ instance });
  const tierMatch = isTier(rawBranch, lakebaseBranches);
  if (isTrunkAlias || isMainOrMaster) {
    mode = "trunk";
    const def = lakebaseBranches.find((b) => b.isDefault);
    if (!def) {
      throw new Error(
        `Could not resolve default Lakebase branch for instance "${instance}"`
      );
    }
    lakebaseBranch = def.name.split("/branches/").pop() ?? def.uid;
  } else if (tierMatch) {
    mode = "tier";
    lakebaseBranch = rawBranch;
  } else {
    let existing = await getBranchByName(branchId, { instance });
    if (!existing) {
      if (args.autoCreate !== false) {
        const parentBranch = await resolveFeatureParent({
          instance,
          target: branchId,
          baseBranch: args.baseBranch,
          previousBranch
        });
        const created = await createBranch({
          instance,
          branch: rawBranch,
          parentBranch
        });
        if (created.state !== "READY") {
          try {
            await waitForBranchReady({
              instance,
              branch: branchId,
              timeoutMs: args.readyTimeoutMs ?? KIT_TIMEOUTS.readyWait
            });
          } catch (err) {
            warnings.push(
              `Lakebase branch created but did not reach READY: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
        existing = await getBranchByName(branchId, { instance });
        mode = "feature-created";
      } else {
        throw new Error(
          `Lakebase branch "${branchId}" does not exist and autoCreate=false`
        );
      }
    }
    lakebaseBranch = branchId;
  }
  const ep = await ensureEndpoint({
    instance,
    branch: lakebaseBranch,
    timeoutMs: args.readyTimeoutMs ?? KIT_TIMEOUTS.readyWait
  });
  const { token, email } = await mintCredential(endpointPath(instance, lakebaseBranch));
  const dsn = buildDsn4(ep.host, database, email, token);
  updateEnvConnection({
    envPath,
    branchId: lakebaseBranch,
    databaseUrl: dsn,
    username: email,
    password: token,
    endpointHost: ep.host
  });
  return {
    branchId,
    mode,
    matchedLakebaseBranch: lakebaseBranch,
    endpointHost: ep.host,
    databaseUrl: dsn,
    envUpdated: true,
    warnings
  };
}
async function resolveFeatureParent(args) {
  if (args.baseBranch) {
    return args.baseBranch;
  }
  if (args.previousBranch && args.previousBranch !== args.target) {
    const prev = await getBranchByName(args.previousBranch, { instance: args.instance });
    if (prev) {
      return args.previousBranch;
    }
  }
  return void 0;
}

// scripts/lakebase/convention-branches.ts
var CONVENTION_TIER_DEFAULTS = {
  feature: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.featureBranchTtlMs), parentBranch: "staging" },
  test: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.testBranchTtlMs), parentBranch: "staging" },
  uat: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.uatBranchTtlMs), parentBranch: "staging" },
  perf: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.perfBranchTtlMs), parentBranch: "staging" }
};
async function createFeatureBranch(args) {
  return createBranch({
    instance: args.instance,
    host: args.host,
    branch: args.branch,
    parentBranch: args.parentBranch ?? CONVENTION_TIER_DEFAULTS.feature.parentBranch,
    ttl: args.ttl ?? CONVENTION_TIER_DEFAULTS.feature.ttl,
    strictParent: args.strictParent
  });
}
async function createTestBranch(args) {
  return createBranch({
    instance: args.instance,
    host: args.host,
    branch: args.branch,
    parentBranch: args.parentBranch ?? CONVENTION_TIER_DEFAULTS.test.parentBranch,
    ttl: args.ttl ?? CONVENTION_TIER_DEFAULTS.test.ttl,
    strictParent: args.strictParent
  });
}
async function createUatBranch(args) {
  return createBranch({
    instance: args.instance,
    host: args.host,
    branch: args.branch,
    parentBranch: args.parentBranch ?? CONVENTION_TIER_DEFAULTS.uat.parentBranch,
    ttl: args.ttl ?? CONVENTION_TIER_DEFAULTS.uat.ttl,
    strictParent: args.strictParent
  });
}
async function createPerfBranch(args) {
  return createBranch({
    instance: args.instance,
    host: args.host,
    branch: args.branch,
    parentBranch: args.parentBranch ?? CONVENTION_TIER_DEFAULTS.perf.parentBranch,
    ttl: args.ttl ?? CONVENTION_TIER_DEFAULTS.perf.ttl,
    strictParent: args.strictParent
  });
}

// scripts/tdd/experiment.ts
function listExperiments(tddDir, featureId) {
  const root = (0, import_path2.join)(tddDir, "experiments", featureId);
  if (!(0, import_fs2.existsSync)(root)) return [];
  const out = [];
  for (const slug of (0, import_fs2.readdirSync)(root)) {
    const dir = (0, import_path2.join)(root, slug);
    if (!(0, import_fs2.statSync)(dir).isDirectory()) continue;
    const branchFile = (0, import_path2.join)(dir, "branch.txt");
    if (!(0, import_fs2.existsSync)(branchFile)) continue;
    out.push({
      feature_id: featureId,
      experiment_slug: slug,
      branch_id: (0, import_fs2.readFileSync)(branchFile, "utf8").trim(),
      created_at: (0, import_fs2.statSync)(branchFile).birthtime.toISOString(),
      dir
    });
  }
  return out;
}
function readOutcomes(tddDir, featureId, slug) {
  const file = (0, import_path2.join)(tddDir, "experiments", featureId, slug, "outcomes.json");
  if (!(0, import_fs2.existsSync)(file)) return null;
  return JSON.parse((0, import_fs2.readFileSync)(file, "utf8"));
}

// scripts/tdd/design-spec-gate.ts
function readPlan(tddDir, featureId) {
  const planPath = (0, import_path3.join)(tddDir, "features", `${featureId}`, "plan.json");
  if (!(0, import_fs3.existsSync)(planPath)) return null;
  return JSON.parse((0, import_fs3.readFileSync)(planPath, "utf8"));
}

// scripts/tdd/smells.ts
var import_fs4 = require("fs");
var import_path4 = require("path");
function readSmellsLog(tddDir) {
  const file = (0, import_path4.join)(tddDir, "smells.json");
  if (!(0, import_fs4.existsSync)(file)) return { detected: [] };
  return JSON.parse((0, import_fs4.readFileSync)(file, "utf8"));
}

// scripts/tdd/gates.ts
var import_fs5 = require("fs");
var import_path5 = require("path");
var GATES_SCHEMA_VERSION = 1;
var GATE_NAMES = ["spec", "plan", "test_list", "promote"];
var GATE_STATUSES = ["open", "approved", "superseded", "withdrawn"];
function defaultGatesState(featureId) {
  return {
    feature_id: featureId,
    schema_version: GATES_SCHEMA_VERSION,
    gates: {
      spec: { status: "open", history: [] },
      plan: { status: "open", history: [] },
      test_list: { status: "open", history: [] },
      promote: { status: "open", history: [] }
    }
  };
}
function readGates(featureId, opts = {}) {
  const tddDir = opts.tddDir ?? "./.tdd";
  const file = gatesFilePath(tddDir, featureId);
  if (!(0, import_fs5.existsSync)(file)) {
    return defaultGatesState(featureId);
  }
  const raw = (0, import_fs5.readFileSync)(file, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`gates.json at ${file} is not valid JSON: ${cause}`);
  }
  return validateGatesState(parsed, file);
}
function gatesFilePath(tddDir, featureId) {
  return (0, import_path5.join)(findFeatureDir2(tddDir, featureId), "gates.json");
}
function findFeatureDir2(tddDir, featureId) {
  const featuresDir = (0, import_path5.join)(tddDir, "features");
  if (!(0, import_fs5.existsSync)(featuresDir)) {
    throw new Error(`${featuresDir} does not exist`);
  }
  const candidates = (0, import_fs5.readdirSync)(featuresDir).filter((d) => d.startsWith(featureId));
  if (candidates.length === 0) {
    throw new Error(`feature ${featureId} not found under ${featuresDir}`);
  }
  return (0, import_path5.join)(featuresDir, candidates[0]);
}
function validateGatesState(parsed, file) {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`gates.json at ${file} is not an object`);
  }
  const obj = parsed;
  if (typeof obj.feature_id !== "string" || obj.feature_id.length === 0) {
    throw new Error(`gates.json at ${file}: missing or invalid feature_id`);
  }
  if (typeof obj.schema_version !== "number") {
    throw new Error(`gates.json at ${file}: missing or invalid schema_version`);
  }
  if (typeof obj.gates !== "object" || obj.gates === null) {
    throw new Error(`gates.json at ${file}: missing or invalid gates`);
  }
  const gates = obj.gates;
  const out = {
    spec: validateGateRecord(gates.spec, "spec", file),
    plan: validateGateRecord(gates.plan, "plan", file),
    test_list: validateGateRecord(gates.test_list, "test_list", file),
    promote: validateGateRecord(gates.promote, "promote", file)
  };
  return {
    feature_id: obj.feature_id,
    schema_version: obj.schema_version,
    gates: out
  };
}
function validateGateRecord(parsed, gateName, file) {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`gates.json at ${file}: gate ${gateName} is not an object`);
  }
  const obj = parsed;
  const status = obj.status;
  if (typeof status !== "string" || !GATE_STATUSES.includes(status)) {
    throw new Error(
      `gates.json at ${file}: gate ${gateName} has invalid status (${String(status)}); expected one of ${GATE_STATUSES.join(", ")}`
    );
  }
  const history = obj.history;
  if (history !== void 0 && !Array.isArray(history)) {
    throw new Error(`gates.json at ${file}: gate ${gateName} history must be an array`);
  }
  return {
    status,
    approver: typeof obj.approver === "string" ? obj.approver : void 0,
    approved_at: typeof obj.approved_at === "string" ? obj.approved_at : void 0,
    artifact_hashes: obj.artifact_hashes && typeof obj.artifact_hashes === "object" ? obj.artifact_hashes : void 0,
    withdrawal_reason: typeof obj.withdrawal_reason === "string" ? obj.withdrawal_reason : void 0,
    history: history ?? []
  };
}

// scripts/tdd/feature-status.ts
var MAX_RECENT_LOG_ENTRIES = 5;
function readJsonIfExists(path24) {
  if (!(0, import_fs6.existsSync)(path24)) return null;
  return JSON.parse((0, import_fs6.readFileSync)(path24, "utf8"));
}
function timelineCycleCount(experimentDir) {
  const timeline = readJsonIfExists(
    (0, import_path6.join)(experimentDir, "timeline.json")
  );
  return timeline?.entries?.length ?? 0;
}
function summarizeTestList(tddDir, featureId) {
  try {
    const list = readMasterTestList(tddDir, featureId);
    const counters = {
      pending: 0,
      red: 0,
      green: 0,
      refactored: 0,
      skipped: 0
    };
    for (const item of list.items) counters[item.status]++;
    const total = list.items.length;
    const done = counters.green + counters.refactored;
    return {
      total,
      by_status: counters,
      completion_pct: total === 0 ? 0 : Math.round(done / total * 100)
    };
  } catch {
    return null;
  }
}
function readSelectionLogRecent(tddDir, limit) {
  const path24 = (0, import_path6.join)(tddDir, "selection-log.md");
  if (!(0, import_fs6.existsSync)(path24)) return [];
  const text = (0, import_fs6.readFileSync)(path24, "utf8");
  const entries = [];
  const headingRe = /^##\s+(\S+T\S+?)\s+–\s+(.+?)$/gm;
  let match;
  while ((match = headingRe.exec(text)) !== null) {
    entries.push({ timestamp: match[1], title: match[2].trim() });
  }
  return entries.slice(-limit);
}
function readGatesSummary(tddDir, featureId) {
  try {
    const state = readGates(featureId, { tddDir });
    const out = {};
    for (const name of GATE_NAMES) {
      const rec = state.gates[name];
      out[name] = {
        status: rec.status,
        approver: rec.approver ?? null,
        approved_at: rec.approved_at ?? null
      };
    }
    return out;
  } catch {
    return null;
  }
}
function readWorkflowState(tddDir) {
  const state = readJsonIfExists((0, import_path6.join)(tddDir, "workflow-state.json"));
  if (!state) return { phase: null, pointer: null };
  return {
    phase: state.phase ?? null,
    pointer: {
      feature_id: state.feature_id ?? null,
      story_id: state.story_id ?? null,
      ac_id: state.ac_id ?? null,
      cycle_id: state.cycle_id ?? null,
      experiment_id: state.experiment_id ?? null
    }
  };
}
function getFeatureStatus(tddDir, featureId) {
  const plan = readPlan(tddDir, featureId);
  const experimentRecords = listExperiments(tddDir, featureId);
  const experiments = experimentRecords.map((rec) => {
    const outcomes = readOutcomes(tddDir, featureId, rec.experiment_slug);
    return {
      slug: rec.experiment_slug,
      branch_id: rec.branch_id,
      status: outcomes?.status ?? null,
      tests_passed: outcomes?.tests_passed ?? null,
      tests_failed: outcomes?.tests_failed ?? null,
      schema_diff_summary: outcomes?.schema_diff_summary ?? null,
      cycle_count: timelineCycleCount(rec.dir)
    };
  });
  let smells = [];
  try {
    smells = readSmellsLog(tddDir).detected.filter((d) => !d.resolution);
  } catch {
    smells = [];
  }
  const { phase, pointer } = readWorkflowState(tddDir);
  return {
    feature_id: featureId,
    current_workflow_phase: phase,
    current_workflow_pointer: pointer,
    plan,
    test_list: summarizeTestList(tddDir, featureId),
    experiments,
    selection_log_recent: readSelectionLogRecent(tddDir, MAX_RECENT_LOG_ENTRIES),
    open_smells: smells,
    gates: readGatesSummary(tddDir, featureId)
  };
}

// scripts/github/pr.ts
var import_octokit4 = require("octokit");
var GitHubPullRequestError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = "GitHubPullRequestError";
  }
  status;
};
async function octokit() {
  const token = await resolveGitHubToken();
  return new import_octokit4.Octokit({ auth: token });
}
function wrap4(err, context) {
  if (err instanceof import_octokit4.RequestError) {
    throw new GitHubPullRequestError(`${context}: ${err.message}`, err.status);
  }
  if (err instanceof Error) {
    throw new GitHubPullRequestError(`${context}: ${err.message}`);
  }
  throw new GitHubPullRequestError(context);
}
async function createPullRequest(args) {
  try {
    const { owner, repo } = parseOwnerRepo(args.ownerRepo);
    const ok = await octokit();
    let base = args.baseBranch;
    if (!base) {
      const { data: repoData } = await ok.rest.repos.get({ owner, repo });
      base = repoData.default_branch || "main";
    }
    const { data } = await ok.rest.pulls.create({
      owner,
      repo,
      title: args.title,
      head: args.headBranch,
      base,
      body: args.body
    });
    return data.html_url || "";
  } catch (err) {
    wrap4(err, "Failed to create pull request");
  }
}
async function getPullRequest(ownerRepo, headBranch) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const ok = await octokit();
    const { data: pulls } = await ok.rest.pulls.list({
      owner,
      repo,
      state: "open",
      head: `${owner}:${headBranch}`,
      per_page: 1
    });
    if (pulls.length === 0) return void 0;
    const { data: pr } = await ok.rest.pulls.get({
      owner,
      repo,
      pull_number: pulls[0].number
    });
    if (pr.state !== "open") return void 0;
    let checks = [];
    let ciStatus = "pending";
    const headSha = pr.head?.sha;
    if (headSha) {
      try {
        const { data: checksData } = await ok.rest.checks.listForRef({
          owner,
          repo,
          ref: headSha
        });
        const runs = checksData.check_runs || [];
        checks = runs.map((c) => ({
          name: c.name || "unknown",
          status: (c.status || "").toUpperCase(),
          conclusion: (c.conclusion || "").toUpperCase(),
          detailsUrl: c.details_url || void 0
        }));
        ciStatus = parseCiStatus(runs);
      } catch {
        ciStatus = "pending";
      }
    }
    return {
      number: pr.number,
      title: pr.title,
      url: pr.html_url || "",
      state: (pr.state || "open").toUpperCase(),
      isDraft: pr.draft || false,
      ciStatus,
      checks,
      headBranch: pr.head?.ref || headBranch,
      baseBranch: pr.base?.ref || "",
      body: pr.body || void 0,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files
    };
  } catch {
    return void 0;
  }
}
function parseCiStatus(rawChecks) {
  if (rawChecks.length === 0) return "pending";
  const latestByName = /* @__PURE__ */ new Map();
  for (const c of rawChecks) {
    latestByName.set(c.name || "unknown", c);
  }
  const states = Array.from(latestByName.values()).map(
    (c) => (c.conclusion || c.status || "").toUpperCase()
  );
  if (states.some((s) => s === "FAILURE" || s === "ERROR" || s === "ACTION_REQUIRED")) {
    return "failure";
  }
  if (states.every((s) => s === "SUCCESS" || s === "NEUTRAL" || s === "SKIPPED")) {
    return "success";
  }
  return "pending";
}
async function getPullRequestReviews(ownerRepo, pullNumber) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const ok = await octokit();
    const { data } = await ok.rest.pulls.listReviews({ owner, repo, pull_number: pullNumber });
    return data.map((r) => ({
      author: r.user?.login || "unknown",
      state: r.state || "COMMENTED",
      body: r.body || "",
      submittedAt: r.submitted_at || void 0
    }));
  } catch {
    return [];
  }
}
async function getPullRequestFiles(ownerRepo, pullNumber) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const ok = await octokit();
    const { data } = await ok.rest.pulls.listFiles({ owner, repo, pull_number: pullNumber });
    const statusMap = {
      added: "added",
      removed: "deleted",
      modified: "modified",
      renamed: "renamed"
    };
    return data.map((f) => ({
      path: f.filename || "",
      status: statusMap[(f.status || "").toLowerCase()] || "modified",
      additions: f.additions || 0,
      deletions: f.deletions || 0
    }));
  } catch {
    return [];
  }
}
async function getPullRequestComments(ownerRepo, pullNumber) {
  try {
    const { owner, repo } = parseOwnerRepo(ownerRepo);
    const ok = await octokit();
    const { data } = await ok.rest.issues.listComments({
      owner,
      repo,
      issue_number: pullNumber
    });
    return data.map((c) => ({
      author: c.user?.login || "unknown",
      body: c.body || ""
    }));
  } catch {
    return [];
  }
}
async function mergePullRequest(args) {
  const method = args.method ?? "merge";
  const deleteRemoteBranch = args.deleteRemoteBranch !== false;
  try {
    const { owner, repo } = parseOwnerRepo(args.ownerRepo);
    const ok = await octokit();
    const { data } = await ok.rest.pulls.merge({
      owner,
      repo,
      pull_number: args.pullNumber,
      merge_method: method
    });
    if (deleteRemoteBranch) {
      try {
        const pr = await ok.rest.pulls.get({ owner, repo, pull_number: args.pullNumber });
        const headRef = pr.data.head.ref;
        await ok.rest.git.deleteRef({
          owner,
          repo,
          ref: `heads/${headRef}`
        });
      } catch {
      }
    }
    return data.message || `Merged PR #${args.pullNumber}`;
  } catch (err) {
    wrap4(err, "Failed to merge pull request");
  }
}
async function mergePairedPullRequest(args) {
  const warnings = [];
  const deleteLakebaseBranch = args.deleteLakebaseBranch !== false;
  let headBranch = "";
  try {
    const { owner, repo } = parseOwnerRepo(args.ownerRepo);
    const ok = await octokit();
    const pr = await ok.rest.pulls.get({ owner, repo, pull_number: args.pullNumber });
    headBranch = pr.data.head?.ref ?? "";
  } catch (err) {
    warnings.push(
      `Could not read PR head branch before merge: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const message = await mergePullRequest({
    ownerRepo: args.ownerRepo,
    pullNumber: args.pullNumber,
    method: args.method,
    deleteRemoteBranch: args.deleteRemoteBranch
  });
  let lakebaseBranchDeleted = false;
  if (deleteLakebaseBranch && headBranch) {
    const sanitized = sanitizeBranchName(headBranch);
    try {
      await deleteBranch({ instance: args.lakebaseInstance, branch: sanitized });
      lakebaseBranchDeleted = true;
    } catch (err) {
      warnings.push(
        `Lakebase branch "${sanitized}" cleanup failed (PR merge succeeded): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  } else if (deleteLakebaseBranch && !headBranch) {
    warnings.push("Skipped Lakebase branch cleanup \u2013 could not resolve PR head branch name");
  }
  return { message, headBranch, lakebaseBranchDeleted, warnings };
}

// scripts/lakebase/doctor.ts
var fs23 = __toESM(require("fs"), 1);
var path23 = __toESM(require("path"), 1);

// scripts/lakebase/databricks-host.ts
async function resolveDatabricksHost(args) {
  const timeoutMs = args.timeoutMs ?? KIT_TIMEOUTS.cliDefault;
  const out = await exec2(
    `databricks auth describe --profile "${escapeShellArg(args.profile)}" -o json`,
    { timeout: timeoutMs }
  );
  return parseHostFromAuthDescribe(out);
}
function parseHostFromAuthDescribe(out) {
  const start = out.indexOf("{");
  if (start < 0) return void 0;
  try {
    const parsed = JSON.parse(out.slice(start));
    const details = parsed.details;
    if (!details || typeof details !== "object") return void 0;
    const host = details.host;
    if (typeof host !== "string") return void 0;
    return host.replace(/\/+$/, "");
  } catch {
    return void 0;
  }
}
function escapeShellArg(s) {
  return s.replace(/"/g, '\\"');
}

// scripts/lakebase/workflow-drift.ts
var fs22 = __toESM(require("fs"), 1);
var path22 = __toESM(require("path"), 1);
function findKitTemplatesDir(start) {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = path22.join(
      dir,
      "templates",
      "project",
      "common",
      ".github",
      "workflows"
    );
    if (fs22.existsSync(candidate)) return candidate;
    const parent = path22.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not locate templates/project/common/.github/workflows/ relative to ${start}. Pass explicit kitDir.`
  );
}
function unifiedDiff(name, projectContent, templateContent) {
  if (projectContent === templateContent) return "";
  const a = projectContent.split("\n");
  const b = templateContent.split("\n");
  const out = [`--- project/${name}`, `+++ template/${name}`];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const av = a[i];
    const bv = b[i];
    if (av === bv) continue;
    if (av !== void 0) out.push(`-${i + 1}: ${av}`);
    if (bv !== void 0) out.push(`+${i + 1}: ${bv}`);
  }
  return out.join("\n");
}
function detectWorkflowDrift(args) {
  const projectWorkflowsDir = path22.join(
    args.projectDir,
    ".github",
    "workflows"
  );
  const here = path22.dirname(new URL(importMetaUrl).pathname);
  const kitWorkflowsDir = args.kitDir ? path22.join(
    args.kitDir,
    "templates",
    "project",
    "common",
    ".github",
    "workflows"
  ) : findKitTemplatesDir(here);
  const templateFiles = fs22.existsSync(kitWorkflowsDir) ? fs22.readdirSync(kitWorkflowsDir).filter((f) => f.endsWith(".yml")) : [];
  const projectFiles = fs22.existsSync(projectWorkflowsDir) ? fs22.readdirSync(projectWorkflowsDir).filter((f) => f.endsWith(".yml")) : [];
  const seen = /* @__PURE__ */ new Set();
  const files = [];
  for (const name of templateFiles) {
    seen.add(name);
    const projectPath2 = path22.join(projectWorkflowsDir, name);
    const templatePath = path22.join(kitWorkflowsDir, name);
    if (!fs22.existsSync(projectPath2)) {
      files.push({ name, status: "missing" });
      continue;
    }
    const projectContent = fs22.readFileSync(projectPath2, "utf8");
    const templateContent = fs22.readFileSync(templatePath, "utf8");
    if (projectContent === templateContent) {
      files.push({ name, status: "unchanged" });
    } else {
      files.push({
        name,
        status: "drifted",
        diff: unifiedDiff(name, projectContent, templateContent)
      });
    }
  }
  for (const name of projectFiles) {
    if (seen.has(name)) continue;
    files.push({ name, status: "extra" });
  }
  const order = {
    drifted: 0,
    missing: 1,
    extra: 2,
    unchanged: 3
  };
  files.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  const hasDrift = files.some((f) => f.status === "drifted" || f.status === "missing");
  return {
    overall: hasDrift ? "drift" : "ok",
    files
  };
}

// scripts/lakebase/doctor.ts
function readEnvFile(projectDir) {
  const envPath = path23.join(projectDir, ".env");
  if (!fs23.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs23.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2];
    if (val.startsWith('"') && val.endsWith('"') || val.startsWith("'") && val.endsWith("'")) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}
async function checkDatabricksCli() {
  try {
    const out = await exec2("databricks --version", { timeout: 5e3 });
    const trimmed = out.trim();
    const m = trimmed.match(/v?(\d+)\.(\d+)/);
    if (m) {
      const major = parseInt(m[1], 10);
      if (major < 1) {
        return {
          name: "databricks-cli",
          status: "warn",
          message: `Databricks CLI ${trimmed} - kit expects v1.0+`,
          detail: { version: trimmed },
          hint: "Upgrade via Homebrew or the installer at https://docs.databricks.com/dev-tools/cli/install.html"
        };
      }
    }
    return {
      name: "databricks-cli",
      status: "ok",
      message: `Databricks CLI ${trimmed}`,
      detail: { version: trimmed }
    };
  } catch (err) {
    return {
      name: "databricks-cli",
      status: "fail",
      message: "databricks CLI not found on PATH",
      detail: { error: err.message },
      hint: "Install via Homebrew (`brew install databricks-cli`) or the official installer."
    };
  }
}
async function checkAuth(profile) {
  try {
    const profileArg = profile ? ` --profile ${profile}` : "";
    const out = await exec2(`databricks auth describe -o json${profileArg}`, {
      timeout: 5e3
    });
    let host;
    try {
      const parsed = JSON.parse(out);
      host = parsed?.details?.host ?? parsed?.host ?? parsed?.host_name;
    } catch {
    }
    return {
      name: "databricks-auth",
      status: "ok",
      message: host ? `Authenticated to ${host}` : "Authenticated (no host parsed from describe)",
      detail: { host, profile: profile ?? "default" }
    };
  } catch (err) {
    return {
      name: "databricks-auth",
      status: "fail",
      message: "databricks auth describe failed",
      detail: { error: err.message },
      hint: "Run `databricks auth login --host <your-workspace>` to authenticate."
    };
  }
}
async function checkIdentity(profile) {
  try {
    const profileArg = profile ? ` --profile ${profile}` : "";
    const out = await exec2(`databricks current-user me -o json${profileArg}`, {
      timeout: 5e3
    });
    let user;
    try {
      const parsed = JSON.parse(out);
      user = parsed?.userName ?? parsed?.emails?.[0]?.value;
    } catch {
    }
    return {
      name: "workspace-identity",
      status: "ok",
      message: user ? `Workspace reachable as ${user}` : "Workspace reachable",
      detail: { user }
    };
  } catch (err) {
    return {
      name: "workspace-identity",
      status: "fail",
      message: "Cannot resolve current user from workspace",
      detail: { error: err.message },
      hint: "Re-authenticate via `databricks auth login` and verify network connectivity."
    };
  }
}
function checkEnv(projectDir) {
  const env = readEnvFile(projectDir);
  const required = ["LAKEBASE_PROJECT_ID", "LAKEBASE_BRANCH_ID"];
  const missing = required.filter((k) => !env[k]);
  if (Object.keys(env).length === 0) {
    return {
      name: "env-file",
      status: "warn",
      message: ".env not found",
      detail: { projectDir, envPath: path23.join(projectDir, ".env") },
      hint: "Run `lakebase-get-connection --output dsn --write-env` or `lakebase-branch sync-env`."
    };
  }
  if (missing.length) {
    return {
      name: "env-file",
      status: "fail",
      message: `.env missing required vars: ${missing.join(", ")}`,
      detail: { presentKeys: Object.keys(env), missing },
      hint: "Re-run `lakebase-branch sync-env` to regenerate .env from the current branch."
    };
  }
  return {
    name: "env-file",
    status: "ok",
    message: `.env present with required keys (LAKEBASE_PROJECT_ID=${env.LAKEBASE_PROJECT_ID})`,
    detail: { keys: Object.keys(env).length, projectId: env.LAKEBASE_PROJECT_ID }
  };
}
async function checkLakebaseProject(projectId, host) {
  if (!projectId) {
    return {
      name: "lakebase-project",
      status: "skip",
      message: "Skipped: no LAKEBASE_PROJECT_ID in .env"
    };
  }
  try {
    const branches = await listBranches({ instance: projectId, host });
    return {
      name: "lakebase-project",
      status: "ok",
      message: `Project ${projectId} reachable (${branches.length} branches)`,
      detail: {
        projectId,
        branchCount: branches.length,
        branchNames: branches.map((b) => b.name)
      }
    };
  } catch (err) {
    return {
      name: "lakebase-project",
      status: "fail",
      message: `Cannot list branches on project ${projectId}`,
      detail: { error: err.message },
      hint: "Verify the project exists and your account has CAN_USE on it."
    };
  }
}
async function checkGitRemote(projectDir) {
  try {
    const url = (await exec2("git remote get-url origin", {
      cwd: projectDir,
      timeout: 5e3
    })).trim();
    if (!url) {
      return {
        name: "git-remote",
        status: "warn",
        message: "No origin remote configured"
      };
    }
    return {
      name: "git-remote",
      status: "ok",
      message: `origin -> ${url}`,
      detail: { url }
    };
  } catch (err) {
    return {
      name: "git-remote",
      status: "warn",
      message: "git remote get-url origin failed",
      detail: { error: err.message },
      hint: "Run `git remote add origin <url>` if this is a fresh repo."
    };
  }
}
function checkLanguage(projectDir) {
  try {
    const lang = detectLanguage(projectDir);
    return {
      name: "detected-language",
      status: "ok",
      message: `Project language: ${lang}`,
      detail: { language: lang }
    };
  } catch (err) {
    return {
      name: "detected-language",
      status: "warn",
      message: "Could not detect project language",
      detail: { error: err.message }
    };
  }
}
function checkHooks(projectDir) {
  const v = verifyHooks(projectDir);
  const installed = Object.entries(v).filter(([, ok]) => ok).map(([k]) => k);
  const missing = Object.entries(v).filter(([, ok]) => !ok).map(([k]) => k);
  if (missing.length === 0) {
    return {
      name: "git-hooks",
      status: "ok",
      message: `All ${installed.length} project git hooks installed`,
      detail: v
    };
  }
  return {
    name: "git-hooks",
    status: "warn",
    message: `Missing git hooks: ${missing.join(", ")}`,
    detail: v,
    hint: "Re-run `lakebase-create-project --install-hooks` or copy the hook files from the kit's templates."
  };
}
function checkWorkflowDrift(projectDir) {
  try {
    const report = detectWorkflowDrift({ projectDir });
    const drifted = report.files.filter((f) => f.status === "drifted").length;
    const missing = report.files.filter((f) => f.status === "missing").length;
    if (report.overall === "ok") {
      return {
        name: "workflow-drift",
        status: "ok",
        message: "Scaffolded .github/workflows/*.yml match the kit's templates",
        detail: { files: report.files.map((f) => ({ name: f.name, status: f.status })) }
      };
    }
    return {
      name: "workflow-drift",
      status: "warn",
      message: `Scaffolded workflows drift from kit: ${drifted} drifted, ${missing} missing`,
      detail: { files: report.files.map((f) => ({ name: f.name, status: f.status })) },
      hint: "Inspect via the lakebase_workflow_drift MCP tool (or detectWorkflowDrift import). Refresh manually until FEIP-7139 updateWorkflows lands."
    };
  } catch (err) {
    return {
      name: "workflow-drift",
      status: "skip",
      message: "Could not run drift check",
      detail: { error: err.message }
    };
  }
}
function worstOf(statuses) {
  const order = ["ok", "skip", "warn", "fail"];
  return statuses.reduce(
    (acc, s) => order.indexOf(s) > order.indexOf(acc) ? s : acc,
    "ok"
  );
}
async function runDoctor(args = {}) {
  const projectDir = args.projectDir ?? process.cwd();
  const profile = args.profile ?? process.env.DATABRICKS_CONFIG_PROFILE;
  const cli = await checkDatabricksCli();
  const auth = cli.status === "ok" ? await checkAuth(profile) : {
    name: "databricks-auth",
    status: "skip",
    message: "Skipped: databricks CLI not available"
  };
  const identity = auth.status === "ok" ? await checkIdentity(profile) : {
    name: "workspace-identity",
    status: "skip",
    message: "Skipped: auth check failed"
  };
  let host = args.host;
  if (!host && auth.status === "ok") {
    try {
      host = await resolveDatabricksHost({ profile: profile ?? "DEFAULT" });
    } catch {
    }
  }
  const env = checkEnv(projectDir);
  const envVars = readEnvFile(projectDir);
  const lakebaseProject = await checkLakebaseProject(
    envVars.LAKEBASE_PROJECT_ID ?? "",
    host
  );
  const gitRemote = await checkGitRemote(projectDir);
  const language = checkLanguage(projectDir);
  const hooks = checkHooks(projectDir);
  const workflowDrift = checkWorkflowDrift(projectDir);
  const checks = [
    cli,
    auth,
    identity,
    env,
    lakebaseProject,
    gitRemote,
    language,
    hooks,
    workflowDrift
  ];
  return {
    overall: worstOf(checks.map((c) => c.status)),
    checks
  };
}

// apps/mcp-server/tools.ts
function requireString(args, key) {
  const v = args[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`'${key}' is required`);
  }
  return v;
}
function optionalString(args, key) {
  const v = args[key];
  return typeof v === "string" && v.length > 0 ? v : void 0;
}
var TOOLS = [
  {
    name: "lakebase_get_connection",
    description: "Mint a Postgres DSN string for a Lakebase branch. Single-seam credential handoff: this is the only path that mints Lakebase credentials.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project (instance) id." },
        branch: { type: "string", description: "Branch id within the project." },
        endpointName: {
          type: "string",
          description: "Endpoint identifier on the branch. Default: 'primary'."
        },
        database: {
          type: "string",
          description: "Database name. Default: $PGDATABASE or 'databricks_postgres'."
        }
      },
      required: ["instance", "branch"],
      additionalProperties: false
    },
    handler: async (args) => {
      return await getConnection({
        output: "dsn",
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        endpointName: optionalString(args, "endpointName"),
        database: optionalString(args, "database")
      });
    }
  },
  {
    name: "lakebase_schema_diff",
    description: "Parent-aware schema diff between two Lakebase branches. If 'against' is omitted, parent is resolved from Lakebase metadata (sourceBranchId, falling back to the project's default branch).",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project (instance) id." },
        branch: { type: "string", description: "Target branch to diff FOR." },
        against: {
          type: "string",
          description: "Explicit parent branch. Default: resolved from metadata."
        },
        database: {
          type: "string",
          description: "Database name. Default: $PGDATABASE or 'databricks_postgres'."
        }
      },
      required: ["instance", "branch"],
      additionalProperties: false
    },
    handler: async (args) => {
      return await getSchemaDiff({
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        comparisonBranch: optionalString(args, "against"),
        database: optionalString(args, "database")
      });
    }
  },
  {
    name: "lakebase_github_token",
    description: "Resolve a GitHub token via the unified fallback chain (GITHUB_TOKEN env \u2192 VS Code session \u2192 gh auth token). Use 'diagnose: true' to inspect which sources are available WITHOUT revealing the token value.",
    inputSchema: {
      type: "object",
      properties: {
        diagnose: {
          type: "boolean",
          description: "If true, return { sources, primary, scopes } instead of the token itself. Safe to log."
        }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      if (args.diagnose === true) {
        return await diagnoseGitHubAuth();
      }
      const token = await resolveGitHubToken();
      const { primary } = await diagnoseGitHubAuth();
      return { token, source: primary };
    }
  },
  {
    name: "lakebase_create_project",
    description: "Bootstrap a fresh Lakebase-paired project end-to-end: Lakebase project + parent branch, GitHub repo (optional), Actions runner, repo secrets, local scaffold.",
    inputSchema: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Project name (Lakebase id + local dir)." },
        parentDir: { type: "string", description: "Parent directory for the new project dir." },
        databricksHost: {
          type: "string",
          description: "Databricks workspace URL (https://....cloud.databricks.com)."
        },
        githubOwner: {
          type: "string",
          description: "GitHub user/org for the repo. Required unless createGithubRepo=false."
        },
        createGithubRepo: {
          type: "boolean",
          description: "Create a GitHub repo? Default: true."
        },
        privateRepo: {
          type: "boolean",
          description: "Make the GitHub repo private? Default: true."
        },
        language: {
          type: "string",
          enum: ["java", "kotlin", "python", "nodejs"],
          description: "Project language. Default: 'java'."
        },
        runnerType: {
          type: "string",
          enum: ["self-hosted", "github-hosted"],
          description: "Actions runner mode. Default: 'self-hosted'."
        }
      },
      required: ["projectName", "parentDir", "databricksHost"],
      additionalProperties: false
    },
    handler: async (args) => {
      const input = {
        projectName: requireString(args, "projectName"),
        parentDir: requireString(args, "parentDir"),
        databricksHost: requireString(args, "databricksHost"),
        githubOwner: optionalString(args, "githubOwner"),
        createGithubRepo: typeof args.createGithubRepo === "boolean" ? args.createGithubRepo : void 0,
        privateRepo: typeof args.privateRepo === "boolean" ? args.privateRepo : void 0,
        language: optionalString(args, "language"),
        runnerType: optionalString(args, "runnerType")
      };
      return await createProject(input);
    }
  },
  {
    name: "lakebase_list_migrations",
    description: "Enumerate migration files on disk for a paired project. No DB connection. Auto-detects language (java/kotlin via pom.xml + Flyway, python via pyproject.toml/alembic.ini + Alembic, nodejs via package.json + Knex).",
    inputSchema: {
      type: "object",
      properties: {
        projectDir: { type: "string", description: "Project root. Default: cwd of the MCP server." },
        language: {
          type: "string",
          enum: ["java", "kotlin", "python", "nodejs"],
          description: "Override language detection."
        }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      return listSchemaMigrations({
        projectDir: optionalString(args, "projectDir"),
        language: optionalString(args, "language")
      });
    }
  },
  {
    name: "lakebase_apply_migrations",
    description: "Apply pending forward migrations against a Lakebase branch. Supports Python/Alembic, Java+Kotlin/Flyway, and Node/Knex. Auto-detects the language from project markers (alembic.ini, pom.xml, knexfile.{js,ts}).",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project (instance) id." },
        branch: { type: "string", description: "Branch to migrate against." },
        projectDir: { type: "string", description: "Project root. Default: cwd." },
        language: {
          type: "string",
          enum: ["java", "kotlin", "python", "nodejs"],
          description: "Override language detection."
        },
        database: { type: "string", description: "Database name. Default: $PGDATABASE or 'databricks_postgres'." },
        endpointName: { type: "string", description: "Endpoint identifier on the branch. Default: 'primary'." }
      },
      required: ["instance", "branch"],
      additionalProperties: false
    },
    handler: async (args) => {
      return applySchemaMigrations({
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        projectDir: optionalString(args, "projectDir"),
        language: optionalString(args, "language"),
        database: optionalString(args, "database"),
        endpointName: optionalString(args, "endpointName")
      });
    }
  },
  {
    name: "lakebase_rollback_migration",
    description: "Roll back applied migrations on a Lakebase branch down to a target version. Supported for Python/Alembic + Node/Knex; NOT supported for Java+Kotlin/Flyway (Flyway Community Edition has no `undo`). For Alembic, 'target' can be a revision id or a relative step like '-1'. For Knex, use 'all' or '0' for full rollback; other values roll back the last batch.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project (instance) id." },
        branch: { type: "string", description: "Branch to roll back." },
        target: { type: "string", description: "Revision id or relative step (e.g., '-1' for one step down)." },
        projectDir: { type: "string", description: "Project root. Default: cwd." },
        language: {
          type: "string",
          enum: ["java", "kotlin", "python", "nodejs"],
          description: "Override language detection."
        },
        database: { type: "string", description: "Database name. Default: $PGDATABASE or 'databricks_postgres'." },
        endpointName: { type: "string", description: "Endpoint identifier on the branch. Default: 'primary'." }
      },
      required: ["instance", "branch", "target"],
      additionalProperties: false
    },
    handler: async (args) => {
      return rollbackSchemaMigration({
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        target: requireString(args, "target"),
        projectDir: optionalString(args, "projectDir"),
        language: optionalString(args, "language"),
        database: optionalString(args, "database"),
        endpointName: optionalString(args, "endpointName")
      });
    }
  },
  {
    name: "lakebase_migration_status",
    description: "Report the currently-applied migration version and the list of pending migrations for a Lakebase branch.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project (instance) id." },
        branch: { type: "string", description: "Branch to inspect." },
        projectDir: { type: "string", description: "Project root. Default: cwd." },
        language: {
          type: "string",
          enum: ["java", "kotlin", "python", "nodejs"],
          description: "Override language detection."
        },
        database: { type: "string", description: "Database name. Default: $PGDATABASE or 'databricks_postgres'." },
        endpointName: { type: "string", description: "Endpoint identifier on the branch. Default: 'primary'." }
      },
      required: ["instance", "branch"],
      additionalProperties: false
    },
    handler: async (args) => {
      return schemaMigrationStatus({
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        projectDir: optionalString(args, "projectDir"),
        language: optionalString(args, "language"),
        database: optionalString(args, "database"),
        endpointName: optionalString(args, "endpointName")
      });
    }
  },
  {
    name: "lakebase_feature_status",
    description: "One-screen snapshot of a feature's TDD workflow state (phase, plan, test-list completion, experiments, recent decisions, open smells). Reads .tdd/ on disk; no Lakebase or network calls. See skills/lakebase-tdd-workflows/references/feature-status-schema.md for the stable payload contract.",
    inputSchema: {
      type: "object",
      properties: {
        featureId: { type: "string", description: "Feature id (e.g., 'F1-checkout')." },
        tddDir: { type: "string", description: "Path to the .tdd/ directory. Default: './.tdd'." }
      },
      required: ["featureId"],
      additionalProperties: false
    },
    handler: async (args) => {
      return getFeatureStatus(
        optionalString(args, "tddDir") ?? "./.tdd",
        requireString(args, "featureId")
      );
    }
  },
  // ------------------------- FEIP-7328 P0.2 PR tools -------------------------
  {
    name: "lakebase_pr_open",
    description: "Create a GitHub pull request via the REST API. Returns the PR html_url.",
    inputSchema: {
      type: "object",
      properties: {
        ownerRepo: { type: "string", description: "GitHub repo slug (owner/repo)." },
        headBranch: { type: "string", description: "Head branch with the changes." },
        title: { type: "string", description: "PR title." },
        body: { type: "string", description: "PR body (markdown)." },
        baseBranch: { type: "string", description: "Target base branch. Default: repo default." }
      },
      required: ["ownerRepo", "headBranch", "title", "body"],
      additionalProperties: false
    },
    handler: async (args) => {
      const url = await createPullRequest({
        ownerRepo: requireString(args, "ownerRepo"),
        headBranch: requireString(args, "headBranch"),
        title: requireString(args, "title"),
        body: requireString(args, "body"),
        baseBranch: optionalString(args, "baseBranch")
      });
      return { url };
    }
  },
  {
    name: "lakebase_pr_merge",
    description: "Merge a GitHub pull request. Default deletes the remote head branch on merge.",
    inputSchema: {
      type: "object",
      properties: {
        ownerRepo: { type: "string", description: "GitHub repo slug (owner/repo)." },
        pullNumber: { type: "number", description: "PR number to merge." },
        method: { type: "string", enum: ["merge", "squash", "rebase"], description: "Merge method. Default: merge." },
        deleteRemoteBranch: { type: "boolean", description: "Delete remote head after merge. Default: true." }
      },
      required: ["ownerRepo", "pullNumber"],
      additionalProperties: false
    },
    handler: async (args) => {
      const num = args.pullNumber;
      if (typeof num !== "number") throw new Error("'pullNumber' must be a number");
      const message = await mergePullRequest({
        ownerRepo: requireString(args, "ownerRepo"),
        pullNumber: num,
        method: optionalString(args, "method"),
        deleteRemoteBranch: typeof args.deleteRemoteBranch === "boolean" ? args.deleteRemoteBranch : void 0
      });
      return { message };
    }
  },
  {
    name: "lakebase_pr_merge_paired",
    description: "Merge a GitHub PR AND delete the matching feature branch in the Lakebase project. Single-call workflow cleanup.",
    inputSchema: {
      type: "object",
      properties: {
        ownerRepo: { type: "string", description: "GitHub repo slug (owner/repo)." },
        pullNumber: { type: "number", description: "PR number to merge." },
        lakebaseInstance: { type: "string", description: "Lakebase project id used to clean up the feature branch." },
        method: { type: "string", enum: ["merge", "squash", "rebase"], description: "Merge method. Default: merge." },
        deleteRemoteBranch: { type: "boolean", description: "Delete remote head after merge. Default: true." },
        deleteLakebaseBranch: { type: "boolean", description: "Delete the Lakebase feature branch. Default: true." }
      },
      required: ["ownerRepo", "pullNumber", "lakebaseInstance"],
      additionalProperties: false
    },
    handler: async (args) => {
      const num = args.pullNumber;
      if (typeof num !== "number") throw new Error("'pullNumber' must be a number");
      return mergePairedPullRequest({
        ownerRepo: requireString(args, "ownerRepo"),
        pullNumber: num,
        lakebaseInstance: requireString(args, "lakebaseInstance"),
        method: optionalString(args, "method"),
        deleteRemoteBranch: typeof args.deleteRemoteBranch === "boolean" ? args.deleteRemoteBranch : void 0,
        deleteLakebaseBranch: typeof args.deleteLakebaseBranch === "boolean" ? args.deleteLakebaseBranch : void 0
      });
    }
  },
  {
    name: "lakebase_pr_status",
    description: "Look up an OPEN pull request by head branch. Returns state, CI checks, counts, review decision. Returns undefined if no open PR exists for that head.",
    inputSchema: {
      type: "object",
      properties: {
        ownerRepo: { type: "string", description: "GitHub repo slug (owner/repo)." },
        headBranch: { type: "string", description: "Head branch to look up." }
      },
      required: ["ownerRepo", "headBranch"],
      additionalProperties: false
    },
    handler: async (args) => {
      const info = await getPullRequest(
        requireString(args, "ownerRepo"),
        requireString(args, "headBranch")
      );
      return info ?? null;
    }
  },
  {
    name: "lakebase_pr_files",
    description: "List files changed by a pull request, with status (added / modified / removed / renamed) and per-file diff stats.",
    inputSchema: {
      type: "object",
      properties: {
        ownerRepo: { type: "string", description: "GitHub repo slug (owner/repo)." },
        pullNumber: { type: "number", description: "PR number." }
      },
      required: ["ownerRepo", "pullNumber"],
      additionalProperties: false
    },
    handler: async (args) => {
      const num = args.pullNumber;
      if (typeof num !== "number") throw new Error("'pullNumber' must be a number");
      return getPullRequestFiles(requireString(args, "ownerRepo"), num);
    }
  },
  {
    name: "lakebase_pr_reviews",
    description: "List reviews on a pull request (APPROVED / CHANGES_REQUESTED / COMMENTED / etc.).",
    inputSchema: {
      type: "object",
      properties: {
        ownerRepo: { type: "string", description: "GitHub repo slug (owner/repo)." },
        pullNumber: { type: "number", description: "PR number." }
      },
      required: ["ownerRepo", "pullNumber"],
      additionalProperties: false
    },
    handler: async (args) => {
      const num = args.pullNumber;
      if (typeof num !== "number") throw new Error("'pullNumber' must be a number");
      return getPullRequestReviews(requireString(args, "ownerRepo"), num);
    }
  },
  {
    name: "lakebase_pr_comments",
    description: "List top-level issue comments on a pull request (separate from review-thread comments).",
    inputSchema: {
      type: "object",
      properties: {
        ownerRepo: { type: "string", description: "GitHub repo slug (owner/repo)." },
        pullNumber: { type: "number", description: "PR number." }
      },
      required: ["ownerRepo", "pullNumber"],
      additionalProperties: false
    },
    handler: async (args) => {
      const num = args.pullNumber;
      if (typeof num !== "number") throw new Error("'pullNumber' must be a number");
      return getPullRequestComments(requireString(args, "ownerRepo"), num);
    }
  },
  // ------------------------- FEIP-7330 P0.4 doctor -------------------------
  {
    name: "lakebase_doctor",
    description: "Run health checks on a Lakebase project: CLI version + auth, .env shape, project reachability, git remote, language, git hooks. Returns a structured report with per-check status + remediation hints.",
    inputSchema: {
      type: "object",
      properties: {
        projectDir: { type: "string", description: "Project directory to inspect. Default: server cwd." },
        profile: { type: "string", description: "Databricks CLI profile. Default: $DATABRICKS_CONFIG_PROFILE." },
        host: { type: "string", description: "Workspace host override." }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      return runDoctor({
        projectDir: optionalString(args, "projectDir"),
        profile: optionalString(args, "profile"),
        host: optionalString(args, "host")
      });
    }
  },
  // ------------------------- FEIP-7140 workflow drift ----------------------
  {
    name: "lakebase_workflow_drift",
    description: "Detect drift between a scaffolded project's .github/workflows/*.yml and the kit's current templates. Returns per-file status (unchanged / drifted / missing / extra) and a unified diff for drifted files. Use when a maintainer wants to know if a project's CI templates are stale vs the kit it pins.",
    inputSchema: {
      type: "object",
      properties: {
        projectDir: { type: "string", description: "Project directory containing .github/workflows/." },
        kitDir: { type: "string", description: "Override the kit directory (default: bundled templates path)." }
      },
      required: ["projectDir"],
      additionalProperties: false
    },
    handler: async (args) => {
      return detectWorkflowDrift({
        projectDir: requireString(args, "projectDir"),
        kitDir: optionalString(args, "kitDir")
      });
    }
  },
  // ------------------------- FEIP-7331 P0.1 branch read tools -------------
  {
    name: "lakebase_branch_list",
    description: "List branches on a Lakebase project (name, uid, parent, expiration, state).",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project id." },
        host: { type: "string", description: "Workspace host override." }
      },
      required: ["instance"],
      additionalProperties: false
    },
    handler: async (args) => {
      return listBranches({
        instance: requireString(args, "instance"),
        host: optionalString(args, "host")
      });
    }
  },
  {
    name: "lakebase_branch_show",
    description: "Look up a single Lakebase branch by name or uid. Returns undefined if not found.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project id." },
        branch: { type: "string", description: "Branch name or uid." },
        host: { type: "string", description: "Workspace host override." }
      },
      required: ["instance", "branch"],
      additionalProperties: false
    },
    handler: async (args) => {
      const info = await getBranchByName(requireString(args, "branch"), {
        instance: requireString(args, "instance"),
        host: optionalString(args, "host")
      });
      return info ?? null;
    }
  },
  {
    name: "lakebase_branch_create",
    description: "Create a Lakebase branch (no git side-effects). For paired git+Lakebase creation, use lakebase_branch_create_paired. Will not exceed the workspace's TTL cap; pass noExpiry: true for long-running tiers.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project id." },
        branch: { type: "string", description: "Branch name (will be sanitized)." },
        parentBranch: { type: "string", description: "Parent branch override (e.g. 'staging'). Default: project default branch." },
        ttl: { type: "string", description: "Lifetime in Lakebase duration format (e.g. '604800s')." },
        noExpiry: { type: "boolean", description: "Set no_expiry=true (long-running tiers only)." },
        host: { type: "string", description: "Workspace host override." }
      },
      required: ["instance", "branch"],
      additionalProperties: false
    },
    handler: async (args) => {
      return createBranch({
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        parentBranch: optionalString(args, "parentBranch"),
        ttl: optionalString(args, "ttl"),
        noExpiry: typeof args.noExpiry === "boolean" ? args.noExpiry : void 0,
        host: optionalString(args, "host")
      });
    }
  },
  {
    name: "lakebase_branch_create_paired",
    description: "Create a Lakebase branch + matching local git branch + .env update in one call. The canonical 'fork from current' workflow op (mirrors the post-checkout git hook).",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project id." },
        branch: { type: "string", description: "Branch name (used for both Lakebase and git)." },
        parentBranch: { type: "string", description: "Lakebase parent branch override." },
        cwd: { type: "string", description: "Project directory (must contain .git/). Default: server cwd." },
        createGitBranch: { type: "boolean", description: "Create + switch the local git branch. Default: true." },
        syncEnv: { type: "boolean", description: "Rewrite .env to point at the new endpoint. Default: true." },
        database: { type: "string", description: "Postgres database name. Default: 'databricks_postgres'." }
      },
      required: ["instance", "branch"],
      additionalProperties: false
    },
    handler: async (args) => {
      return createPairedBranch({
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        parentBranch: optionalString(args, "parentBranch"),
        cwd: optionalString(args, "cwd") ?? process.cwd(),
        createGitBranch: typeof args.createGitBranch === "boolean" ? args.createGitBranch : void 0,
        syncEnv: typeof args.syncEnv === "boolean" ? args.syncEnv : void 0,
        database: optionalString(args, "database")
      });
    }
  },
  {
    name: "lakebase_branch_create_tier",
    description: "Create a convention-tier Lakebase branch (feature / test / uat / perf). Each tier has its own default TTL and forks from 'staging' by default. PSA branching methodology.",
    inputSchema: {
      type: "object",
      properties: {
        tier: { type: "string", enum: ["feature", "test", "uat", "perf"], description: "Convention tier." },
        instance: { type: "string", description: "Lakebase project id." },
        branch: { type: "string", description: "Branch name (will be sanitized)." },
        parentBranch: { type: "string", description: "Parent override. Default: 'staging' for all four tiers." },
        ttl: { type: "string", description: "TTL override. Default: tier-specific (30d / 14d / 14d / 7d)." },
        strictParent: { type: "boolean", description: "Throw if convention's default parent missing instead of falling back. Default: false." },
        host: { type: "string", description: "Workspace host override." }
      },
      required: ["tier", "instance", "branch"],
      additionalProperties: false
    },
    handler: async (args) => {
      const tier = requireString(args, "tier");
      const common = {
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        parentBranch: optionalString(args, "parentBranch"),
        ttl: optionalString(args, "ttl"),
        strictParent: typeof args.strictParent === "boolean" ? args.strictParent : void 0,
        host: optionalString(args, "host")
      };
      switch (tier) {
        case "feature":
          return createFeatureBranch(common);
        case "test":
          return createTestBranch(common);
        case "uat":
          return createUatBranch(common);
        case "perf":
          return createPerfBranch(common);
        default:
          throw new Error(`Unknown tier: ${tier}`);
      }
    }
  },
  {
    name: "lakebase_branch_delete",
    description: "Delete a Lakebase branch (no git side-effects). For paired git+Lakebase cleanup, use lakebase_branch_delete_paired. Throws if the branch cannot be resolved.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project id." },
        branch: { type: "string", description: "Branch name, uid, or full resource name." },
        host: { type: "string", description: "Workspace host override." }
      },
      required: ["instance", "branch"],
      additionalProperties: false
    },
    handler: async (args) => {
      await deleteBranch({
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        host: optionalString(args, "host")
      });
      return { deleted: true, branch: args.branch };
    }
  },
  {
    name: "lakebase_branch_delete_paired",
    description: "Delete a Lakebase branch + local git branch + remote git branch in one call. Skips deletion of branches that are currently checked out (local) or absent (remote). Default deletes everything; pass deleteGitLocal/deleteGitRemote: false to skip a side.",
    inputSchema: {
      type: "object",
      properties: {
        instance: { type: "string", description: "Lakebase project id." },
        branch: { type: "string", description: "Branch name." },
        cwd: { type: "string", description: "Project directory (must contain .git/). Default: server cwd." },
        deleteGitLocal: { type: "boolean", description: "Delete the local git branch. Default: true." },
        deleteGitRemote: { type: "boolean", description: "Delete the remote git branch. Default: true." },
        gitRemote: { type: "string", description: "Git remote name. Default: 'origin'." }
      },
      required: ["instance", "branch"],
      additionalProperties: false
    },
    handler: async (args) => {
      return deletePairedBranch({
        instance: requireString(args, "instance"),
        branch: requireString(args, "branch"),
        cwd: optionalString(args, "cwd") ?? process.cwd(),
        deleteGitLocal: typeof args.deleteGitLocal === "boolean" ? args.deleteGitLocal : void 0,
        deleteGitRemote: typeof args.deleteGitRemote === "boolean" ? args.deleteGitRemote : void 0,
        gitRemote: optionalString(args, "gitRemote")
      });
    }
  },
  {
    name: "lakebase_branch_checkout_paired",
    description: "In-process equivalent of the post-checkout git hook: sync .env to the current git branch's matching Lakebase endpoint. Use after switching git branches outside the hook flow.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Project directory (must contain .env). Default: server cwd." },
        branch: { type: "string", description: "Target git branch override. Default: read current via git." },
        instance: { type: "string", description: "Lakebase instance override. Default: read LAKEBASE_PROJECT_ID from .env." },
        trunkAlias: { type: "string", description: "Git branch name that should pair with the project's default Lakebase branch. Mirrors LAKEBASE_TRUNK_BRANCH from the post-checkout hook." }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      return checkoutPaired({
        cwd: optionalString(args, "cwd") ?? process.cwd(),
        branch: optionalString(args, "branch"),
        instance: optionalString(args, "instance"),
        trunkAlias: optionalString(args, "trunkAlias")
      });
    }
  },
  {
    name: "lakebase_branch_sync_env",
    description: "Refresh .env to point at the current branch's endpoint. Recovery for .env drift; equivalent of the post-checkout hook minus the git-branch step.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Project directory (must contain .env and .git/). Default: server cwd." },
        instance: { type: "string", description: "Lakebase instance override. Default: read LAKEBASE_PROJECT_ID from .env." },
        branch: { type: "string", description: "Branch name override. Default: current git branch (sanitized)." },
        database: { type: "string", description: "Postgres database name. Default: 'databricks_postgres'." }
      },
      additionalProperties: false
    },
    handler: async (args) => {
      return syncEnvToCurrentBranch({
        cwd: optionalString(args, "cwd") ?? process.cwd(),
        instance: optionalString(args, "instance"),
        branch: optionalString(args, "branch"),
        database: optionalString(args, "database")
      });
    }
  }
];

// apps/mcp-server/dump-tools.ts
var dump = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: t.inputSchema
}));
process.stdout.write(JSON.stringify(dump, null, 2) + "\n");
//# sourceMappingURL=dump-tools.cjs.map