// List migration filenames on a branch without checking it out. Lifted
// from extension's listMigrationsOnBranch.
//
// This crosses the git + migration-tool boundary, but the primitive
// itself is pure git (`ls-tree`) plus a filename filter - so it lives
// under scripts/git/ rather than scripts/lakebase/. Higher-level
// migration logic (alembic / flyway / knex orchestration) stays in
// scripts/lakebase/migrate.ts.

import { exec } from "../util/exec.js";

const DEFAULT_PATTERN = /^V\d+.*\.sql$/i;

export interface ListMigrationsOnBranchArgs {
  cwd: string;
  /** Branch (or any tree-ish) to inspect. */
  branch: string;
  /**
   * Path within the repo containing migration files (e.g.
   * "src/main/resources/db/migration"). Trailing slash optional.
   */
  migrationPath: string;
  /**
   * Regex applied to the basename of each file. Default: Flyway-style
   * `V<n>...sql` (case-insensitive). Pass an explicit pattern for
   * Alembic, Knex, or custom layouts.
   */
  pattern?: RegExp;
}

/**
 * Return migration filenames (basenames only) on `branch` matching
 * `pattern`. Sorted lexically so versioned filenames come back in
 * apply order. Returns [] when the branch doesn't exist, the migration
 * path is empty, or any underlying git call fails - migration
 * comparisons across branches in the UI shouldn't crash on a fresh
 * branch with no migrations yet.
 */
export async function listMigrationsOnBranch(
  args: ListMigrationsOnBranchArgs
): Promise<string[]> {
  const { cwd, branch, migrationPath, pattern = DEFAULT_PATTERN } = args;
  if (!branch || !migrationPath) return [];
  try {
    const raw = await exec(
      `git ls-tree --name-only "${branch}" -- "${migrationPath}/"`,
      { cwd }
    );
    if (!raw) return [];
    return raw
      .split("\n")
      .map((f) => f.split("/").pop() || f)
      .filter((f) => pattern.test(f))
      .sort();
  } catch {
    return [];
  }
}
