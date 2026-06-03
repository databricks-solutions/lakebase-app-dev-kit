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

export { type CopyDirSubstitutedArgs, type OwnerRepo, type SyncCiSecretsArgs, copyDirSubstituted, delay, extractZipToDir, formatOwnerRepo, isCliEntry, parseOwnerRepo, patchPomForLakebase, sanitizeArtifactId, sanitizeBranchName, syncCiSecrets };
