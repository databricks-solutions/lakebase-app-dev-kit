// Parent-aware schema diff between two Lakebase branches.
//
// Compares the target branch against its parent (the branch's sourceBranchId
// in Lakebase metadata) – for a feature forked from staging, that means diff
// vs staging, not vs production. Falls back to the project's default branch
// when source can't be resolved (e.g. for staging itself, or branches whose
// source has been deleted).
//
// Returns a structured SchemaDiffResult that matches the data contract the
// VS Code extension's per-table-diff modal consumes – same field names, same
// semantics, so once the extension re-routes (publish_and_consume),
// the modal can read identical JSON from either call site.

import { runDatabricksSync } from "./databricks-cli.js";
import type { Pool } from "pg";
import { getConnection } from "./get-connection.js";
import { KIT_TIMEOUTS } from "./kit-config.js";
import { buildSchemaQuery, isAllSchemas, schemaObjectName, type SchemaQueryRow } from "./branch-schema.js";

export interface SchemaColumn {
  name: string;
  dataType: string;
}

export interface SchemaObject {
  type: "TABLE" | "INDEX";
  name: string;
  columns?: SchemaColumn[];
}

export interface ModifiedSchemaObject extends SchemaObject {
  type: "TABLE";
  columns: SchemaColumn[];
  addedColumns: SchemaColumn[];
  removedColumns: SchemaColumn[];
  prodColumns: SchemaColumn[];
}

export interface SchemaDiffResult {
  /** Branch the diff is FOR (target). */
  branchName: string;
  /**
   * The Lakebase branch this diff was computed AGAINST (the parent / source).
   * Empty string when unknown or when comparing the default branch itself.
   */
  comparisonBranchName: string;
  timestamp: string;
  /**
   * Always empty in the script-emitted result – migrations are a workspace
   * file concern, not a Lakebase-side concern. The extension fills this in
   * locally from its workspace's migrationPath.
   */
  migrations: Array<{ version: string; description: string }>;
  /** Tables on target that don't exist on the parent. */
  created: SchemaObject[];
  /** Tables on both branches with column differences. */
  modified: ModifiedSchemaObject[];
  /** Tables on parent that don't exist on the target. */
  removed: SchemaObject[];
  /** Full inventory of tables on the target branch. */
  branchTables: SchemaObject[];
  /** True iff created + modified + removed are all empty. */
  inSync: boolean;
  /** Populated when the diff couldn't be computed. Caller decides how to surface. */
  error?: string;
}

export interface GetSchemaDiffArgs {
  /** Lakebase project id. */
  instance: string;
  /** Target branch to compute the diff FOR. */
  branch: string;
  /**
   * Explicit comparison branch. When omitted, resolved via Lakebase metadata
   * (target's sourceBranchId → default branch fallback).
   */
  comparisonBranch?: string;
  /** Database name. Defaults to env PGDATABASE then "databricks_postgres". */
  database?: string;
  /** Optional WorkspaceClient pass-through to getConnection (OBO via AppKit). */
  workspaceClient?: unknown;
  /**
   * Postgres schema to diff. Default "public". A specific schema (e.g. "cfg")
   * diffs objects outside public; "all" / "*" diffs every non-system schema
   * with table names qualified as `schema.table`. Both branches are scanned
   * with the same scope so names line up.
   */
  schema?: string;
}

/** Skip this table in diffs – Flyway's bookkeeping isn't user schema. */
const IGNORED_TABLES = new Set(["flyway_schema_history"]);

