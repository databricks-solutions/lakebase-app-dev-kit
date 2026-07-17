// AlembicAdapter: SchemaMigrationAdapter implementation for Python projects
// using Alembic. slice 3.
//
// Wraps the existing scripts/lakebase/schema-migrate-runners/alembic.ts runner
// in the cross-tool adapter contract from ADR-0005. The runner's
// underlying behavior is unchanged; this is a contract adapter, not a
// reimplementation.
//
// Alembic supports rollback natively (downgrade), so this adapter
// implements the optional rollback method. baseline is deferred to a
// follow-up slice; Alembic's `stamp` command is the equivalent, but
// wiring it through cleanly requires runner changes.

import * as fs from "node:fs";
import * as path from "node:path";

import { getConnection } from "../get-connection.js";
import {
  applyAlembic,
  createAlembicRevision,
  listAlembicHeads,
  mergeAlembicHeads,
  rollbackAlembic,
  stampAlembic,
  statusAlembic,
} from "../schema-migrate-runners/alembic.js";
import {
  migrationSlug,
  migrationTimestamp,
  type AppliedSchemaMigration,
  type SchemaMigrationFile,
  type PendingSchemaMigration,
} from "../schema-migrate.js";
import {
  registerSchemaMigrationAdapter,
  type ApplyArgs,
  type ApplyResult,
  type CollapseHeadsArgs,
  type CollapseHeadsResult,
  type ListArgs,
  type ListResult,
  type NewMigrationArgs,
  type NewMigrationResult,
  type SchemaMigrationAdapter,
  type RollbackArgs,
  type RollbackResult,
  type StampArgs,
  type StampResult,
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

/**
 * Locate the Alembic versions directory. Convention: either
 * `migrations/versions/` (alembic.ini `script_location = migrations`) or
 * `alembic/versions/` (the default `alembic init` layout).
 */
function findVersionsDir(projectDir: string): string | undefined {
  const candidates = [
    path.join(projectDir, "migrations", "versions"),
    path.join(projectDir, "alembic", "versions"),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function listAlembicFiles(projectDir: string): SchemaMigrationFile[] {
  const dir = findVersionsDir(projectDir);
  if (!dir) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".py") && !f.startsWith("__"));
  // Alembic file convention: <revid>_<slug>.py. True apply order requires
  // walking the down_revision DAG, which Alembic itself enforces at apply
  // time. For pure listing purposes, lexicographic by filename matches
  // common revid schemes (zero-padded sequences, timestamps).
  return files
    .map((filename) => {
      const stem = filename.replace(/\.py$/, "");
      const sep = stem.indexOf("_");
      const version = sep === -1 ? stem : stem.slice(0, sep);
      const description = sep === -1 ? "" : stem.slice(sep + 1).replace(/_/g, " ");
      return {
        version,
        filename,
        description,
        type: "Python" as const,
        tool: "alembic" as const,
      };
    })
    .sort((a, b) => a.filename.localeCompare(b.filename));
}

export const AlembicAdapter: SchemaMigrationAdapter = {
  id: "alembic",
  languages: ["python"],

  /**
   * Detect Alembic-specifically rather than Python-broadly. A project
   * with pyproject.toml but no alembic.ini and no env.py is a Python
   * project that hasn't (yet) adopted Alembic, and should NOT auto-route
   * here. Callers can still force-select via project.yaml#migration_tool.
   */
  detect(projectDir: string): boolean {
    if (fs.existsSync(path.join(projectDir, "alembic.ini"))) return true;
    if (fs.existsSync(path.join(projectDir, "migrations", "env.py"))) return true;
    if (fs.existsSync(path.join(projectDir, "alembic", "env.py"))) return true;
    return false;
  },

  async apply(args: ApplyArgs): Promise<ApplyResult> {
    const dsn = await buildDsn(args);
    try {
      const legacy = await applyAlembic({ projectDir: args.projectDir, dsn });
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
      const legacy = await rollbackAlembic({
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

  async stamp(args: StampArgs): Promise<StampResult> {
    const dsn = await buildDsn(args);
    try {
      const r = await stampAlembic({ projectDir: args.projectDir, dsn, revision: args.revision });
      return { status: "ok", stamped_revision: r.stamped, tool_specific: { tool: r.tool } };
    } catch (err) {
      return {
        status: "error",
        stamped_revision: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  async status(args: StatusArgs): Promise<StatusResult> {
    const dsn = await buildDsn(args);
    try {
      const legacy = await statusAlembic({ projectDir: args.projectDir, dsn });
      return {
        applied_version: legacy.current ?? null,
        pending: legacy.pending as PendingSchemaMigration[],
        // The legacy statusAlembic returns current + pending, not the
        // full applied history. Surface what we have. Backfilling the
        // applied list requires an extra `alembic history -r base:current`
        // call; deferred to a follow-up so this slice stays a pure port.
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
    return { files: listAlembicFiles(args.projectDir) };
  },

  // baseline intentionally absent in slice 3. Alembic exposes `stamp`
  // as the equivalent operation; deferred to a follow-up.

  async newMigration(args: NewMigrationArgs): Promise<NewMigrationResult> {
    try {
      if (args.autogenerate && (!args.instance || !args.branch)) {
        throw new Error("autogenerate requires both instance and branch (to diff models vs the branch DB)");
      }
      // Timestamp rev-id: globally unique + chronologically sortable, so sibling
      // features forking from the same head never pick the same id. Alembic
      // still chains via down_revision; collapsing the resulting heads at merge
      // is handled by the merge step, not here.
      const revId = migrationTimestamp();
      const dsn = args.autogenerate
        ? await buildDsn({
            instance: args.instance!,
            branch: args.branch!,
            database: args.database,
            endpointName: args.endpointName,
          })
        : undefined;
      const created = await createAlembicRevision({
        projectDir: args.projectDir,
        revId,
        message: args.slug,
        autogenerate: !!args.autogenerate,
        dsn,
      });
      return { status: "ok", version: revId, filename: path.basename(created), path: created };
    } catch (err) {
      return {
        status: "error",
        version: "",
        filename: "",
        path: "",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  async collapseHeads(args: CollapseHeadsArgs): Promise<CollapseHeadsResult> {
    // Sibling features forked from the same head leave two heads after merge.
    // Unify them with a native merge revision (no file rewriting). Idempotent:
    // a single head is a no-op.
    try {
      const heads = await listAlembicHeads(args.projectDir);
      if (heads.length <= 1) return { status: "noop", headsBefore: heads };
      // Detect-only (scm-doctor): report the multi-head state, do not merge.
      if (args.dryRun) return { status: "ok", headsBefore: heads };
      const created = await mergeAlembicHeads(args.projectDir, args.message ?? "merge heads");
      const mergeRevision = path.basename(created).replace(/\.py$/, "").split("_")[0];
      return { status: "ok", headsBefore: heads, mergeRevision, path: created };
    } catch (err) {
      return {
        status: "error",
        headsBefore: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

// Auto-register on import. Consumers that import this module get the
// adapter visible to resolveSchemaMigrationAdapter; consumers that don't import it
// see no adapter (the registry stays empty and resolveSchemaMigrationAdapter throws
// the helpful UnresolvedSchemaMigrationAdapterError).
registerSchemaMigrationAdapter(AlembicAdapter);
