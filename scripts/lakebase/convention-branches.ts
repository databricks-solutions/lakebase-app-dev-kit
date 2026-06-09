/**
 * Branch convention helpers – `createFeatureBranch / createTestBranch /
 * createUatBranch / createPerfBranch`.
 *
 * The PSA branching methodology (see
 * skills/lakebase-release-workflows/SKILL.md + references/branching-and-
 * release-methodology.md) defines four short-tier workflow branch types
 * that fork from `staging`:
 *
 *   prod ── staging ── feature   (active feature dev)
 *                  ├── test      (integration testing)
 *                  ├── uat       (user acceptance)
 *                  └── perf      (performance / load)
 *
 * Each is finite-lifetime – tied to a specific dev cycle, not a permanent
 * tier. So unlike `createLongRunningBranch` (which sets `no_expiry: true`
 * for the prod/staging tiers), these helpers default to a Lakebase TTL.
 *
 * Per-tier TTL defaults (override via `args.ttl`):
 *   feature: 30 days (typical feature dev cycle)
 *   test:    14 days
 *   uat:     14 days
 *   perf:     7 days
 *
 * All four fork from `staging` by default. Callers in non-staging-rooted
 * projects can override via `parentBranch`.
 */

import { BranchLookupOpts } from "./branch-utils.js";
import { KIT_TIMEOUTS, formatLakebaseTtl } from "./kit-config.js";
import {
  createPairedBranch,
  type CreatePairedBranchResult,
} from "./paired-branch.js";

/**
 * Tier defaults. Exported so tests + future tickets can introspect.
 *
 * **Workspace TTL caveat:** the PSA-convention TTLs below (30d feature,
 * 14d test/uat, 7d perf) are the documented norms but some Lakebase
 * workspaces enforce a tighter maximum-expiration policy. Workspaces
 * with tighter caps can override each tier's default via the matching
 * env var on KIT_TIMEOUTS (e.g.
 * `LAKEBASE_KIT_FEATURE_BRANCH_TTL_MS=604800000` for 7-day feature
 * branches). When a workspace rejects a TTL even after override,
 * the substrate raises {@link LakebaseBranchTtlTooLongError} with a
 * typed, actionable message. Callers can also override `ttl` per-call
 * or set `noExpiry: true` for the long-running tiers. The
 * `history_retention_duration` field on
 * `databricks postgres get-project` is a conservative starting point.
 */
export const CONVENTION_TIER_DEFAULTS = {
  feature: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.featureBranchTtlMs), parentBranch: "staging" },
  test: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.testBranchTtlMs), parentBranch: "staging" },
  uat: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.uatBranchTtlMs), parentBranch: "staging" },
  perf: { ttl: formatLakebaseTtl(KIT_TIMEOUTS.perfBranchTtlMs), parentBranch: "staging" },
} as const;

export interface CreateConventionBranchArgs extends BranchLookupOpts {
  /** Target branch name. Will be sanitized to a Lakebase id. */
  branch: string;
  /** Override the parent branch. Defaults to "staging" for all four tiers. */
  parentBranch?: string;
  /** Override the TTL. Defaults to the tier's value (see CONVENTION_TIER_DEFAULTS). */
  ttl?: string;
  /**
   * Forwarded to createBranch. When the convention's default parent (e.g.
   * "staging") doesn't exist on the project, the substrate falls back to
   * the project default branch with a stderr warning. Set strictParent:
   * true to throw instead – useful for hotfix-from-production paths where
   * the lineage MUST match the convention.
   */
  strictParent?: boolean;
}

// NOTE: the Lakebase-ONLY convention creators (createFeatureBranch /
// createTestBranch / createUatBranch / createPerfBranch) were DELETED. They
// created a Lakebase branch with no git branch + no .env sync, which violates
// the kit's one rule: every branch is paired (Lakebase + git + .env), created
// only through the substrate. Callers MUST use the PAIRED helpers below
// (createFeaturePairedBranch / createTestPairedBranch / ...) or, for the
// experiment/spike lifecycle, the paired-branch primitives directly
// (createPairedBranch / deletePairedBranch / checkoutPaired). There is no
// unpaired branch-creation path in this kit by design.

// ─── Per-tier-type PAIRED helpers (atomic Lakebase + git + .env) ─────
//
// These combine the substrate's createPairedBranch atomicity with the
// per-tier convention TTL. They are the canonical "claim a feature branch"
// (or test/uat/perf) primitive: callers (TDD agents, smoke orchestrators,
// humans) MUST use these instead of calling createPairedBranch directly,
// because createPairedBranch defaults to no_expiry: true (which is wrong
// for finite-lifetime tier branches and would silently create what
// looks like a long-running tier).
//
// All four take CreateConventionPairedBranchArgs (CreateConventionBranchArgs
// + cwd + paired flags). Each forwards to createPairedBranch with the
// convention TTL pre-filled.

