// Migration adapter interface + registry skeleton (FEIP-7210 slice 1).
//
// Design: ADR-0005 (~/code/docs/adr/ADR-0005-schema-migrate-adapter.md).
//
// Today, scripts/lakebase/migrate.ts hardcodes a Flyway-first dispatch
// against a known set of language markers (pom.xml + Maven, alembic.ini +
// Python, knexfile.{js,ts} + Node). Adding a new migration tool means
// touching that dispatch. The adapter pattern inverts the dependency:
// each tool ships a MigrationAdapter that implements the contract; the
// dispatcher just routes by detection.
//
// This slice ships types only. No behavior changes. The existing
// migrate.ts surface continues to work unchanged; subsequent slices
// will port its internals into FlywayAdapter / AlembicAdapter /
// KnexAdapter implementations.
//
// Sub-tasks (per ADR-0005 implementation sequencing):
//   slice 1 (this PR): types + registry skeleton
//   slice 2: port Flyway out of migrate.ts into FlywayAdapter
//   slice 3: port Alembic + Knex (list-only)
//   slice 4: ship lakebase-schema-migrate CLI + deprecation alias for
//            lakebase-migrate
//   slice 5+: doctor checks, optional Knex completion, Liquibase,
//             custom path-based adapter

import type {
  AppliedMigration,
  MigrationFile,
  MigrationLanguage,
  MigrationToolName,
  PendingMigration,
} from "./migrate";

/**
 * Adapter id. Stable; matches `project.yaml#migration_tool` override.
 * "custom" is reserved for path-based loading via
 * `project.yaml#migration_tool_module` (slice 5+).
 */
export type MigrationAdapterId = MigrationToolName | "custom";

export interface ApplyArgs {
  instance: string;
  branch: string;
  projectDir: string;
  database?: string;
  endpointName?: string;
}

export interface ApplyResult {
  applied_migrations: AppliedMigration[];
  status: "ok" | "noop" | "error";
  error?: string;
  /**
   * Tool-specific fields outside the cross-tool contract. Adapters MAY
   * populate (e.g. Flyway's installed_rank); callers MUST treat as
   * opaque + tool-aware.
   */
  tool_specific?: Record<string, unknown>;
}

export interface RollbackArgs {
  instance: string;
  branch: string;
  projectDir: string;
  /** Adapter-specific target: revision id or relative step like "-1". */
  target: string;
  database?: string;
  endpointName?: string;
}

export interface RollbackResult {
  rolled_back: AppliedMigration[];
  status: "ok" | "noop" | "error" | "unsupported";
  error?: string;
  tool_specific?: Record<string, unknown>;
}

export interface StatusArgs {
  instance: string;
  branch: string;
  projectDir: string;
  database?: string;
  endpointName?: string;
}

export interface StatusResult {
  applied_version: string | null;
  pending: PendingMigration[];
  applied: AppliedMigration[];
  status: "ok" | "error";
  error?: string;
  tool_specific?: Record<string, unknown>;
}

export interface ListArgs {
  projectDir: string;
}

export interface ListResult {
  files: MigrationFile[];
}

export interface BaselineArgs {
  instance: string;
  branch: string;
  projectDir: string;
  version: string;
  description?: string;
  database?: string;
  endpointName?: string;
}

export interface BaselineResult {
  status: "ok" | "error" | "unsupported";
  baseline_version: string | null;
  error?: string;
  tool_specific?: Record<string, unknown>;
}

/**
 * Cross-tool migration adapter contract. Every adapter exposes the same
 * surface; tool-specific fields ride on `tool_specific` so the contract
 * stays uniform.
 */
export interface MigrationAdapter {
  readonly id: MigrationAdapterId;
  /** Languages this adapter claims. Used by auto-detection. */
  readonly languages: ReadonlyArray<MigrationLanguage>;

  /**
   * Auto-detect: does this adapter own the given project? Adapters
   * inspect marker files (pom.xml + flyway-maven-plugin for Flyway,
   * alembic.ini for Alembic, knexfile for Knex, ...).
   */
  detect(projectDir: string): boolean;

  apply(args: ApplyArgs): Promise<ApplyResult>;

  /**
   * Roll back to a target version. OPTIONAL: Flyway Community Edition
   * does not support rollback; adapters omit this property when the
   * underlying tool lacks the capability.
   */
  rollback?(args: RollbackArgs): Promise<RollbackResult>;

  status(args: StatusArgs): Promise<StatusResult>;

  list(args: ListArgs): Promise<ListResult>;

  /**
   * Apply Flyway-style baseline marker to an existing schema. OPTIONAL.
   */
  baseline?(args: BaselineArgs): Promise<BaselineResult>;
}

/**
 * In-memory adapter registry. Built-in adapters register here on import;
 * resolveAdapter walks the registry by detect() for auto-routing.
 *
 * Slice 1 ships an empty registry skeleton. Slices 2-3 register the
 * built-in Flyway / Alembic / Knex adapters as they land.
 */
const REGISTRY = new Map<MigrationAdapterId, MigrationAdapter>();

export function registerAdapter(adapter: MigrationAdapter): void {
  REGISTRY.set(adapter.id, adapter);
}

export function getAdapter(id: MigrationAdapterId): MigrationAdapter | undefined {
  return REGISTRY.get(id);
}

export function listAdapters(): MigrationAdapter[] {
  return [...REGISTRY.values()];
}

/**
 * Resolution rules:
 *   1. Explicit override -> getAdapter(override); throws when not registered.
 *   2. Auto-detect -> first registered adapter whose detect() returns true.
 *   3. None match -> throws UnresolvedAdapterError with a hint.
 */
export function resolveAdapter(
  projectDir: string,
  override?: MigrationAdapterId
): MigrationAdapter {
  if (override) {
    const a = REGISTRY.get(override);
    if (!a) {
      throw new UnresolvedAdapterError(
        `migration_tool=${override} is not a registered adapter. Registered: ${
          [...REGISTRY.keys()].join(", ") || "(none)"
        }`
      );
    }
    return a;
  }
  for (const adapter of REGISTRY.values()) {
    if (adapter.detect(projectDir)) return adapter;
  }
  throw new UnresolvedAdapterError(
    `Cannot resolve migration tool for ${projectDir}. ` +
      `Set project.yaml#migration_tool to one of: ${[...REGISTRY.keys()].join(", ") || "(none)"}.`
  );
}

export class UnresolvedAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnresolvedAdapterError";
  }
}

/**
 * Test seam: clear the registry. Production code never calls this;
 * tests use it to isolate from any auto-registered adapters that may
 * land in subsequent slices.
 */
export function _clearRegistryForTests(): void {
  REGISTRY.clear();
}
