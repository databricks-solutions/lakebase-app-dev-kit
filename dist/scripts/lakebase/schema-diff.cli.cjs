#!/usr/bin/env node
"use strict";

// scripts/lakebase/schema-diff.ts
var import_node_child_process4 = require("child_process");

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
var execFileP = (0, import_node_util.promisify)(import_node_child_process.execFile);
var LakebaseBranchError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "LakebaseBranchError";
  }
};
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

// scripts/lakebase/branch-schema.ts
var import_pg2 = require("pg");

// scripts/lakebase/branch-endpoint.ts
var import_node_child_process3 = require("child_process");

// scripts/lakebase/branch-schema.ts
var SYSTEM_SCHEMA_FILTER = "c.table_schema NOT IN ('pg_catalog','information_schema') AND c.table_schema NOT LIKE 'pg_%'";
function isAllSchemas(schema) {
  const s = (schema ?? "").trim().toLowerCase();
  return s === "all" || s === "*";
}
function buildSchemaQuery(schema) {
  const cols = "c.table_schema, c.table_name, c.column_name, c.data_type";
  const join = "FROM information_schema.columns c JOIN pg_tables t ON c.table_name = t.tablename AND c.table_schema = t.schemaname ";
  if (isAllSchemas(schema)) {
    return {
      text: `SELECT ${cols} ` + join + `WHERE ${SYSTEM_SCHEMA_FILTER} ORDER BY c.table_schema, c.table_name, c.ordinal_position`,
      values: []
    };
  }
  const one = (schema ?? "").trim() || "public";
  return {
    text: `SELECT ${cols} ` + join + "WHERE c.table_schema = $1 ORDER BY c.table_name, c.ordinal_position",
    values: [one]
  };
}
function schemaObjectName(row, allSchemas) {
  return allSchemas ? `${row.table_schema}.${row.table_name}` : row.table_name;
}

// scripts/lakebase/schema-diff.ts
var IGNORED_TABLES = /* @__PURE__ */ new Set(["flyway_schema_history"]);
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
    const targetTables = await listTables(targetPool, args.schema);
    const comparisonTables = await listTables(comparisonPool, args.schema);
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
async function listTables(pool, schema) {
  const allSchemas = isAllSchemas(schema);
  const query = buildSchemaQuery(schema);
  const { rows } = await pool.query(query.text, query.values);
  const tables = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (!r.table_name || IGNORED_TABLES.has(r.table_name)) continue;
    const key = schemaObjectName(r, allSchemas);
    if (!tables.has(key)) tables.set(key, []);
    tables.get(key).push({ name: r.column_name, dataType: r.data_type });
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
function formatSchemaDiffAsMarkdown(result) {
  const lines = ["**SCHEMA CHANGES (Lakebase diff)**", ""];
  if (result.error) {
    lines.push(`Could not compute schema diff: ${result.error}`);
    return lines.join("\n") + "\n";
  }
  const blocks = [];
  for (const obj of result.created) {
    const block = [`+ ${obj.type} ${obj.name} (CREATED)`];
    if (obj.type === "TABLE" && obj.columns) {
      for (const col of obj.columns) {
        block.push(`  L ${col.name} ${col.dataType}`);
      }
    }
    blocks.push(block);
  }
  for (const obj of result.modified) {
    const block = [`~ TABLE ${obj.name} (MODIFIED)`];
    for (const col of obj.addedColumns) {
      block.push(`  + ${col.name} ${col.dataType}`);
    }
    blocks.push(block);
  }
  for (const obj of result.removed) {
    blocks.push([`- ${obj.type} ${obj.name} (REMOVED)`]);
  }
  if (blocks.length === 0) {
    lines.push("No schema changes (in sync).");
  } else {
    for (let i = 0; i < blocks.length; i++) {
      if (i > 0) lines.push("");
      lines.push(...blocks[i]);
    }
  }
  return lines.join("\n") + "\n";
}
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
  return (0, import_node_child_process4.execFileSync)("databricks", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: KIT_TIMEOUTS.cliDefault
  });
}

// scripts/lakebase/schema-diff.cli.ts
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--instance":
        out.instance = argv[++i];
        break;
      case "--branch":
        out.branch = argv[++i];
        break;
      case "--comparison-branch":
      case "--against":
        out.comparisonBranch = argv[++i];
        break;
      case "--database":
        out.database = argv[++i];
        break;
      case "--schema":
        out.schema = argv[++i];
        break;
      case "--format": {
        const v = argv[++i];
        if (v === "json" || v === "markdown") {
          out.format = v;
        } else {
          out.format = v;
        }
        break;
      }
      case "--pretty":
        out.pretty = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        break;
    }
  }
  return out;
}
var HELP = `lakebase-schema-diff \u2013 parent-aware schema diff between two Lakebase branches

Usage:
  lakebase-schema-diff --instance <id> --branch <name> [--against <parent>] [--database <db>] [--pretty]

Behavior:
  When --against is omitted, the comparison branch is resolved from Lakebase
  metadata: the target's sourceBranchId (its parent), falling back to the
  project's default branch.

Output:
  JSON on stdout. Shape matches the extension's SchemaDiffResult so the
  modal/webview can consume identical JSON from either call site.

Flags:
  --instance           Lakebase project id (required)
  --branch             Target branch to diff FOR (required)
  --against / --comparison-branch
                       Explicit parent branch (default: resolved from metadata)
  --database           Database name (default: $PGDATABASE or "databricks_postgres")
  --schema <name|all>  Postgres schema to diff (default: "public"). A specific
                       schema (e.g. "cfg") diffs objects outside public; "all"
                       (or "*") diffs every non-system schema, qualifying names
                       as schema.table.
  --format <json|markdown>
                       Output format. "json" (default) emits the structured
                       SchemaDiffResult. "markdown" emits the canonical
                       "SCHEMA CHANGES (Lakebase diff)" block consumed by
                       prepare-commit-msg hook, GH Actions PR comment, and
                       the extension's commit-detail view.
  --pretty             Pretty-print JSON output (no effect on markdown)

Examples:
  lakebase-schema-diff --instance proj-abc --branch br-feature
  lakebase-schema-diff --instance proj-abc --branch br-feature --against br-staging --pretty
  lakebase-schema-diff --instance proj-abc --branch br-feature --format markdown
`;
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (!args.instance) {
    process.stderr.write("Error: --instance is required.\n");
    return 2;
  }
  if (!args.branch) {
    process.stderr.write("Error: --branch is required.\n");
    return 2;
  }
  const format = args.format ?? "json";
  if (format !== "json" && format !== "markdown") {
    process.stderr.write(
      `Error: --format must be "json" or "markdown" (got "${format}")
`
    );
    return 2;
  }
  const result = await getSchemaDiff({
    instance: args.instance,
    branch: args.branch,
    comparisonBranch: args.comparisonBranch,
    database: args.database,
    schema: args.schema
  });
  if (format === "markdown") {
    process.stdout.write(formatSchemaDiffAsMarkdown(result));
  } else {
    process.stdout.write(
      args.pretty ? JSON.stringify(result, null, 2) + "\n" : JSON.stringify(result) + "\n"
    );
  }
  return result.error ? 1 : 0;
}
main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
    process.exit(1);
  }
);
//# sourceMappingURL=schema-diff.cli.cjs.map