export interface CreateConventionPairedBranchArgs extends CreateConventionBranchArgs {
  /** Project directory (must contain .git/; .env is updated if syncEnv=true). */
  cwd: string;
  /** Create+switch a git branch with the same sanitized name. Default: true. */
  createGitBranch?: boolean;
  /** Update .env to point at the new branch's endpoint. Default: true. */
  syncEnv?: boolean;
  /** Default: 120_000. Lakebase ready-state poll budget. */
  readyTimeoutMs?: number;
  /** Default: "databricks_postgres". */
  database?: string;
}

/**
 * Cut a feature-tier paired branch (Lakebase + git + .env sync). Forks from
 * `staging` by default. Atomic via createPairedBranch: if the Lakebase side
 * fails, no git branch is left dangling.
 *
 * Feature branches are created NON-EXPIRING (noExpiry, no TTL). A feature branch
 * is the PARENT of the per-story experiment branches, and Lakebase
 * forbids an expiring branch from having child branches ("Branches with an
 * expiration date cannot have child branches", surfaced by the live
 * smoke). Feature branches are reaped by the SCM workflow (abandon / merge /
 * doctor -> deleteBranch), not by TTL; deleting a no-expiry branch through the
 * substrate is confirmed. An explicit `ttl` still wins (mutually exclusive with
 * noExpiry) for a finite-lifetime feature branch with no experiments.
 */
export async function createFeaturePairedBranch(
  args: CreateConventionPairedBranchArgs,
): Promise<CreatePairedBranchResult> {
  return createPairedBranch({
    instance: args.instance,
    branch: args.branch,
    parentBranch: args.parentBranch ?? CONVENTION_TIER_DEFAULTS.feature.parentBranch,
    ...(args.ttl ? { ttl: args.ttl } : { noExpiry: true }),
    cwd: args.cwd,
    createGitBranch: args.createGitBranch,
    syncEnv: args.syncEnv,
    readyTimeoutMs: args.readyTimeoutMs,
    database: args.database,
  });
}

/** Cut a test-tier paired branch (Lakebase + git + .env) with the 14-day convention TTL. */
export async function createTestPairedBranch(
  args: CreateConventionPairedBranchArgs,
): Promise<CreatePairedBranchResult> {
  return createPairedBranch({
    instance: args.instance,
    branch: args.branch,
    parentBranch: args.parentBranch ?? CONVENTION_TIER_DEFAULTS.test.parentBranch,
    ttl: args.ttl ?? CONVENTION_TIER_DEFAULTS.test.ttl,
    cwd: args.cwd,
    createGitBranch: args.createGitBranch,
    syncEnv: args.syncEnv,
    readyTimeoutMs: args.readyTimeoutMs,
    database: args.database,
  });
}

/** Cut a uat-tier paired branch (Lakebase + git + .env) with the 14-day convention TTL. */
export async function createUatPairedBranch(
  args: CreateConventionPairedBranchArgs,
): Promise<CreatePairedBranchResult> {
  return createPairedBranch({
    instance: args.instance,
    branch: args.branch,
    parentBranch: args.parentBranch ?? CONVENTION_TIER_DEFAULTS.uat.parentBranch,
    ttl: args.ttl ?? CONVENTION_TIER_DEFAULTS.uat.ttl,
    cwd: args.cwd,
    createGitBranch: args.createGitBranch,
    syncEnv: args.syncEnv,
    readyTimeoutMs: args.readyTimeoutMs,
    database: args.database,
  });
}

/** Cut a perf-tier paired branch (Lakebase + git + .env) with the 7-day convention TTL. */
export async function createPerfPairedBranch(
  args: CreateConventionPairedBranchArgs,
): Promise<CreatePairedBranchResult> {
  return createPairedBranch({
    instance: args.instance,
    branch: args.branch,
    parentBranch: args.parentBranch ?? CONVENTION_TIER_DEFAULTS.perf.parentBranch,
    ttl: args.ttl ?? CONVENTION_TIER_DEFAULTS.perf.ttl,
    cwd: args.cwd,
    createGitBranch: args.createGitBranch,
    syncEnv: args.syncEnv,
    readyTimeoutMs: args.readyTimeoutMs,
    database: args.database,
  });
}
