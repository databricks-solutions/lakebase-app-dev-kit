// Live schema introspection against a Lakebase branch.
//
// Connects via the branch's primary endpoint and queries information_schema
// to inventory tables + columns. Used by schema-diff and any agent or
// extension that wants to inspect a branch's live structure without going
// through pg_dump.
//
// Credentials route through get-connection.ts (the single mint seam);
// pg client comes from the `pg` package (transitively available via
// @databricks/lakebase, plus a direct dep for clarity).

import { Client } from "pg";
import { getEndpoint, endpointPath as buildEndpointPath } from "./branch-endpoint.js";
import { resolveBranchId } from "./branch-utils.js";
import { mintCredential } from "./get-connection.js";
import { DEFAULT_DATABASE, POSTGRES_PORT } from "./constants.js";
import { KIT_TIMEOUTS } from "./kit-config.js";

export interface TableSchema {
  name: string;
  columns: Array<{ name: string; dataType: string }>;
}

export interface QueryBranchSchemaArgs {
  instance: string;
  /**
   * Branch identifier. Accepts branch_id (e.g. "demo-feature"; tier names
   * "production" / "staging" / "uat" / "perf" are branch_ids), branch_uid
   * (e.g. "br-broad-sky-d2k5gewt"), or full resource path. Normalized
   * internally before any CLI URL is built.
   */
  branch: string;
  /** Default: $PGDATABASE then "databricks_postgres" */
  database?: string;
  /** Skip the flyway_schema_history table (default: true) */
  skipFlyway?: boolean;
  /**
   * Postgres schema to inventory. Default "public". Pass a specific schema
   * (e.g. "cfg") to diff objects that live outside public, or "all" / "*" to
   * inventory every non-system schema (in which case table names are returned
   * qualified as `schema.table` so objects from different schemas don't
   * collide). See {@link buildSchemaQuery}.
   */
  schema?: string;
}

/** A row of the information_schema column inventory. */
export interface SchemaQueryRow {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
}

const SYSTEM_SCHEMA_FILTER =
  "c.table_schema NOT IN ('pg_catalog','information_schema') " +
  "AND c.table_schema NOT LIKE 'pg_%'";

/** True when `schema` requests every non-system schema rather than just one. */
export function isAllSchemas(schema?: string): boolean {
  const s = (schema ?? "").trim().toLowerCase();
  return s === "all" || s === "*";
}

/**
 * Build the parameterized information_schema inventory query for a schema
 * scope. This is the ONE place the column-inventory SQL lives; both
 * queryBranchSchema (live introspection) and getSchemaDiff (parent diff) use
 * it, so a fix to the schema scoping applies to both.
 *
 *   - default / "public": filter to the single schema, bare table names
 *     (backward compatible with the prior public-only behavior).
 *   - a specific schema (e.g. "cfg"): filter to that schema, bare table names.
 *   - "all" / "*": every non-system schema, table names qualified as
 *     `schema.table`.
 */
export function buildSchemaQuery(schema?: string): { text: string; values: string[] } {
  const cols = "c.table_schema, c.table_name, c.column_name, c.data_type";
  const join =
    "FROM information_schema.columns c " +
    "JOIN pg_tables t ON c.table_name = t.tablename AND c.table_schema = t.schemaname ";
  if (isAllSchemas(schema)) {
    return {
      text:
        `SELECT ${cols} ` + join +
        `WHERE ${SYSTEM_SCHEMA_FILTER} ` +
        "ORDER BY c.table_schema, c.table_name, c.ordinal_position",
      values: [],
    };
  }
  const one = ((schema ?? "").trim() || "public");
  return {
    text:
      `SELECT ${cols} ` + join +
      "WHERE c.table_schema = $1 " +
      "ORDER BY c.table_name, c.ordinal_position",
    values: [one],
  };
}

/**
 * Object name for an inventory row: `schema.table` when scanning all schemas,
 * the bare table name otherwise. Keeps single-schema diffs (the common case)
 * on bare names while making multi-schema inventories collision-free.
 */
export function schemaObjectName(row: { table_schema: string; table_name: string }, allSchemas: boolean): string {
  return allSchemas ? `${row.table_schema}.${row.table_name}` : row.table_name;
}

/**
 * Inventory the tables + columns on a Lakebase branch's public schema.
 *
 * Returns [] when the endpoint has no host yet (branch is still
 * provisioning) so callers can degrade gracefully. Throws only on
 * credential-minting / authentication failures, since those signal a
 * configuration problem the caller should surface.
 */
export async function queryBranchSchema(args: QueryBranchSchemaArgs): Promise<TableSchema[]> {
  // Normalize once. buildEndpointPath is sync + uses raw interpolation, so
  // every CLI path downstream needs branch_id (not uid). getEndpoint already
  // accepts either form via resolveBranchPath, but we normalize here so the
  // single shared `branchId` flows through both call sites consistently.
  const branchId = await resolveBranchId({ instance: args.instance, branch: args.branch });
  const ep = await getEndpoint({ instance: args.instance, branch: branchId });
  if (!ep?.host) {
    return [];
  }
  const { token, email } = await mintCredential(buildEndpointPath(args.instance, branchId));
  const database = args.database ?? process.env.PGDATABASE ?? DEFAULT_DATABASE;
  const skipFlyway = args.skipFlyway !== false;

  const client = new Client({
    host: ep.host,
    port: POSTGRES_PORT,
    database,
    user: email,
    password: token,
    ssl: { rejectUnauthorized: false }, // Lakebase managed cert
    connectionTimeoutMillis: KIT_TIMEOUTS.pgConnect,
    statement_timeout: KIT_TIMEOUTS.pgStatement,
  });

  const allSchemas = isAllSchemas(args.schema);
  const query = buildSchemaQuery(args.schema);

  try {
    await client.connect();
    const result = await client.query<SchemaQueryRow>(query.text, query.values);
    const tables = new Map<string, Array<{ name: string; dataType: string }>>();
    for (const row of result.rows) {
      if (!row.table_name) continue;
      if (skipFlyway && row.table_name === "flyway_schema_history") continue;
      const key = schemaObjectName(row, allSchemas);
      if (!tables.has(key)) {
        tables.set(key, []);
      }
      tables.get(key)!.push({ name: row.column_name, dataType: row.data_type });
    }
    return Array.from(tables.entries()).map(([name, columns]) => ({ name, columns }));
  } finally {
    try {
      await client.end();
    } catch {
      /* noop */
    }
  }
}

/** Convenience: just the table names, no column inventory. */
export async function queryBranchTables(args: QueryBranchSchemaArgs): Promise<string[]> {
  const schema = await queryBranchSchema(args);
  return schema.map(t => t.name);
}
