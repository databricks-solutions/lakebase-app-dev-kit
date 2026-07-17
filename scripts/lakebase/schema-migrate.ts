// Schema migration primitives for Lakebase-paired projects.
//
// Four canonical operations:
//   applySchemaMigrations    – run pending forward migrations against a branch
//   rollbackSchemaMigration  – undo applied migrations down to a target version
//   schemaMigrationStatus    – report current applied version + pending migrations
//   listSchemaMigrations     – enumerate available migration files (no DB needed)
//
// Language dispatch: Python/Alembic, Java+Kotlin/Flyway, and Node/Knex
// runners are all fully implemented (apply / status / list for all three;
// rollback for Alembic + Knex). The original primitives lift
// shipped Flyway + Knex as stubs; they were completed alongside
// (adapter pattern) slices 2 + 3. listSchemaMigrations() is a pure file-scan
// with no DB or runtime dependency.
//
// All primitives take explicit {instance, branch} args so headless agents
// (Claude Desktop, OpenAI Codex, CI) can call them without a project .env.
// When called from a checked-out paired project, the project's own .env is
// not consulted by these primitives, only the args passed in.

import * as fs from "node:fs";
import * as path from "node:path";
import { getConnection } from "./get-connection.js";
import { resolveMigrationLanguage } from "./migration-layout.js";
import { normalizeTierName, protectedTierNamesFromEnv } from "./branch-utils.js";
// Adapter modules auto-register on import; routing below uses
// resolveSchemaMigrationAdapter() (slice 4). The legacy public API
// (applySchemaMigrations / rollbackSchemaMigration / schemaMigrationStatus /
// listSchemaMigrations) is preserved as a thin shim over adapter calls.
import "./adapters/alembic-adapter.js";
import "./adapters/flyway-adapter.js";
import "./adapters/knex-adapter.js";
import {
  resolveSchemaMigrationAdapter,
  type SchemaMigrationAdapterId,
  type NewMigrationArgs,
  type NewMigrationResult,
  type CollapseHeadsResult,
} from "./schema-migration-adapter.js";

export type SchemaMigrationLanguage = "java" | "kotlin" | "python" | "nodejs";

export type SchemaMigrationToolName = "flyway" | "alembic" | "knex";

export interface SchemaMigrationFile {
  /** Stable identifier sortable in apply-order: Flyway `V<n>`, Alembic
   *  revision hash, Knex timestamp prefix. */
  version: string;
  filename: string;
  description: string;
  type: "SQL" | "Python" | "JavaScript" | "TypeScript";
  /** Tool that should run this file. */
  tool: SchemaMigrationToolName;
}

export interface ListSchemaMigrationsArgs {
  /** Project root. Defaults to process.cwd(). */
  projectDir?: string;
  /** Override language detection. Defaults to auto-detect from project files. */
  language?: SchemaMigrationLanguage;
}

export interface AppliedSchemaMigration {
  version: string;
  description: string;
  executionTimeMs?: number;
}

export interface ApplySchemaMigrationsArgs {
  instance: string;
  branch: string;
  projectDir?: string;
  language?: SchemaMigrationLanguage;
  database?: string;
  endpointName?: string;
  /**
   * FEIP-8039: allow migrating a PROTECTED TIER branch (main/master/staging/dev
   * + configured tiers). Default false: a build/experiment migration must target
   * its own paired feature/experiment branch, never a shared tier , an aborted
   * build that migrated a tier (or a feature branch it then reset in git only)
   * leaves the DB ahead of code. The promote path (scm-merge migrating the parent
   * tier) sets this true, that migration IS the intended tier mutation.
   */
  allowTier?: boolean;
}

export interface ApplySchemaMigrationsResult {
  applied: AppliedSchemaMigration[];
  alreadyAtLatest: boolean;
  tool: SchemaMigrationToolName;
}

export interface RollbackSchemaMigrationArgs {
  instance: string;
  branch: string;
  /** Target version or revision to roll back to. For Alembic this can be a
   *  revision identifier ("ae103…") or a relative step ("-1"). */
  target: string;
  projectDir?: string;
  language?: SchemaMigrationLanguage;
  database?: string;
  endpointName?: string;
}

export interface RollbackSchemaMigrationResult {
  rolledBack: AppliedSchemaMigration[];
  tool: SchemaMigrationToolName;
}

export interface SchemaMigrationStatusArgs {
  instance: string;
  branch: string;
  projectDir?: string;
  language?: SchemaMigrationLanguage;
  database?: string;
  endpointName?: string;
}

export interface PendingSchemaMigration {
  version: string;
  filename: string;
  description: string;
}

export interface SchemaMigrationStatusResult {
  current: string | undefined;
  pending: PendingSchemaMigration[];
  tool: SchemaMigrationToolName;
}

