// Canonical migration-layout resolution: the SINGLE source of truth for
// project-language detection and the per-language migration conventions
// (directory, filename pattern, watcher glob). Both the kit's own migration
// flows and the lakebase-scm-extension consume this, so the two never drift.
//
// Monorepo-aware: when the workspace root carries no language marker (a common
// monorepo shape where the app + its migrations live in a subdir, e.g.
// `recipe-app/migrations`), detection descends from the configured migration
// path toward the root and uses the first directory whose markers identify a
// language. Explicit overrides always win over detection.

import * as fs from "fs";
import * as path from "path";

/** Languages the kit knows how to detect. `unknown` maps to the Flyway
 *  defaults (the historical fallback) so callers never crash on an
 *  unrecognized layout. */
export type MigrationLanguage = "java" | "kotlin" | "python" | "nodejs" | "unknown";

const MIGRATION_LANGUAGES: readonly MigrationLanguage[] = [
  "java",
  "kotlin",
  "python",
  "nodejs",
  "unknown",
];

export interface MigrationDefaults {
  /** Default migration directory, relative to the project root. */
  path: string;
  /** Filename matcher (case-insensitive) for "is this a migration file". */
  pattern: RegExp;
  /** Watcher glob, relative to the migration directory. */
  glob: string;
}

/** Per-language conventions. `kotlin` shares the Flyway layout with `java`;
 *  `unknown` falls back to Flyway (the historical default). */
export const MIGRATION_DEFAULTS: Record<MigrationLanguage, MigrationDefaults> = {
  java: { path: "src/main/resources/db/migration", pattern: /^V\d+.*\.sql$/i, glob: "*.sql" },
  kotlin: { path: "src/main/resources/db/migration", pattern: /^V\d+.*\.sql$/i, glob: "*.sql" },
  python: { path: "alembic/versions", pattern: /^[0-9a-f][\w]*.*\.py$/i, glob: "*.py" },
  nodejs: { path: "migrations", pattern: /^\d+.*\.(js|ts)$/i, glob: "*.{js,ts}" },
  unknown: { path: "src/main/resources/db/migration", pattern: /^V\d+.*\.sql$/i, glob: "*.sql" },
};

/** Detect the project language from marker files in a SINGLE directory (no
 *  descent). Returns `unknown` when nothing matches. */
export function detectLanguageAt(dir: string): MigrationLanguage {
  if (fs.existsSync(path.join(dir, "pom.xml"))) {
    const kotlinDir = path.join(dir, "src", "main", "kotlin");
    if (fs.existsSync(kotlinDir)) {
      return "kotlin";
    }
    try {
      const pom = fs.readFileSync(path.join(dir, "pom.xml"), "utf-8");
      if (pom.includes("kotlin-maven-plugin")) {
        return "kotlin";
      }
    } catch {
      /* fall through to java */
    }
    return "java";
  }
  // pom.xml already returned above, so a package.json here is unambiguously Node.
  if (
    fs.existsSync(path.join(dir, "pyproject.toml")) ||
    fs.existsSync(path.join(dir, "requirements.txt")) ||
    fs.existsSync(path.join(dir, "alembic.ini"))
  ) {
    return "python";
  }
  if (fs.existsSync(path.join(dir, "package.json"))) {
    return "nodejs";
  }
  return "unknown";
}

/**
 * Resolve the project language. Precedence:
 *   1. explicit `override` (when it names a real language);
 *   2. marker files at the project root;
 *   3. monorepo fallback , when the root is unmarked but a `migrationPath` is
 *      configured, walk UP from the migration dir to the root and return the
 *      first directory whose markers identify a language. So a Next app whose
 *      knex migrations live in `recipe-app/migrations` resolves to `nodejs`
 *      from `recipe-app/`, not the marker-less root.
 * Returns `unknown` when nothing matches (callers map that to Flyway defaults).
 */
export function resolveMigrationLanguage(
  projectDir?: string,
  configuredMigrationPath?: string,
  override?: string,
): MigrationLanguage {
  const ov = (override ?? "").trim().toLowerCase();
  if (ov && ov !== "auto" && (MIGRATION_LANGUAGES as readonly string[]).includes(ov)) {
    return ov as MigrationLanguage;
  }
  if (!projectDir) {
    return "unknown";
  }
  const atRoot = detectLanguageAt(projectDir);
  if (atRoot !== "unknown") {
    return atRoot;
  }

  const rel = (configuredMigrationPath ?? "").trim();
  if (!rel) {
    return "unknown";
  }
  // Walk up from the configured migration dir toward the root (inclusive),
  // first marker match wins. Stay within the root so a `..`-laden path can
  // never probe outside the project.
  const rootResolved = path.resolve(projectDir);
  let dir = path.resolve(projectDir, rel);
  while (dir === rootResolved || dir.startsWith(rootResolved + path.sep)) {
    const lang = detectLanguageAt(dir);
    if (lang !== "unknown") {
      return lang;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return "unknown";
}

/**
 * Compile a user-supplied migration filename regex (case-insensitive).
 * Returns undefined for empty/invalid input so callers fall back to the
 * language default rather than throwing on a bad setting.
 */
export function compileMigrationPattern(src?: string): RegExp | undefined {
  const s = (src ?? "").trim();
  if (!s) {
    return undefined;
  }
  try {
    return new RegExp(s, "i");
  } catch {
    return undefined;
  }
}

export interface ResolveMigrationLayoutArgs {
  /** Project root. */
  projectDir?: string;
  /** Configured migration dir (relative to root). Empty = language default. */
  migrationPath?: string;
  /** Explicit language override. Empty/"auto" = detect. */
  language?: string;
  /** Explicit filename-pattern override (string regex). Empty/invalid = default. */
  migrationPattern?: string;
  /** Explicit watcher-glob override. Empty = default. */
  migrationGlob?: string;
}

export interface MigrationLayout {
  language: MigrationLanguage;
  /** Migration dir relative to the project root. */
  migrationPath: string;
  migrationPattern: RegExp;
  migrationGlob: string;
}

/**
 * Resolve the full migration layout (language + path + pattern + glob) from a
 * project root plus optional explicit overrides. Detection is the default;
 * each override wins when present. This is the one function consumers should
 * call; it composes resolveMigrationLanguage + MIGRATION_DEFAULTS + the
 * override precedence so the rules live in exactly one place.
 */
export function resolveMigrationLayout(args: ResolveMigrationLayoutArgs): MigrationLayout {
  const configuredMigrationPath = (args.migrationPath ?? "").trim();
  const language = resolveMigrationLanguage(args.projectDir, configuredMigrationPath, args.language);
  const defaults = MIGRATION_DEFAULTS[language];
  return {
    language,
    migrationPath: configuredMigrationPath || defaults.path,
    migrationPattern: compileMigrationPattern(args.migrationPattern) ?? defaults.pattern,
    migrationGlob: (args.migrationGlob ?? "").trim() || defaults.glob,
  };
}
