declare class GitHubPullRequestError extends Error {
    readonly status?: number | undefined;
    constructor(message: string, status?: number | undefined);
}
interface PullRequestCheck {
    name: string;
    status: string;
    conclusion: string;
    detailsUrl?: string;
}
interface PullRequestReview {
    author: string;
    state: string;
    body: string;
    submittedAt?: string;
}
interface PullRequestFile {
    path: string;
    status: "added" | "modified" | "deleted" | "renamed";
    additions: number;
    deletions: number;
}
interface PullRequestInfo {
    number: number;
    title: string;
    url: string;
    state: string;
    isDraft: boolean;
    ciStatus: "pending" | "success" | "failure";
    checks: PullRequestCheck[];
    headBranch: string;
    baseBranch: string;
    body?: string;
    additions?: number;
    deletions?: number;
    changedFiles?: number;
}
interface WorkflowRunSummary {
    id: number;
    name: string;
    status: string;
    conclusion: string;
    branch: string;
    event: string;
    /** ISO 8601 timestamp from GitHub. Useful for filtering out runs older than
     * a session start time or detecting stuck/orphaned runs whose updated_at
     * lags. May be `undefined` if the API omitted it. */
    createdAt?: string;
    updatedAt?: string;
}
interface CreatePullRequestArgs {
    ownerRepo: string;
    headBranch: string;
    title: string;
    body: string;
    /** Target branch. Omit to use the repo's default branch. */
    baseBranch?: string;
}
/** Create a pull request. Returns the HTML URL. */
declare function createPullRequest(args: CreatePullRequestArgs): Promise<string>;
/** Find the open PR whose head branch matches; returns the full PR info + CI status. */
declare function getPullRequest(ownerRepo: string, headBranch: string): Promise<PullRequestInfo | undefined>;
/** Reviews on a PR (approvals, change requests, comments). */
declare function getPullRequestReviews(ownerRepo: string, pullNumber: number): Promise<PullRequestReview[]>;
/** Files changed in a PR. */
declare function getPullRequestFiles(ownerRepo: string, pullNumber: number): Promise<PullRequestFile[]>;
/** Issue/PR comments (e.g. schema-diff CI bot comments). */
declare function getPullRequestComments(ownerRepo: string, pullNumber: number): Promise<Array<{
    author: string;
    body: string;
}>>;
/** Plain list of issue/PR comment bodies (filtered for non-empty). */
declare function listIssueComments(ownerRepo: string, issueNumber: number): Promise<string[]>;
interface MergePullRequestArgs {
    ownerRepo: string;
    pullNumber: number;
    /** Default: "merge". */
    method?: "merge" | "squash" | "rebase";
    /** Default: true. Delete the remote head branch after merge. */
    deleteRemoteBranch?: boolean;
}
/** Merge a PR. Optionally deletes the remote head branch. */
declare function mergePullRequest(args: MergePullRequestArgs): Promise<string>;
/** Recent workflow runs for a repo. */
declare function listWorkflowRuns(ownerRepo: string, limit?: number): Promise<WorkflowRunSummary[]>;
interface FastForwardBranchArgs {
    /** owner/repo (e.g. "kevin-hartman/ecom-mpk123"). */
    ownerRepo: string;
    /** The branch whose ref will be moved (e.g. "staging"). */
    branch: string;
    /** The SHA or branch name to move it to (e.g. "main"). When passing
     *  a branch name, the latest SHA on that branch is resolved first. */
    toRef: string;
}
/**
 * Fast-forward `branch` to point at `toRef`. Used by `release()` to
 * keep the source tier aligned with the target tier after merge:
 * without this, every staging→main release leaves staging trailing
 * main by one merge commit (tree-identical but graph-divergent), and
 * the gap compounds across releases. Tooling that displays "X behind
 * Y" then misleadingly suggests staging has fallen out of sync when
 * it hasn't.
 *
 * Uses GitHub's `git/refs` PATCH API. Idempotent: calling it twice
 * with the same `toRef` is a no-op on the second call. Will throw if
 * the update is not a fast-forward (i.e. `toRef` is not a descendant
 * of `branch`). For the release-flow case, `toRef` is always the
 * target of the merge we just landed, so it IS a descendant by
 * construction.
 */
declare function fastForwardBranch(args: FastForwardBranchArgs): Promise<void>;
interface MergePairedPullRequestArgs {
    ownerRepo: string;
    pullNumber: number;
    /** Lakebase project id used to clean up the feature branch on merge. */
    lakebaseInstance: string;
    /** Default: "merge". */
    method?: "merge" | "squash" | "rebase";
    /** Delete the remote head git branch. Default: true. */
    deleteRemoteBranch?: boolean;
    /** Delete the matching feature Lakebase branch after merge. Default: true. */
    deleteLakebaseBranch?: boolean;
}
interface MergePairedPullRequestResult {
    /** GitHub merge confirmation message. */
    message: string;
    /** The PR's head branch name (used to resolve the Lakebase feature branch). */
    headBranch: string;
    /** True iff the matching feature Lakebase branch was deleted. */
    lakebaseBranchDeleted: boolean;
    warnings: string[];
}
/**
 * Merge a GitHub PR and clean up the matching feature Lakebase branch.
 *
 * The pairing-aware merge operation: once the code change lands in the base
 * git branch, the feature Lakebase branch has served its purpose (CI replays
 * its migrations against the base Lakebase branch automatically). Best-effort
 * delete keeps Lakebase branch counts from growing unbounded.
 *
 * Note: this does NOT auto-apply schema migrations against the base Lakebase
 * branch. That happens via the CI workflow on the base branch's next push.
 * The "parent-matched merge" is structurally: head git → base git, then
 * delete the feature Lakebase (its schema is already in the base via merged
 * migrations).
 */
declare function mergePairedPullRequest(args: MergePairedPullRequestArgs): Promise<MergePairedPullRequestResult>;

export { type CreatePullRequestArgs as C, type FastForwardBranchArgs as F, GitHubPullRequestError as G, type MergePairedPullRequestArgs as M, type PullRequestCheck as P, type WorkflowRunSummary as W, type MergePairedPullRequestResult as a, type MergePullRequestArgs as b, type PullRequestFile as c, type PullRequestInfo as d, type PullRequestReview as e, createPullRequest as f, fastForwardBranch as g, getPullRequest as h, getPullRequestComments as i, getPullRequestFiles as j, getPullRequestReviews as k, listIssueComments as l, listWorkflowRuns as m, mergePairedPullRequest as n, mergePullRequest as o };