export async function getSchemaDiff(args: GetSchemaDiffArgs): Promise<SchemaDiffResult> {
  const timestamp = new Date().toISOString();
  const baseResult: SchemaDiffResult = {
    branchName: args.branch,
    comparisonBranchName: "",
    timestamp,
    migrations: [],
    created: [],
    modified: [],
    removed: [],
    branchTables: [],
    inSync: false,
  };

  const comparisonBranch = args.comparisonBranch ?? resolveComparisonBranch(args.instance, args.branch);
  if (!comparisonBranch) {
    return { ...baseResult, error: "Could not resolve a comparison target Lakebase branch" };
  }
  if (comparisonBranch === args.branch) {
    // Diff against self is vacuous.
    return { ...baseResult, comparisonBranchName: comparisonBranch, inSync: true };
  }

  let targetPool: Pool | undefined;
  let comparisonPool: Pool | undefined;
  try {
    targetPool = await getConnection({
      output: "pool",
      instance: args.instance,
      branch: args.branch,
      database: args.database,
      workspaceClient: args.workspaceClient,
    });
    comparisonPool = await getConnection({
      output: "pool",
      instance: args.instance,
      branch: comparisonBranch,
      database: args.database,
      workspaceClient: args.workspaceClient,
    });

    const targetTables = await listTables(targetPool, args.schema);
    const comparisonTables = await listTables(comparisonPool, args.schema);
    return diffSchemas(args.branch, comparisonBranch, targetTables, comparisonTables, timestamp);
  } catch (err) {
    return {
      ...baseResult,
      comparisonBranchName: comparisonBranch,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (targetPool) await targetPool.end().catch(() => undefined);
    if (comparisonPool) await comparisonPool.end().catch(() => undefined);
  }
}

async function listTables(pool: Pool, schema?: string): Promise<Map<string, SchemaColumn[]>> {
  const allSchemas = isAllSchemas(schema);
  const query = buildSchemaQuery(schema);
  const { rows } = await pool.query<SchemaQueryRow>(query.text, query.values);
  const tables = new Map<string, SchemaColumn[]>();
  for (const r of rows) {
    if (!r.table_name || IGNORED_TABLES.has(r.table_name)) continue;
    const key = schemaObjectName(r, allSchemas);
    if (!tables.has(key)) tables.set(key, []);
    tables.get(key)!.push({ name: r.column_name, dataType: r.data_type });
  }
  return tables;
}

function diffSchemas(
  branch: string,
  comparisonBranch: string,
  target: Map<string, SchemaColumn[]>,
  comparison: Map<string, SchemaColumn[]>,
  timestamp: string
): SchemaDiffResult {
  const created: SchemaObject[] = [];
  const removed: SchemaObject[] = [];
  const modified: ModifiedSchemaObject[] = [];

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
        prodColumns: comparisonCols,
      });
    }
  }

  const branchTables: SchemaObject[] = [...target.entries()]
    .map(([name, columns]) => ({ type: "TABLE" as const, name, columns }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    branchName: branch,
    comparisonBranchName: comparisonBranch,
    timestamp,
    migrations: [],
    created: created.sort((a, b) => a.name.localeCompare(b.name)),
    modified: modified.sort((a, b) => a.name.localeCompare(b.name)),
    removed: removed.sort((a, b) => a.name.localeCompare(b.name)),
    branchTables,
    inSync: created.length === 0 && modified.length === 0 && removed.length === 0,
  };
}

const colKey = (c: SchemaColumn): string => `${c.name}:${c.dataType}`;

/**
 * Render a SchemaDiffResult as the canonical "SCHEMA CHANGES (Lakebase diff)"
 * markdown block. Consumers (the scaffolded prepare-commit-msg hook, the
 * GH Actions PR comment, the extension's commit-detail view) parse this
 * shape. Keep the surface stable; if you need new fields, add them as
 * additional sections rather than altering the established prefixes.
 * (Previously the same format was emitted by the now-removed shell
 * formatter templates/.../scripts/format-schema-diff.sh.)
 *
 * Output shape (per object, blank line between objects):
 *
 *   **SCHEMA CHANGES (Lakebase diff)**
 *
 *   + TABLE name (CREATED)
 *     L col_name data_type
 *
 *   + INDEX name (CREATED)
 *
 *   ~ TABLE name (MODIFIED)
 *     + col_name data_type
 *
 *   - TABLE name (REMOVED)
 *
 *   - INDEX name (REMOVED)
 *
 * Empty-diff emits `No schema changes (in sync).` after the header.
 */