export class SchemaMigrationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "SchemaMigrationError";
  }
}

// ---- Language detection --------------------------------------------------

/** Detect the project language from filesystem markers. Mirrors the
 *  detection in templates/project/common/scripts/flyway-migrate.sh so the
 *  kit primitive and the bundled hook agree on which tool to run. */
export function detectLanguage(projectDir: string): SchemaMigrationLanguage {
  // Delegate to the canonical resolver (migration-layout.ts) so the kit and the
  // lakebase-scm-extension share ONE detection rule. The resolver is tolerant
  // (returns "unknown"); this throwing wrapper preserves the kit primitive's
  // historical contract for callers that require a concrete language.
  const lang = resolveMigrationLanguage(projectDir);
  if (lang === "unknown") {
    throw new SchemaMigrationError(
      `Could not detect project language in ${projectDir}. ` +
        `Expected one of: pom.xml (java/kotlin), pyproject.toml or alembic.ini (python), package.json (nodejs). ` +
        `Pass {language} explicitly to override.`
    );
  }
  return lang;
}

/** Map a language to the migration tool the kit invokes for it. */
export function toolForLanguage(language: SchemaMigrationLanguage): SchemaMigrationToolName {
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

// ---- listSchemaMigrations: pure file-scan (works for all three languages) ------
//
// Stays sync (no I/O beyond fs.readdirSync) to preserve the legacy public
// API shape. Adapter `list()` methods are Promise-returning by interface;
// tightening that to sync is a follow-up (every implementation today is
// synchronous internally).

/** Enumerate migration files in a project. No DB connection required.
 *  Order is apply-order (V1, V2, ... for Flyway; chronological for Alembic
 *  via alembic.ini-resolved order; timestamp-ascending for Knex). */
export function listSchemaMigrations(args: ListSchemaMigrationsArgs = {}): SchemaMigrationFile[] {
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

function listFlywayMigrations(projectDir: string): SchemaMigrationFile[] {
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

function listAlembicMigrations(projectDir: string): SchemaMigrationFile[] {
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

function listKnexMigrations(projectDir: string): SchemaMigrationFile[] {
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
// Public API (applySchemaMigrations / rollbackSchemaMigration / schemaMigrationStatus /
// listSchemaMigrations) is preserved verbatim for backward compatibility. It
// resolves the adapter (auto-detect or via the `language` override) and
// translates adapter results back to the legacy shapes.

/** Resolve an adapter, honoring an explicit language override. */
function adapterFor(projectDir: string, language?: SchemaMigrationLanguage) {
  const override: SchemaMigrationAdapterId | undefined = language
    ? toolForLanguage(language)
    : undefined;
  return resolveSchemaMigrationAdapter(projectDir, override);
}

// ---- FEIP-8039: protected-tier migration guard + DB-ahead-of-code detection ----

/**
 * A build/experiment migration was aimed at a PROTECTED TIER branch. Thrown so
 * the run fails loud instead of mutating a shared tier's DB (which then drifts
 * ahead of every feature's code, the class of bug behind the phantom alembic
 * revision + orphan table). The promote path opts in via `allowTier`.
 */
export class TierMigrationRefusedError extends Error {
  constructor(public readonly branch: string) {
    super(
      `Refusing to run schema migrations against protected tier branch "${branch}". ` +
        `A feature build/experiment migrates only its OWN paired branch (or an ephemeral verify branch), ` +
        `never a shared tier (main/master/staging/dev or a configured tier). If this is the promote step ` +
        `intentionally migrating the parent tier, pass allowTier: true.`,
    );
    this.name = "TierMigrationRefusedError";
  }
}

/**
 * Throw {@link TierMigrationRefusedError} when `branch` is a protected tier
 * (env-aware set: main/master/staging/dev + LAKEBASE_TIER_NAMES + configured
 * trunk/staging/base) and `allowTier` is not set. Pure , no DB, no I/O.
 */
export function assertMigrationBranchAllowed(
  branch: string,
  opts: { allowTier?: boolean },
  env: Record<string, string | undefined> = process.env,
): void {
  if (opts.allowTier) return;
  if (protectedTierNamesFromEnv(env).has(normalizeTierName(branch))) {
    throw new TierMigrationRefusedError(branch);
  }
}

/**
 * True when the DB's applied revision has NO corresponding local migration file
 * , the DB is AHEAD of code (an aborted build applied a migration whose file was
 * later git-reset away, or a re-cut branch reused a stale polluted DB). A null /
 * empty applied revision (fresh or unstamped DB) is NOT orphaned. Pure.
 */
export function dbRevisionOrphaned(
  appliedRevision: string | null | undefined,
  localRevisionIds: string[],
): boolean {
  const applied = (appliedRevision ?? "").trim();
  if (!applied) return false;
  return !localRevisionIds.includes(applied);
}

/**
 * Recover the orphan revision id from alembic's "Can't locate revision
 * identified by '<rev>'" error , the exact failure when the DB points at a
 * revision whose migration file is gone (DB ahead of code). Returns the rev id,
 * or null when the message is unrelated. Pure , parses the error text so no raw
 * SQL read of alembic_version is needed.
 */
export function parseAlembicMissingRevision(stderr: string): string | null {
  const m = /[Cc]an't locate revision identified by ['"]?([0-9a-f]+)['"]?/.exec(stderr);
  return m ? m[1] : null;
}

// ---- applySchemaMigrations -----------------------------------------------------

export async function applySchemaMigrations(args: ApplySchemaMigrationsArgs): Promise<ApplySchemaMigrationsResult> {
  // FEIP-8039: refuse a protected-tier target before any DB work (the promote
  // path opts in via allowTier). Keeps a build/experiment from migrating a tier.
  assertMigrationBranchAllowed(args.branch, { allowTier: args.allowTier });
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
    throw new SchemaMigrationError(r.error ?? "apply failed");
  }
  return {
    applied: r.applied_migrations,
    alreadyAtLatest: r.status === "noop",
    tool: adapter.id as SchemaMigrationToolName,
  };
}

// ---- rollbackSchemaMigration ---------------------------------------------------

export async function rollbackSchemaMigration(args: RollbackSchemaMigrationArgs): Promise<RollbackSchemaMigrationResult> {
  const projectDir = args.projectDir ?? process.cwd();
  const adapter = adapterFor(projectDir, args.language);
  if (!adapter.rollback) {
    throw new SchemaMigrationError(
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
    throw new SchemaMigrationError(r.error ?? "rollback failed");
  }
  return {
    rolledBack: r.rolled_back,
    tool: adapter.id as SchemaMigrationToolName,
  };
}

// ---- schemaMigrationStatus -----------------------------------------------------

export async function schemaMigrationStatus(args: SchemaMigrationStatusArgs): Promise<SchemaMigrationStatusResult> {
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
    throw new SchemaMigrationError(r.error ?? "status failed");
  }
  return {
    current: r.applied_version ?? undefined,
    pending: r.pending,
    tool: adapter.id as SchemaMigrationToolName,
  };
}

// ---- branchRevisionOrphan (FEIP-8039 live probe) -------------------------------

/**
 * Report whether the branch DB is AHEAD of code: return the applied revision id
 * that has NO local migration file, or null when the DB matches (or is behind)
 * code. This is the live probe the claim guard + reconcile use; it wraps the pure
 * detectors ({@link dbRevisionOrphaned} / {@link parseAlembicMissingRevision}).
 *
 * Two ways the DB-ahead state surfaces: `status` succeeds but its `current`
 * revision is absent from the local versions dir, OR (the common alembic case)
 * the status shell-out ERRORS with "Can't locate revision identified by '<rev>'"
 * because the revision's file was git-reset away, in which case we recover the
 * rev from that error. Any other failure (unreachable branch, no tool) returns
 * null , this is a best-effort probe, not a hard gate on connectivity.
 */
export async function branchRevisionOrphan(args: {
  instance: string;
  branch: string;
  projectDir?: string;
  language?: SchemaMigrationLanguage;
}): Promise<string | null> {
  const projectDir = args.projectDir ?? process.cwd();
  const localIds = listSchemaMigrations({ projectDir, language: args.language }).map((m) => m.version);
  try {
    const status = await schemaMigrationStatus({
      instance: args.instance,
      branch: args.branch,
      projectDir,
      language: args.language,
    });
    return dbRevisionOrphaned(status.current, localIds) ? (status.current ?? null) : null;
  } catch (e) {
    return parseAlembicMissingRevision(e instanceof Error ? e.message : String(e));
  }
}

// ---- applyAndVerifyTierMigration (FEIP-8050 Finding 25) ------------------------

export interface ApplyVerifyResult {
  ok: boolean;
  detail: string;
}

/** Injectable seams so the verify logic is testable without a live DB; both
 *  default to the real primitives. */
export interface ApplyVerifyDeps {
  apply?: (a: ApplySchemaMigrationsArgs) => Promise<ApplySchemaMigrationsResult>;
  status?: (a: SchemaMigrationStatusArgs) => Promise<SchemaMigrationStatusResult>;
}

/**
 * Apply migrations to a TARGET branch and then VERIFY that branch is actually at
 * code head before reporting success (Finding 25). The promote's local-migrate
 * fallback previously reported "in sync" purely from the apply exit code, which is
 * a lie in two ways: the apply can be a NO-OP against the wrong branch (already at
 * head), and a partial apply can leave the target behind. Reading the target's
 * own status back (pending == 0) is the only honest confirmation.
 *
 * `allowTier` is implied (promote migrates the parent tier). Returns ok=false with
 * a `migrate-unconfirmed` detail when the target is not verified at head OR the
 * verification itself cannot run, so the caller BLOCKS completion rather than
 * printing a false "in sync".
 */
export async function applyAndVerifyTierMigration(
  args: { instance: string; branch: string; projectDir: string; language?: SchemaMigrationLanguage },
  deps: ApplyVerifyDeps = {},
): Promise<ApplyVerifyResult> {
  const apply = deps.apply ?? applySchemaMigrations;
  const status = deps.status ?? schemaMigrationStatus;
  try {
    await apply({ instance: args.instance, branch: args.branch, projectDir: args.projectDir, language: args.language, allowTier: true });
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
  // Read the TARGET branch's own state back: only pending == 0 proves it is at head.
  try {
    const st = await status({ instance: args.instance, branch: args.branch, projectDir: args.projectDir, language: args.language });
    if (st.pending.length > 0) {
      return {
        ok: false,
        detail: `migrate-unconfirmed: ${args.branch} still has ${st.pending.length} pending migration(s) after the local apply (current=${st.current ?? "none"})`,
      };
    }
    return { ok: true, detail: `applied + verified ${args.branch} at head locally (current=${st.current ?? "none"})` };
  } catch (e) {
    return {
      ok: false,
      detail: `migrate-unconfirmed: could not verify ${args.branch} is at head (${e instanceof Error ? e.message : String(e)})`,
    };
  }
}

// ---- createSchemaMigration -----------------------------------------------------
//
// The create side of the adapter contract. The build (Driver) calls this
// tool-agnostically; each adapter names the new migration in its own native
// sequential scheme (Flyway V<n>, Alembic zero-padded rev-id, Knex timestamp)
// so the Driver never learns three toolchains.

/**
 * A migration version stamp: 14-digit UTC `YYYYMMDDHHMMSS`, matching Knex's
 * default migration prefix. All three tools share this one scheme so versions
 * are globally unique (no cross-branch collision when sibling features fork
 * from the same tier head) and lexicographically == chronologically sortable.
 * The clock is injectable so tests are deterministic.
 */
export function migrationTimestamp(now: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return (
    `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}` +
    `${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`
  );
}

/** Slugify a human description into a snake_case filename component. */
export function migrationSlug(description: string): string {
  return (
    description
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "migration"
  );
}

export interface CreateSchemaMigrationArgs extends NewMigrationArgs {
  /** Override language detection. Defaults to auto-detect from project files. */
  language?: SchemaMigrationLanguage;
}

/**
 * Create a new, correctly-named migration via the project's tool adapter.
 * Throws SchemaMigrationError if the resolved adapter has no create step.
 */
export async function createSchemaMigration(args: CreateSchemaMigrationArgs): Promise<NewMigrationResult> {
  const projectDir = args.projectDir ?? process.cwd();
  const adapter = adapterFor(projectDir, args.language);
  if (!adapter.newMigration) {
    throw new SchemaMigrationError(
      `Adapter '${adapter.id}' does not support creating migrations.`
    );
  }
  const r = await adapter.newMigration({
    projectDir,
    slug: args.slug,
    autogenerate: args.autogenerate,
    instance: args.instance,
    branch: args.branch,
    database: args.database,
    endpointName: args.endpointName,
  });
  if (r.status === "error") {
    throw new SchemaMigrationError(r.error ?? "create migration failed");
  }
  return r;
}

// ---- collapseMigrationHeads ----------------------------------------------------
//
// Unify multiple migration heads at a sibling-merge boundary. DAG tools
// (Alembic) implement it; flat-list tools (Flyway, Knex) omit it, so this is a
// no-op for them. Idempotent: a single head is a no-op too.

export interface CollapseMigrationHeadsArgs {
  projectDir?: string;
  /** Override language detection. Defaults to auto-detect from project files. */
  language?: SchemaMigrationLanguage;
  /** Message for the generated merge revision (Alembic). */
  message?: string;
  /** Detect-only: report heads without creating a merge revision. */
  dryRun?: boolean;
}

export async function collapseMigrationHeads(
  args: CollapseMigrationHeadsArgs
): Promise<CollapseHeadsResult> {
  const projectDir = args.projectDir ?? process.cwd();
  const adapter = adapterFor(projectDir, args.language);
  if (!adapter.collapseHeads) {
    // Flat-list tool (Flyway/Knex): no DAG, nothing to collapse.
    return { status: "noop", headsBefore: [] };
  }
  const r = await adapter.collapseHeads({ projectDir, message: args.message, dryRun: args.dryRun });
  if (r.status === "error") {
    throw new SchemaMigrationError(r.error ?? "collapse heads failed");
  }
  return r;
}
