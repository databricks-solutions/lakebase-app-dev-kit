export { C as CwdOnly, E as ExecOptions, e as exec, s as shq } from '../../exec-CwxSWhlz.cjs';

/** Promise-based sleep – replaces shell `sleep` in poll loops. */
declare function delay(ms: number): Promise<void>;

interface OwnerRepo {
    owner: string;
    repo: string;
}
declare function parseOwnerRepo(urlOrSlug: string): OwnerRepo;
declare function formatOwnerRepo(owner: string, repo: string): string;

/**
 * Sanitize a project name into a valid Maven artifactId.
 * Lowercase, hyphens only, no leading digits, defaults to "demo".
 */
declare function sanitizeArtifactId(name: string): string;

declare function patchPomForLakebase(pomPath: string): void;

declare function extractZipToDir(zipBuffer: Buffer, targetDir: string): void;

interface CopyDirSubstitutedArgs {
    projectName?: string;
    /** Entry names to skip at the top level (defaults to ".gitignore.extra" and "fallback"). */
    skipEntries?: Set<string>;
}
declare function copyDirSubstituted(srcDir: string, destDir: string, args?: CopyDirSubstitutedArgs): void;

/** Max Lakebase branch-name length (the Postgres identifier limit). A name over
 *  this is truncated on create, so any name a caller also uses to LOOK UP the
 *  branch must already be within it, or the read misses ("branch id not found"). */
declare const LAKEBASE_BRANCH_NAME_MAX = 63;
declare function sanitizeBranchName(gitBranch: string): string;

interface SyncCiSecretsArgs {
    /** Project root (used to resolve ownerRepo from `git remote` when not given,
     *  and as the cwd for the `databricks tokens create` call). */
    projectDir: string;
    /** Workspace host (DATABRICKS_HOST secret). Required. */
    databricksHost: string;
    /** Lakebase project id (LAKEBASE_PROJECT_ID secret). Required. */
    lakebaseProjectId: string;
    /** Token comment for `databricks tokens create`. */
    comment?: string;
    /** Token lifetime in seconds (default: 24h). */
    lifetimeSeconds?: number;
    /** Override the auto-detected ownerRepo (defaults to origin remote). */
    ownerRepo?: string;
}
/** Synchronize Databricks + Lakebase CI secrets to the repo's Actions secrets. */
declare function syncCiSecrets(args: SyncCiSecretsArgs): Promise<void>;

/**
 * Return true iff the current module is being executed as a Node.js
 * entry point (vs. imported as a library). Pass `import.meta.url`
 * from the caller so each module identifies itself unambiguously.
 *
 * Both sides of the comparison are realpath-resolved so a symlink at
 * either path (the .bin shim, or a project symlinking dist/ into a
 * sandbox) cannot break the match.
 */
declare function isCliEntry(importMetaUrl: string): boolean;

/** Proxy-related env var names; lower + upper case variants both. */
declare const PROXY_ENV_KEYS: readonly ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy", "npm_config_proxy", "npm_config_https_proxy", "npm_config_no_proxy", "npm_config_registry"];
/**
 * Return ONLY the proxy-related env vars from `process.env` (or the
 * provided source), filtered to those actually set. Empty / undefined
 * values are omitted so callers don't accidentally overwrite an
 * inherited value with an empty string.
 */
declare function proxyEnvSubset(source?: NodeJS.ProcessEnv): Record<string, string>;
/**
 * Compose an env object that always includes the user's proxy env on
 * top of whatever the caller passes. Use when constructing a child
 * process's env from scratch in a test fixture:
 *
 * ```ts
 * spawnSync("npm", ["install"], {
 *   env: withProxyEnv({ FOO: "bar" }),  // proxy keys auto-included
 *   stdio: "inherit",
 * });
 * ```
 *
 * If `base` is `process.env`, this is a no-op (the keys are already
 * present). If `base` is a minimal object, the proxy keys are merged
 * in from process.env so the child still sees them.
 *
 * Caller-provided values take precedence over the inherited proxy
 * keys, so a test can deliberately override (e.g. tunnel through a
 * mock proxy) by setting the same key in `base`.
 */
declare function withProxyEnv(base?: Record<string, string | undefined>): Record<string, string>;

interface PollProbeDone<T> {
    done: true;
    value: T;
}
interface PollProbePending {
    done: false;
}
type PollProbeResult<T> = PollProbeDone<T> | PollProbePending;
interface PollUntilArgs<T> {
    /**
     * The probe function. Returns `{ done: true, value }` to terminate
     * the loop with success, or `{ done: false }` to keep polling. Throw
     * from inside the probe for irrecoverable conditions; the throw
     * propagates out of pollUntil.
     */
    probe: (ctx: {
        pollIndex: number;
        elapsedMs: number;
    }) => Promise<PollProbeResult<T>>;
    /** Total budget for the loop, milliseconds. */
    timeoutMs: number;
    /** Interval between probes, milliseconds. */
    intervalMs: number;
    /**
     * Optional label embedded in the default `onPoll` log line. Has no
     * effect when `onPoll` is supplied.
     */
    label?: string;
    /**
     * Fires after every probe. The poll index is 1-based; elapsedMs is
     * since the loop started, not since the last probe. The default is a
     * no-op so silent polling stays silent unless the caller opts in.
     */
    onPoll?: (info: {
        pollIndex: number;
        elapsedMs: number;
        result: PollProbeResult<T>;
    }) => void;
    /** Inject `now` for tests. Default: `() => new Date()`. */
    now?: () => Date;
    /** Inject sleep for tests. Default: the shared `delay` util. */
    sleep?: (ms: number) => Promise<void>;
}
interface PollUntilDoneResult<T> {
    outcome: "done";
    value: T;
    polls: number;
    elapsedMs: number;
}
interface PollUntilTimeoutResult {
    outcome: "timeout";
    polls: number;
    elapsedMs: number;
}
type PollUntilResult<T> = PollUntilDoneResult<T> | PollUntilTimeoutResult;
declare function pollUntil<T>(args: PollUntilArgs<T>): Promise<PollUntilResult<T>>;
/**
 * Convenience wrapper for the common case where the probe returns
 * `T | undefined` (undefined = keep polling). Defined values count as
 * done. Use this when the probe naturally returns optional data and
 * "defined" already means "ready" (e.g. branch lookups, workflow run
 * lookups).
 */
declare function pollUntilDefined<T>(probe: (ctx: {
    pollIndex: number;
    elapsedMs: number;
}) => Promise<T | undefined>, opts: Omit<PollUntilArgs<T>, "probe">): Promise<PollUntilResult<T>>;

export { type CopyDirSubstitutedArgs, LAKEBASE_BRANCH_NAME_MAX, type OwnerRepo, PROXY_ENV_KEYS, type PollProbeDone, type PollProbePending, type PollProbeResult, type PollUntilArgs, type PollUntilDoneResult, type PollUntilResult, type PollUntilTimeoutResult, type SyncCiSecretsArgs, copyDirSubstituted, delay, extractZipToDir, formatOwnerRepo, isCliEntry, parseOwnerRepo, patchPomForLakebase, pollUntil, pollUntilDefined, proxyEnvSubset, sanitizeArtifactId, sanitizeBranchName, syncCiSecrets, withProxyEnv };
