import { W as WorkflowRunSummary, d as PullRequestInfo, n as mergePairedPullRequest } from '../../pr-Cxj1u3K7.cjs';
import { Pool } from 'pg';

interface AdoptLakebaseProjectArgs {
    /** Existing git repo to onboard. */
    projectDir: string;
    /**
     * Lakebase project id (becomes the database project's identifier
     * and the value stored in `.env` as `LAKEBASE_PROJECT_ID`).
     */
    projectName: string;
    /** Databricks workspace URL the project should live under. */
    databricksHost: string;
    /**
     * Whether to also lay down `.tdd/` (delegates to `adoptTdd`).
     * Default: false (brownfield onboarding is incremental; TDD adoption
     * is a separate, opt-in decision).
     */
    enableTdd?: boolean;
    /**
     * Whether to wire `[E2E]` Playwright support (delegates to
     * `enableE2eForProject`). Requires a `package.json` at projectDir.
     * Default: false.
     */
    enableE2e?: boolean;
    /**
     * Whether to wire `[Infra]` runner support (delegates to
     * `enableInfraForProject`). Default: false.
     */
    enableInfra?: boolean;
    /**
     * Treat existing `.env` as authoritative: refuse to overwrite when
     * its `LAKEBASE_PROJECT_ID` differs from `projectName`. Default:
     * true. Set to false only when intentionally rebinding a project
     * (the caller carries the "are you sure" prompt).
     */
    preserveExistingEnv?: boolean;
    /**
     * Skip writing `.env` entirely. The Lakebase project still gets
     * created and the default branch is still returned; only the local
     * file write is suppressed. Useful when the caller wants to write
     * `.env` itself with project-specific extras.
     */
    skipEnv?: boolean;
    /**
     * Report what would change without writing anything. Lakebase
     * project creation is NOT dry-run-able via this flag; only the
     * file-writing portion is suppressed. Default: false.
     */
    dryRun?: boolean;
}
interface AdoptLakebaseProjectResult {
    /** Lakebase project id created (or already existing). */
    lakebaseProjectId: string;
    /** Default branch the Lakebase project exposes (often "production"). */
    defaultBranch: string;
    /** Paths written to disk this run, relative to projectDir. */
    filesWritten: string[];
    /** Non-fatal warnings the orchestrator accumulated. */
    warnings: string[];
}
/**
 * Onboard an existing git repo to Lakebase. Creates the Lakebase
 * database project, resolves the default branch, and writes the
 * connection-pair to `.env` (preserving any extra keys the project
 * already declared).
 *
 * Pre-flights:
 *   - projectDir must exist
 *   - projectDir/.git must exist (the project must be a git repo)
 *   - if `.env` already declares LAKEBASE_PROJECT_ID and
 *     `preserveExistingEnv: true` (default), refuses when the value
 *     differs from `projectName`.
 *
 * Side effects:
 *   - Calls `databricks postgres create-project` via the Databricks
 *     CLI (server-side state).
 *   - Writes `<projectDir>/.env.example` and `<projectDir>/.env`.
 *
 * Does NOT:
 *   - run `git init`, create a GitHub repo, or push anything
 *   - install git hooks or scaffold the workflow YAMLs (use
 *     `scaffoldStaticAll` separately when the brownfield project
 *     wants those)
 *   - run any migration / language-specific scaffold
 */
declare function adoptLakebaseProject(args: AdoptLakebaseProjectArgs): Promise<AdoptLakebaseProjectResult>;
/**
 * Pre-flight checker exposed so callers (CLI bin, VS Code command)
 * can validate the brownfield environment before running the
 * orchestrator and surface a precise error message. Returns the same
 * set of preconditions adoptLakebaseProject enforces; throws on the
 * first failure.
 */
declare function assertAdoptionPreflight(args: {
    projectDir: string;
    expectedProjectName?: string;
}): void;
/**
 * Helper for tests: build a minimal "real" project structure in a
 * tmpdir (git repo + optional package.json). Exported so the
 * BDD harness can reuse it; consumers should not call this in
 * production.
 */
declare function _testMakeBrownfieldFixture(opts: {
    dir: string;
    packageJson?: Record<string, unknown>;
}): void;

interface AdoptTddArgs {
    /** Project root that will receive `.tdd/`. Must be a git repo. */
    projectDir: string;
    /**
     * Re-run on a project that already has `.tdd/`. Without it the call
     * refuses (the default-fail surfaces a clear hint instead of silently
     * doing nothing). With it, missing template files are added and the
     * report distinguishes in-sync vs drifted entries; existing files are
     * preserved unless `force` is also true.
     */
    update?: boolean;
    /**
     * Overwrite drifted template files with the canonical kit version.
     * Implies `update`. Project-authored files outside the template tree
     * are never touched.
     */
    force?: boolean;
    /**
     * Report what would change without writing anything. Useful for CI
     * checks and for the human-facing "what does this command do" probe.
     */
    dryRun?: boolean;
    /**
     * Override the kit's `templates/tdd-bootstrap/.tdd` source. The BDD
     * harness uses this to drive against a fixture; production callers
     * always let the substrate auto-locate.
     */
    bootstrapDir?: string;
}
interface AdoptTddResult {
    /** Files written this run (or, in dry-run, files that would be written). */
    added: string[];
    /** Files already present with content matching the canonical template. */
    inSync: string[];
    /** Files already present whose content differs from the canonical template. */
    drifted: string[];
    /** Files written this run because `force` overrode their drift. */
    updated: string[];
    /** True iff no files were modified (the call is a clean no-op). */
    noChanges: boolean;
}
/**
 * Drop the `templates/tdd-bootstrap/.tdd` tree into `projectDir/.tdd`.
 *
 * Default mode: refuses if `.tdd/` already exists. The caller is told
 * to re-run with `update: true` if they want a brownfield refresh.
 *
 * `update` mode walks the template tree and writes any missing file;
 * existing files are inspected and bucketed into `inSync` vs `drifted`.
 *
 * `force` mode (implies `update`) additionally rewrites drifted files
 * with the canonical template content. The `.gitkeep` placeholders
 * never count as drift since they are intentionally empty.
 *
 * `dryRun` mode returns the same report but writes nothing.
 */
declare function adoptTdd(args: AdoptTddArgs): AdoptTddResult;

declare const BRAND: unique symbol;
/**
 * The leaf of a Lakebase branch resource path
 * (`projects/<id>/branches/<NAME>`). Use in source_branch fields, in
 * .env LAKEBASE_BRANCH_NAME, and anywhere a CLI subresource URL needs
 * `{branch}`. NEVER pass a BranchUid where a BranchName is expected.
 */
type BranchName = string & {
    readonly [BRAND]: "BranchName";
};
/**
 * The system-assigned Lakebase branch uid (`br-crimson-fire-d28lb2ez`).
 * Returned in the `uid` field of `list-branches` / `get-branch`. Used
 * only for direct uid lookups. NEVER paste into a path-shaped API field.
 */
type BranchUid = string & {
    readonly [BRAND]: "BranchUid";
};

declare class LakebaseBranchError extends Error {
    constructor(message: string);
}
/**
 * Thrown when a branch create request's TTL exceeds the workspace's
 * maximum branch-expiration policy. The workspace cap varies by
 * deployment (some allow 30+ days, others cap below 30); the kit's
 * convention defaults (30d feature / 14d test+uat / 7d perf) may not
 * fit every workspace.
 *
 * Recovery options for the caller:
 *   - Pass a shorter `ttl` (e.g. "604800s" for 7 days) on createBranch /
 *     createFeatureBranch / cutExperiment.
 *   - Pass `noExpiry: true` for branches that should persist (typically
 *     production / staging tiers, not feature tiers).
 *   - Probe the project's `history_retention_duration` via get-project
 *     for a conservative upper bound (often, but not always, the cap).
 */
declare class LakebaseBranchTtlTooLongError extends LakebaseBranchError {
    /** The TTL that was attempted (the value passed to the API). */
    readonly attemptedTtl: string;
    constructor(attemptedTtl: string, underlyingMessage: string);
}
/**
 * Pattern-match the underlying CLI stderr against the workspace
 * TTL-too-long signal. Exported for the unit-test boundary so the
 * detection logic stays guarded by tests if Lakebase rewords the error.
 */
declare function isTtlTooLongError(stderr: string): boolean;
/**
 * Parse a Lakebase-format TTL string ("<seconds>s") to integer seconds.
 * Returns undefined for malformed input. Pure; used in TTL-clamp math.
 */
declare function parseLakebaseTtl(ttl: string | undefined): number | undefined;
/**
 * Return the smaller of two Lakebase-format TTL strings (min by seconds).
 * Returns the parseable one when only one parses; undefined when neither
 * does. Used to clamp a requested TTL against the workspace cap.
 */
declare function minLakebaseTtl(a: string | undefined, b: string | undefined): string | undefined;
declare function getCachedProjectRetention(instance: string): string | undefined;
declare function cacheProjectRetention(instance: string, ttl: string | undefined): void;
declare function clearRetentionCache(): void;
interface LakebaseBranchInfo {
    /**
     * Lakebase-side opaque uid, e.g. `br-broad-sky-d2k5gewt`. Returned by
     * `get-branch` / `list-branches` as the `uid` field. NOT accepted in
     * any path-shaped API field – the service rejects it with "branch id
     * not found". For source_branch references, `{branch}` URL segments,
     * .env LAKEBASE_BRANCH_NAME, etc., use {@link nameLeaf} instead.
     *
     * Branded {@link BranchUid} so the compiler refuses to accept it where
     * a {@link BranchName} is expected.
     */
    uid: BranchUid;
    /**
     * Friendly resource-path leaf, e.g. `production`. The {@link BranchName}
     * form of the branch identifier; the segment after `/branches/` in the
     * full resource name. THIS is the value to pass into source_branch,
     * subresource URLs, .env LAKEBASE_BRANCH_NAME, etc.
     *
     * Derived from `name` on parse, so it's always present when `name` is.
     */
    nameLeaf: BranchName;
    /** Full resource name, e.g. `projects/proj-abc/branches/feature-x`. */
    name: string;
    /** `READY`, `PROVISIONING`, etc. */
    state: string;
    /**
     * Parent branch full resource name (e.g. `projects/x/branches/staging`),
     * sourced from `status.source_branch` in the Lakebase API response.
     *
     * Use {@link sourceBranchId} for just the leaf segment (a {@link BranchName}).
     */
    sourceBranchName?: string;
    /** Parent branch leaf – a {@link BranchName} like `staging`. Derived from sourceBranchName. */
    sourceBranchId?: BranchName;
    /** True if this is the project's default branch. */
    isDefault?: boolean;
    /**
     * RFC3339 expiration, e.g. "2026-06-25T05:00:00Z". Present for branches
     * created with a TTL (workflow tiers feature / test / uat / perf). Absent
     * for long-running tiers (production / staging) and for legacy branches
     * created with `no_expiry: true`.
     */
    expireTime?: string;
    /** True if the branch is protected from deletion. */
    isProtected?: boolean;
}
interface BranchLookupOpts {
    /** Lakebase project id. */
    instance: string;
    /** Optional DATABRICKS_HOST override. */
    host?: string;
}
/** Build the canonical project path. */
declare function projectPath(instance: string): string;
/** List all branches for a Lakebase project. */
declare function listBranches(opts: BranchLookupOpts): Promise<LakebaseBranchInfo[]>;
/** Find a branch by uid, branchId, or full resource name. */
declare function getBranchByName(branchNameOrUid: string, opts: BranchLookupOpts): Promise<LakebaseBranchInfo | undefined>;
/** Get the project's default branch (or undefined if none is marked default). */
declare function getDefaultBranch(opts: BranchLookupOpts): Promise<LakebaseBranchInfo | undefined>;
/**
 * Tier predicate: a branch is a long-running tier iff it's non-default
 * AND has no expireTime (the architect cut it deliberately via
 * {@link createLongRunningBranch}, which sets `no_expiry: true` and
 * therefore leaves expireTime absent on the API response).
 *
 * Mirrors the methodology's intent: feature branches carry a TTL
 * (LakebaseBranchInfo.expireTime is set) and are transient; tiers
 * (staging, uat, perf, ...) are no_expiry and persistent. The earlier
 * "non-default" filter incorrectly swept in every feature branch.
 *
 * Pure utility – callers supply the branch list. This keeps the
 * helper sync, mockable, and cheap to call multiple times against
 * the same cached list during a single workflow.
 */
declare function isLongRunningTierBranch(b: LakebaseBranchInfo): boolean;
/**
 * Tier check: returns true iff `name` matches a long-running tier
 * Lakebase branch by exact branchId leaf. See
 * {@link isLongRunningTierBranch} for the underlying classification.
 *
 * Mirrors the post-checkout hook's auto-discovery model
 * (templates/project/common/scripts/post-checkout.sh:252-279).
 */
declare function isTier(name: string, branches: LakebaseBranchInfo[]): boolean;
/**
 * Returns the names (branchId leaves) of every long-running tier
 * Lakebase branch in the project (staging, uat, perf, ...). Useful
 * for surfaces that need to enumerate tiers (e.g. extension UI
 * grouping) rather than just test membership via {@link isTier}.
 *
 * Filters on {@link isLongRunningTierBranch} so feature branches
 * (which are non-default but carry an expireTime) are excluded.
 */
declare function tierBranchNames(branches: LakebaseBranchInfo[]): string[];
/**
 * Resolve a branch reference to its full resource name (projects/.../branches/...).
 * Returns undefined when the branch can't be found.
 */
declare function resolveBranchPath(branchNameOrUid: string, opts: BranchLookupOpts): Promise<string | undefined>;
/**
 * Normalize a branch reference to the friendly `branch_id` (leaf segment,
 * e.g. "demo-feature", "staging", "production"). This is the form accepted
 * by CLI subresource URLs like `branches/{x}/endpoints/primary`.
 *
 * Accepts any of:
 *   - branch_id ("demo-feature", or any PSA tier name: "production",
 *     "staging", "uat", "perf")
 *   - branch_uid ("br-broad-sky-d2k5gewt")
 *   - full resource path ("projects/x/branches/demo-feature")
 *
 * Throws when the branch can't be resolved (e.g. uid points at nothing).
 * Fast-path: returns input unchanged for values that don't look like a uid
 * (no `br-` prefix) and don't include a path prefix – avoids a round-trip
 * for the common branch_id case.
 */
declare function resolveBranchId(args: BranchLookupOpts & {
    branch: string;
}): Promise<string>;

interface CreateBranchArgs extends BranchLookupOpts {
    /** Target branch name (will be sanitized to a Lakebase id). */
    branch: string;
    /**
     * Explicit parent branch override. Use for "fork from staging" or
     * "fork from production" hotfix scenarios.
     *
     * Must be a BranchName (the resource-path leaf, e.g. `production`,
     * `staging`, `feature-x`) – NOT a BranchUid (`br-…`) and NOT a full
     * resource path. The runtime guard inside createBranch will reject a
     * BranchUid-shaped value with a helpful error. Use `asBranchName(s)`
     * at the call site if you have a string of unknown provenance.
     */
    parentBranch?: string;
    /**
     * Branch the caller is currently checked-out on (in agent runtimes,
     * read from .env's LAKEBASE_BRANCH_ID before calling this). When set
     * and not equal to the target, used as the parent (git-like "fork from
     * current"). Ignored when parentBranch override is provided.
     */
    currentBranch?: string;
    /** Wait-for-READY poll budget in milliseconds. Default 120_000. */
    readyTimeoutMs?: number;
    /** Poll interval in milliseconds. Default 5_000. */
    pollIntervalMs?: number;
    /**
     * If true, the spec sets `no_expiry: true` so Lakebase never auto-deletes
     * the branch. Lakebase's API requires one of expire_time / ttl /
     * no_expiry to be set on every create-branch call; omitting all three is
     * rejected. Default behavior: no_expiry: true if `ttl` is also unset;
     * if `ttl` is set, that wins and noExpiry must be omitted or false.
     * Mutually exclusive with `ttl`.
     */
    noExpiry?: boolean;
    /**
     * Lakebase-format TTL string ("<seconds>s", e.g. "604800s" = 7 days). When
     * set, Lakebase auto-deletes the branch after this duration relative to
     * create_time. Use for finite-lifetime workflow tiers (feature / test /
     * uat / perf). Mutually exclusive with `noExpiry: true`. Format is the
     * protobuf Duration JSON encoding – bare seconds with trailing "s".
     */
    ttl?: string;
    /**
     * Strictness for parentBranch lookup. When `parentBranch` is set but the
     * named branch does not exist on the project, the substrate's default is
     * to FALL BACK to the project's default branch with a stderr warning –
     * which keeps the convention-tier defaults
     * (CONVENTION_TIER_DEFAULTS.feature.parentBranch="staging", etc.)
     * usable on projects that don't yet follow the PSA topology.
     *
     * Pass `strictParent: true` to opt OUT of the fallback and throw a
     * typed LakebaseBranchError when the named parent is missing – useful
     * for hotfix-from-production paths where the lineage MUST match the
     * caller's expectation. Default: false (fallback enabled).
     */
    strictParent?: boolean;
}
/**
 * Create a Lakebase branch.
 *
 * Idempotent on a true retry: if a branch with the sanitized name already
 * exists AND its actual source matches the source the caller is asking
 * for now, returns the existing branch. If the existing branch was forked
 * from a *different* source, throws – silently returning a branch with
 * the wrong lineage would mask the user's intent (e.g. they meant to
 * branch from staging this time, but a stale branch from production
 * still occupies the name).
 */
declare function createBranch(args: CreateBranchArgs): Promise<LakebaseBranchInfo>;
interface WaitForBranchReadyArgs extends BranchLookupOpts {
    branch: string;
    timeoutMs?: number;
    pollIntervalMs?: number;
}
/** Poll until the branch reaches READY state. Throws on timeout. */
declare function waitForBranchReady(args: WaitForBranchReadyArgs): Promise<LakebaseBranchInfo>;

interface DeleteBranchArgs extends BranchLookupOpts {
    /** Branch uid, branchId, or full resource name. */
    branch: string;
    /**
     * Escape hatch: allow deleting the project's default branch.
     * Default false: the guard refuses to delete a branch whose
     * `isDefault=true`, since that's the trunk every other branch was
     * forked from. Without this guard, a thin-wrapped shell that loops
     * `delete-lakebase-branches.sh production some-feature-branch`
     * could wipe the project's root.
     */
    allowDefault?: boolean;
}
/**
 * Delete a Lakebase branch. Throws when the branch can't be resolved
 * (no silent no-op – caller should catch + ignore if they want
 * idempotent semantics). By default, refuses to delete the project's
 * default branch; pass `allowDefault: true` to override.
 */
