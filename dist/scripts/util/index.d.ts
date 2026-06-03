export { C as CwdOnly, E as ExecOptions, e as exec, s as shq } from '../../exec-CwxSWhlz.js';

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

export { type CopyDirSubstitutedArgs, type OwnerRepo, PROXY_ENV_KEYS, type SyncCiSecretsArgs, copyDirSubstituted, delay, extractZipToDir, formatOwnerRepo, isCliEntry, parseOwnerRepo, patchPomForLakebase, proxyEnvSubset, sanitizeArtifactId, sanitizeBranchName, syncCiSecrets, withProxyEnv };