export function formatSchemaDiffAsMarkdown(result: SchemaDiffResult): string {
  const lines: string[] = ["**SCHEMA CHANGES (Lakebase diff)**", ""];

  if (result.error) {
    lines.push(`Could not compute schema diff: ${result.error}`);
    return lines.join("\n") + "\n";
  }

  const blocks: string[][] = [];

  for (const obj of result.created) {
    const block: string[] = [`+ ${obj.type} ${obj.name} (CREATED)`];
    if (obj.type === "TABLE" && obj.columns) {
      for (const col of obj.columns) {
        block.push(`  L ${col.name} ${col.dataType}`);
      }
    }
    blocks.push(block);
  }

  for (const obj of result.modified) {
    const block: string[] = [`~ TABLE ${obj.name} (MODIFIED)`];
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

/**
 * Resolve the comparison branch via Lakebase metadata:
 *   1. target branch's `status.source_branch` (its parent), if set – this is
 *      a full resource path like `projects/x/branches/staging`; we trim to
 *      the leaf id since downstream CLI subresource URLs need branch_id.
 *   2. project's default branch, otherwise
 *   3. undefined if neither is resolvable
 *
 * Historical note: earlier code looked for `source_branch_id` at the top
 * level of `get-branch` responses. The Lakebase API actually nests it under
 * `status.source_branch` as the full path. Using the full path leaf means
 * we never need a uid→name lookup hop.
 */
function resolveComparisonBranch(instance: string, branch: string): string | undefined {
  const branchInfo = describeBranch(instance, branch);
  const sourceBranch = branchInfo?.status?.source_branch ?? branchInfo?.spec?.source_branch;
  if (sourceBranch && typeof sourceBranch === "string") {
    const leaf = sourceBranch.split("/branches/").pop();
    if (leaf) return leaf;
  }
  const def = findDefaultBranch(instance);
  if (def) return def;
  return undefined;
}

interface BranchMetadata {
  uid?: string;
  name?: string;
  status?: {
    default?: boolean;
    /** Parent branch's full resource name when the branch was forked. */
    source_branch?: string;
  };
  /** Kept as a fallback for list-branches responses that haven't surfaced status.source_branch. */
  spec?: { source_branch?: string };
  is_default?: boolean;
}

function describeBranch(instance: string, branch: string): BranchMetadata | undefined {
  const branchPath = `projects/${instance}/branches/${branch}`;
  try {
    const raw = dbcli(["postgres", "get-branch", branchPath, "-o", "json"]);
    return JSON.parse(raw) as BranchMetadata;
  } catch {
    // Fall back to scanning list-branches – older CLI versions may not expose
    // `get-branch`. Tolerate the gap silently; caller's metadata may simply
    // be unavailable.
    try {
      const raw = dbcli(["postgres", "list-branches", `projects/${instance}`, "-o", "json"]);
      const parsed = JSON.parse(raw) as BranchMetadata[] | { branches?: BranchMetadata[]; items?: BranchMetadata[] };
      const items = Array.isArray(parsed) ? parsed : parsed.branches ?? parsed.items ?? [];
      return items.find((b) => b.uid === branch || b.name?.endsWith(`/branches/${branch}`));
    } catch {
      return undefined;
    }
  }
}

function findDefaultBranch(instance: string): string | undefined {
  try {
    const raw = dbcli(["postgres", "list-branches", `projects/${instance}`, "-o", "json"]);
    const parsed = JSON.parse(raw) as BranchMetadata[] | { branches?: BranchMetadata[]; items?: BranchMetadata[] };
    const items = Array.isArray(parsed) ? parsed : parsed.branches ?? parsed.items ?? [];
    const def = items.find((b) => b.status?.default === true || b.is_default === true);
    if (!def) return undefined;
    // Prefer NAME (leaf of "projects/X/branches/Y") over UID – list-endpoints
    // accepts the name segment but rejects bare UIDs as "branch id not found".
    return def.name?.split("/branches/").pop() ?? def.uid ?? undefined;
  } catch {
    return undefined;
  }
}

function dbcli(args: string[]): string {
  return runDatabricksSync(args, { timeout: KIT_TIMEOUTS.cliDefault });
}
