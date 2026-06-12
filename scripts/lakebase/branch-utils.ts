// Lakebase branch lookup helpers. Subset of LakebaseService ported for
// the branch-lifecycle ops (create / delete; checkout follows in).

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  asBranchUid,
  branchNameFromResourcePath,
  type BranchName,
  type BranchUid,
} from "./branch-id.js";
import { KIT_TIMEOUTS } from "./kit-config.js";

const execFileP = promisify(execFile);

export class LakebaseBranchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LakebaseBranchError";
  }
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
export class LakebaseBranchTtlTooLongError extends LakebaseBranchError {
  /** The TTL that was attempted (the value passed to the API). */
  public readonly attemptedTtl: string;

  constructor(attemptedTtl: string, underlyingMessage: string) {
    super(
      `Branch create rejected: TTL '${attemptedTtl}' exceeds the workspace's maximum ` +
        `expiration policy. Pass a shorter ttl arg (e.g. "604800s" for 7 days) or set ` +
        `noExpiry: true. The workspace cap is not directly exposed by the Lakebase API; ` +
        `the project's history_retention_duration (from \`databricks postgres get-project\`) ` +
        `is a conservative starting point.\n\nUnderlying error: ${underlyingMessage}`
    );
    this.name = "LakebaseBranchTtlTooLongError";
    this.attemptedTtl = attemptedTtl;
  }
}

/**
 * Pattern-match the underlying CLI stderr against the workspace
 * TTL-too-long signal. Exported for the unit-test boundary so the
 * detection logic stays guarded by tests if Lakebase rewords the error.
 */
export function isTtlTooLongError(stderr: string): boolean {
  return /expiration time exceeds the maximum expiration time/i.test(stderr);
}

/**
 * Parse a Lakebase-format TTL string ("<seconds>s") to integer seconds.
 * Returns undefined for malformed input. Pure; used in TTL-clamp math.
 */
