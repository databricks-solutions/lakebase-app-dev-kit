// FEIP-7566: apply the baseline (placeholder) migration to a freshly-created
// production branch's database.
//
// At scaffold time the kit commits a placeholder migration (alembic
// `001_init_placeholder`, flyway `V1__init_placeholder`, knex
// `001_init_placeholder`) into every long-living branch's files, but the ONLY
// path that ever *applies* migrations is the merge.yml CI job, and that job is
// guarded to skip the initial branch-creation push (github.event.before is the
// all-zero sha). So production's DB never had even the baseline stamped on it.
// A later feature migration that chains off the baseline (down_revision: "001")
// then fails to apply against prod because the parent revision was never run.
//
// The fix is to stamp the baseline onto the production DB at creation time,
// before any tier is cut: staging/dev fork from production copy-on-write, so
// they inherit the baselined alembic_version / flyway_schema_history row and
// every subsequent feature merge applies incrementally on a consistent base.
//
// This service is the single apply. It is injectable (deps.apply) so it can be
// unit-tested hermetically, and it never throws: a baseline-apply hiccup must
// not abort project creation, so failures are returned as an `error` outcome
// for the caller to surface as a loud warning.

import type {
  ApplySchemaMigrationsArgs,
  ApplySchemaMigrationsResult,
  AppliedSchemaMigration,
  SchemaMigrationLanguage,
  SchemaMigrationToolName,
} from "./schema-migrate.js";

export interface BaselineMigrateArgs {
  /** Lakebase project id (the `instance`). */
  instance: string;
  /** The production branch id to baseline (the project's default branch). */
  branch: string;
  /** The scaffolded project directory (holds the migration files). */
  projectDir: string;
  /** Project language, passed explicitly so adapter resolution never detects. */
  language: SchemaMigrationLanguage;
}

export interface BaselineMigrateDeps {
  apply: (args: ApplySchemaMigrationsArgs) => Promise<ApplySchemaMigrationsResult>;
}

export interface BaselineMigrateOutcome {
  /** `applied` = baseline ran; `noop` = already at latest; `error` = apply failed. */
  status: "applied" | "noop" | "error";
  /** Migrations applied (empty unless status === "applied"). */
  applied: AppliedSchemaMigration[];
  /** The migration tool used, when known. */
  tool?: SchemaMigrationToolName;
  /** Failure message, present only when status === "error". */
  message?: string;
}

/**
 * Apply the baseline migration to the production branch's database.
 * Never throws: returns an `error` outcome on failure so project creation
 * can continue and surface the problem as a warning.
 */
export async function applyBaselineMigration(
  args: BaselineMigrateArgs,
  deps: BaselineMigrateDeps,
): Promise<BaselineMigrateOutcome> {
  try {
    const result = await deps.apply({
      instance: args.instance,
      branch: args.branch,
      projectDir: args.projectDir,
      language: args.language,
    });
    return {
      status: result.alreadyAtLatest ? "noop" : "applied",
      applied: result.applied,
      tool: result.tool,
    };
  } catch (err) {
    return {
      status: "error",
      applied: [],
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