declare function deleteBranch(args: DeleteBranchArgs): Promise<void>;

interface CreatePairedBranchArgs {
    instance: string;
    branch: string;
    /** Explicit Lakebase parent override. */
    parentBranch?: string;
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
    /**
     * Lakebase-format TTL string ("<seconds>s", e.g. "2592000s" = 30 days)
     * for the Lakebase branch. Mutually exclusive with `noExpiry: true`.
     * When neither is set, createBranch's default (`no_expiry: true`)
     * applies - which is wrong for feature/test/uat/perf branches that
     * should expire. Per-tier-type wrappers in convention-branches.ts
     * (createFeaturePairedBranch / createTestPairedBranch / ...) plumb the
     * right convention TTL here.
     */
    ttl?: string;
    /**
     * When true, force `no_expiry: true` on the Lakebase branch. Use for
     * long-running tiers (production, staging). Mutually exclusive with
     * `ttl`. When neither is set, createBranch's default fires (no_expiry
     * true), but new callers should be explicit.
     */
    noExpiry?: boolean;
}
interface CreatePairedBranchResult {
    branch: LakebaseBranchInfo;
    /** Sanitized git branch name (matches Lakebase branch name). */
    gitBranch: string;
    /** True iff the git branch was newly created in this call. */
    gitBranchCreated: boolean;
    /** True iff .env was updated with fresh credentials. */
    envSynced: boolean;
    /** Non-fatal issues collected during the run. */
    warnings: string[];
}
/**
 * Create a Lakebase branch + matching git branch + .env sync, in one call.
 *
 * Order:
 *   1. Create Lakebase branch (sanitized name)
 *   2. Wait for READY (so the endpoint exists when we sync .env)
 *   3. Create git branch with the same sanitized name (if createGitBranch)
 *   4. Mint credential + update .env (if syncEnv)
 *
 * Failures after step 1 are NOT rolled back – the Lakebase branch survives
 * and the caller can retry. Warnings collect non-fatal step failures.
 */
declare function createPairedBranch(args: CreatePairedBranchArgs): Promise<CreatePairedBranchResult>;
interface DeletePairedBranchArgs {
    instance: string;
    branch: string;
    /** Project directory (must contain .git/). */
    cwd: string;
    /** Delete the local git branch. Default: true. Skipped if branch is currently checked out. */
    deleteGitLocal?: boolean;
    /** Delete the remote git branch if it exists. Default: true. */
    deleteGitRemote?: boolean;
    /** Remote name. Default: "origin". */
    gitRemote?: string;
}
interface DeletePairedBranchResult {
    lakebaseDeleted: boolean;
    gitLocalDeleted: boolean;
    gitRemoteDeleted: boolean;
    warnings: string[];
}
/**
 * Delete the Lakebase branch + matching git branch (local + remote).
 *
 * Best-effort: each side is attempted independently and failures land in
 * `warnings[]`. The function never throws – returns a status of each side.
 * Useful for the extension's "delete branch everywhere" command and for
 * agent-driven cleanup.
 */
declare function deletePairedBranch(args: DeletePairedBranchArgs): Promise<DeletePairedBranchResult>;
interface SyncEnvArgs {
    /** Project directory (must contain .env and .git/). */
    cwd: string;
    /** Override the Lakebase instance id. Default: read LAKEBASE_PROJECT_ID from .env. */
    instance?: string;
    /** Override the branch name. Default: use current git branch (sanitized). */
    branch?: string;
    /**
     * Override: when the current git branch equals this name, pair with the
     * project's default Lakebase branch (whose leaf may differ, e.g.
     * `production`). Mirrors `checkoutPaired`'s trunkAlias. Default: no
     * alias, falls back to `main`/`master` as trunk indicators.
     */
    trunkAlias?: string;
    /** Default: "databricks_postgres". */
    database?: string;
}
interface SyncEnvResult {
    /** Sanitized branch name we synced to. */
    branchId: string;
    endpointHost: string;
    databaseUrl: string;
}
/**
 * Read current git branch (or honor the `branch` override), look up the
 * matching Lakebase branch's endpoint, mint a fresh credential, and update
 * .env. This is the in-process equivalent of templates/.../post-checkout.sh,
 * usable from any agent.
 *
 * Throws when:
 *   - .env doesn't exist or doesn't declare LAKEBASE_PROJECT_ID (and no
 *     `instance` override was passed)
 *   - the Lakebase branch's endpoint has no host yet (still provisioning)
 *   - credential minting fails (auth expired, etc.)
 */
declare function syncEnvToCurrentBranch(args: SyncEnvArgs): Promise<SyncEnvResult>;
type CheckoutMode = "trunk" | "tier" | "feature" | "feature-created";
interface CheckoutPairedArgs {
    /** Project directory (must contain .env). */
    cwd: string;
    /** Target git branch. Default: read current via `git rev-parse --abbrev-ref HEAD`. */
    branch?: string;
    /** Lakebase instance. Default: read LAKEBASE_PROJECT_ID from .env. */
    instance?: string;
    /**
     * Override: when the current git branch equals this name, pair with the
     * project's default Lakebase branch. Mirrors LAKEBASE_TRUNK_BRANCH from
     * the post-checkout hook. Default: no alias – uses main/master.
     */
    trunkAlias?: string;
    /**
     * Pinned base branch for feature mode. Mirrors LAKEBASE_BASE_BRANCH. When
     * set, new feature branches always fork from this branch instead of using
     * the "branch I was just on" hint.
     */
    baseBranch?: string;
    /**
     * Previous Lakebase branch (the value of LAKEBASE_BRANCH_ID in .env BEFORE
     * the git checkout). Used as the 2nd-precedence parent in feature mode.
     * When omitted, this is read from .env automatically.
     */
    previousBranch?: string;
    /** When the target feature branch doesn't exist on Lakebase, create it. Default: true. */
    autoCreate?: boolean;
    /** Default: "databricks_postgres". */
    database?: string;
    /** Lakebase branch ready-state poll budget. Default: 120_000. */
    readyTimeoutMs?: number;
}
interface CheckoutPairedResult {
    /** Sanitized branch name on the Lakebase side. */
    branchId: string;
    /** Which mode resolved. */
    mode: CheckoutMode;
    /** The Lakebase branch we actually paired against (may differ from branchId
     *  in trunk/staging modes where the alias maps to a fixed Lakebase name). */
    matchedLakebaseBranch: string;
    /** Endpoint host the .env now points at. */
    endpointHost: string;
    /** Full DSN written into .env. */
    databaseUrl: string;
    /** True iff .env was rewritten. */
    envUpdated: boolean;
    /** Non-fatal issues collected during the run. */
    warnings: string[];
}
/**
 * In-process equivalent of the bundled `post-checkout.sh` hook.
 *
 * Use when an agent is driving a paired project programmatically without
 * relying on the git hook to fire (e.g. an agent that doesn't shell out to
 * `git checkout`, or a recovery path when the hook isn't installed). For
 * developers running `git checkout` in a terminal, the hook handles this
 * automatically – calling checkoutPaired then is redundant.
 *
 * Mirrors the hook's three-mode logic and parent fallback chain. Tier
 * discovery is auto from the Lakebase branch list – no per-tier alias
 * is needed (this is the post-alpha.9 model, see FEIP-7098):
 *
 *   1. **trunk** – current branch == `trunkAlias` (or main/master if no
 *      alias). Pairs .env with the project's default Lakebase branch.
 *   2. **tier** – current branch name matches a non-default Lakebase branch
 *      by exact branchId (any long-running tier the architect has cut:
 *      staging / uat / perf / dev / ...). Pairs .env with that branch;
 *      does NOT auto-create. Tiers must be bootstrapped deliberately via
 *      {@link createLongRunningBranch}.
 *   3. **feature** – anything else. Auto-creates a Lakebase branch with the
 *      same sanitized name, using parent precedence:
 *        a. `baseBranch` arg (pinned 3-tier base)
 *        b. `previousBranch` arg / LAKEBASE_BRANCH_ID from .env, if that
 *           branch still exists on Lakebase
 *        c. Project default branch
 *
 * After resolving the Lakebase branch, ensures its endpoint exists (creates
 * one with autoscaling 2-4 CU if missing), mints a fresh credential, and
 * rewrites the .env connection block. The git checkout itself is NOT
 * performed – caller is responsible for that side (either `git checkout`
 * before calling, or rely on the hook firing after `git checkout`).
 */
