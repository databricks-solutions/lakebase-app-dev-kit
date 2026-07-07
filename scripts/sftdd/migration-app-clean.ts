// Deterministic migration-self-containment check (the migration-app-coupling smell).
// A migration is an IMMUTABLE historical artifact; the app is mutable. A migration
// that imports app code at module scope (`from app... import x`, `import app`) couples
// the two: a later rename/move/removal of that symbol breaks replaying the migration
// from base, and `alembic history`/`heads` (which load every revision module WITHOUT
// running env.py) fail to import `app` unless the path happens to be set. It greens
// under `alembic upgrade` (env.py sets sys.path) yet breaks in CI's `alembic history`.
//
// This catches it DETERMINISTICALLY, no model judgment: scan the migration files for
// MODULE-SCOPE imports of the app package. An import INSIDE a function body (indented)
// is fine (it runs only when that migration executes, and app code is importable
// then); only top-level (column-0) app imports are flagged. A finding is a precise
// file:line list the Driver repairs by inlining a frozen copy of the needed logic (or
// raw SQL). Mirrors the `contract-clean` / `layering-clean` / `imports-clean` gates.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

export interface MigrationAppCleanArgs {
  /** Project working-tree root. */
  projectDir: string;
  /** Migration dirs to scan (relative to projectDir). Default: common locations. */
  migrationDirs?: string[];
}

export interface MigrationAppViolation {
  /** Project-relative file path. */
  file: string;
  /** 1-based line number. */
  line: number;
  /** The offending source line (trimmed). */
  text: string;
}

export interface MigrationAppCleanResult {
  clean: boolean;
  /** Module-scope app imports found in migration files. */
  violations: MigrationAppViolation[];
  /** A precise, Driver-actionable repair directive, or undefined when clean. */
  remediation?: string;
}

const DEFAULT_MIGRATION_DIRS = ["alembic/versions", "migrations", "db/migrations", "src/migrations"];
const EXCLUDE_DIR = /(^|\/)(node_modules|\.git|\.venv|venv|__pycache__)(\/|$)/;

/** A MODULE-SCOPE (column 0, no leading whitespace) import of the `app` package:
 *  `from app import ...`, `from app.services import ...`, `import app`, `import app.x`.
 *  The `\b` after `app` keeps `application` / `app_config` / `apples` from matching. */
const MODULE_SCOPE_APP_IMPORT = /^(from\s+app\b|import\s+app\b)/;

function walk(dir: string, keep: (abs: string) => boolean, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = join(dir, e);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (!EXCLUDE_DIR.test(abs)) walk(abs, keep, out);
    } else if (st.isFile() && keep(abs)) {
      out.push(abs);
    }
  }
  return out;
}

/** Scan the project's migration files for module-scope imports of the app package. */
export function checkMigrationAppClean(args: MigrationAppCleanArgs): MigrationAppCleanResult {
  const migrationDirs = args.migrationDirs ?? DEFAULT_MIGRATION_DIRS;
  const violations: MigrationAppViolation[] = [];
  for (const md of migrationDirs) {
    const abs = join(args.projectDir, md);
    if (!existsSync(abs)) continue;
    for (const file of walk(abs, (p) => extname(p) === ".py")) {
      let lines: string[];
      try {
        lines = readFileSync(file, "utf8").split("\n");
      } catch {
        continue;
      }
      lines.forEach((text, i) => {
        // Column 0 only: an indented import lives inside a function body (fine).
        if (MODULE_SCOPE_APP_IMPORT.test(text)) {
          violations.push({ file: relative(args.projectDir, file), line: i + 1, text: text.trim().slice(0, 200) });
        }
      });
    }
  }
  if (violations.length === 0) return { clean: true, violations: [] };

  const list = violations.map((v) => `  ${v.file}:${v.line}  ${v.text}`).join("\n");
  const remediation =
    `MIGRATION-APP-COUPLING: the migration(s) below import app code at module scope. A migration is an` +
    ` immutable historical artifact; importing mutable app code means a later rename/move/removal of that symbol` +
    ` breaks replaying the migration from base, and it loads under \`alembic upgrade\` (env.py sets sys.path) yet` +
    ` fails in \`alembic history\`/\`heads\` (which do not). Make the migration self-contained: inline a frozen copy` +
    ` of the needed logic directly in the migration file (or express the change in raw SQL). Do NOT import from` +
    ` app.* at module scope:\n${list}`;
  return { clean: false, violations, remediation };
}
