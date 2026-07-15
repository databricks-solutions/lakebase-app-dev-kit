export { C as CreatePullRequestArgs, F as FastForwardBranchArgs, G as GitHubPullRequestError, M as MergePairedPullRequestArgs, a as MergePairedPullRequestResult, b as MergePullRequestArgs, c as MergePullRequestResult, P as PullRequestCheck, d as PullRequestFile, e as PullRequestInfo, f as PullRequestReview, W as WorkflowRunSummary, g as createPullRequest, h as fastForwardBranch, i as getPullRequest, j as getPullRequestComments, k as getPullRequestFiles, l as getPullRequestReviews, m as listIssueComments, n as listWorkflowRuns, o as mergePairedPullRequest, p as mergePullRequest } from '../../pr-D3CteJaf.js';

/** OAuth scopes the workflow ops collectively need. */
declare const GITHUB_SCOPES: readonly ["repo", "workflow", "delete_repo"];
/**
 * Resolve a GitHub token through the unified fallback chain.
 *
 * Non-interactive – never prompts. For the interactive sign-in UX
 * (`createIfNone: true`), the extension's `ensureGitHubAuth()` wrapper
 * calls `tryVsCodeSession({ createIfNone: true })` directly.
 *
 * @param scopes optional override of GITHUB_SCOPES (rare – most callers use the default)
 */
declare function resolveGitHubToken(scopes?: readonly string[]): Promise<string>;
interface VsCodeSessionOptions {
    /** Defaults to GITHUB_SCOPES. */
    scopes?: readonly string[];
    /**
     * When true and no session exists, VS Code prompts the user to sign in.
     * Only meaningful inside the extension host; ignored elsewhere.
     * Default: false (silent).
     */
    createIfNone?: boolean;
}
/**
 * Resolve a token from the VS Code GitHub session, or undefined when:
 *   - We're not inside the extension host (`vscode` module unresolvable)
 *   - No session exists and `createIfNone` is false
 *   - Any error in the session call
 */
declare function tryVsCodeSession(opts?: VsCodeSessionOptions): Promise<string | undefined>;
/**
 * Resolve a token by shelling out to `gh auth token`. Returns undefined if
 * gh isn't installed, isn't authenticated, or any other failure.
 */
declare function tryGhAuthToken(): string | undefined;
/**
 * Diagnostic helper. Reports which sources are configured / would
 * succeed, without revealing the token itself. Used by the CLI's
 * `--diagnose` flag and by tests.
 */
declare function diagnoseGitHubAuth(): Promise<GitHubAuthDiagnosis>;
type GitHubAuthSource = "env" | "vscode" | "gh";
interface GitHubAuthDiagnosis {
    /** Sources that returned a usable token, in fallback order. */
    sources: GitHubAuthSource[];
    /** First source `resolveGitHubToken` would use, or undefined if none. */
    primary?: GitHubAuthSource;
    scopes: string[];
}

declare class GitHubRepoError extends Error {
    readonly status?: number;
    constructor(message: string, status?: number);
}
/** Returns the GitHub login of the currently authenticated user. */
declare function getCurrentUser(): Promise<string>;
interface CreateRepoOptions {
    /** Make the repo private. Default: true. */
    private?: boolean;
    description?: string;
}
/**
 * Create a new GitHub repository. Accepts either bare name (creates for the
 * authenticated user) or "owner/name" (creates in org if owner != login).
 *
 * @returns the repo HTML URL.
 */
declare function createRepo(name: string, opts?: CreateRepoOptions): Promise<string>;
/** Delete a GitHub repository. Requires the `delete_repo` OAuth scope. */
declare function deleteRepo(name: string): Promise<void>;
/** True iff the repository exists and is visible to the authenticated user. */
declare function repoExists(name: string): Promise<boolean>;
/**
 * Whether GitHub Actions is enabled for `ownerRepo`. `GET .../actions/permissions`
 * returns `enabled:false` both when a repo admin disabled Actions AND when an org
 * policy disables it for the repo. When Actions is off, the kit's CI workflows
 * (pr.yml / merge.yml) silently never run, which presents as "CI didn't follow
 * the kit workflow". Returns:
 *   - true / false  : the determined state
 *   - undefined     : couldn't determine (no token, repo invisible, API error) ,
 *                     callers must treat this as "unknown", never as disabled,
 *                     so a missing token never produces a false alarm.
 */
declare function getActionsEnabled(ownerRepo: string): Promise<boolean | undefined>;
/**
 * Resolve the canonical `owner/repo` slug. Used by create-project to poll
 * until a freshly-created repo is visible (SAML / propagation delays).
 */
declare function getRepoFullName(name: string): Promise<string>;

declare class GitHubRunnerError extends Error {
    readonly status?: number;
    constructor(message: string, status?: number);
}
interface RepoRunner {
    id: number;
    name: string;
    status: string;
}
/**
 * Create a short-lived registration token for `config.sh`. Surfaces a
 * clear error when the signed-in user cannot see the repo (404 / SAML).
 */
declare function createRegistrationToken(ownerRepo: string): Promise<string>;
/** List all self-hosted runners registered on the repo. */
declare function listRepoRunners(ownerRepo: string): Promise<RepoRunner[]>;
/** Find a runner by name on the repo; returns undefined if not present. */
declare function getRunnerIdByName(ownerRepo: string, runnerName: string): Promise<number | undefined>;
/** Get the GitHub-reported status of a runner by name. */
declare function getRunnerStatus(ownerRepo: string, runnerName: string): Promise<string | undefined>;
/** Deregister a runner from the repo (best-effort – failures are swallowed). */
declare function deleteRunner(ownerRepo: string, runnerId: number): Promise<void>;

declare class GitHubSecretsError extends Error {
    readonly status?: number;
    constructor(message: string, status?: number);
}
/** Create or update a single GitHub Actions repository secret. */
declare function setRepoSecret(ownerRepo: string, secretName: string, secretValue: string): Promise<void>;
/**
 * Set multiple repository secrets in sequence. Fail-fast: validates all
 * values are non-empty BEFORE making any API call (so a bad input doesn't
 * leave some secrets written and others not).
 */
declare function setRepoSecrets(ownerRepo: string, secrets: Record<string, string>): Promise<void>;
/** List configured secret names (returns empty array on any error). */
declare function listSecretNames(ownerRepo: string): Promise<string[]>;

export { type CreateRepoOptions, GITHUB_SCOPES, type GitHubAuthDiagnosis, type GitHubAuthSource, GitHubRepoError, GitHubRunnerError, GitHubSecretsError, type RepoRunner, type VsCodeSessionOptions, createRegistrationToken, createRepo, deleteRepo, deleteRunner, diagnoseGitHubAuth, getActionsEnabled, getCurrentUser, getRepoFullName, getRunnerIdByName, getRunnerStatus, listRepoRunners, listSecretNames, repoExists, resolveGitHubToken, setRepoSecret, setRepoSecrets, tryGhAuthToken, tryVsCodeSession };
