// Schema migration primitives for Lakebase-paired projects (FEIP-7091).
//
// Four canonical operations:
//   applyMigrations    – run pending forward migrations against a branch
//   rollbackMigration  – undo applied migrations down to a target version
//   migrationStatus    – report current applied version + pending migrations
//   listMigrations     – enumerate available migration files (no DB needed)
//
// Language dispatch: Python/Alembic, Java+Kotlin/Flyway, and Node/Knex
// runners are all fully implemented (apply / status / list for all three;
// rollback for Alembic + Knex). The original primitives lift (FEIP-7091)
// shipped Flyway + Knex as stubs; they were completed alongside FEIP-7210
// (adapter pattern) slices 2 + 3. listMigrations() is a pure file-scan
// with no DB or runtime dependency.
//
// All primitives take explicit {instance, branch} args so headless agents
// (Claude Desktop, OpenAI Codex, CI) can call them without a project .env.
// When called from a checked-out paired project, the project's own .env is
// not consulted by these primitives, only the args passed in.

import * as fs from "node:fs";
import * as path from "node:path";
import { getConnection } from "./get-connection.js";
// Adapter modules auto-register on import; routing below uses
// resolveAdapter() (FEIP-7210 slice 4). The legacy public API
// (applyMigrations / rollbackMigration / migrationStatus /
// listMigrations) is preserved as a thin shim over adapter calls.
import "./adapters/alembic-adapter.js";
import "./adapters/flyway-adapter.js";
import "./adapters/knex-adapter.js";
import { resolveAdapter, type MigrationAdapterId } from "./migration-adapter.js";

export type MigrationLanguage = "java" | "kotlin" | "python" | "nodejs";

export type MigrationToolName = "flyway" | "alembic" | "knex";

export interface MigrationFile {
  /** Stable identifier sortable in apply-order: Flyway `V<n>`, Alembic
   *  revision hash, Knex timestamp prefix. */
  version: string;
  filename: string;
  description: string;
  type: "SQL" | "Python" | "JavaScript" | "TypeScript";
  /** Tool that should run this file. */
  tool: MigrationToolName;
}

export interface ListMigrationsArgs {
  /** Project root. Defaults to process.cwd(). */
  projectDir?: string;
  /** Override language detection. Defaults to auto-detect from project files. */
  language?: MigrationLanguage;
}

export interface AppliedMigration {
  version: string;
  description: string;
  executionTimeMs?: number;
}

export interface ApplyMigrationsArgs {
  instance: string;
  branch: string;
  projectDir?: string;
  language?: MigrationLanguage;
  database?: string;
  endpointName?: string;
}

export interface ApplyMigrationsResult {
  applied: AppliedMigration[];
  alreadyAtLatest: boolean;
  tool: MigrationToolName;
}

export interface RollbackMigrationArgs {
  instance: string;
  branch: string;
  /** Target version or revision to roll back to. For Alembic this can be a
   *  revision identifier ("ae103…") or a relative step ("-1"). */
  target: string;
  projectDir?: string;
  language?: MigrationLanguage;
  database?: string;
  endpointName?: string;
}

export interface RollbackMigrationResult {
  rolledBack: AppliedMigration[];
  tool: MigrationToolName;
}

export interface MigrationStatusArgs {
  instance: string;
  branch: string;
  projectDir?: string;
  language?: MigrationLanguage;
  database?: string;
  endpointName?: string;
}

export interface PendingMigration {
  version: string;
  filename: string;
  description: string;
}

export interface MigrationStatusResult {
  current: string | undefined;
  pending: PendingMigration[];
  tool: MigrationToolName;
}

export class MigrationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "MigrationError";
  }
}

// ---- Language detection --------------------------------------------------

/** Detect the project language from filesystem markers. Mirrors the
 *  detection in templates/project/common/scripts/flyway-migrate.sh so the
 *  kit primitive and the bundled hook agree on which tool to run. */
export function detectLanguage(projectDir: string): MigrationLanguage {
  if (fs.existsSync(path.join(projectDir, "pom.xml"))) {
    // pom.xml present, default to "java"; kotlin still uses pom + Flyway.
    return "java";
  }
  if (
    fs.existsSync(path.join(projectDir, "pyproject.toml")) ||
    fs.existsSync(path.join(projectDir, "requirements.txt")) ||
    fs.existsSync(path.join(projectDir, "alembic.ini"))
  ) {
    return "python";
  }
  if (fs.existsSync(path.join(projectDir, "package.json"))) {
    return "nodejs";
  }
  throw new MigrationError(
    `Could not detect project language in ${projectDir}. ` +
      `Expected one of: pom.xml (java/kotlin), pyproject.toml or alembic.ini (python), package.json (nodejs). ` +
      `Pass {language} explicitly to override.`
  );
}

/** Map a language to the migration tool the kit invokes for it. */
export function toolForLanguage(language: MigrationLanguage): MigrationToolName {
  switch (language) {
    case "java":
    case "kotlin":
      return "flyway";
    case "python":
      return "alembic";
    case "nodejs":
      return "knex";
  }
}

