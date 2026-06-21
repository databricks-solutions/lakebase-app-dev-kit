// Auto-migration for the artifact root rename (.tdd -> .sftdd).
//
// WHY THIS EXISTS: the workflow's on-disk artifact directory was renamed from
// ".tdd" to ".sftdd" to match the lakebase-sftdd-workflows skill. Existing
// projects still have a ".tdd" dir. Rather than force a manual migration, the
// orchestrator calls migrateLegacyArtifactDir() on entry: a legacy ".tdd" is
// renamed to ".sftdd" in place on the next run, preserving git history when the
// project is a git repo. Idempotent and safe: a no-op once ".sftdd" exists or
// when no ".tdd" is present.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { join } from "node:path";

import { ARTIFACT_ROOT, LEGACY_ARTIFACT_ROOT } from "./sftdd-paths.js";

export interface MigrationResult {
  /** True only when a legacy ".tdd" was renamed to ".sftdd" on this call. */
  migrated: boolean;
  /** The resolved artifact-root path after the call. */
  root: string;
  /** "git" when git mv preserved history, "fs" for a plain rename, undefined when no migration happened. */
  via?: "git" | "fs";
}

function isGitRepo(projectDir: string): boolean {
  return fs.existsSync(join(projectDir, ".git"));
}

/** Rewrite a project's .gitignore entries that point at the legacy root so a
 *  freshly migrated ".sftdd" keeps the same ignore rules (e.g. the per-run
 *  agent-log + run-config). Only lines whose path segment is the legacy root
 *  are touched; everything else is preserved verbatim. No-op when absent. */
function rewriteGitignore(projectDir: string): void {
  const gi = join(projectDir, ".gitignore");
  if (!fs.existsSync(gi)) return;
  const before = fs.readFileSync(gi, "utf8");
  const after = before.replace(
    new RegExp(`(^|\\s)${LEGACY_ARTIFACT_ROOT.replace(".", "\\.")}/`, "gm"),
    `$1${ARTIFACT_ROOT}/`,
  );
  if (after !== before) fs.writeFileSync(gi, after);
}

/** Rename a legacy ".tdd" artifact dir to ".sftdd" when the new one does not
 *  yet exist. Prefers `git mv` so history follows the rename; falls back to a
 *  filesystem rename. No-op (migrated: false) when ".sftdd" already exists or
 *  when there is no legacy ".tdd" to migrate. */
export function migrateLegacyArtifactDir(projectDir: string = process.cwd()): MigrationResult {
  const next = join(projectDir, ARTIFACT_ROOT);
  const legacy = join(projectDir, LEGACY_ARTIFACT_ROOT);

  if (fs.existsSync(next)) return { migrated: false, root: next };
  if (!fs.existsSync(legacy)) return { migrated: false, root: next };

  if (isGitRepo(projectDir)) {
    try {
      execFileSync("git", ["mv", LEGACY_ARTIFACT_ROOT, ARTIFACT_ROOT], {
        cwd: projectDir,
        stdio: "ignore",
      });
      rewriteGitignore(projectDir);
      return { migrated: true, root: next, via: "git" };
    } catch {
      // git mv can fail (e.g. the dir was never tracked); fall through to fs.
    }
  }

  fs.renameSync(legacy, next);
  rewriteGitignore(projectDir);
  return { migrated: true, root: next, via: "fs" };
}