export function parseLakebaseTtl(ttl: string | undefined): number | undefined {
  if (!ttl) return undefined;
  const m = ttl.trim().match(/^(\d+)s?$/);
  if (!m) return undefined;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Return the smaller of two Lakebase-format TTL strings (min by seconds).
 * Returns the parseable one when only one parses; undefined when neither
 * does. Used to clamp a requested TTL against the workspace cap.
 */
export function minLakebaseTtl(
  a: string | undefined,
  b: string | undefined,
): string | undefined {
  const sa = parseLakebaseTtl(a);
  const sb = parseLakebaseTtl(b);
  if (sa === undefined && sb === undefined) return undefined;
  if (sa === undefined) return `${sb}s`;
  if (sb === undefined) return `${sa}s`;
  return `${Math.min(sa, sb)}s`;
}

// Per-instance cache of the project's `history_retention_duration`.
// Populated lazily by `createBranch` on the first TTL-too-long retry
// path; subsequent branch creates against the same instance reuse the
// cached value rather than re-shelling get-project. Cleared via
// {@link clearRetentionCache} (kept for tests; production agents never
// need to invalidate this cache because the project's retention policy
// is stable for the duration of any agent's lifetime).
const RETENTION_CACHE = new Map<string, string | undefined>();

export function getCachedProjectRetention(instance: string): string | undefined {
  return RETENTION_CACHE.get(instance);
}

export function cacheProjectRetention(instance: string, ttl: string | undefined): void {
  RETENTION_CACHE.set(instance, ttl);
}

export function clearRetentionCache(): void {
  RETENTION_CACHE.clear();
}

export interface LakebaseBranchInfo {
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

export interface BranchLookupOpts {
  /** Lakebase project id. */
  instance: string;
  /** Optional DATABRICKS_HOST override. */
  host?: string;
}

/** Build the canonical project path. */
export function projectPath(instance: string): string {
  return `projects/${instance}`;
}

/** List all branches for a Lakebase project. */
export async function listBranches(opts: BranchLookupOpts): Promise<LakebaseBranchInfo[]> {
  const raw = await dbcli(
    ["postgres", "list-branches", projectPath(opts.instance), "-o", "json"],
    opts.host
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LakebaseBranchError(`Unexpected CLI output: ${raw.slice(0, 200)}`);
  }
  const items: unknown[] = Array.isArray(parsed)
    ? parsed
    : ((parsed as { branches?: unknown[]; items?: unknown[] }).branches ??
        (parsed as { items?: unknown[] }).items ??
        []);
  return items.map(parseBranch).filter((b): b is LakebaseBranchInfo => b !== undefined);
}

/** Find a branch by uid, branchId, or full resource name. */
export async function getBranchByName(
  branchNameOrUid: string,
  opts: BranchLookupOpts
): Promise<LakebaseBranchInfo | undefined> {
  const branches = await listBranches(opts);
  return branches.find(
    (b) =>
      b.uid === branchNameOrUid ||
      b.name === branchNameOrUid ||
      b.name.endsWith(`/${branchNameOrUid}`)
  );
}

/** Get the project's default branch (or undefined if none is marked default). */
export async function getDefaultBranch(opts: BranchLookupOpts): Promise<LakebaseBranchInfo | undefined> {
  const branches = await listBranches(opts);
  return branches.find((b) => b.isDefault);
}

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
export function isLongRunningTierBranch(b: LakebaseBranchInfo): boolean {
  return !b.isDefault && !b.expireTime;
}

/**
 * The fixed default set of PROTECTED tier leaf names (the promotion
 * hierarchy). A branch is a protected tier only if it is BOTH long-running
 * ({@link isLongRunningTierBranch}) AND its leaf name is in the protected set
 * , so a long-running branch with an off-convention name (e.g. a `scratch`
 * spike left no_expiry) is treated as an ordinary branch, not a tier.
 *
 * Projects extend this per-project via {@link protectedTierNamesFromEnv}
 * (LAKEBASE_TIER_NAMES + the configured trunk/staging/base names). The
 * Lakebase DEFAULT branch (production) is always protected regardless of name,
 * handled by callers via the isDefault / trunk-alias check, not this set.
 */
export const DEFAULT_PROTECTED_TIER_NAMES: ReadonlySet<string> = new Set([
  "main",
  "master",
  "staging",
  "dev",
]);

/** Canonical comparison key for a tier name: trimmed + lowercased. */
export function normalizeTierName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * The protected tier-name set = the fixed default UNION any per-project extra
 * names (normalized). Pass the project's configured trunk/staging/base +
 * LAKEBASE_TIER_NAMES here so off-default tier names (e.g. "qa") are protected.
 */
export function resolveProtectedTierNames(extra?: Iterable<string>): Set<string> {
  const out = new Set<string>(DEFAULT_PROTECTED_TIER_NAMES);
  for (const n of extra ?? []) {
    const k = normalizeTierName(n);
    if (k) { out.add(k); }
  }
  return out;
}

/**
 * Resolve the protected tier-name set for the current project from the
 * environment: the fixed default plus `LAKEBASE_TIER_NAMES` (comma-separated)
 * and the configured `LAKEBASE_TRUNK_BRANCH` / `LAKEBASE_STAGING_BRANCH` /
 * `LAKEBASE_BASE_BRANCH`. The bash mirror lives in post-checkout.sh.
 */
export function protectedTierNamesFromEnv(
  env: Record<string, string | undefined> = process.env,
): Set<string> {
  const extra: string[] = [];
  for (const part of (env.LAKEBASE_TIER_NAMES ?? "").split(",")) {
    if (part.trim()) { extra.push(part); }
  }
  for (const key of ["LAKEBASE_TRUNK_BRANCH", "LAKEBASE_STAGING_BRANCH", "LAKEBASE_BASE_BRANCH"]) {
    const v = env[key];
    if (v && v.trim()) { extra.push(v); }
  }
  return resolveProtectedTierNames(extra);
}

/**
 * Tier check: returns true iff `name` matches a long-running tier
 * Lakebase branch by exact branchId leaf. See
 * {@link isLongRunningTierBranch} for the underlying classification.
 *
 * Mirrors the post-checkout hook's auto-discovery model
 * (templates/project/common/scripts/post-checkout.sh:252-279).
 */
export function isTier(
  name: string,
  branches: LakebaseBranchInfo[],
  protectedNames: ReadonlySet<string> = DEFAULT_PROTECTED_TIER_NAMES,
): boolean {
  if (!name) { return false; }
  if (!protectedNames.has(normalizeTierName(name))) { return false; }
  return branches.some((b) => isLongRunningTierBranch(b) && b.nameLeaf === name);
}

/**
 * Returns the names (branchId leaves) of every long-running tier
 * Lakebase branch in the project (staging, uat, perf, ...). Useful
 * for surfaces that need to enumerate tiers (e.g. extension UI
 * grouping) rather than just test membership via {@link isTier}.
 *
 * Filters on {@link isLongRunningTierBranch} so feature branches
 * (which are non-default but carry an expireTime) are excluded.
 */
export function tierBranchNames(
  branches: LakebaseBranchInfo[],
  protectedNames: ReadonlySet<string> = DEFAULT_PROTECTED_TIER_NAMES,
): string[] {
  return branches
    .filter((b) => isLongRunningTierBranch(b) && protectedNames.has(normalizeTierName(b.nameLeaf as string)))
    .map((b) => b.nameLeaf as string);
}

/**
 * Resolve a branch reference to its full resource name (projects/.../branches/...).
 * Returns undefined when the branch can't be found.
 */
export async function resolveBranchPath(
  branchNameOrUid: string,
  opts: BranchLookupOpts
): Promise<string | undefined> {
  if (branchNameOrUid.startsWith("projects/") && branchNameOrUid.includes("/branches/")) {
    return branchNameOrUid;
  }
  const branch = await getBranchByName(branchNameOrUid, opts);
  return branch?.name;
}

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
export async function resolveBranchId(
  args: BranchLookupOpts & { branch: string }
): Promise<string> {
  const { branch, ...opts } = args;

  // Full resource path → take the leaf.
  if (branch.startsWith("projects/") && branch.includes("/branches/")) {
    const leaf = branch.split("/branches/").pop();
    if (leaf) return leaf;
  }

  // Fast path: looks like a branch_id already (no uid prefix). Trust it.
  if (!branch.startsWith("br-")) {
    return branch;
  }

  // Slow path: uid → list + filter to get the friendly id.
  const info = await getBranchByName(branch, opts);
  if (!info) {
    throw new LakebaseBranchError(
      `Could not resolve branch "${branch}" in project "${opts.instance}". ` +
        `Pass either the branch_id (e.g. "demo-feature") or the branch uid.`
    );
  }
  const leaf = info.name.split("/branches/").pop();
  if (!leaf) {
    throw new LakebaseBranchError(
      `Branch info for "${branch}" missing a name segment (got "${info.name}").`
    );
  }
  return leaf;
}

// ── Internal ────────────────────────────────────────────────────

interface RawBranch {
  uid?: string;
  name?: string;
  state?: string;
  status?: {
    current_state?: string;
    default?: boolean;
    /**
     * Lakebase returns the parent branch's full resource name here on
     * `get-branch` responses. Older speculation was `spec.source_branch`
     * (kept as a fallback for backward compatibility / list-branches shapes
     * we haven't seen yet).
     */
    source_branch?: string;
    expire_time?: string;
    is_protected?: boolean;
  };
  is_default?: boolean;
  spec?: { source_branch?: string };
}

function parseBranch(raw: unknown): LakebaseBranchInfo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as RawBranch;
  const name = r.name ?? "";
  if (!name) return undefined;

  // BranchName: always the leaf of the resource path. NEVER fall back to
  // the uid here – a uid in a path-shaped field is exactly the bug this
  // brand exists to prevent.
  const nameLeaf = branchNameFromResourcePath(name);
  if (!nameLeaf) return undefined;

  // BranchUid: prefer the API's `uid` field. If absent (older shapes),
  // skip the branch rather than fake it from the leaf, which would be
  // a BranchName mislabeled as a BranchUid.
  if (!r.uid) return undefined;
  let uid;
  try {
    uid = asBranchUid(r.uid);
  } catch {
    return undefined;
  }

  const sourceBranchName = r.status?.source_branch ?? r.spec?.source_branch;
  const sourceBranchId = sourceBranchName ? branchNameFromResourcePath(sourceBranchName) ?? undefined : undefined;

  return {
    uid,
    nameLeaf,
    name,
    state: r.status?.current_state ?? r.state ?? "UNKNOWN",
    sourceBranchName,
    sourceBranchId,
    isDefault: r.status?.default === true || r.is_default === true,
    expireTime: r.status?.expire_time,
    isProtected: r.status?.is_protected,
  };
}

async function dbcli(args: string[], host?: string): Promise<string> {
  const trimmedHost = host?.replace(/\/+$/, "");
  const env = trimmedHost
    ? ({ ...process.env, DATABRICKS_HOST: trimmedHost } as NodeJS.ProcessEnv)
    : process.env;
  try {
    const { stdout } = await execFileP("databricks", args, { env, timeout: KIT_TIMEOUTS.cliDefault });
    return stdout.toString();
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string | Buffer };
    const stderr =
      typeof e.stderr === "string"
        ? e.stderr
        : Buffer.isBuffer(e.stderr)
          ? e.stderr.toString("utf8")
          : "";
    throw new LakebaseBranchError(
      `databricks ${args.join(" ")} failed: ${e.message}${stderr ? `\nstderr: ${stderr.trim()}` : ""}`
    );
  }
}