// ---- listMigrations: pure file-scan (works for all three languages) ------
//
// Stays sync (no I/O beyond fs.readdirSync) to preserve the legacy public
// API shape. Adapter `list()` methods are Promise-returning by interface;
// tightening that to sync is a follow-up (every implementation today is
// synchronous internally).

/** Enumerate migration files in a project. No DB connection required.
 *  Order is apply-order (V1, V2, ... for Flyway; chronological for Alembic
 *  via alembic.ini-resolved order; timestamp-ascending for Knex). */
export function listMigrations(args: ListMigrationsArgs = {}): MigrationFile[] {
  const projectDir = args.projectDir ?? process.cwd();
  const language = args.language ?? detectLanguage(projectDir);
  const tool = toolForLanguage(language);

  switch (tool) {
    case "flyway":
      return listFlywayMigrations(projectDir);
    case "alembic":
      return listAlembicMigrations(projectDir);
    case "knex":
      return listKnexMigrations(projectDir);
  }
}

function listFlywayMigrations(projectDir: string): MigrationFile[] {
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

function listAlembicMigrations(projectDir: string): MigrationFile[] {
  const candidates = [
    path.join(projectDir, "migrations", "versions"),
    path.join(projectDir, "alembic", "versions"),
  ];
  const dir = candidates.find((p) => fs.existsSync(p));
  if (!dir) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".py") && !f.startsWith("__"));
  return files
    .map((filename) => {
      const stem = filename.replace(/\.py$/, "");
      const sep = stem.indexOf("_");
      const version = sep === -1 ? stem : stem.slice(0, sep);
      const description = sep === -1 ? "" : stem.slice(sep + 1).replace(/_/g, " ");
      return { version, filename, description, type: "Python" as const, tool: "alembic" as const };
    })
    .sort((a, b) => a.filename.localeCompare(b.filename));
}

function listKnexMigrations(projectDir: string): MigrationFile[] {
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

/** Compare Flyway-style version strings: "1", "2", "1.2", "1.2.3". */
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

// ---- DSN helper (kept for any out-of-tree caller that imports it; the
// adapter routing above builds DSNs inside each adapter) ------------------

/** Build a Postgres DSN for the target branch. Retained as part of the
 *  public surface for backward compatibility with any consumer that
 *  imports it directly. */
async function dsnFor(args: {
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

// ---- Adapter routing -----------------------------------------------------
//
// Public API (applyMigrations / rollbackMigration / migrationStatus /
// listMigrations) is preserved verbatim for backward compatibility. It
// resolves the adapter (auto-detect or via the `language` override) and
// translates adapter results back to the legacy shapes.

/** Resolve an adapter, honoring an explicit language override. */
function adapterFor(projectDir: string, language?: MigrationLanguage) {
  const override: MigrationAdapterId | undefined = language
    ? toolForLanguage(language)
    : undefined;
  return resolveAdapter(projectDir, override);
}

// ---- applyMigrations -----------------------------------------------------

export async function applyMigrations(args: ApplyMigrationsArgs): Promise<ApplyMigrationsResult> {
  const projectDir = args.projectDir ?? process.cwd();
  const adapter = adapterFor(projectDir, args.language);
  const r = await adapter.apply({
    instance: args.instance,
    branch: args.branch,
    projectDir,
    database: args.database,
    endpointName: args.endpointName,
  });
  if (r.status === "error") {
    throw new MigrationError(r.error ?? "apply failed");
  }
  return {
    applied: r.applied_migrations,
    alreadyAtLatest: r.status === "noop",
    tool: adapter.id as MigrationToolName,
  };
}

// ---- rollbackMigration ---------------------------------------------------

export async function rollbackMigration(args: RollbackMigrationArgs): Promise<RollbackMigrationResult> {
  const projectDir = args.projectDir ?? process.cwd();
  const adapter = adapterFor(projectDir, args.language);
  if (!adapter.rollback) {
    throw new MigrationError(
      `Adapter '${adapter.id}' does not support rollback. ` +
        `(Flyway Community Edition has no \`undo\`; other adapters may omit rollback by design.)`
    );
  }
  const r = await adapter.rollback({
    instance: args.instance,
    branch: args.branch,
    projectDir,
    target: args.target,
    database: args.database,
    endpointName: args.endpointName,
  });
  if (r.status === "error") {
    throw new MigrationError(r.error ?? "rollback failed");
  }
  return {
    rolledBack: r.rolled_back,
    tool: adapter.id as MigrationToolName,
  };
}

// ---- migrationStatus -----------------------------------------------------

export async function migrationStatus(args: MigrationStatusArgs): Promise<MigrationStatusResult> {
  const projectDir = args.projectDir ?? process.cwd();
  const adapter = adapterFor(projectDir, args.language);
  const r = await adapter.status({
    instance: args.instance,
    branch: args.branch,
    projectDir,
    database: args.database,
    endpointName: args.endpointName,
  });
  if (r.status === "error") {
    throw new MigrationError(r.error ?? "status failed");
  }
  return {
    current: r.applied_version ?? undefined,
    pending: r.pending,
    tool: adapter.id as MigrationToolName,
  };
}
