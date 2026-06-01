// KnexAdapter: SchemaMigrationAdapter implementation for Node.js projects
// using Knex. FEIP-7210 slice 3.
//
// Wraps scripts/lakebase/schema-migrate-runners/knex.ts, which shells out to
// `npx knex` and derives results via before/after `migrate:status`
// state diff. rollback is implemented because Knex supports it
// natively. baseline is omitted: Knex has no native baseline concept.

import * as fs from "node:fs";
import * as path from "node:path";

import { getConnection } from "../get-connection.js";
import {
  applyKnex,
  rollbackKnex,
  statusKnex,
} from "../schema-migrate-runners/knex.js";
import type { AppliedSchemaMigration, SchemaMigrationFile, PendingSchemaMigration } from "../schema-migrate.js";
import {
  registerSchemaMigrationAdapter,
  type ApplyArgs,
  type ApplyResult,
  type ListArgs,
  type ListResult,
  type SchemaMigrationAdapter,
  type RollbackArgs,
  type RollbackResult,
  type StatusArgs,
  type StatusResult,
} from "../schema-migration-adapter.js";

async function buildDsn(args: {
  instance: string;
  branch: string;
  database?: string;
  endpointName?: string;
}): Promise<string> {
  const result = await getConnection({
    output: "dsn",
    instance: args.instance,
    branch: args.branch,
    database: args.database,
    endpointName: args.endpointName,
  });
  return result.url;
}

const KNEXFILE_VARIANTS = ["knexfile.js", "knexfile.ts", "knexfile.mjs", "knexfile.cjs"];

function listKnexFiles(projectDir: string): SchemaMigrationFile[] {
  // Knex convention: ./migrations/*.{js,ts} with a numeric timestamp
  // prefix that doubles as the version identifier.
  const dir = path.join(projectDir, "migrations");
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => (f.endsWith(".js") || f.endsWith(".ts")) && !f.startsWith("."));
  return files
    .map((filename) => {
      const stem = filename.replace(/\.(js|ts)$/, "");
      const m = stem.match(/^(\d{14})_(.+)$/);
      const version = m ? m[1] : stem;
      const description = m ? m[2].replace(/[_-]/g, " ") : stem;
      const type = filename.endsWith(".ts") ? ("TypeScript" as const) : ("JavaScript" as const);
      return { version, filename, description, type, tool: "knex" as const };
    })
    .sort((a, b) => a.version.localeCompare(b.version));
}

export const KnexAdapter: SchemaMigrationAdapter = {
  id: "knex",
  languages: ["nodejs"],

  /**
   * A knexfile at the project root is the canonical Knex marker. A bare
   * package.json with no knexfile means "Node.js project, but not Knex"
   * and should NOT auto-route here. Callers can still force-select via
   * project.yaml#migration_tool.
   */
  detect(projectDir: string): boolean {
    return KNEXFILE_VARIANTS.some((name) => fs.existsSync(path.join(projectDir, name)));
  },

  async apply(args: ApplyArgs): Promise<ApplyResult> {
    const dsn = await buildDsn(args);
    try {
      const legacy = await applyKnex({ projectDir: args.projectDir, dsn });
      return {
        applied_migrations: legacy.applied as AppliedSchemaMigration[],
        status: legacy.alreadyAtLatest ? "noop" : "ok",
        tool_specific: {
          alreadyAtLatest: legacy.alreadyAtLatest,
          tool: legacy.tool,
        },
      };
    } catch (err) {
      return {
        applied_migrations: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  async rollback(args: RollbackArgs): Promise<RollbackResult> {
    const dsn = await buildDsn(args);
    try {
      const legacy = await rollbackKnex({
        projectDir: args.projectDir,
        dsn,
        target: args.target,
      });
      return {
        rolled_back: legacy.rolledBack as AppliedSchemaMigration[],
        status: legacy.rolledBack.length === 0 ? "noop" : "ok",
        tool_specific: { tool: legacy.tool },
      };
    } catch (err) {
      return {
        rolled_back: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  async status(args: StatusArgs): Promise<StatusResult> {
    const dsn = await buildDsn(args);
    try {
      const legacy = await statusKnex({ projectDir: args.projectDir, dsn });
      return {
        applied_version: legacy.current ?? null,
        pending: legacy.pending as PendingSchemaMigration[],
        applied: [],
        status: "ok",
        tool_specific: { tool: legacy.tool },
      };
    } catch (err) {
      return {
        applied_version: null,
        pending: [],
        applied: [],
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  async list(args: ListArgs): Promise<ListResult> {
    return { files: listKnexFiles(args.projectDir) };
  },

  // baseline intentionally absent. Knex has no native baseline concept;
  // omitting it advertises that correctly via the optional-capability
  // protocol so callers won't attempt the operation.
};

// Auto-register on import.
registerSchemaMigrationAdapter(KnexAdapter);