declare function checkoutPaired(args: CheckoutPairedArgs): Promise<CheckoutPairedResult>;

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
declare const CONVENTION_TIER_DEFAULTS: {
    readonly feature: {
        readonly ttl: string;
        readonly parentBranch: "staging";
    };
    readonly test: {
        readonly ttl: string;
        readonly parentBranch: "staging";
    };
    readonly uat: {
        readonly ttl: string;
        readonly parentBranch: "staging";
    };
    readonly perf: {
        readonly ttl: string;
        readonly parentBranch: "staging";
    };
};
interface CreateConventionBranchArgs extends BranchLookupOpts {
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
/**
 * Cut a feature-tier Lakebase branch off `staging` with a 30-day TTL.
 * Lakebase deletes the branch automatically when the TTL expires – useful
 * for feature dev cycles where the branch lives only as long as the work.
 */
declare function createFeatureBranch(args: CreateConventionBranchArgs): Promise<LakebaseBranchInfo>;
/** Cut a test-tier Lakebase branch off `staging` with a 14-day TTL. */
declare function createTestBranch(args: CreateConventionBranchArgs): Promise<LakebaseBranchInfo>;
/** Cut a uat-tier Lakebase branch off `staging` with a 14-day TTL. */
declare function createUatBranch(args: CreateConventionBranchArgs): Promise<LakebaseBranchInfo>;
/** Cut a perf-tier Lakebase branch off `staging` with a 7-day TTL. */
declare function createPerfBranch(args: CreateConventionBranchArgs): Promise<LakebaseBranchInfo>;
interface CreateConventionPairedBranchArgs extends CreateConventionBranchArgs {
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
 * Cut a feature-tier paired branch (Lakebase + git + .env sync) with the
 * 30-day convention TTL. Forks from `staging` by default. Atomic via
 * createPairedBranch: if the Lakebase side fails, no git branch is left
 * dangling.
 */
declare function createFeaturePairedBranch(args: CreateConventionPairedBranchArgs): Promise<CreatePairedBranchResult>;
/** Cut a test-tier paired branch (Lakebase + git + .env) with the 14-day convention TTL. */
declare function createTestPairedBranch(args: CreateConventionPairedBranchArgs): Promise<CreatePairedBranchResult>;
/** Cut a uat-tier paired branch (Lakebase + git + .env) with the 14-day convention TTL. */
declare function createUatPairedBranch(args: CreateConventionPairedBranchArgs): Promise<CreatePairedBranchResult>;
/** Cut a perf-tier paired branch (Lakebase + git + .env) with the 7-day convention TTL. */
declare function createPerfPairedBranch(args: CreateConventionPairedBranchArgs): Promise<CreatePairedBranchResult>;

interface CutBackupArgs extends BranchLookupOpts {
    /**
     * Branch to snapshot. For the release flow this is the current prod
     * branch (e.g. "production"). The snapshot is forked off this branch
     * at the moment of the call.
     */
    sourceBranch: string;
    /**
     * Name for the new backup branch. Should encode the release / run
     * identifier so rollback knows which backup to restore (e.g.
     * "prod-backup-v1.2.3" or "pre-migrate-pr-42"). The substrate does
     * not enforce a naming pattern - it is documented in the
     * lakebase-release-workflows skill.
     */
    backupName: string;
    /** Wait-for-READY budget. Passed through to createBranch. */
    readyTimeoutMs?: number;
    /** Poll interval. Passed through to createBranch. */
    pollIntervalMs?: number;
}
interface CutBackupResult {
    /** The created backup branch. */
    backup: LakebaseBranchInfo;
    /** The source branch's full resource name (echoed for caller convenience). */
    sourceBranchName: string;
}
/**
 * Snapshot a Lakebase branch by creating a new branch forked off it.
 *
 * Idempotent on retry: if a branch with `backupName` already exists AND
 * was forked from `sourceBranch`, returns the existing branch. If it
 * was forked from a different source, throws (delegated to createBranch's
 * lineage-conflict check) - silently returning a wrongly-rooted backup
 * would defeat the rollback contract.
 */
declare function cutBackup(args: CutBackupArgs): Promise<CutBackupResult>;

interface ResolveDatabricksHostArgs {
    /** Databricks CLI profile from ~/.databrickscfg. */
    profile: string;
    /** Override the per-call timeout. Default: KIT_TIMEOUTS.cliDefault. */
    timeoutMs?: number;
}
/**
 * Resolve the workspace host URL for the named profile via
 * `databricks auth describe -o json`. Returns the host string without
 * trailing slash, or undefined when the profile is unknown or the
 * response is unparseable.
 */
declare function resolveDatabricksHost(args: ResolveDatabricksHostArgs): Promise<string | undefined>;
/**
 * Exposed for unit testing. Trims a non-JSON preamble (some CLI
 * builds prefix a warning or auth-error line before the JSON payload),
 * parses the JSON, and extracts `details.host`.
 */
declare function parseHostFromAuthDescribe(out: string): string | undefined;

/** One entry from `databricks auth profiles -o json`. */
interface DatabricksProfile {
    name: string;
    host?: string;
    valid?: boolean;
}
/** Normalize a workspace host for comparison: trim, strip trailing slashes, lowercase. */
declare function normalizeHost(host: string): string;
/**
 * Pure selector. Given the JSON emitted by `databricks auth profiles -o
 * json` and a target workspace host, return the name of the unique VALID
 * profile whose host matches.
 *
 * Returns undefined when there is no match, or when the match is ambiguous
 * (more than one distinct valid profile for the same host): we never pin a
 * guess. Tolerates a non-JSON preamble (the CLI sometimes prefixes warning
 * lines) by trimming to the first `{`, mirroring parseHostFromAuthDescribe.
 */
declare function selectProfileForHost(profilesJson: string, host: string): string | undefined;
/**
 * Resolve the unique valid CLI profile for a workspace host by shelling
 * out to `databricks auth profiles -o json`. Returns undefined when the
 * CLI is missing/errors, or when there is no unique valid match (caller
 * then leaves the .env's bare host untouched: status quo, never worse).
 */
declare function resolveProfileForHost(host: string, timeoutMs?: number): Promise<string | undefined>;
interface EnsureProfilePinnedArgs {
    /** Absolute path to the project's .env. */
    envPath: string;
    /**
     * Test seam: override the host -> profile resolver. Defaults to the
     * live resolveProfileForHost (which shells out to the CLI).
     */
    resolve?: (host: string) => Promise<string | undefined>;
}
interface EnsureProfilePinnedResult {
    /** Profile name newly written into .env, when a pin was added. */
    pinned?: string;
    /** Why no pin was written (for logging / doctor output). */
    reason?: "already-pinned" | "no-env" | "no-host" | "no-match";
}
/**
 * Idempotently ensure .env pins DATABRICKS_CONFIG_PROFILE. No-op when the
 * file is missing, the profile is already pinned, there is no
 * DATABRICKS_HOST to resolve against, or no unique valid profile matches.
 * When a unique match is found, the pin is inserted directly after the
 * DATABRICKS_HOST line so the two auth keys stay together.
 */
declare function ensureProfilePinned(args: EnsureProfilePinnedArgs): Promise<EnsureProfilePinnedResult>;

interface UploadDirectoryArgs {
    /** Local directory to upload. */
    localRoot: string;
    /** Workspace path destination (must be absolute, e.g.
     *  `/Workspace/Users/me/myapp`). Created if absent. */
    workspacePath: string;
    /** Databricks CLI profile. */
    profile: string;
    /** Subdirectory names to skip (default: `node_modules`, `.git`,
     *  `dist`, `.tmp`, `.vitest`, `.venv-live-tests`, `.tools-live-tests`,
     *  `coverage`, and any dotfile-prefixed dir). */
    skipDirs?: string[];
    /** Override per-import timeout. Default: KIT_TIMEOUTS.cliDefault. */
    timeoutMs?: number;
}
interface UploadDirectoryResult {
    /** Number of files uploaded. */
    filesUploaded: number;
    /** Number of remote directories created. */
    dirsCreated: number;
    /** Per-file errors (non-fatal); the upload continues past failures so
     *  the caller can decide whether to retry or fail the deploy. */
    errors: Array<{
        relPath: string;
        error: string;
    }>;
}
/**
 * Recursively upload `localRoot` to `workspacePath` in the workspace.
 *
 * The remote root is created first (idempotent `workspace mkdirs`).
 * Each file is uploaded via `workspace import <remote> --file <local>
 * --format AUTO --overwrite`, which the platform treats as create-or-
 * replace. Parent directories are created on-demand as files are
 * walked; each `mkdirs` call is deduped via the in-memory createdDirs
 * set so a deep tree only hits the CLI once per directory.
 *
 * The walk skips well-known noise directories (node_modules, .git,
 * dist, ...). Override via `skipDirs`. Hidden files (leading dot) are
 * uploaded, since some are deploy-critical (e.g. `.env.example`).
 */
declare function uploadDirectory(args: UploadDirectoryArgs): Promise<UploadDirectoryResult>;

interface EnsureAppEndpointArgs {
    /** Local directory with package.json + app.yaml + source files. */
    workspaceRoot: string;
    /** Databricks Workspace path to upload source to (must be absolute, e.g.
     *  `/Workspace/Users/me/myapp`). Created if absent. */
    workspacePath: string;
    /** Databricks CLI profile for auth. */
    profile: string;
    /** App name (Databricks Apps constraints: <=26 chars, lowercase letters /
     *  digits / hyphens). */
    appName: string;
    /** Description set on initial `apps create`. Ignored if the app already
     *  exists. Default: "Deployed by lakebase-app-dev-kit". */
    description?: string;
    /** Override the `apps create` step timeout. The CLI blocks until the
     *  app reaches ACTIVE state; cold-start can take 5+ minutes. Default:
     *  1200s (matching the CLI's own --timeout 20m default). */
    createTimeoutMs?: number;
    /** Override the deploy step timeout. Apps deploy can take 5+ minutes on
     *  cold-start. Default: 600s. */
    deployTimeoutMs?: number;
}
interface EnsureAppEndpointResult {
    /** True iff `apps deploy` exited 0. */
    ok: boolean;
    /** URL of the deployed app, fetched via `apps get` after deploy.
     *  Undefined if the get call failed (the app may still be deployed). */
    url: string | undefined;
    /** True if the app was just created (vs already existed). */
    created: boolean;
    /** Workspace upload step result. */
    upload: UploadDirectoryResult;
    /** Process exit code of the deploy command. */
    exitCode: number | null;
    /** Raw stdout from `apps deploy`. */
    deployStdout: string;
    /** Raw stderr from `apps deploy`. */
    deployStderr: string;
}
interface DeleteAppEndpointArgs {
    /** Databricks CLI profile. */
    profile: string;
    /** App name to delete. */
    appName: string;
    /** Optional workspace path to delete recursively after the app is
     *  removed. When the app is paired with a Lakebase branch, the
     *  caller usually wants the uploaded source gone too. */
    workspacePath?: string;
    /** When true (default), `RESOURCE_DOES_NOT_EXIST` from the apps delete
     *  call resolves to `appDeleted: false, found: false` instead of
     *  rejecting. Idempotency contract: callers re-running the teardown
     *  on an already-deleted app see no error. */
    ignoreMissing?: boolean;
    /** Override the per-call timeout. Apps delete returns immediately
     *  (the platform's 20-min DELETING cool-down before the name can be
     *  reused is separate). Default: KIT_TIMEOUTS.cliDefault. */
    timeoutMs?: number;
}
interface DeleteAppEndpointResult {
    /** True iff `apps delete` returned successfully. */
    appDeleted: boolean;
    /** True iff the workspace path was deleted. Always false when
     *  `workspacePath` was not provided. */
    workspaceDeleted: boolean;
    /** True iff the app was present at the start of the call. */
    found: boolean;
}
interface GetAppEndpointArgs {
    profile: string;
    appName: string;
    timeoutMs?: number;
}
interface GetAppEndpointResult {
    /** True iff the app exists on the workspace. */
    exists: boolean;
    /** URL of the app if it exists. */
    url: string | undefined;
    /** Parsed app info (the JSON `databricks apps get` returns). */
    info: Record<string, unknown> | undefined;
}
interface GetCiAppEndpointArgs {
    /** Lakebase project id (LAKEBASE_PROJECT_ID). Used in the derived app name. */
    instance: string;
    /** Lakebase CI branch name (e.g. "ci-pr-42"). Used in the derived app name. */
    branch: string;
    /** Optional Databricks CLI profile. When omitted, the CLI uses
     *  DATABRICKS_HOST / DATABRICKS_TOKEN env vars (the CI default). */
    profile?: string;
    /** Optional explicit Databricks App name override. When unset, the name
     *  is derived from `<instance>-<branch>` (lowercased, sanitized,
     *  truncated to the Databricks Apps 26-char limit). */
    appName?: string;
    /** Per-call timeout. Default: KIT_TIMEOUTS.cliDefault. */
    timeoutMs?: number;
}
interface GetCiAppEndpointResult {
    /** Public URL of the deployed CI app; undefined when the app does not
     *  exist yet (deploy step was skipped or has not run). */
    url: string | undefined;
    /** App name that was queried (resolved override or derived). Useful when
     *  the caller wants to log which name was probed. */
    appName: string;
    /** True iff the app exists on the workspace. */
    exists: boolean;
}
/**
 * Look up an existing app endpoint by name. Returns `exists: false`
 * (without throwing) when the app does not exist; throws on auth or
 * other infrastructure failures.
 */
declare function getAppEndpoint(args: GetAppEndpointArgs): Promise<GetAppEndpointResult>;
/**
 * Tear down an app endpoint and (optionally) its uploaded workspace
 * files. Slice 4 of FEIP-7130. Pairs with `deletePairedBranch`
 * (scripts/lakebase/paired-branch.ts): when the Lakebase branch is
 * removed, the matching app endpoint should be removed too.
 *
 * Order:
 *   1. apps delete <name>           (idempotent when ignoreMissing=true)
 *   2. workspace delete <wsPath> --recursive   (only when workspacePath set)
 *
 * The app's name enters a 20-minute DELETING cool-down on the platform
 * before it can be reused; that constraint is OUTSIDE this primitive's
 * scope. Callers that need a "delete then recreate same name" workflow
 * should pick a different app_name or wait the cool-down.
 *
 * Promise rejects on infra failures (CLI not on PATH, timeout). Missing
 * app resolves to {found:false, appDeleted:false} when ignoreMissing
 * (the default); set ignoreMissing=false to throw instead.
 */
declare function deleteAppEndpoint(args: DeleteAppEndpointArgs): Promise<DeleteAppEndpointResult>;
/**
 * Provision (create or update) a Databricks Apps endpoint via the
 * per-step pattern: upload source, ensure the app exists, deploy via
 * the API-direct path. Returns the deployed URL.
 *
 * Idempotent: re-running against an already-deployed app re-uploads
 * source + redeploys without recreating the app endpoint.
 *
 * Promise rejects only on infrastructure failures (CLI not on PATH,
 * timeout, upload step uncaught). Non-zero deploy exit codes resolve
 * to `ok: false` so callers compose with `.ok` rather than try/catch.
 */
declare function ensureAppEndpoint(args: EnsureAppEndpointArgs): Promise<EnsureAppEndpointResult>;
/**
 * Look up the deployed Databricks Apps endpoint for a Lakebase CI branch
 * by convention. The CI app name is derived from `<instance>-<branch>`
 * (matching the Databricks Apps name constraints: <=26 chars, lowercase
 * letters / digits / hyphens). An explicit `appName` overrides the
 * derivation for projects that ship their CI app under a different name.
 *
 * Designed for pr.yml: after the (separate) CI app-deploy step, this
 * primitive resolves the public URL to export as `LAKEBASE_APP_ENDPOINT`
 * for the project-root Playwright step (FEIP-7094 Phase 2). When the
 * app does not exist yet (e.g. deploy step skipped due to missing
 * secrets, or no CI-deploy has been wired into the project), the
 * primitive resolves with `url: undefined` rather than throwing, so the
 * downstream Playwright step degrades to its webServer fallback.
 *
 * Infrastructure failures (auth expired, CLI not on PATH) still throw.
 */
declare function getCiAppEndpoint(args: GetCiAppEndpointArgs): Promise<GetCiAppEndpointResult>;
/**
 * Derive the Databricks App name for a CI branch. Lowercases, replaces
 * non-alphanumeric runs with a single hyphen, trims leading/trailing
 * hyphens, and truncates to the Databricks Apps 26-char limit.
 */
declare function deriveCiAppName(instance: string, branch: string): string;

interface DeployTarget {
    workspace_profile: string;
    workspace_path: string;
    app_name: string;
    lakebase_project: string;
    lakebase_branch: string;
    uc_catalog?: string;
    uc_schema?: string;
    uc_volume?: string;
    lakebase_secret_scope?: string;
    lakebase_secret_key?: string;
    ai_model?: string;
}
interface DeployTargetsConfig {
    targets: Record<string, DeployTarget>;
}
declare function readTargets(workspaceRoot: string): DeployTargetsConfig | null;
declare function writeTargets(config: DeployTargetsConfig, workspaceRoot: string): void;
declare function parseTargetsYaml(content: string): DeployTargetsConfig;
declare function getTargetNames(workspaceRoot: string): string[];

interface GenerateAppYamlOptions {
    /** Pre-existing app.yaml contents. When supplied, the `command:` block
     *  is parsed out and preserved; the env block is regenerated from the
     *  target. */
    existing?: string;
    /** Override the default command list. Used when there is no existing
     *  file and the caller wants a non-default entrypoint. Default:
     *  `["npm", "run", "start"]`. */
    defaultCommand?: string[];
}
/**
 * Generate or rewrite app.yaml for a Lakebase deployment target.
 *
 * Output shape (Lakebase-only target):
 * ```yaml
 * command:
 *   - npm
 *   - run
 *   - start
 *
 * env:
 *   - name: PGHOST
 *     valueFrom: postgres
 *   - name: PGDATABASE
 *     valueFrom: postgres
 *   - name: PGUSER
 *     valueFrom: postgres
 *   - name: PGPORT
 *     valueFrom: postgres
 *   - name: PGSSLMODE
 *     valueFrom: postgres
 *   - name: LAKEBASE_ENDPOINT
 *     valueFrom: postgres
 *   - name: LAKEBASE_PROJECT_ID
 *     value: "<project>"
 *   - name: LAKEBASE_BRANCH_ID
 *     value: "<branch>"
 * ```
 *
 * Optional UC / secret env vars are appended when the target declares
 * them. Optional vars are NEVER emitted when unset (the platform refuses
 * empty values).
 */
declare function generateAppYaml(target: DeployTarget, options?: GenerateAppYamlOptions): string;

type LakebasePermissionLevel = "CAN_USE" | "CAN_CREATE" | "CAN_MANAGE";
interface GetAppServicePrincipalArgs {
    profile: string;
    appName: string;
    timeoutMs?: number;
}
interface AppServicePrincipal {
    /** The SP's client_id (also called application_id). Used as the
     *  principal identifier in permissions API calls. */
    clientId: string;
    /** Optional human-readable name of the SP, when surfaced by `apps get`. */
    name?: string;
}
/**
 * Resolve the service principal that runs the given Databricks App.
 * Returns undefined when the app exists but does not yet have an SP
 * assigned (transitional state during app creation). Throws when the
 * app does not exist or the call fails.
 */
declare function getAppServicePrincipal(args: GetAppServicePrincipalArgs): Promise<AppServicePrincipal | undefined>;
interface GrantLakebasePermissionArgs {
    profile: string;
    /** Lakebase project name (the bare name, e.g. `live-all-1780214536`). */
    projectName: string;
    /** Principal to grant. Pass an SP's clientId for app SPs; a user
     *  email for users; a group name for groups. */
    servicePrincipalName: string;
    /** Permission level to grant. Default: `CAN_MANAGE` (matches the
     *  extension's existing behavior; broader than strictly required to
     *  read/write but covers all kit workflows). */
    level?: LakebasePermissionLevel;
    /** Override the per-call timeout. Default: KIT_TIMEOUTS.cliDefault. */
    timeoutMs?: number;
}
interface GrantLakebasePermissionResult {
    /** True iff the PATCH returned successfully. */
    granted: boolean;
}
/**
 * Grant a principal a permission level on a Lakebase Postgres project.
 *
 * Uses the `/api/2.0/permissions/database-projects/<name>` PATCH endpoint
 * (the kit's substrate is on the newer Lakebase Postgres API; that endpoint
 * still services this object type). Pass the project's bare name (not the
 * full `projects/<name>` resource path).
 *
 * Idempotent: re-running with the same args is a no-op at the API level
 * (the platform deduplicates ACL entries).
 */
declare function grantLakebasePermission(args: GrantLakebasePermissionArgs): Promise<GrantLakebasePermissionResult>;
interface PropagateCredentialsArgs {
    /** Target whose `lakebase_project` field names the project to grant. */
    target: DeployTarget;
    /** Databricks CLI profile. */
    profile: string;
    /** Name of the app whose service principal to grant. The app must
     *  already exist + have its SP assigned (ensureAppEndpoint blocks
     *  on ACTIVE state, so this holds after a successful ensure call). */
    appName: string;
    /** Lakebase permission level. Default: `CAN_MANAGE`. */
    level?: LakebasePermissionLevel;
    /** Override the per-call timeout. */
    timeoutMs?: number;
}
interface PropagateCredentialsResult {
    /** SP client_id resolved from the app. Undefined when the app has
     *  no SP assigned yet (transitional). */
    servicePrincipalClientId: string | undefined;
    /** True iff the Lakebase permission was granted. False when the SP
     *  could not be resolved (the grant call was skipped). */
    lakebaseGranted: boolean;
}
/**
 * Single seam that resolves the app's service principal + grants it
 * access to the Lakebase project named in the target. Pairs with
 * `ensureAppEndpoint`: call ensure FIRST (it blocks on ACTIVE), then
 * propagateCredentials, then the app can connect to Lakebase via the
 * PG* env vars + the auto-generated credential (handled by
 * `@databricks/lakebase` at runtime).
 *
 * Returns `lakebaseGranted: false` (not a throw) when the SP cannot
 * be resolved; the caller decides whether to retry or fail the deploy.
 * Other failures (auth, network, permission API errors) propagate as
 * throws.
 */
declare function propagateCredentials(args: PropagateCredentialsArgs): Promise<PropagateCredentialsResult>;

interface RollbackDeployArgs {
    /** Databricks CLI profile. */
    profile: string;
    /** App name to roll back. */
    appName: string;
    /** Explicit deployment id to roll back to. When omitted, the
     *  primitive auto-selects the most recent SUCCEEDED deployment
     *  before the currently active one. */
    deploymentId?: string;
    /** Override the rollback deploy timeout. Default: 600s. */
    timeoutMs?: number;
}
interface RollbackDeployResult {
    /** True iff the rollback `apps deploy` returned exit 0. */
    ok: boolean;
    /** Deployment id rolled back TO. */
    toDeploymentId: string;
    /** source_code_path of the deployment that was rolled back to. */
    sourceCodePath: string;
    /** Process exit code of the deploy command. */
    exitCode: number | null;
    /** Raw stdout from `apps deploy`. */
    deployStdout: string;
    /** Raw stderr from `apps deploy`. */
    deployStderr: string;
}
interface DeploymentInfo {
    deployment_id?: string;
    source_code_path?: string;
    status?: {
        state?: string;
    };
    state?: string;
    create_time?: string;
}
/**
 * List all deployments for an app, parsed and typed.
 */
declare function listAppDeployments(args: {
    profile: string;
    appName: string;
    timeoutMs?: number;
}): Promise<DeploymentInfo[]>;
/**
 * Roll back an app to a prior deployment.
 *
 * - With `deploymentId` set: re-deploys that exact deployment's
 *   source_code_path.
 * - Without `deploymentId`: lists deployments, picks the most recent
 *   SUCCEEDED one that is NOT the current active deployment, and
 *   re-deploys its source_code_path. Throws when no such deployment
 *   exists (the app has 0 or 1 historical succeeded deploys).
 *
 * Returns a structured result for any deploy exit code; rejects only
 * on infrastructure failures (CLI not on PATH, timeout, list call
 * fails).
 */
declare function rollbackDeploy(args: RollbackDeployArgs): Promise<RollbackDeployResult>;

interface ValidateAppOptions {
    /** Project root directory containing package.json + app.yaml. */
    workspaceRoot: string;
    /** Databricks CLI profile used to authenticate validate's discovery
     *  calls. Required: validate refuses to run without a profile or
     *  DATABRICKS_HOST. */
    profile: string;
    /** Override the per-call timeout. Defaults to the kit's long-CLI band
     *  (KIT_TIMEOUTS.cliLong, 60s by default). Validate is fast for the
     *  no-op case but can take longer on large projects with many deps. */
    timeoutMs?: number;
}
interface ValidateAppResult {
    /** True when the CLI exited with status 0. */
    ok: boolean;
    /** Process exit code; null when the process was killed by signal. */
    exitCode: number | null;
    /** Full stdout of the validate run. The CLI uses ANSI color + emoji
     *  markers; callers that surface this to humans can render as-is, to
     *  agents can strip ANSI codes. */
    stdout: string;
    /** Full stderr of the validate run. */
    stderr: string;
}
/**
 * Run `databricks apps validate --profile <profile>` in the given
 * workspace root. The promise resolves with a structured result for any
 * exit code (including non-zero); it only rejects on infrastructure
 * failures (CLI not found, working dir doesn't exist, etc.) and on
 * timeout.
 *
 * Why this shape: every other substrate primitive that wraps a CLI uses
 * the same "structured result + reject only on infra failure" contract
 * (see branch-create.ts / migrate.ts). Callers compose the boolean
 * `ok` field into higher-level orchestration without try/catch noise.
 */
declare function validateApp(opts: ValidateAppOptions): Promise<ValidateAppResult>;

/**
 * Create a long-running branch tier from another tier.
 *
 * Part of the release-workflows convention (see
 * skills/lakebase-release-workflows/SKILL.md). A long-running branch
 * is a tier the architect declares in the project's chain (e.g.
 * staging, dev). This primitive cuts a Lakebase branch named `name`
 * forked from the project's current default branch (per the substrate's
 * "no parent → fork from current" convention) AND pushes a matching
 * git branch from `forkFromBranch` so release PRs can target it.
 *
 * Both sides are idempotent:
 *   - createBranch returns the existing branch if `name` already exists.
 *   - `git push -u origin <name>` won't fail on re-push.
 *
 * Intended caller: integration test suites bootstrapping their declared
 * chain, OR a future `bootstrap-branch-convention` orchestrator that
 * sets up all the architect's tiers from a fresh prod project.
 */

interface CreateLongRunningBranchArgs {
    /** Tier name to create (e.g. 'staging', 'dev'). Used as both the git
     *  branch name and the Lakebase branch name. */
    name: string;
    /** Existing git branch the new tier forks from. For two-tier the
     *  staging tier forks from 'main'; for three-tier the dev tier forks
     *  from 'staging' and the staging tier forks from 'main'. */
    forkFromBranch: string;
    /** Lakebase project ID. */
    projectId: string;
    /** Local git work tree where the git operations run (typically the
     *  scaffolded project directory). */
    workTreeDir: string;
    /** Workspace URL. Forwarded to the substrate's createBranch via env. */
    databricksHost?: string;
}
interface CreateLongRunningBranchResult {
    /** Full Lakebase resource path of the created branch
     *  (`projects/<projectId>/branches/<name>`). */
    lakebaseBranchName: string;
    /** Git branch name that was pushed to origin (same as `args.name`). */
    gitBranch: string;
    /** Lakebase branch info for callers that need uid / state. */
    lakebase: LakebaseBranchInfo;
}
/**
 * Cut a long-running tier off another tier. Returns once both the
 * Lakebase branch and the git branch are pushed and ready.
 *
 * Throws if Lakebase branch creation fails. The git side uses
 * `cp.execSync` with `stdio: 'pipe'` so substrate consumers can capture
 * output if needed; failures propagate as exceptions.
 */
declare function createLongRunningBranch(args: CreateLongRunningBranchArgs): Promise<CreateLongRunningBranchResult>;

/**
 * Release a `from` branch into a long-running `to` tier.
 *
 * In the release-workflows convention (see
 * skills/lakebase-release-workflows/SKILL.md), a release is any merge
 * that lands in a long-running tier. The four-phase shape (cut ci-pr
 * branch / regression test / cut backup / migrate) runs at every
 * adjacent-tier release; only the from/to labels change. Phases 1-2
 * happen automatically when the PR opens (pr.yml); phases 3-4 happen
 * on PR merge (merge.yml on the `to` push).
 *
 * This primitive is the orchestrator for phases 3-4: open + merge the
 * PR + wait for merge.yml. Phases 1-2 are gated by GitHub branch
 * protection (must be green before merge is allowed). Phases 3-4 land
 * the migration on `to`.
 *
 * Same primitive serves every adjacent-tier release:
 *   - `feature/X → staging`: from=feature/X, to=staging
 *   - `dev → staging` (3-tier shop): from=dev, to=staging
 *   - `staging → main`: from=staging, to=main
 */

interface ReleaseArgs {
    /** Source branch. Can be a working branch (feature/test/uat/perf) or
     *  a long-running tier. */
    from: string;
    /** Target tier. MUST be a long-running tier (the release primitive
     *  doesn't make sense without merge.yml triggering on push). */
    to: string;
    /** GitHub owner/repo (e.g. "kevin-hartman/ecom-mpk123"). */
    ownerRepo: string;
    /** Human-readable label appended to the PR title for traceability.
     *  Example: "post-scenario-7" → "Release: staging → main (post-scenario-7)". */
    releaseLabel: string;
    /** Bound the wait for merge.yml. Default: 10 minutes (comfortable
     *  headroom for cut-backup + migrate). */
    timeoutMs?: number;
    /** Bound the wait for pr.yml (the CI gate) to complete before
     *  merging. Default: 10 minutes. */
    prGateTimeoutMs?: number;
    /** How often to poll listWorkflowRuns while waiting. Default: 15s. */
    pollIntervalMs?: number;
    /** Workflow file basename for the merge gate (Phases 3-4), matched
     *  against the run's `name` field. Default: 'merge.yml'. */
    workflowFile?: string;
    /** Workflow file basename for the PR gate (Phases 1-2), matched
     *  against the run's `name` field. Default: 'pr.yml'. */
    prWorkflowFile?: string;
    /** When true (default), `release()` itself waits for pr.yml to
     *  complete with conclusion=success before merging. This is the
     *  belt-and-suspenders enforcement of the CI gate - it works even
     *  in repos without branch protection (free-tier private repos
     *  cannot configure required status checks, so the GitHub-side gate
     *  silently allows any merge there). Set false ONLY if the caller
     *  is enforcing the gate some other way. */
    requireCiGate?: boolean;
}
interface ReleaseResult {
    /** PR number used for the from→to release. */
    prNumber: number;
    /** Workflow run that fired on the `to` push. */
    workflowRun: WorkflowRunSummary;
    /** The workflow run's conclusion (expected: 'success'). Convenience
     *  alias for `workflowRun.conclusion`. */
    conclusion: string;
}
/**
 * Open + merge a from→to PR and wait for the workflow run that fires
 * on the `to` push to complete. Returns the run + conclusion so the
 * caller can assert success.
 *
 * The caller is responsible for:
 *   - Verifying the snapshot lifecycle (cut on merge, cleaned on green).
 *   - Verifying schema effects on the `to` Lakebase branch.
 * Both verifications are test-suite-specific and live with the consumer.
 */
declare function release(args: ReleaseArgs): Promise<ReleaseResult>;

interface EndpointInfo {
    host: string;
    state: string;
}
interface GetEndpointArgs {
    instance: string;
    branch: string;
    /** Default: "primary" */
    endpointName?: string;
}
/**
 * Look up the primary endpoint for a Lakebase branch.
 *
 * Returns undefined when the branch has no endpoints yet, or when the
 * endpoint exists but has no host (still provisioning). For "wait until
 * ready" semantics, poll with a retry loop in the caller.
 */
declare function getEndpoint(args: GetEndpointArgs): Promise<EndpointInfo | undefined>;
/**
 * Build the canonical endpoint resource path that mintCredential expects.
 * Convenience helper – most callers go through getConnection() which builds
 * this internally.
 *
 * **NOTE:** synchronous; does NOT normalize uid → branch_id. Caller is
 * responsible for passing `branch_id` (the friendly leaf, e.g.
 * "demo-feature" / "staging" / "production"). If you might be holding a
 * uid, await {@link resolveBranchId} from `./branch-utils.js` first.
 * The async helpers in this file (getEndpoint, ensureEndpoint, getCredential)
 * normalize for you.
 */
declare function endpointPath(instance: string, branch: string, endpointName?: string): string;
interface EnsureEndpointArgs {
    instance: string;
    branch: string;
    /** Default: "primary" */
    endpointName?: string;
    /** Default: "ENDPOINT_TYPE_READ_WRITE" */
    endpointType?: "ENDPOINT_TYPE_READ_WRITE" | "ENDPOINT_TYPE_READ_ONLY";
    /** Autoscaling minimum compute units. Default: 2. */
    autoscalingMinCu?: number;
    /** Autoscaling maximum compute units. Default: 4. */
    autoscalingMaxCu?: number;
    /** Default: 120_000. Wait budget for the endpoint to reach ACTIVE state. */
    timeoutMs?: number;
}
/**
 * Get the primary endpoint for a branch, creating one if it doesn't exist.
 *
 * Mirrors the `get_or_create_endpoint` helper in templates/.../post-checkout.sh.
 * Used by `checkoutPaired` to make sure a freshly-resolved Lakebase branch
 * has a reachable endpoint before .env gets rewritten with credentials.
 */
declare function ensureEndpoint(args: EnsureEndpointArgs): Promise<EndpointInfo>;
interface GetCredentialArgs {
    instance: string;
    branch: string;
    /** Default: "primary" */
    endpointName?: string;
}
/**
 * Mint a short-lived `{ token, email }` for a branch's endpoint. Resolves the
 * branch path (so caller can pass uid / sanitized name / full path), then
 * routes through `mintCredential` in get-connection.ts – the single credential
 * seam. Useful for callers that want raw credentials rather than a DSN/Pool
 * (e.g. constructing a pg.Client with custom timeouts).
 */
declare function getCredential(args: GetCredentialArgs): Promise<{
    token: string;
    email: string;
}>;

interface TableSchema {
    name: string;
    columns: Array<{
        name: string;
        dataType: string;
    }>;
}
interface QueryBranchSchemaArgs {
    instance: string;
    /**
     * Branch identifier. Accepts branch_id (e.g. "demo-feature"; tier names
     * "production" / "staging" / "uat" / "perf" are branch_ids), branch_uid
     * (e.g. "br-broad-sky-d2k5gewt"), or full resource path. Normalized
     * internally before any CLI URL is built.
     */
    branch: string;
    /** Default: $PGDATABASE then "databricks_postgres" */
    database?: string;
    /** Skip the flyway_schema_history table (default: true) */
    skipFlyway?: boolean;
}
/**
 * Inventory the tables + columns on a Lakebase branch's public schema.
 *
 * Returns [] when the endpoint has no host yet (branch is still
 * provisioning) so callers can degrade gracefully. Throws only on
 * credential-minting / authentication failures, since those signal a
 * configuration problem the caller should surface.
 */
declare function queryBranchSchema(args: QueryBranchSchemaArgs): Promise<TableSchema[]>;
/** Convenience: just the table names, no column inventory. */
declare function queryBranchTables(args: QueryBranchSchemaArgs): Promise<string[]>;

interface WriteEnvFileArgs {
    projectDir: string;
    databricksHost: string;
    lakebaseProjectId: string;
}
/**
 * Write a .env to {projectDir}/.env with the two fixed config keys and
 * commented connection placeholders. Overwrites any existing .env.
 *
 * @returns the absolute path of the written file.
 */
declare function writeEnvFile(args: WriteEnvFileArgs): string;
interface UpdateEnvConnectionArgs {
    /** Absolute path to the .env file. */
    envPath: string;
    /** Lakebase branch id this .env now points at (sanitized name). */
    branchId: string;
    /** Full postgresql:// DSN, or "" when connection is pending. */
    databaseUrl: string;
    /** Lakebase user (email). */
    username: string;
    /** Short-lived OAuth token. */
    password: string;
    /** Optional Lakebase endpoint host. Spring's application-local.properties and
     * the post-checkout.sh hook both write LAKEBASE_HOST=... so consumers like
     * the JDBC URL builder can derive jdbc:postgresql://${host}:... independently
     * of DATABASE_URL parsing. */
    endpointHost?: string;
    /** Optional comment line prepended to the connection block. */
    comment?: string;
}
/**
 * Update the connection block (LAKEBASE_BRANCH_ID, DATABASE_URL, DB_USERNAME,
 * DB_PASSWORD) in an existing .env file, preserving every other line.
 *
 * Algorithm matches templates/project/common/scripts/post-checkout.sh:
 *   1. Read existing .env
 *   2. Drop any line starting with one of the four connection keys
 *   3. Append the fresh block (with optional leading comment)
 *
 * If the file doesn't exist, it's created with just the connection block –
 * caller can subsequently writeEnvFile() to add the project-level keys.
 */
declare function updateEnvConnection(args: UpdateEnvConnectionArgs): void;

interface HookVerification {
    postCheckout: boolean;
    prepareCommitMsg: boolean;
    prePush: boolean;
}
interface WorkflowVerification {
    pr: boolean;
    merge: boolean;
}
/** Returns true/false for each of the three hooks the workflow ops rely on. */
declare function verifyHooks(projectDir: string): HookVerification;
/** Returns true/false for each of the two GitHub Actions workflows. */
declare function verifyWorkflows(projectDir: string): WorkflowVerification;
/** Combined health report; convenient for the create-project final step. */
declare function verifyProject(projectDir: string): {
    hooks: HookVerification;
    workflows: WorkflowVerification;
    warnings: string[];
};

interface CreateProjectArgs {
    /** Project name (Lakebase project id and local directory name). */
    projectName: string;
    /** Parent directory where the project folder will be created. */
    parentDir: string;
    /** Databricks workspace host URL (trailing slashes are stripped). */
    databricksHost: string;
    /** GitHub owner – required when createGithubRepo is true. */
    githubOwner?: string;
    /** Whether to create a GitHub repository (default: true). */
    createGithubRepo?: boolean;
    /** Whether to make the GitHub repo private (default: true). */
    privateRepo?: boolean;
    /** Project language stack (default: 'java'). */
    language?: "java" | "kotlin" | "python" | "nodejs";
    /** CI runner type (default: 'self-hosted'). */
    runnerType?: "self-hosted" | "github-hosted";
    /**
     * Lakebase tier topology for this project. An architectural choice
     * the caller (typically a wizard) should surface to the user rather
     * than picking silently. Features are short-lived branches, NOT
     * tiers; they are not counted in this number.
     *
     *   1 (or undefined) - prod only. Features fork from prod.
     *   2                 - prod + staging. Features fork from staging.
     *                       Staging accumulates merged features between
     *                       release windows; releases promote staging
     *                       to prod via a separate PR.
     *   3                 - prod + staging + dev. Features fork from dev.
     *                       Dev accumulates day-to-day feature integration;
     *                       periodically dev is promoted to staging.
     *
     * Scaffolding cuts the extra tiers off prod (staging) and off staging
     * (dev) via `createLongRunningBranch` (Lakebase no_expiry + git push
     * to origin). When `tiers === 1` (or omitted), only the prod default
     * branch exists.
     */
    tiers?: 1 | 2 | 3;
    /** Lay down the .tdd/ scaffold from templates/tdd-bootstrap/ (default: true). */
    enableTdd?: boolean;
    /**
     * Wire Playwright into the project so `[E2E]`-tagged AC rows have a
     * runner: drops `playwright.config.ts` + `tests/e2e/smoke.spec.ts`,
     * adds `test:e2e` script + `@playwright/test` to `package.json`, and
     * appends an E2E block to `scripts/run-tests.sh`. Default: true for
     * `nodejs`, false otherwise. Java/Kotlin/Python projects can still
     * opt-in via `--enable-e2e`; the package.json patch is a no-op when
     * there is no package.json so the wire-up is partial (templates +
     * run-tests.sh only) until the project hand-rolls its own runner.
     * FEIP-7094 Phase 2.
     */
    enableE2e?: boolean;
    /**
     * Wire the [Infra]-tag runner into the project: adds a `test:infra`
     * script to package.json (which invokes the kit's
     * `lakebase-infra-runner` bin) and appends an infra block to
     * `scripts/run-tests.sh`. Default: true for `nodejs`, false otherwise
     * (mirrors the enableE2e default). Java/Kotlin/Python projects can
     * opt in via `--enable-infra`; the package.json patch is a no-op
     * when there is no package.json, so the wire-up is partial
     * (run-tests.sh only) until the project hand-rolls its own runner.
     */
    enableInfra?: boolean;
    /**
     * Skip the `.claude/commands/{design,build}.md` scaffold. Default:
     * false (commands are written). Set to true for projects that already
     * have their own slash commands they want to keep, or for non-Claude-Code
     * consumers that only use the substrate library.
     */
    skipCommands?: boolean;
}
interface CreateProjectResult {
    projectDir: string;
    githubRepoUrl?: string;
    lakebaseProjectId: string;
    lakebaseDefaultBranch: string;
    warnings: string[];
}
type ProgressCallback = (step: string, detail?: string) => void;
/**
 * Orchestrate the 10-step project creation.
 *
 *   1. Create GitHub repo (Octokit) – useGithub only
 *   2. Wait for repo visibility (SAML/propagation) – useGithub only
 *   3. Clone repo OR git init local dir
 *   4. Create Lakebase project (databricks postgres create-project)
 *   5. Resolve default branch id
 *   6. Scaffold templates (common + language-specific via Spring Initializr or static).
 *      Ships .env.example only – .env is never written or committed by this flow.
 *      First post-checkout populates .env from .env.example with a fresh JWT.
 *   7. Sync CI secrets (DATABRICKS_HOST / LAKEBASE_PROJECT_ID / DATABRICKS_TOKEN) – useGithub
 *   8. Set up self-hosted runner – useGithub + self-hosted only
 *   9. Initial commit + push (workflow-scope error surfaced clearly) – push only if useGithub
 *  10. Health check (verifyHooks + verifyWorkflows) – warnings reported, not fatal
 */
declare function createProject(input: CreateProjectArgs, progress?: ProgressCallback): Promise<CreateProjectResult>;

interface InstallPlaywrightOptions {
    /** Override the templates/project root. Default: auto-detected. */
    templatesDir?: string;
}
/** Files this primitive drops into a project root, relative to projectDir. */
declare const PLAYWRIGHT_TEMPLATE_FILES: readonly ["playwright.config.ts", string];
interface WritePlaywrightTemplatesArgs extends InstallPlaywrightOptions {
    projectDir: string;
    /** Overwrite an existing playwright.config.ts / smoke fixture. Default: false. */
    force?: boolean;
}
interface WritePlaywrightTemplatesResult {
    /** Paths (relative to projectDir) that were newly written. */
    written: string[];
    /** Paths that already existed and were left alone (force=false). */
    skipped: string[];
}
/**
 * Drop the bundled playwright.config.ts + tests/e2e/smoke.spec.ts into
 * projectDir. Skips a file when it already exists unless force=true.
 * Throws if either source template is missing from the kit (a kit
 * packaging bug, not a user error).
 */
declare function writePlaywrightTemplates(args: WritePlaywrightTemplatesArgs): WritePlaywrightTemplatesResult;
interface RunPlaywrightInstallArgs {
    projectDir: string;
    /** Per-call timeout for each shell-out. Default: KIT_TIMEOUTS.cliLong. */
    timeoutMs?: number;
}
interface RunPlaywrightInstallResult {
    /** Resolved CLI version (the output of `npx playwright --version`). */
    version: string;
    /** True iff the chromium browser bundle install returned 0. */
    browserInstalled: boolean;
}
/**
 * Install @playwright/test as a devDependency in projectDir, install the
 * chromium browser binary, and verify by reading `npx playwright --version`.
 * Loud-fail on any step: the scaffolder surfaces a clear remediation
 * (re-run installPlaywright, or re-tag the [E2E] rows) when this throws.
 */
declare function runPlaywrightInstall(args: RunPlaywrightInstallArgs): Promise<RunPlaywrightInstallResult>;
interface InstallPlaywrightArgs extends InstallPlaywrightOptions {
    projectDir: string;
    /** Forwarded to writePlaywrightTemplates. Default: false. */
    force?: boolean;
    /** Forwarded to runPlaywrightInstall. Default: KIT_TIMEOUTS.cliLong. */
    timeoutMs?: number;
    /**
     * Skip the npm/npx install steps and write templates only. Used by
     * the scaffolder in test mode and by humans who want to wire the
     * config without paying the chromium-download cost yet.
     */
    skipBrowserInstall?: boolean;
}
interface InstallPlaywrightResult {
    templates: WritePlaywrightTemplatesResult;
    /** Undefined when skipBrowserInstall=true. */
    install?: RunPlaywrightInstallResult;
}
/**
 * End-to-end bootstrap: drop templates, install the npm package, install
 * chromium, verify. The scaffolder (FEIP-7094 Phase 2) calls this once
 * when --enable-e2e is set; the human-facing path is `npx
 * @databricks-solutions/lakebase-app-dev-kit install-playwright`.
 */
declare function installPlaywright(args: InstallPlaywrightArgs): Promise<InstallPlaywrightResult>;

/**
 * Version range applied to @playwright/test when patching package.json.
 * Bumped here, not at call sites, so a single edit re-pins every project
 * scaffolded by this kit version. Major-pin (^1) accepts patch + minor
 * upgrades but blocks an accidental v2 migration when Playwright cuts
 * a breaking release.
 */
declare const PLAYWRIGHT_TEST_VERSION_RANGE = "^1.49.0";
interface AddPlaywrightToPackageJsonArgs {
    projectDir: string;
    /** Override the version range stamped into devDependencies. */
    versionRange?: string;
}
interface AddPlaywrightToPackageJsonResult {
    /** True iff the file existed and was patched (or already had both keys). */
    patched: boolean;
    /** True iff `scripts.test:e2e` was newly added. */
    scriptAdded: boolean;
    /** True iff `devDependencies["@playwright/test"]` was newly added. */
    depAdded: boolean;
}
/**
 * Idempotently add `scripts["test:e2e"] = "playwright test"` and
 * `devDependencies["@playwright/test"]` to a project's package.json.
 * No-ops if package.json is absent (non-Node project) so callers can
 * blindly invoke it after enabling E2E without language-gating.
 */
declare function addPlaywrightToPackageJson(args: AddPlaywrightToPackageJsonArgs): AddPlaywrightToPackageJsonResult;
interface AddE2eToRunTestsScriptArgs {
    projectDir: string;
}
interface AddE2eToRunTestsScriptResult {
    /** True iff the runner script existed and was patched (or already had the block). */
    patched: boolean;
    /** True iff the E2E block was newly inserted. */
    inserted: boolean;
}
/**
 * Idempotently append a Playwright invocation to scripts/run-tests.sh.
 * The block only fires when playwright.config.ts is present at the
 * project root, so retrofits land safely (the existing run-tests.sh
 * continues to behave for projects without E2E).
 */
declare function addE2eToRunTestsScript(args: AddE2eToRunTestsScriptArgs): AddE2eToRunTestsScriptResult;
interface EnableE2eForProjectArgs {
    projectDir: string;
    /** Forward to writePlaywrightTemplates. Default: false. */
    force?: boolean;
    /** Override the templates root (BDD harness). */
    templatesDir?: string;
    /** Override the @playwright/test version range. */
    versionRange?: string;
}
interface EnableE2eForProjectResult {
    /** Paths (relative to projectDir) freshly written. */
    templatesWritten: string[];
    /** Paths skipped because they already existed (force=false). */
    templatesSkipped: string[];
    packageJson: AddPlaywrightToPackageJsonResult;
    runTestsScript: AddE2eToRunTestsScriptResult;
}
/**
 * One-shot scaffolder integration: drop Playwright templates at the
 * project root, then patch package.json + scripts/run-tests.sh so
 * `npm run test:e2e` and `./scripts/run-tests.sh` both pick up E2E. No-ops
 * fields that don't apply (e.g. package.json patch skipped on Maven
 * projects). Always safe to re-run.
 */
declare function enableE2eForProject(args: EnableE2eForProjectArgs): EnableE2eForProjectResult;

interface AddInfraToPackageJsonArgs {
    projectDir: string;
    /**
     * The `test:infra` script value. Defaults to invoking the kit bin
     * via npx (`npx --yes lakebase-infra-runner`). Override when a
     * project needs a custom invocation path (e.g. a vendored npm-pinned
     * version, a wrapper that injects env vars).
     */
    scriptValue?: string;
}
interface AddInfraToPackageJsonResult {
    patched: boolean;
    scriptAdded: boolean;
}
/**
 * Idempotently add `scripts["test:infra"]` to package.json. No-op when
 * package.json is absent (non-Node project) so the helper is safe to
 * invoke unconditionally from the scaffolder.
 */
declare function addInfraToPackageJson(args: AddInfraToPackageJsonArgs): AddInfraToPackageJsonResult;
interface AddInfraToRunTestsScriptArgs {
    projectDir: string;
}
interface AddInfraToRunTestsScriptResult {
    patched: boolean;
    inserted: boolean;
}
/**
 * Idempotently append an [Infra] suite invocation to scripts/run-tests.sh.
 * The block fires when `package.json` has a `test:infra` script (so the
 * scaffolder integration is observable end-to-end), making retrofits and
 * partial wires both work.
 */
declare function addInfraToRunTestsScript(args: AddInfraToRunTestsScriptArgs): AddInfraToRunTestsScriptResult;
interface EnableInfraForProjectArgs {
    projectDir: string;
    /** Forwarded to addInfraToPackageJson. */
    scriptValue?: string;
}
interface EnableInfraForProjectResult {
    packageJson: AddInfraToPackageJsonResult;
    runTestsScript: AddInfraToRunTestsScriptResult;
}
/**
 * One-shot scaffolder integration: patch package.json + run-tests.sh
 * so `npm run test:infra` and the full validation suite both invoke
 * the [Infra] runner. Always safe to re-run.
 */
declare function enableInfraForProject(args: EnableInfraForProjectArgs): EnableInfraForProjectResult;

interface GetConnectionArgs {
    /**
     * Lakebase project id (e.g. "proj-abc123"). Maps to
     * `projects/<instance>` in the Databricks resource hierarchy.
     */
    instance: string;
    /**
     * Branch identifier within the project. Accepts:
     *   - branch_id (e.g. "demo-feature"; also any PSA tier name:
     *     "production", "staging", "uat", "perf")
     *   - branch_uid (e.g. "br-broad-sky-d2k5gewt")
     *   - full resource path ("projects/x/branches/demo-feature")
     *
     * Normalized to branch_id internally before any CLI path is built.
     */
    branch: string;
    /**
     * Endpoint identifier on the branch. Defaults to "primary" – the only
     * value the extension uses today (see lakebaseService.getCredential).
     */
    endpointName?: string;
    /**
     * Database name to connect to. Defaults to env PGDATABASE, then
     * "databricks_postgres".
     */
    database?: string;
    /**
     * For --output pool, an optional WorkspaceClient (from
     * @databricks/sdk-experimental). Pass when you want On-Behalf-Of behavior
     * via AppKit; omit to let @databricks/lakebase resolve from environment.
     */
    workspaceClient?: unknown;
}
interface DsnArgs extends GetConnectionArgs {
    output: "dsn";
}
interface PoolArgs extends GetConnectionArgs {
    output: "pool";
}
type ConnectionArgs = DsnArgs | PoolArgs;
interface DsnResult {
    url: string;
    host: string;
    port: number;
    database: string;
    user: string;
    endpointPath: string;
}
declare function getConnection(args: DsnArgs): Promise<DsnResult>;
declare function getConnection(args: PoolArgs): Promise<Pool>;
/**
 * Resolve the primary endpoint host for a branch.
 *
 * @param branch  branch_id, branch_uid, or full resource path. Normalized
 *                internally before the CLI subresource URL is built.
 */
declare function resolveEndpointHost(instance: string, branch: string): Promise<string>;
/**
 * Mint a short-lived Lakebase credential against a branch endpoint.
 *
 * This is the ONLY function that should call
 * `databricks postgres generate-database-credential` anywhere in the codebase.
 * A CI grep guard enforces that – every other workflow op (schema queries,
 * direct pg.Pool construction, DSN building) must go through this helper.
 *
 * @param endpointPath Full Lakebase endpoint resource path
 *   (e.g. `projects/my-app/branches/feature-x/endpoints/primary`)
 */
declare function mintCredential(endpointPath: string): Promise<{
    token: string;
    email: string;
}>;
declare function resolveCurrentUser(): Promise<string>;
/**
 * Wait until a freshly-provisioned Lakebase branch will accept a
 * Postgres connection with credentials minted via `getConnection`.
 *
 * Use this after `createLakebaseProject` / `createBranch` and before
 * handing a DSN to a non-retrying Postgres client (notably the `pg`
 * Node driver, which surfaces transient "External authorization
 * failed" errors as terminal during the IAM-role-propagation window).
 * JDBC-based drivers (Flyway, Liquibase) generally retry internally so
 * they don't hit this problem; the `pg`-based path (Knex, custom
 * Node.js consumers, `getConnection({output: "pool"})`) does.
 *
 * Strategy: mint a fresh credential, open a probe `pg.Client`,
 * `SELECT 1`, close. If the connect or query fails with an
 * auth-failure error, wait + mint again + retry. The credential is
 * short-lived so a new mint per attempt is required (the OLD token
 * may have outlived the retry window).
 *
 * Times out after `timeoutMs` (default 60s) with the last error.
 */
interface WaitForBranchAuthReadyArgs extends GetConnectionArgs {
    /** Total budget. Defaults to 60_000 ms. */
    timeoutMs?: number;
    /** Initial backoff between probes. Defaults to 2_000 ms. */
    initialBackoffMs?: number;
}
declare function waitForBranchAuthReady(args: WaitForBranchAuthReadyArgs): Promise<void>;

interface InfraCheckResult {
    /** Stable check identifier; matches the test name in the JUnit XML output. */
    name: "migrations-clean" | "schema-diff-computable" | "connection-reachable";
    passed: boolean;
    /** Human-readable summary (one line). */
    detail: string;
    /** Wall-clock duration in milliseconds. */
    duration_ms: number;
}
interface InfraSuiteResult {
    /** True iff every check passed. */
    passed: boolean;
    /** Per-check outcomes in canonical (registration) order. */
    checks: InfraCheckResult[];
    /** Branch the suite ran against. */
    branch: string;
    /** Total wall-clock duration for the suite, in milliseconds. */
    duration_ms: number;
}
interface RunInfraSuiteArgs {
    /** Lakebase project id. */
    instance: string;
    /** Branch to test against. */
    branch: string;
    /** Optional project root for schemaMigrationStatus's language detection. */
    projectDir?: string;
    /** Optional comparison branch override forwarded to getSchemaDiff. */
    comparisonBranch?: string;
    /**
     * When set, the suite writes a JUnit XML file at this path summarising
     * every check. The shape mirrors vitest's `junit` reporter so a CI
     * consumer can ingest [API] and [Infra] results uniformly.
     */
    junitOutput?: string;
}
/**
 * Run the [Infra]-tag suite against a Lakebase branch and report
 * per-check outcomes. Each check runs sequentially (the dependencies
 * matter: migrations-clean must succeed before connection-reachable
 * means anything in a fresh-branch context, and schema-diff-computable
 * is its own seam). A check failure does not short-circuit the suite;
 * every check runs so the JUnit report covers them all.
 */
declare function runInfraSuite(args: RunInfraSuiteArgs): Promise<InfraSuiteResult>;
/**
 * Render an InfraSuiteResult as a JUnit-shape XML document. One
 * testsuite element with a testcase per check; failed checks include a
 * <failure> child with the detail string. The format matches vitest's
 * `junit` reporter output (single suite, no nesting) so a CI consumer
 * can apply the same parsers to [API] and [Infra] results.
 */
declare function formatJUnit(result: InfraSuiteResult): string;

declare class LakebaseProjectError extends Error {
    constructor(message: string);
}
interface LakebaseProjectInfo {
    /** Project UID as Lakebase reports it (often matches the projectId). */
    uid: string;
    /** Fully-qualified resource name, e.g. "projects/my-app". */
    name: string;
    /** Current lifecycle state (e.g. "READY"). */
    state: string;
}
interface LakebaseProjectArgs {
    /** Project id (becomes the local directory name + Lakebase identifier). */
    projectId: string;
    /** Optional DATABRICKS_HOST override; otherwise CLI's default config is used. */
    host?: string;
}
/**
 * Create a Lakebase project via `databricks postgres create-project`.
 * Long-running on the server side; the CLI waits for completion.
 */
declare function createLakebaseProject(args: LakebaseProjectArgs): Promise<LakebaseProjectInfo>;
/**
 * Delete a Lakebase project via `databricks postgres delete-project`.
 * Long-running on the server side; the CLI waits for completion.
 */
declare function deleteLakebaseProject(args: LakebaseProjectArgs): Promise<void>;
/**
 * Resolve the default branch id for a freshly-created Lakebase project.
 * Returns the empty string if the default branch isn't ready yet (the
 * extension treats that as non-fatal in createProject step 4).
 */
/**
 * Resolve the project's default branch and return its {@link BranchName}
 * (the resource-path leaf, e.g. `production`), NOT its {@link BranchUid}.
 *
 * Why this returns BranchName specifically: every API field that takes a
 * branch reference – `source_branch` in create-branch specs, the
 * `{branch}` segment in `branches/{x}/endpoints/...` URLs, .env
 * LAKEBASE_BRANCH_NAME – wants the path leaf, not the uid. Returning a
 * uid here (the prior contract under the misleading name
 * `getDefaultBranchId`) caused a "branch id not found" error from the
 * service when the value was substituted into source_branch.
 *
 * Returns null when the project has no default branch or the CLI errored.
 */
/**
 * Pure helper: extract the default branch's BranchName from a parsed
 * list-branches response. Exported so the regression contract is
 * directly unit-testable without mocking the Databricks CLI.
 *
 * Always derives from `name`, never from `uid`. A BranchUid in this slot
 * would be silently wrong: the API rejects uids in path-shaped fields
 * (which is the only place this function's return value belongs).
 */
declare function findDefaultBranchName(items: BranchMetadata[]): BranchName | null;
declare function getDefaultBranchName(args: LakebaseProjectArgs): Promise<BranchName | null>;
/**
 * @deprecated Renamed to {@link getDefaultBranchName}. The old name was
 * ambiguous ("Id" of what?) and the old implementation returned the
 * BranchUid, which is wrong for every caller that passes it into a
 * path-shaped API field. This shim now returns the BranchName as a bare
 * string for transitional callers; remove after the next major bump.
 */
declare function getDefaultBranchId(args: LakebaseProjectArgs): Promise<string>;
interface BranchMetadata {
    uid?: string;
    name?: string;
    status?: {
        default?: boolean;
    };
    is_default?: boolean;
}
interface LakebaseProjectMetadata {
    uid: string;
    name: string;
    displayName?: string;
    state?: string;
}
/**
 * Look up a Lakebase project's metadata (uid, display name, state).
 * Returns undefined when the project doesn't exist or the CLI errors.
 */
declare function getProjectInfo(args: LakebaseProjectArgs): Promise<LakebaseProjectMetadata | undefined>;
/**
 * Pure helper: extract the protobuf-Duration `history_retention_duration`
 * from a parsed `databricks postgres get-project -o json` payload.
 * Returns the duration as a Lakebase-format TTL string ("<seconds>s") or
 * undefined when the field is absent / unparseable.
 *
 * The Lakebase API does not directly expose the workspace's maximum
 * branch-expiration policy, but the project's `history_retention_duration`
 * is a conservative upper bound for branch TTLs: a branch cannot retain
 * history longer than the project does. {@link createBranch} uses this to
 * recover from `LakebaseBranchTtlTooLongError` by retrying with a clamped
 * TTL.
 */
declare function findHistoryRetentionDuration(parsed: Record<string, unknown>): string | undefined;
/**
 * Query a Lakebase project's `history_retention_duration` and return it
 * as a Lakebase-format TTL string ("<seconds>s"). Returns undefined when
 * the project does not exist, the CLI fails, or the field is absent.
 *
 * The kit caches the result per-instance for the rest of the session via
 * the branch-utils retention cache (see {@link cacheProjectRetention}) so
 * repeated branch creates against the same instance pay the get-project
 * cost at most once.
 */
declare function getProjectRetentionDuration(args: LakebaseProjectArgs): Promise<string | undefined>;

/** All SCM states, in canonical progression order. */
declare const SCM_STATES: readonly ["scaffold-complete", "feature-claimed", "pr-ready", "ci-green", "merged"];
type ScmState = (typeof SCM_STATES)[number];
type TierTopology = 1 | 2 | 3;
interface ScmWorkflowState {
    $schema?: string;
    version: 1;
    state: ScmState;
    tier_topology: TierTopology;
    project_id: string;
    feature_id?: string;
    branch?: string;
    parent_branch?: string;
    lakebase_branch_uid?: string;
    claimed_at?: string;
    pr_url?: string;
    pushed_at?: string;
    ci_run_url?: string;
    ci_green_at?: string;
    merged_at?: string;
    migrate_run_url?: string;
    migrate_completed_at?: string;
}
/** Project-root-relative path to the gate-surface file. */
declare const STATE_FILE_REL = ".lakebase/workflow-state.json";
/** Resolve the absolute path to the state file for a given project root. */
declare function stateFilePath(projectDir: string): string;
/**
 * Read the workflow-state file. Returns null if the file does not exist
 * (scaffold has not been run yet, or the project pre-dates the state
 * machine). Throws on parse / validation errors so callers can surface
 * them instead of silently treating a broken file as "no state."
 */
declare function readWorkflowState(projectDir: string): ScmWorkflowState | null;
/**
 * Write the workflow-state file atomically (tmp + rename). Creates the
 * `.lakebase/` directory if missing. Validates before writing so a
 * caller cannot persist a state that would fail to read back.
 */
declare function writeWorkflowState(projectDir: string, state: ScmWorkflowState): void;
interface InitWorkflowStateArgs {
    projectId: string;
    tierTopology: TierTopology;
}
/**
 * Construct (but do not write) a fresh scaffold-complete state record.
 * Callers that own the scaffold flow are responsible for invoking
 * `writeWorkflowState` after `createProject` succeeds.
 */
declare function initWorkflowState(args: InitWorkflowStateArgs): ScmWorkflowState;
interface ValidationError {
    path: string;
    message: string;
}
type ValidationResult = {
    ok: true;
    value: ScmWorkflowState;
} | {
    ok: false;
    errors: ValidationError[];
};
/**
 * Hand-rolled validator. Mirrors `scm-workflow-state.schema.json` so
 * that file can be used for editor tooling (VSCode JSON schema
 * integration, `lakebase-scm-state` CLI documentation) while the
 * runtime check has zero dependencies.
 */
declare function validateWorkflowState(value: unknown): ValidationResult;
interface GateInvariant {
    key: string;
    present: boolean;
    value?: string;
}
interface GateStatus {
    /** State this gate represents. */
    name: ScmState;
    /** True if the workflow has already entered or passed this state. */
    passed: boolean;
    /** True if this state is the current one. */
    current: boolean;
    /** Invariants this state demands plus their current presence. */
    invariants: GateInvariant[];
}
/**
 * Compute, for each SCM state, whether it has been reached and which
 * invariants the schema demands are populated. The inspect CLI uses
 * this to render the gate ladder.
 */
declare function describeGates(state: ScmWorkflowState): GateStatus[];

declare class ScmClaimError extends Error {
    readonly code: "no-state-file" | "bad-precondition" | "missing-instance" | "invalid-feature-id" | "already-claimed-other";
    constructor(message: string, code: "no-state-file" | "bad-precondition" | "missing-instance" | "invalid-feature-id" | "already-claimed-other");
}
interface ClaimFeatureBranchArgs {
    /** Project root (must contain .lakebase/workflow-state.json + .git/). */
    projectDir: string;
    /**
     * Raw feature identifier as the human typed it (e.g. "initial-domain"
     * or "F1-initial-domain"). Sanitized for the Lakebase + git branch.
     * The branch name is always `feature/<sanitized>`.
     */
    featureId: string;
    /**
     * Lakebase project id (instance). When omitted, the helper reads
     * project_id from the workflow-state file, which mirrors
     * LAKEBASE_PROJECT_ID from .env.
     */
    instance?: string;
    /**
     * Override the resolved parent branch. The default chain is
     * tier_topology -> {default | staging | dev}. Useful for hotfix
     * paths that need to fork from production even on a 2-tier project.
     */
    parentBranchOverride?: string;
    /**
     * When true, return a no-op success if the workflow is already in
     * feature-claimed for THE SAME feature-id (matched by sanitized
     * branch). Defaults to true; pass false to make repeat claims fail
     * loud. Distinct from `bad-precondition` because nothing is wrong;
     * the caller just re-ran the bin.
     */
    idempotent?: boolean;
    /** Optional clock injection for testability. Defaults to `new Date()`. */
    now?: () => Date;
}
interface ClaimFeatureBranchResult {
    /** The new workflow-state record after the claim. */
    state: ScmWorkflowState;
    /** Substrate's paired-branch result (lakebase branch, git branch, env sync). */
    paired: CreatePairedBranchResult;
    /** True iff the call short-circuited because the feature was already claimed. */
    alreadyClaimed: boolean;
}
/**
 * Resolve the Lakebase parent branch name for a feature claim based on
 * the project's tier topology. Tier 1 has no named long-running tiers,
 * so the project's Lakebase default branch (whatever the workspace
 * called it at scaffold) is the parent.
 */
declare function resolveParentBranch(tierTopology: 1 | 2 | 3, instance: string): Promise<string>;
/**
 * Validate a feature-id is non-empty and sanitizes to a non-empty
 * branch suffix. Rejects raw input that would collapse to "" after
 * sanitization (e.g. "---") so the resulting `feature/` branch is
 * never just the prefix.
 */
declare function sanitizeFeatureSlug(featureId: string): string;
/**
 * The CANONICAL feature branch name for a slug. A paired branch's git name
 * must equal its slash-less Lakebase branch id, so the canonical name is the
 * SANITIZED form ("feature-<slug>"), not a raw "feature/<slug>". Running the
 * input through `sanitizeBranchName` (the same function the substrate uses to
 * mint the Lakebase branch) makes this the single source of truth: callers,
 * the idempotency check, and assertions all reconstruct the identical name.
 */
declare function featureBranchName(slug: string): string;
/**
 * Phase B entry point. See module header for the contract.
 */
declare function claimFeatureBranch(args: ClaimFeatureBranchArgs): Promise<ClaimFeatureBranchResult>;
/** Cheap existence check used by the CLI before doing argv work. */
declare function workflowStateFileExists(projectDir: string): boolean;

declare class ScmAdoptError extends Error {
    readonly code: "already-adopted" | "missing-instance" | "missing-current-branch" | "unrecognized-branch" | "lakebase-pair-missing";
    constructor(message: string, code: "already-adopted" | "missing-instance" | "missing-current-branch" | "unrecognized-branch" | "lakebase-pair-missing");
}
interface AdoptStateArgs {
    /** Project root (must contain .git/). */
    projectDir: string;
    /**
     * Lakebase project id. When omitted, callers should pre-resolve it
     * from .env (LAKEBASE_PROJECT_ID); the helper does not parse .env
     * itself to keep the dependency surface small.
     */
    instance: string;
    /**
     * Overwrite an existing workflow-state.json. Default: false (refuses
     * with `already-adopted`). The defensive default protects against
     * an adopter clobbering a state row that's mid-transition.
     */
    force?: boolean;
    /**
     * Clock injection for testability. Defaults to `new Date()`.
     */
    now?: () => Date;
}
interface AdoptStateResult {
    /** Newly-written workflow-state row. */
    state: ScmWorkflowState;
    /** Diagnostic notes (e.g. "current branch is staging, treated as scaffold-complete"). */
    notes: string[];
}
/**
 * Decide the project's tier topology from its long-running tier branches.
 * Tier 1 = only the default branch (no `staging` / `dev`). Tier 2 = a
 * `staging` branch exists. Tier 3 = both `staging` and `dev` exist.
 * Detection is by branch name (the substrate convention); workspaces
 * that deviate from the convention will adopt as tier 1 and may pass
 * the correct value via a future --tier-topology flag.
 */
declare function inferTierTopology(branches: LakebaseBranchInfo[]): TierTopology;
declare function adoptScmState(args: AdoptStateArgs): Promise<AdoptStateResult>;

declare class ScmAbandonError extends Error {
    readonly code: "no-state-file" | "bad-precondition" | "dirty-working-tree" | "missing-claim-fields";
    constructor(message: string, code: "no-state-file" | "bad-precondition" | "dirty-working-tree" | "missing-claim-fields");
}
interface AbandonFeatureArgs {
    projectDir: string;
    /** Override the workflow's recorded instance. */
    instance?: string;
    /**
     * Skip the dirty-working-tree refusal. Uncommitted edits on the
     * feature branch are lost when the git branch is deleted; the
     * default refusal protects against that.
     */
    force?: boolean;
    /**
     * Switch HEAD to this branch before deleting the feature branch.
     * Defaults to the workflow row's parent_branch.
     */
    switchTo?: string;
}
interface AbandonFeatureResult {
    state: ScmWorkflowState;
    lakebaseDeleted: boolean;
    gitLocalDeleted: boolean;
    gitRemoteDeleted: boolean;
    warnings: string[];
}
declare function abandonFeatureBranch(args: AbandonFeatureArgs): Promise<AbandonFeatureResult>;

declare class ScmPreparePrError extends Error {
    readonly code: "no-state-file" | "bad-precondition" | "dirty-working-tree" | "wrong-branch" | "no-commits-ahead" | "no-github-remote" | "push-failed" | "pr-failed";
    constructor(message: string, code: "no-state-file" | "bad-precondition" | "dirty-working-tree" | "wrong-branch" | "no-commits-ahead" | "no-github-remote" | "push-failed" | "pr-failed");
}
interface PreparePrArgs {
    projectDir: string;
    /** PR title. Defaults to the feature id slug. */
    title?: string;
    /** PR body. Defaults to a stub referencing the feature id. */
    body?: string;
    /** Remote name. Default: "origin". */
    remote?: string;
    /** Skip the ahead-of-parent check (useful for empty-feature debug PRs). */
    allowNoCommits?: boolean;
    /** Skip the dirty-tree refusal. */
    force?: boolean;
    /** Clock injection for testability. */
    now?: () => Date;
    /**
     * Override the pushed PR URL discovery (mostly for tests). When set,
     * the helper skips push + create steps and just records the URL.
     * NOT a supported user-facing flag.
     */
    prUrlOverride?: string;
}
interface PreparePrResult {
    state: ScmWorkflowState;
    prUrl: string;
    /** True iff createPullRequest was invoked (vs. reusing an existing open PR). */
    prCreated: boolean;
}
declare function preparePr(args: PreparePrArgs): Promise<PreparePrResult>;

declare class ScmWaitCiError extends Error {
    readonly code: "no-state-file" | "bad-precondition" | "no-github-remote" | "ci-failed" | "timeout" | "pr-not-found";
    constructor(message: string, code: "no-state-file" | "bad-precondition" | "no-github-remote" | "ci-failed" | "timeout" | "pr-not-found");
}
interface WaitCiArgs {
    projectDir: string;
    /** Total budget for the poll loop, milliseconds. Default: 30 minutes. */
    timeoutMs?: number;
    /** Interval between polls, milliseconds. Default: 30 seconds. */
    pollMs?: number;
    /** Clock injection for testability. */
    now?: () => Date;
    /**
     * Replace the underlying getPullRequest with a test double. The
     * default uses the real one. Internal/testing surface; the CLI does
     * not expose this flag.
     */
    fetchPr?: (ownerRepo: string, headBranch: string) => Promise<PullRequestInfo | undefined>;
    /**
     * Replace the sleep step so tests can run sub-second. Default:
     * the substrate's delay util.
     */
    sleep?: (ms: number) => Promise<void>;
}
interface WaitCiResult {
    state: ScmWorkflowState;
    /** PR info captured at the moment CI went green. */
    pr: PullRequestInfo;
    /** Number of polls performed (>= 1). */
    polls: number;
}
declare function waitForCi(args: WaitCiArgs): Promise<WaitCiResult>;

declare class ScmMergeError extends Error {
    readonly code: "no-state-file" | "bad-precondition" | "no-github-remote" | "no-pr-url" | "bad-pr-url" | "merge-failed" | "migrate-failed" | "migrate-timeout";
    constructor(message: string, code: "no-state-file" | "bad-precondition" | "no-github-remote" | "no-pr-url" | "bad-pr-url" | "merge-failed" | "migrate-failed" | "migrate-timeout");
}
interface MergeArgs {
    projectDir: string;
    /** Merge method. Default: "squash" (matches the workflow expectation of a single rolled-up commit on the parent). */
    method?: "merge" | "squash" | "rebase";
    /** Override instance from workflow state. */
    instance?: string;
    /** Switch HEAD to this branch after merge. Default: workflow.parent_branch. */
    switchTo?: string;
    /** Skip the local branch + HEAD switch (useful for CI-only merges). */
    skipLocalCleanup?: boolean;
    /**
     * Wait for the downstream migrate workflow on parent_branch to complete
     * before returning. Default: true. Set false for "merge and walk away"
     * flows where the user does not need migration confirmation.
     */
    waitMigrate?: boolean;
    /** Total budget for the migrate poll loop, milliseconds. Default: 30 minutes. */
    migrateTimeoutMs?: number;
    /** Interval between migrate polls, milliseconds. Default: 30 seconds. */
    migratePollMs?: number;
    /**
     * Predicate identifying the downstream migrate workflow run among
     * recent runs on parent_branch. Default: any push-event run on
     * parent_branch newer than the merge timestamp. Tests can pass a
     * tighter predicate (e.g. filter by workflow name).
     */
    migrateRunPredicate?: (run: WorkflowRunSummary, mergedAt: Date) => boolean;
    /**
     * Override the workflow-runs fetcher (mostly for tests). The default
     * uses the substrate's listWorkflowRuns.
     */
    fetchRuns?: (ownerRepo: string, limit?: number) => Promise<WorkflowRunSummary[]>;
    /** Override the sleep step (for tests). */
    sleep?: (ms: number) => Promise<void>;
    /** Clock injection for testability. */
    now?: () => Date;
}
interface MergeResult {
    state: ScmWorkflowState;
    /** Result from the underlying paired-merge primitive. */
    paired: Awaited<ReturnType<typeof mergePairedPullRequest>>;
    /** True iff the local feature branch was deleted. */
    localBranchDeleted: boolean;
    /** Branch HEAD points at after the merge step (parent_branch on success). */
    headAfter: string;
    /** Information about the downstream migrate workflow when --wait-migrate was on. */
    migrate?: {
        waited: boolean;
        runUrl?: string;
        conclusion?: string;
        polls: number;
    };
    warnings: string[];
}
declare function mergeFeature(args: MergeArgs): Promise<MergeResult>;
/** Pull "123" out of "https://github.com/owner/repo/pull/123" (and similar). */
declare function extractPullNumber(prUrl: string): number | undefined;

declare class ScmRecoverError extends Error {
    readonly code: "missing-instance" | "claim-conflict" | "substrate-failure";
    constructor(message: string, code: "missing-instance" | "claim-conflict" | "substrate-failure");
}
interface RecoverOrphansArgs {
    projectDir: string;
    /**
     * Lakebase project id. Required because the helper compares git +
     * Lakebase branch inventories. Resolve from .env at the CLI layer.
     */
    instance: string;
    /**
     * When true, retroactively pair every orphan via createFeaturePairedBranch.
     * Default: false (detect-only). The default avoids surprises: a user
     * can run this to inspect the orphan list, then decide whether to
     * claim, branch-by-branch, or fix .lakebase/workflow-state.json
     * manually.
     */
    claim?: boolean;
    /**
     * Limit claim work to a specific branch name. Useful when one orphan
     * is known + the rest are intentional (e.g. release-engineering
     * branches the maintainer wants to keep orphan).
     */
    onlyBranch?: string;
    /**
     * Clock injection for testability.
     */
    now?: () => Date;
}
interface OrphanCandidate {
    /** Local git branch name (e.g. "feature/initial-domain"). */
    gitBranch: string;
    /** Sanitized Lakebase branch id (e.g. "feature-initial-domain"). */
    sanitized: string;
    /** True iff this is HEAD's current branch. Claiming HEAD is allowed but flagged. */
    isCurrent: boolean;
    /** Reason a branch was classified an orphan. */
    reason: string;
}
interface ClaimedOrphan {
    candidate: OrphanCandidate;
    /** Lakebase UID assigned by the substrate. */
    lakebaseBranchUid: string;
    /** True iff the workflow-state.json row was updated to feature-claimed. */
    stateUpdated: boolean;
    /** Diagnostic warnings from the substrate. */
    warnings: string[];
}
interface RecoverOrphansResult {
    /** Inferred tier topology (mirrors adopt). */
    tierTopology: TierTopology;
    /** All orphan candidates detected. */
    orphans: OrphanCandidate[];
    /**
     * Branches in the working tree that we intentionally skipped (tier
     * branches, default branch). Included so the CLI can render a
     * "considered but not orphaned" line for transparency.
     */
    skipped: Array<{
        gitBranch: string;
        reason: string;
    }>;
    /** Orphans that were retroactively claimed (only populated when claim=true). */
    claimed: ClaimedOrphan[];
    /** Whether the workflow-state row was updated (only when a SINGLE claim was made). */
    stateUpdatedFor?: string;
}
declare function recoverOrphans(args: RecoverOrphansArgs): Promise<RecoverOrphansResult>;

type DoctorSeverity = "ok" | "warn" | "fail";
interface DoctorFinding {
    id: string;
    severity: DoctorSeverity;
    message: string;
    /** One-line shell command the user can run to address this. */
    suggestion?: string;
}
interface DoctorArgs {
    projectDir: string;
    /** Lakebase project id. Required to reach the Lakebase side. */
    instance?: string;
}
interface DoctorReport {
    projectDir: string;
    workflowStatePresent: boolean;
    state?: ScmWorkflowState;
    inferredTierTopology?: TierTopology;
    findings: DoctorFinding[];
    /** Convenience aggregate. */
    worstSeverity: DoctorSeverity;
}
declare function runDoctor(args: DoctorArgs): Promise<DoctorReport>;
declare class ScmDoctorFixError extends Error {
    readonly code: "finding-not-present" | "unsupported-finding" | "fix-failed";
    constructor(message: string, code: "finding-not-present" | "unsupported-finding" | "fix-failed");
}
/** Findings the doctor can auto-fix. Others require manual intervention. */
declare const FIXABLE_FINDING_IDS: readonly ["env-branch-drift", "head-branch-drift", "tier-topology-mismatch", "orphan-current-branch"];
type FixableFindingId = (typeof FIXABLE_FINDING_IDS)[number];
interface FixFindingArgs {
    projectDir: string;
    instance?: string;
    findingId: FixableFindingId;
    /** Use the supplied report instead of re-running runDoctor (for tests). */
    report?: DoctorReport;
}
interface FixFindingResult {
    /** Finding that was acted on. */
    findingId: FixableFindingId;
    /** One-line summary of the remediation that ran. */
    action: string;
    /** Doctor report captured after the remediation. */
    postReport: DoctorReport;
}
/**
 * Apply a targeted remediation for one finding. Refuses if the
 * finding isn't present in the current report (so the user can't
 * accidentally run a `--fix` against a stale plan). Refuses on
 * unsupported finding ids.
 */
declare function fixFinding(args: FixFindingArgs): Promise<FixFindingResult>;

interface RunnerInfo {
    name: string;
    dir: string;
    pid?: number;
    online: boolean;
}
type RunnerReportFn = (msg: string) => void;
declare function runnerDir(projectName: string): string;
declare function runnerName(projectName: string): string;
/** Download the GitHub Actions runner tarball, cache it under ~/.cache. */
declare function ensureCachedArchive(): Promise<string>;
/** Resolve JAVA_HOME: env var first, then find-java-home. */
declare function resolveJavaHome(): Promise<string | undefined>;
/** True iff the runner's recorded pid is alive. */
declare function isRunning(projectName: string): boolean;
declare function getRunnerInfo(projectName: string): RunnerInfo | undefined;
/** Stop the runner process (best-effort) and clean up stale state dirs. */
declare function stopRunner(projectName: string): void;
interface SetupRunnerArgs {
    fullRepoName: string;
    projectName: string;
    report?: RunnerReportFn;
}
declare function setupRunner(args: SetupRunnerArgs): Promise<RunnerInfo>;
interface RemoveRunnerArgs {
    fullRepoName: string;
    projectName: string;
}
/** Stop, deregister from GitHub (best-effort), and delete the on-disk dir. */
declare function removeRunner(args: RemoveRunnerArgs): Promise<void>;

type RunnerType = "self-hosted" | "github-hosted";
type ScaffoldReportFn = (message: string, detail?: string) => void;
interface ScaffoldOptions {
    /** Override the templates/project root. Default: auto-detected. */
    templatesDir?: string;
}
/** Deploy all scripts from common/scripts/. Files become executable. */
declare function deployScripts(targetDir: string, opts?: ScaffoldOptions): Promise<string[]>;
interface DeployClaudeCommandsResult {
    /** Paths (relative to targetDir) that were written. */
    written: string[];
    /** Paths that already existed and were left untouched (force=false). */
    skipped: string[];
}
interface DeployClaudeCommandsOptions extends ScaffoldOptions {
    /** Overwrite existing .claude/commands/*.md. Default: false. */
    force?: boolean;
}
/**
 * Deploy `.claude/commands/{design,build}.md` from
 * `common/.claude/commands/`. Substitutes `${KIT_VERSION_AT_SCAFFOLD}`
 * with the kit version that ran the scaffold so the project file pins
 * to a specific substrate revision (the future drift detector reads
 * this back). Skips files that already exist in the project unless
 * `force: true` so a re-run does not clobber a user's edits.
 */
declare function deployClaudeCommands(targetDir: string, opts?: DeployClaudeCommandsOptions): Promise<DeployClaudeCommandsResult>;
/** Deploy GitHub Actions workflows from common/.github/workflows/. */
declare function deployWorkflows(targetDir: string, opts?: ScaffoldOptions): Promise<string[]>;
/**
 * Install git hooks by copying template scripts into .git/hooks.
 * Requires {@param targetDir}/.git to already exist (caller ran git init).
 */
declare function installHooks(targetDir: string): Promise<string>;
interface DeployEnvExampleArgs extends ScaffoldOptions {
    databricksHost?: string;
    lakebaseProjectId?: string;
}
/** Deploy .env.example with optional value substitution. */
declare function deployEnvExample(targetDir: string, args?: DeployEnvExampleArgs): Promise<void>;
/** Deploy .env with the project's credentials already filled in. The
 *  create-project flow has these credentials in hand (LAKEBASE_PROJECT_ID
 *  is the project being scaffolded; DATABRICKS_HOST is the target workspace
 *  the user picked), so populating .env immediately avoids the gated-hook
 *  problem where the post-checkout hook bails on empty LAKEBASE_PROJECT_ID
 *  and never refreshes .env on subsequent checkouts. .env is gitignored
 *  (see .gitignore.base) - never enters git history. Secrets (JWT,
 *  DB_PASSWORD, DATABASE_URL) are written by the hook on first checkout. */
declare function deployEnv(targetDir: string, args?: DeployEnvExampleArgs): Promise<void>;
/** Deploy deploy-targets.yaml with optional {{PROJECT_NAME}} substitution. */
declare function deployDeployTargets(targetDir: string, projectName?: string, opts?: ScaffoldOptions): Promise<void>;
/** Deploy .vscode/settings.json (disables built-in Git SCM). */
declare function deployVscodeSettings(targetDir: string, opts?: ScaffoldOptions): Promise<void>;
/** Deploy .gitignore: common/.gitignore.base + <language>/.gitignore.extra. */
declare function deployGitignore(targetDir: string, language?: ProjectLanguage, opts?: ScaffoldOptions): Promise<void>;
/**
 * Patch the deployed workflows for the chosen runner type.
 *
 * Templates ship with `runs-on: self-hosted` + `actions/setup-java@v4`. This
 * is a historical default: most workspaces today register a self-hosted
 * runner alongside the project, so the templates match that path out of the
 * box (no patch needed - it just falls through and works).
 *
 * For each non-default mode, swap the bits that need swapping:
 *   - github-hosted: replace `runs-on: self-hosted` -> `runs-on: ubuntu-latest`
 *     across all .github/workflows/*.yml. setup-java already targets the
 *     online Maven on github-hosted runners, so nothing else changes.
 *   - self-hosted: replace the actions/setup-java block with a local-JDK
 *     detection step (the self-hosted runner pre-provisions JDK + a Maven
 *     mirror, so we don't want the online setup-java step).
 */
declare function patchWorkflowsForRunnerType(targetDir: string, runnerType: RunnerType): Promise<void>;
interface ScaffoldStaticAllArgs extends ScaffoldOptions {
    targetDir: string;
    databricksHost?: string;
    lakebaseProjectId?: string;
    language?: ProjectLanguage;
    runnerType?: RunnerType;
    report?: ScaffoldReportFn;
    /**
     * Skip `.claude/commands/{design,build}.md`. Default: false (commands
     * are scaffolded). Set to true when the project already has its own
     * commands or when scaffolding programmatically (CI bootstrap) for
     * a consumer that does not use Claude Code.
     */
    skipCommands?: boolean;
}
interface ScaffoldAllArgs extends ScaffoldStaticAllArgs {
    /** Optional Initializr client override for tests. */
    initializrClient?: SpringInitializrClient;
}
interface ScaffoldStaticAllResult {
    scripts: string[];
    workflows: string[];
    hooksInstalled: string;
    /** `.claude/commands/*.md` files written this run. Empty when skipped. */
    claudeCommands: string[];
}
/**
 * Orchestrate the static (non-language-project) portion of scaffolding.
 * Language-specific files (Spring Initializr for Java/Kotlin, static
 * templates for Python/Node) ship in FEIP-7073.
 *
 * Caller must have already created targetDir and run `git init` there
 * (installHooks requires .git/).
 */
declare function scaffoldStaticAll(args: ScaffoldStaticAllArgs): Promise<ScaffoldStaticAllResult>;
/**
 * Full scaffold: static files (scaffoldStaticAll) + language-specific
 * project (Spring Initializr for Java/Kotlin; static template copy for
 * Python/Node). Mirror of ScaffoldService.scaffoldAll. Order matters –
 * language project is deployed LAST so its src/ doesn't shadow scaffold
 * scripts (which live at the project root, not under src/).
 */
declare function scaffoldAll(args: ScaffoldAllArgs): Promise<ScaffoldStaticAllResult>;

type SpringJvmLanguage = "java" | "kotlin";
interface InitializrMetadata {
    bootVersion: string;
    javaVersion: string;
}
interface GenerateMavenProjectOptions {
    language: SpringJvmLanguage;
    artifactId: string;
    name?: string;
    groupId?: string;
    packageName?: string;
    description?: string;
}
declare class InitializrNetworkError extends Error {
    readonly cause?: unknown;
    constructor(message: string, cause?: unknown);
}
declare class InitializrParseError extends Error {
    constructor(message: string);
}
type FetchFn = typeof fetch;
/** SNAPSHOT, RC, milestone, alpha/beta versions are not GA. */
declare function isPrereleaseBootVersion(version: string): boolean;
/** Pick the newest GA Spring Boot version from Initializr metadata. */
declare function resolveLatestBootVersion(section: unknown): string;
/** Java 8/11 and every fourth release from 17 (17, 21, 25, …) are LTS. */
declare function isLtsJavaVersion(version: string): boolean;
/** Pick the newest LTS Java version that Initializr supports for this Boot release. */
declare function resolveLatestLtsJavaVersion(section: unknown): string;
declare class SpringInitializrClient {
    private metadataCache?;
    private readonly baseUrl;
    private readonly fetchFn;
    constructor(baseUrl?: string, fetchFn?: FetchFn);
    getMetadata(forceRefresh?: boolean): Promise<InitializrMetadata>;
    generateMavenProject(opts: GenerateMavenProjectOptions): Promise<Buffer>;
}

interface DeploySpringStarterArgs {
    targetDir: string;
    language: SpringJvmLanguage;
    projectName?: string;
    /** Override templates dir (tests). */
    templatesDir?: string;
    /** Override Initializr client (tests). */
    initializrClient?: SpringInitializrClient;
    report?: ScaffoldReportFn;
}
/**
 * Mirror of ScaffoldService.deploySpringFromInitializr.
 *
 *   1. If LAKEBASE_SCAFFOLD_FALLBACK=1, skip the network entirely and use
 *      the bundled fallback (templates/.../fallback/).
 *   2. Otherwise: fetch metadata + starter zip from start.spring.io,
 *      extract, apply Spring overlay (templates/project/spring/), patch
 *      pom.xml for Lakebase (flyway-pg dep + flyway/surefire plugins).
 *   3. If anything fails BEFORE extraction succeeds, fall back to the
 *      bundled template. If failure happens AFTER extraction, surface the
 *      error (the user has partial state on disk that they may want to keep).
 */
declare function deploySpringStarter(args: DeploySpringStarterArgs): Promise<void>;

type ProjectLanguage = "java" | "kotlin" | "python" | "nodejs";
interface DeployLanguageProjectArgs {
    targetDir: string;
    language: ProjectLanguage;
    projectName?: string;
    /** Override templates dir (tests). */
    templatesDir?: string;
    /** Override Initializr client (tests). */
    initializrClient?: SpringInitializrClient;
    report?: ScaffoldReportFn;
}
declare function deployLanguageProject(args: DeployLanguageProjectArgs): Promise<void>;

interface SchemaColumn {
    name: string;
    dataType: string;
}
interface SchemaObject {
    type: "TABLE" | "INDEX";
    name: string;
    columns?: SchemaColumn[];
}
interface ModifiedSchemaObject extends SchemaObject {
    type: "TABLE";
    columns: SchemaColumn[];
    addedColumns: SchemaColumn[];
    removedColumns: SchemaColumn[];
    prodColumns: SchemaColumn[];
}
interface SchemaDiffResult {
    /** Branch the diff is FOR (target). */
    branchName: string;
    /**
     * The Lakebase branch this diff was computed AGAINST (the parent / source).
     * Empty string when unknown or when comparing the default branch itself.
     */
    comparisonBranchName: string;
    timestamp: string;
    /**
     * Always empty in the script-emitted result – migrations are a workspace
     * file concern, not a Lakebase-side concern. The extension fills this in
     * locally from its workspace's migrationPath.
     */
    migrations: Array<{
        version: string;
        description: string;
    }>;
    /** Tables on target that don't exist on the parent. */
    created: SchemaObject[];
    /** Tables on both branches with column differences. */
    modified: ModifiedSchemaObject[];
    /** Tables on parent that don't exist on the target. */
    removed: SchemaObject[];
    /** Full inventory of tables on the target branch. */
    branchTables: SchemaObject[];
    /** True iff created + modified + removed are all empty. */
    inSync: boolean;
    /** Populated when the diff couldn't be computed. Caller decides how to surface. */
    error?: string;
}
interface GetSchemaDiffArgs {
    /** Lakebase project id. */
    instance: string;
    /** Target branch to compute the diff FOR. */
    branch: string;
    /**
     * Explicit comparison branch. When omitted, resolved via Lakebase metadata
     * (target's sourceBranchId → default branch fallback).
     */
    comparisonBranch?: string;
    /** Database name. Defaults to env PGDATABASE then "databricks_postgres". */
    database?: string;
    /** Optional WorkspaceClient pass-through to getConnection (OBO via AppKit). */
    workspaceClient?: unknown;
}
declare function getSchemaDiff(args: GetSchemaDiffArgs): Promise<SchemaDiffResult>;
/**
 * Render a SchemaDiffResult as the canonical "SCHEMA CHANGES (Lakebase diff)"
 * markdown block. Consumers (the scaffolded prepare-commit-msg hook, the
 * GH Actions PR comment, the extension's commit-detail view) parse this
 * shape. Keep the surface stable; if you need new fields, add them as
 * additional sections rather than altering the established prefixes.
 * (Pre-FEIP-7494 the same format was emitted by the now-removed shell
 * formatter templates/.../scripts/format-schema-diff.sh.)
 *
 * Output shape (per object, blank line between objects):
 *
 *   **SCHEMA CHANGES (Lakebase diff)**
 *
 *   + TABLE name (CREATED)
 *     L col_name data_type
 *
 *   + INDEX name (CREATED)
 *
 *   ~ TABLE name (MODIFIED)
 *     + col_name data_type
 *
 *   - TABLE name (REMOVED)
 *
 *   - INDEX name (REMOVED)
 *
 * Empty-diff emits `No schema changes (in sync).` after the header.
 */
declare function formatSchemaDiffAsMarkdown(result: SchemaDiffResult): string;

interface EnsureLakebaseSecretAuthArgs {
    /** Databricks CLI profile (the deploying user's identity). */
    profile: string;
    /** Secret scope name to create / use. Idempotent: existing scopes
     *  are kept. */
    scopeName: string;
    /** Secret key name within the scope. The minted PAT is stored here. */
    keyName: string;
    /** Service principal client id to grant READ on the scope. When
     *  undefined, the scope + secret are created but no ACL is set. */
    servicePrincipalClientId?: string;
    /** Description placed on the minted PAT. Useful for token-list audits. */
    tokenComment?: string;
    /** PAT lifetime in seconds. Default: 90 days. */
    tokenLifetimeSeconds?: number;
    timeoutMs?: number;
}
interface EnsureLakebaseSecretAuthResult {
    /** Scope name (passed through). */
    scope: string;
    /** Key name (passed through). */
    key: string;
    /** True iff this call created the scope (false if it pre-existed). */
    scopeCreated: boolean;
    /** True iff a new PAT was minted + stored. */
    patStored: boolean;
    /** True iff the SP ACL was granted (false when servicePrincipalClientId
     *  was undefined or the grant failed). */
    aclGranted: boolean;
}
/**
 * Ensure a secret scope + key are configured for Lakebase auth.
 *
 * Order:
 *   1. Create secret scope (idempotent: tolerates SCOPE_ALREADY_EXISTS)
 *   2. Mint a long-lived PAT
 *   3. Store the PAT in `<scope>/<key>`
 *   4. Grant the SP READ on the scope (only when servicePrincipalClientId provided)
 *
 * Each call mints a NEW PAT regardless of whether the secret already
 * holds one; the platform's secret put is destructive (overwrite). For
 * the lakebase-scm-extension's deploy flow, this matches the desired
 * behavior (fresh PAT per deploy, tokens rotate at the configured
 * lifetime).
 *
 * Promise rejects on infrastructure failures (CLI not on PATH, timeout,
 * token mint refusal). The ACL grant is best-effort: failure is
 * reflected in `aclGranted: false` rather than throwing, so callers can
 * surface the warning without failing the deploy.
 */
declare function ensureLakebaseSecretAuth(args: EnsureLakebaseSecretAuthArgs): Promise<EnsureLakebaseSecretAuthResult>;

type CommandUpdateOutcome = "added" | "updated" | "unchanged" | "preserved";
interface CommandFileUpdate {
    /** File name (e.g. "design.md"). */
    name: string;
    outcome: CommandUpdateOutcome;
}
interface UpdateCommandsArgs {
    /** Project directory containing `.claude/commands/`. */
    projectDir: string;
    /**
     * Kit directory containing
     * `templates/project/common/.claude/commands/`. Default: walk up
     * from this module looking for the templates marker.
     */
    kitDir?: string;
    /**
     * When true, report what WOULD change but don't write to disk.
     * Default: false. Pairs with the CLI's `--dry-run` flag.
     */
    dryRun?: boolean;
    /**
     * When false, the writer refuses to overwrite a project command
     * file whose body has drifted (i.e. status === "drifted"). The
     * file is reported with outcome "preserved" and left untouched.
     * Default: true. Pairs with the CLI's `--force` flag and the
     * interactive-per-file confirm flow above this primitive.
     */
    force?: boolean;
}
interface UpdateCommandsResult {
    files: CommandFileUpdate[];
    /** True iff anything actually changed on disk (or would, in dryRun). */
    changed: boolean;
}
/**
 * Refresh a scaffolded project's `.claude/commands/{design,build}.md`
 * in place from the kit's current templates.
 *
 * Defaults:
 *   - WRITES the kit's template content with the current kit version
 *     substituted into the `${KIT_VERSION_AT_SCAFFOLD}` placeholder.
 *   - With `force: true` (default), drifted files are overwritten.
 *     With `force: false`, drifted files are left alone and reported
 *     with outcome `preserved` so the CLI's interactive-per-file
 *     confirm flow can decide one at a time.
 *   - LEAVES hook files (`<name>.{pre,post}-hook.md`) completely
 *     untouched. They never appear in the result list either; the
 *     contract is "this primitive only touches kit-owned templates."
 *   - CREATES `.claude/commands/` if missing.
 *
 * Set `dryRun: true` to surface the same per-file outcomes without
 * touching disk.
 */
declare function updateCommands(args: UpdateCommandsArgs): UpdateCommandsResult;

type WorkflowStatus = "unchanged" | "drifted" | "missing" | "extra";
interface WorkflowFileStatus {
    /** File name (e.g. "pr.yml"). */
    name: string;
    status: WorkflowStatus;
    /**
     * Unified diff when status is "drifted". Empty string otherwise.
     * Diff is project-vs-template (project's lines marked -, template's +).
     */
    diff?: string;
}
interface WorkflowDriftReport {
    /** Aggregate: ok if every file is unchanged, otherwise drift. */
    overall: "ok" | "drift";
    /** Per-file status entries. Includes missing + extra files for completeness. */
    files: WorkflowFileStatus[];
}
interface DetectWorkflowDriftArgs {
    /** Project directory containing .github/workflows/. */
    projectDir: string;
    /**
     * Kit directory containing templates/project/common/.github/workflows/.
     * Default: walks up from this module looking for the templates marker
     * (same logic as scaffold.findTemplatesDir).
     */
    kitDir?: string;
}
/**
 * Compare a project's .github/workflows/*.yml against the kit's
 * templates. Returns a per-file report flagging missing, extra, and
 * drifted files.
 *
 * Use cases:
 *   - lakebase-doctor surfaces drift as a WARN check
 *   - CI: nightly job that PRs an updateWorkflows when drift detected
 *   - One-off: maintainer runs lakebase-doctor --json before a release
 *
 * Returns overall: "ok" iff every workflow file is unchanged AND no
 * missing files exist. Extra files (project has a workflow the kit
 * doesn't template) are reported as "extra" status but DON'T count
 * against "ok" - projects legitimately add their own workflows.
 */
declare function detectWorkflowDrift(args: DetectWorkflowDriftArgs): WorkflowDriftReport;
type WorkflowUpdateOutcome = "added" | "updated" | "unchanged" | "removed";
interface WorkflowFileUpdate {
    /** File name (e.g. "pr.yml"). */
    name: string;
    outcome: WorkflowUpdateOutcome;
}
interface UpdateWorkflowsArgs {
    /** Project directory containing .github/workflows/. */
    projectDir: string;
    /**
     * Kit directory containing templates/project/common/.github/workflows/.
     * Default: walk up from this module looking for the templates marker
     * (same logic as {@link detectWorkflowDrift}).
     */
    kitDir?: string;
    /**
     * When true, removes project workflow .yml files that aren't in the
     * kit templates. Default: false – projects legitimately add their own
     * workflows alongside the kit's set.
     */
    pruneExtras?: boolean;
    /**
     * When true, report what WOULD change but don't write to disk.
     * Default: false.
     */
    dryRun?: boolean;
    /**
     * When true, substitute `{{LAKEBASE_KIT_VERSION}}` with the kit's
     * current version (read from its package.json) before writing.
     * Default: true – matches the scaffolder's behavior.
     */
    substitute?: boolean;
}
interface UpdateWorkflowsResult {
    /** Per-file outcome (added / updated / unchanged / removed). */
    files: WorkflowFileUpdate[];
    /** True iff anything actually changed on disk (or would, in dryRun). */
    changed: boolean;
}
type CommandFileStatus = WorkflowStatus;
interface CommandFileEntry {
    /** File name (e.g. "design.md"). */
    name: string;
    status: CommandFileStatus;
    /**
     * Project's pinned kit version, parsed from the file's
     * `Pinned to: <version>` line. Undefined when the file doesn't
     * carry a pin (e.g. legacy hand-rolled command files).
     */
    pinned_version?: string;
    /**
     * Kit's current version (the version the detector compared against).
     * Same for every file in a single report; surfaced per-entry so a
     * downstream consumer can diff pinned vs current without re-reading
     * package.json.
     */
    kit_version?: string;
    /**
     * Unified diff when status is "drifted". Project's lines marked -,
     * template's +. Substitutions are re-applied to the template before
     * the diff so version-pin updates don't show up as noise (the
     * project's pinned version is replaced with the kit's current
     * version on both sides).
     */
    diff?: string;
}
interface CommandDriftReport {
    /** Aggregate: ok if every file is unchanged + no template missing. */
    overall: "ok" | "drift";
    /** Per-file status. Hook files NEVER appear here. */
    files: CommandFileEntry[];
}
interface DetectCommandDriftArgs {
    /** Project directory containing `.claude/commands/`. */
    projectDir: string;
    /**
     * Kit directory containing
     * `templates/project/common/.claude/commands/`. Default: walks up
     * from this module looking for the templates marker (same logic as
     * `detectWorkflowDrift`).
     */
    kitDir?: string;
}
/**
 * Compare a project's `.claude/commands/*.md` against the kit's
 * canonical templates. Hook files
 * (`<name>.{pre,post}-hook.md`) are excluded from the walk; projects
 * own those.
 *
 * Each entry reports the project's pinned kit version (from the
 * `Pinned to:` line) plus the kit's current version. Drifted entries
 * include a unified diff with the version placeholder re-applied to
 * the template on both sides, so a version bump alone never shows up
 * as drift.
 */
declare function detectCommandDrift(args: DetectCommandDriftArgs): CommandDriftReport;
interface ScaffoldedDriftReport {
    /** Aggregate across every scaffolded surface. */
    overall: "ok" | "drift";
    workflows: WorkflowDriftReport;
    commands: CommandDriftReport;
}
interface DetectScaffoldedDriftArgs {
    projectDir: string;
    kitDir?: string;
}
/**
 * One-shot drift detection across every scaffolded surface the kit
 * stamps with a version pin. Currently covers
 * `.github/workflows/*.yml` (via {@link detectWorkflowDrift}) and
 * `.claude/commands/*.md` (via {@link detectCommandDrift}). Future
 * scaffolded surfaces with a similar template-plus-pin shape can plug
 * into the same report shape.
 *
 * Use this when you want a single ok/drift verdict for a project;
 * call the per-surface functions when you only care about one.
 */
declare function detectScaffoldedDrift(args: DetectScaffoldedDriftArgs): ScaffoldedDriftReport;
/**
 * Refresh a scaffolded project's `.github/workflows/*.yml` in place
 * from the kit's current templates.
 *
 * Defaults to:
 *   - WRITES the kit's template content into the project, overwriting
 *     any drifted copies. `{{LAKEBASE_KIT_VERSION}}` is substituted with
 *     the kit's current version (read from its package.json).
 *   - LEAVES extra project workflow files in place (the project might
 *     have added its own .yml alongside the kit's set). Pass
 *     `pruneExtras: true` to remove them.
 *   - CREATES .github/workflows/ if missing.
 *
 * Designed to be the safe counterpart to {@link detectWorkflowDrift}:
 * after a drift report flags drifted/missing files, `updateWorkflows()`
 * closes the gap in one call. The per-file `outcome` list mirrors the
 * drift report's vocabulary so callers can diff before vs after if
 * needed.
 *
 * Set `dryRun: true` to surface the same per-file outcomes without
 * touching disk – useful for previews in lakebase-doctor.
 */
declare function updateWorkflows(args: UpdateWorkflowsArgs): UpdateWorkflowsResult;

interface CatalogExistsArgs {
    profile: string;
    catalog: string;
    timeoutMs?: number;
}
/**
 * Check whether a Unity Catalog catalog exists. Returns true on 200,
 * false on 404 / RESOURCE_DOES_NOT_EXIST. Throws only on
 * infrastructure failures (CLI not on PATH, timeout).
 */
declare function catalogExists(args: CatalogExistsArgs): Promise<boolean>;
interface TryCreateCatalogArgs {
    profile: string;
    catalog: string;
    comment?: string;
    timeoutMs?: number;
}
interface TryCreateCatalogResult {
    /** True iff the create POST returned successfully. False when the
     *  workspace blocks programmatic catalog creation (Default Storage
     *  workspaces, missing permissions, etc.); the caller can fall back
     *  to an interactive flow. */
    created: boolean;
    /** Error message when create failed (for diagnostic surfacing). */
    error?: string;
}
/**
 * Try to create a Unity Catalog catalog. Returns `{ created: false,
 * error }` (not a throw) on any failure path so the caller can decide
 * whether to fall back to interactive creation or escalate.
 */
declare function tryCreateCatalog(args: TryCreateCatalogArgs): Promise<TryCreateCatalogResult>;
interface EnsureSchemaAndVolumeArgs {
    profile: string;
    catalog: string;
    schema: string;
    volume: string;
    /** Comment applied to newly created schema + volume. Ignored when
     *  the resources already exist. */
    comment?: string;
    /** Volume type. Default: `MANAGED`. */
    volumeType?: "MANAGED" | "EXTERNAL";
    timeoutMs?: number;
}
interface EnsureSchemaAndVolumeResult {
    /** True iff this call created the schema (false if it pre-existed). */
    schemaCreated: boolean;
    /** True iff this call created the volume. */
    volumeCreated: boolean;
}
/**
 * Ensure a Unity Catalog schema + volume exist under the named catalog.
 * Idempotent: existing schema/volume are left untouched. The catalog
 * itself must exist (use `catalogExists` + `tryCreateCatalog` first).
 */
declare function ensureSchemaAndVolume(args: EnsureSchemaAndVolumeArgs): Promise<EnsureSchemaAndVolumeResult>;
type UcCatalogPermission = "USE_CATALOG" | "USE_SCHEMA" | "READ_VOLUME" | "WRITE_VOLUME" | "CREATE_SCHEMA" | "CREATE_TABLE" | "MODIFY" | "SELECT" | "ALL_PRIVILEGES";
interface GrantUcCatalogPermissionArgs {
    profile: string;
    catalog: string;
    /** Principal (SP clientId, user email, or group name). */
    servicePrincipalName: string;
    /** Permissions to add. Default: the "deployed-app standard" set:
     *  USE_CATALOG + USE_SCHEMA + READ_VOLUME + WRITE_VOLUME. */
    permissions?: UcCatalogPermission[];
    timeoutMs?: number;
}
interface GrantUcCatalogPermissionResult {
    granted: boolean;
}
/**
 * Grant a principal permissions on a Unity Catalog catalog. Wraps
 * PATCH `/api/2.1/unity-catalog/permissions/catalog/<name>` with the
 * standard `changes: [{ principal, add: [...] }]` shape.
 */
declare function grantUcCatalogPermission(args: GrantUcCatalogPermissionArgs): Promise<GrantUcCatalogPermissionResult>;
/**
 * Build the Catalog Explorer URL for a workspace. Pure helper, no
 * network call. Useful for surfacing clickable links in agent / UI
 * output after a successful deploy.
 */
declare function catalogExplorerUrl(workspaceHost: string): string;

type SchemaMigrationLanguage = "java" | "kotlin" | "python" | "nodejs";
type SchemaMigrationToolName = "flyway" | "alembic" | "knex";
interface SchemaMigrationFile {
    /** Stable identifier sortable in apply-order: Flyway `V<n>`, Alembic
     *  revision hash, Knex timestamp prefix. */
    version: string;
    filename: string;
    description: string;
    type: "SQL" | "Python" | "JavaScript" | "TypeScript";
    /** Tool that should run this file. */
    tool: SchemaMigrationToolName;
}
interface ListSchemaMigrationsArgs {
    /** Project root. Defaults to process.cwd(). */
    projectDir?: string;
    /** Override language detection. Defaults to auto-detect from project files. */
    language?: SchemaMigrationLanguage;
}
interface AppliedSchemaMigration {
    version: string;
    description: string;
    executionTimeMs?: number;
}
interface ApplySchemaMigrationsArgs {
    instance: string;
    branch: string;
    projectDir?: string;
    language?: SchemaMigrationLanguage;
    database?: string;
    endpointName?: string;
}
interface ApplySchemaMigrationsResult {
    applied: AppliedSchemaMigration[];
    alreadyAtLatest: boolean;
    tool: SchemaMigrationToolName;
}
interface RollbackSchemaMigrationArgs {
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
interface RollbackSchemaMigrationResult {
    rolledBack: AppliedSchemaMigration[];
    tool: SchemaMigrationToolName;
}
interface SchemaMigrationStatusArgs {
    instance: string;
    branch: string;
    projectDir?: string;
    language?: SchemaMigrationLanguage;
    database?: string;
    endpointName?: string;
}
interface PendingSchemaMigration {
    version: string;
    filename: string;
    description: string;
}
interface SchemaMigrationStatusResult {
    current: string | undefined;
    pending: PendingSchemaMigration[];
    tool: SchemaMigrationToolName;
}
declare class SchemaMigrationError extends Error {
    readonly cause?: unknown | undefined;
    constructor(message: string, cause?: unknown | undefined);
}
/** Detect the project language from filesystem markers. Mirrors the
 *  detection in templates/project/common/scripts/flyway-migrate.sh so the
 *  kit primitive and the bundled hook agree on which tool to run. */
declare function detectLanguage(projectDir: string): SchemaMigrationLanguage;
/** Map a language to the migration tool the kit invokes for it. */
declare function toolForLanguage(language: SchemaMigrationLanguage): SchemaMigrationToolName;
/** Enumerate migration files in a project. No DB connection required.
 *  Order is apply-order (V1, V2, ... for Flyway; chronological for Alembic
 *  via alembic.ini-resolved order; timestamp-ascending for Knex). */
declare function listSchemaMigrations(args?: ListSchemaMigrationsArgs): SchemaMigrationFile[];
declare function applySchemaMigrations(args: ApplySchemaMigrationsArgs): Promise<ApplySchemaMigrationsResult>;
declare function rollbackSchemaMigration(args: RollbackSchemaMigrationArgs): Promise<RollbackSchemaMigrationResult>;
declare function schemaMigrationStatus(args: SchemaMigrationStatusArgs): Promise<SchemaMigrationStatusResult>;

export { type AbandonFeatureArgs, type AbandonFeatureResult, type AddE2eToRunTestsScriptArgs, type AddE2eToRunTestsScriptResult, type AddInfraToPackageJsonArgs, type AddInfraToPackageJsonResult, type AddInfraToRunTestsScriptArgs, type AddInfraToRunTestsScriptResult, type AddPlaywrightToPackageJsonArgs, type AddPlaywrightToPackageJsonResult, type AdoptLakebaseProjectArgs, type AdoptLakebaseProjectResult, type AdoptStateArgs, type AdoptStateResult, type AdoptTddArgs, type AdoptTddResult, type AppServicePrincipal, type AppliedSchemaMigration, type ApplySchemaMigrationsArgs, type ApplySchemaMigrationsResult, type BranchLookupOpts, type BranchMetadata, CONVENTION_TIER_DEFAULTS, type CatalogExistsArgs, type CheckoutMode, type CheckoutPairedArgs, type CheckoutPairedResult, type ClaimFeatureBranchArgs, type ClaimFeatureBranchResult, type ClaimedOrphan, type CommandDriftReport, type CommandFileEntry, type CommandFileStatus, type CommandFileUpdate, type CommandUpdateOutcome, type ConnectionArgs, type CreateBranchArgs, type CreateConventionBranchArgs, type CreateConventionPairedBranchArgs, type CreateLongRunningBranchArgs, type CreateLongRunningBranchResult, type CreatePairedBranchArgs, type CreatePairedBranchResult, type CutBackupArgs, type CutBackupResult, type DatabricksProfile, type DeleteAppEndpointArgs, type DeleteAppEndpointResult, type DeleteBranchArgs, type DeletePairedBranchArgs, type DeletePairedBranchResult, type DeployClaudeCommandsOptions, type DeployClaudeCommandsResult, type DeployEnvExampleArgs, type DeployLanguageProjectArgs, type DeploySpringStarterArgs, type DeployTarget, type DeployTargetsConfig, type DetectCommandDriftArgs, type DetectScaffoldedDriftArgs, type DetectWorkflowDriftArgs, type DoctorArgs, type DoctorFinding, type DoctorReport, type DoctorSeverity, type DsnArgs, type DsnResult, type EnableE2eForProjectArgs, type EnableE2eForProjectResult, type EnableInfraForProjectArgs, type EnableInfraForProjectResult, type EndpointInfo, type EnsureAppEndpointArgs, type EnsureAppEndpointResult, type EnsureEndpointArgs, type EnsureLakebaseSecretAuthArgs, type EnsureLakebaseSecretAuthResult, type EnsureProfilePinnedArgs, type EnsureProfilePinnedResult, type EnsureSchemaAndVolumeArgs, type EnsureSchemaAndVolumeResult, FIXABLE_FINDING_IDS, type FixFindingArgs, type FixFindingResult, type FixableFindingId, type GateInvariant, type GateStatus, type GenerateAppYamlOptions, type GenerateMavenProjectOptions, type GetAppEndpointArgs, type GetAppEndpointResult, type GetAppServicePrincipalArgs, type GetCiAppEndpointArgs, type GetCiAppEndpointResult, type GetConnectionArgs, type GetCredentialArgs, type GetEndpointArgs, type GetSchemaDiffArgs, type GrantLakebasePermissionArgs, type GrantLakebasePermissionResult, type GrantUcCatalogPermissionArgs, type GrantUcCatalogPermissionResult, type HookVerification, type InfraCheckResult, type InfraSuiteResult, type InitWorkflowStateArgs, type InitializrMetadata, InitializrNetworkError, InitializrParseError, type InstallPlaywrightArgs, type InstallPlaywrightOptions, type InstallPlaywrightResult, LakebaseBranchError, type LakebaseBranchInfo, LakebaseBranchTtlTooLongError, type LakebasePermissionLevel, type LakebaseProjectArgs, LakebaseProjectError, type LakebaseProjectInfo, type LakebaseProjectMetadata, type ListSchemaMigrationsArgs, type MergeArgs, type MergeResult, type ModifiedSchemaObject, type OrphanCandidate, PLAYWRIGHT_TEMPLATE_FILES, PLAYWRIGHT_TEST_VERSION_RANGE, type PendingSchemaMigration, type PoolArgs, type PreparePrArgs, type PreparePrResult, type ProjectLanguage, type PropagateCredentialsArgs, type PropagateCredentialsResult, type QueryBranchSchemaArgs, type RecoverOrphansArgs, type RecoverOrphansResult, type ReleaseArgs, type ReleaseResult, type RemoveRunnerArgs, type ResolveDatabricksHostArgs, type RollbackDeployArgs, type RollbackDeployResult, type RollbackSchemaMigrationArgs, type RollbackSchemaMigrationResult, type RunInfraSuiteArgs, type RunPlaywrightInstallArgs, type RunPlaywrightInstallResult, type RunnerInfo, type RunnerReportFn, type RunnerType, SCM_STATES, STATE_FILE_REL, type ScaffoldAllArgs, type ScaffoldOptions, type ScaffoldReportFn, type ScaffoldStaticAllArgs, type ScaffoldStaticAllResult, type ScaffoldedDriftReport, type SchemaColumn, type SchemaDiffResult, SchemaMigrationError, type SchemaMigrationFile, type SchemaMigrationLanguage, type SchemaMigrationStatusArgs, type SchemaMigrationStatusResult, type SchemaMigrationToolName, type SchemaObject, ScmAbandonError, ScmAdoptError, ScmClaimError, ScmDoctorFixError, ScmMergeError, ScmPreparePrError, ScmRecoverError, type ScmState, ScmWaitCiError, type ScmWorkflowState, type SetupRunnerArgs, SpringInitializrClient, type SpringJvmLanguage, type SyncEnvArgs, type SyncEnvResult, type TableSchema, type TierTopology, type TryCreateCatalogArgs, type TryCreateCatalogResult, type UcCatalogPermission, type UpdateCommandsArgs, type UpdateCommandsResult, type UpdateEnvConnectionArgs, type UpdateWorkflowsArgs, type UpdateWorkflowsResult, type UploadDirectoryArgs, type UploadDirectoryResult, type ValidateAppOptions, type ValidateAppResult, type ValidationError, type ValidationResult, type WaitCiArgs, type WaitCiResult, type WaitForBranchAuthReadyArgs, type WaitForBranchReadyArgs, type WorkflowDriftReport, type WorkflowFileStatus, type WorkflowFileUpdate, type WorkflowStatus, type WorkflowUpdateOutcome, type WorkflowVerification, type WriteEnvFileArgs, type WritePlaywrightTemplatesArgs, type WritePlaywrightTemplatesResult, _testMakeBrownfieldFixture, abandonFeatureBranch, addE2eToRunTestsScript, addInfraToPackageJson, addInfraToRunTestsScript, addPlaywrightToPackageJson, adoptLakebaseProject, adoptScmState, adoptTdd, applySchemaMigrations, assertAdoptionPreflight, cacheProjectRetention, catalogExists, catalogExplorerUrl, checkoutPaired, claimFeatureBranch, clearRetentionCache, createBranch, createFeatureBranch, createFeaturePairedBranch, createLakebaseProject, createLongRunningBranch, createPairedBranch, createPerfBranch, createPerfPairedBranch, createProject, createTestBranch, createTestPairedBranch, createUatBranch, createUatPairedBranch, cutBackup, deleteAppEndpoint, deleteBranch, deleteLakebaseProject, deletePairedBranch, deployClaudeCommands, deployDeployTargets, deployEnv, deployEnvExample, deployGitignore, deployLanguageProject, deployScripts, deploySpringStarter, deployVscodeSettings, deployWorkflows, deriveCiAppName, describeGates, detectCommandDrift, detectLanguage, detectScaffoldedDrift, detectWorkflowDrift, enableE2eForProject, enableInfraForProject, endpointPath, ensureAppEndpoint, ensureCachedArchive, ensureEndpoint, ensureLakebaseSecretAuth, ensureProfilePinned, ensureSchemaAndVolume, extractPullNumber, featureBranchName, findDefaultBranchName, findHistoryRetentionDuration, fixFinding, formatJUnit, formatSchemaDiffAsMarkdown, generateAppYaml, getAppEndpoint, getAppServicePrincipal, getBranchByName, getCachedProjectRetention, getCiAppEndpoint, getConnection, getCredential, getDefaultBranch, getDefaultBranchId, getDefaultBranchName, getEndpoint, getProjectInfo, getProjectRetentionDuration, getRunnerInfo, getSchemaDiff, getTargetNames, grantLakebasePermission, grantUcCatalogPermission, inferTierTopology, initWorkflowState, installHooks, installPlaywright, isLongRunningTierBranch, isLtsJavaVersion, isPrereleaseBootVersion, isRunning, isTier, isTtlTooLongError, listAppDeployments, listBranches, listSchemaMigrations, mergeFeature, minLakebaseTtl, mintCredential, normalizeHost, parseHostFromAuthDescribe, parseLakebaseTtl, parseTargetsYaml, patchWorkflowsForRunnerType, preparePr, projectPath, propagateCredentials, queryBranchSchema, queryBranchTables, readTargets, readWorkflowState, recoverOrphans, release, removeRunner, resolveBranchId, resolveBranchPath, resolveCurrentUser, resolveDatabricksHost, resolveEndpointHost, resolveJavaHome, resolveLatestBootVersion, resolveLatestLtsJavaVersion, resolveParentBranch, resolveProfileForHost, rollbackDeploy, rollbackSchemaMigration, runDoctor, runInfraSuite, runPlaywrightInstall, runnerDir, runnerName, sanitizeFeatureSlug, scaffoldAll, scaffoldStaticAll, schemaMigrationStatus, selectProfileForHost, setupRunner, stateFilePath, stopRunner, syncEnvToCurrentBranch, tierBranchNames, toolForLanguage, tryCreateCatalog, updateCommands, updateEnvConnection, updateWorkflows, uploadDirectory, validateApp, validateWorkflowState, verifyHooks, verifyProject, verifyWorkflows, waitForBranchAuthReady, waitForBranchReady, waitForCi, workflowStateFileExists, writeEnvFile, writePlaywrightTemplates, writeTargets, writeWorkflowState };
