// FlywayAdapter: SchemaMigrationAdapter implementation for Java/Kotlin projects
// using flyway-maven-plugin. FEIP-7210 slice 2.
//
// Wraps the existing scripts/lakebase/schema-migrate-runners/flyway.ts runner
// in the cross-tool adapter contract from ADR-0005. The runner's
// underlying behavior is unchanged; this is a contract adapter, not a
// reimplementation.
//
// Note: Flyway Community Edition does NOT support rollback. The adapter
// omits the `rollback` method per the ADR-0005 optional-capability
// protocol; callers MUST property-check before invoking.

import * as fs from "node:fs";
import * as path from "node:path";

import { getConnection } from "../get-connection.js";
import {
  applyFlyway,
  statusFlyway,
} from "../schema-migrate-runners/flyway.js";
import {
  migrationSlug,
  nextMigrationNumber,
  type AppliedSchemaMigration,
  type SchemaMigrationFile,
  type PendingSchemaMigration,
} from "../schema-migrate.js";
import {
  registerSchemaMigrationAdapter,
  type ApplyArgs,
  type ApplyResult,
  type ListArgs,
  type ListResult,
  type NewMigrationArgs,
  type NewMigrationResult,
  type SchemaMigrationAdapter,
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

function listFlywayFiles(projectDir: string): SchemaMigrationFile[] {
  // Flyway convention: src/main/resources/db/migration/V<n>__<desc>.sql
  const dir = path.join(projectDir, "src", "main", "resources", "db", "migration");
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => /^V\d+(\.\d+)*__.+\.sql$/.test(f));
  return files
    .map((filename) => {
      const m = filename.match(/^V(\d+(?:\.\d+)*)__(.+)\.sql$/);
      const version = m![1];
      const description = m![2].replace(/_/g, " ");
      return { version, filename, description, type: "SQL" as const, tool: "flyway" as const };
    })
    .sort((a, b) => versionCompare(a.version, b.version));
}

function versionCompare(a: string, b: string): number {
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

export const FlywayAdapter: SchemaMigrationAdapter = {
  id: "flyway",
  languages: ["java", "kotlin"],

  detect(projectDir: string): boolean {
    return fs.existsSync(path.join(projectDir, "pom.xml"));
  },

  async apply(args: ApplyArgs): Promise<ApplyResult> {
    const dsn = await buildDsn(args);
    try {
      const legacy = await applyFlyway({ projectDir: args.projectDir, dsn });
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

  // rollback intentionally absent: Flyway Community Edition does not
  // support it. Callers MUST property-check (`adapter.rollback?` /
  // `if (adapter.rollback)`) before invoking.

  async status(args: StatusArgs): Promise<StatusResult> {
    const dsn = await buildDsn(args);
    try {
      const legacy = await statusFlyway({ projectDir: args.projectDir, dsn });
      return {
        applied_version: legacy.current ?? null,
        pending: legacy.pending as PendingSchemaMigration[],
        // Legacy statusFlyway does not return the applied history; we
        // surface only the currently-applied version + pending. Adapters
        // that complete this (Alembic, future Knex) MAY populate.
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
    return { files: listFlywayFiles(args.projectDir) };
  },

  // baseline intentionally absent. Flyway DOES support baseline at the
  // tool level, but exposing it cleanly requires plumbing flags into the
  // existing runner. Deferred to a follow-up slice; the adapter's
  // optional-protocol shape makes this additive.

  async newMigration(args: NewMigrationArgs): Promise<NewMigrationResult> {
    // Flyway has no `generate` command: migrations are hand-written SQL whose
    // V<n> prefix IS the ordering. We create the next-numbered skeleton (the
    // Driver writes the DDL/DML). autogenerate is ignored (no model diffing).
    try {
      const dir = path.join(args.projectDir, "src", "main", "resources", "db", "migration");
      fs.mkdirSync(dir, { recursive: true });
      const n = nextMigrationNumber(listFlywayFiles(args.projectDir).map((f) => f.version));
      const slug = migrationSlug(args.slug);
      const filename = `V${n}__${slug}.sql`;
      const full = path.join(dir, filename);
      if (fs.existsSync(full)) throw new Error(`${filename} already exists`);
      fs.writeFileSync(
        full,
        `-- V${n}: ${args.slug}\n-- Flyway migration (write your DDL/DML below).\n`,
        "utf8"
      );
      return { status: "ok", version: String(n), filename, path: full };
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
};

// Auto-register on import. Consumers that import this module get the
// adapter visible to resolveSchemaMigrationAdapter; consumers that don't import it
// see no adapter (the registry stays empty and resolveSchemaMigrationAdapter throws
// the helpful UnresolvedSchemaMigrationAdapterError).
registerSchemaMigrationAdapter(FlywayAdapter);
