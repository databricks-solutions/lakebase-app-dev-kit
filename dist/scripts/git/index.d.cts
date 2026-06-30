import { C as CwdOnly } from '../../exec-CwxSWhlz.cjs';

/**
 * Initialize a git repo in `projectDir` with the default branch set to
 * "main". Caller is responsible for ensuring `projectDir` exists.
 */
declare function gitInit(projectDir: string): Promise<void>;

interface CloneRepoArgs {
    /** Git URL (https:// or ssh://). */
    repoUrl: string;
    /**
     * Directory that will contain the cloned repo. Git creates the
     * target directory as a subdir of `parentDir`, named after the repo.
     */
    parentDir: string;
    /** Milliseconds before SIGTERM. Default: 60_000. */
    timeoutMs?: number;
}
/**
 * Clone a Git repository into `parentDir`. Git creates the target dir
 * as a subdir of `parentDir` named after the repo.
 *
 * For HTTPS URLs, git uses the configured credential helper (typically
 * the macOS keychain or `osxkeychain`). For SSH URLs, the user's ssh
 * agent. No GitHub token plumbing happens here.
 *
 * The URL is shq-escaped: shell-active characters in the URL (e.g. `$`
 * or backticks in unusual self-hosted endpoints) are suppressed rather
 * than expanded.
 *
 * @throws Error if the clone subprocess exits non-zero (auth failure,
 *   repo not found, network error, etc.).
 */
declare function cloneRepo(args: CloneRepoArgs): Promise<void>;

interface CommitAndPushArgs {
    projectDir: string;
    message: string;
    /** Push to "origin main" after commit. Default: true. */
    push?: boolean;
    /** Remote name. Default: "origin". */
    remote?: string;
    /** Branch name. Default: "main". */
    branch?: string;
}
declare class WorkflowScopeError extends Error {
    constructor(projectDir: string);
}
/**
 * Commit and (by default) push to origin/main with -u. Stages
 * everything first (`git add -A`), then commits with the given message,
 * then pushes. Throws {@link WorkflowScopeError} when the remote
 * rejects due to the GitHub token lacking the `workflow` OAuth scope.
 *
 * For non-initial-commit flows, prefer the primitives in ./commits.ts.
 */
declare function commitAndPush(args: CommitAndPushArgs): Promise<void>;

interface AddRemoteArgs {
    cwd: string;
    /** Remote name (e.g. "upstream"). */
    name: string;
    /** Remote URL (https:// or ssh://). */
    url: string;
}
interface RemoveRemoteArgs {
    cwd: string;
    name: string;
}
interface DeleteRemoteBranchArgs {
    cwd: string;
    branch: string;
    /** Remote name. Default: "origin". */
    remote?: string;
}
/**
 * Read `git remote get-url origin` and normalize to https://github.com/owner/repo.
 * Returns empty string if not a git repo / no origin.
 *
 * Host-alias aware: the host segment must NOT be hardcoded to `github.com`.
 * EMU (Enterprise Managed Users) setups commonly point origin at an SSH `Host`
 * alias from ~/.ssh/config , e.g. `org-140212977@github-emu:databricks-field-eng/
 * partner-asset-tracker.git`. The old normalizer only rewrote a literal
 * `git@github.com:`, so the alias passed through unchanged and parseOwnerRepo
 * then split it into a garbage owner (`org-...@github-emu:databricks-field-eng`),
 * which 404s every owner/repo-derived op (Create PR, runner setup, PR status).
 * We extract the owner/repo PATH after the host regardless of the host/user and
 * re-home it on github.com (this module is GitHub-only).
 */
declare function getGitHubUrl(cwd: string): Promise<string>;
/** owner/repo slug for the origin remote; empty string if not GitHub. */
declare function getOwnerRepo(cwd: string): Promise<string>;
/** `git remote add <name> <url>`. */
declare function addRemote(args: AddRemoteArgs): Promise<void>;
/** `git remote remove <name>`. */
declare function removeRemote(args: RemoveRemoteArgs): Promise<void>;
/**
 * List remote names as parsed `git remote` lines. Returns [] when the
 * cwd is not a git repo or has no remotes configured.
 */
declare function listRemotes(args: CwdOnly): Promise<string[]>;
/**
 * Delete a branch on the remote. Uses `git push <remote> --delete
 * <branch>`. Default remote = "origin".
 */
declare function deleteRemoteBranch(args: DeleteRemoteBranchArgs): Promise<void>;

interface GitBranchInfo {
    name: string;
    isCurrent: boolean;
    isRemote: boolean;
    tracking?: string;
    ahead?: number;
    behind?: number;
}
interface ListLocalBranchesArgs {
    cwd: string;
}
interface ListRemoteBranchesArgs {
    cwd: string;
    /** Remote name. Default: "origin". */
    remote?: string;
}
interface HasRemoteBranchArgs {
    cwd: string;
    branch: string;
    /** Remote name. Default: "origin". */
    remote?: string;
}
/**
 * List local branches with tracking + ahead/behind metadata. Returns []
 * when the directory is not a git repo. Each entry carries the upstream
 * ref (when set) and ahead/behind counts parsed from
 * `git branch --format`.
 */
declare function listLocalBranches(args: ListLocalBranchesArgs): Promise<GitBranchInfo[]>;
/**
 * List remote branches that are NOT already checked out locally. Strips
 * the remote prefix from the returned `name` and preserves the full
 * `origin/<branch>` ref in `tracking`. Useful for "switch to existing
 * remote branch" pickers that want to hide branches the caller can
 * already reach locally.
 */
declare function listRemoteBranches(args: ListRemoteBranchesArgs): Promise<GitBranchInfo[]>;
/**
 * True iff `branch` exists on the given remote. Returns false when the
 * remote is unreachable or the branch is absent. Uses `git ls-remote
 * --heads`, which does not require a fetch.
 */
declare function hasRemoteBranch(args: HasRemoteBranchArgs): Promise<boolean>;

interface ResolveNearestParentArgs {
    cwd: string;
    /** Ref to find the parent of. Default: "HEAD". */
    tip?: string;
    /**
     * Candidate parent branches in preference order. The extension passes
     * the deduped union of [trunkBranch, "main", "master", stagingBranch,
     * "staging"]; the substrate stays config-agnostic and trusts the
     * caller to pre-merge VS Code / .env / repo conventions.
     */
    candidates: string[];
}
interface NearestParent {
    name: string;
    baseSha: string;
}
interface GetMergeBaseArgs extends ResolveNearestParentArgs {
    /**
     * Branches to try with `git merge-base <tip> <fallback>` if none of the
     * candidates have a reachable merge-base. Default: ["main", "master"].
     * Useful for legacy two-branch projects.
     */
    fallbacks?: string[];
}
/**
 * Pick the candidate branch whose merge-base with `tip` has the most
 * recent commit timestamp. Skips the tip's own branch (so a feature
 * branch named "main" wouldn't resolve to itself). Returns undefined
 * when no candidate exists locally / has a reachable merge-base.
 */
declare function resolveNearestParent(args: ResolveNearestParentArgs): Promise<NearestParent | undefined>;
/**
 * Convenience wrapper for callers that only need the parent branch name
 * (e.g. tree labels). Returns empty string when no candidate resolves.
 */
declare function getNearestParentName(args: ResolveNearestParentArgs): Promise<string>;
/**
 * Return the merge-base SHA between `tip` and its nearest parent across
 * `candidates`. Falls back to direct merge-base against `fallbacks`
 * (default ["main", "master"]) when no candidate resolves, so legacy
 * two-branch projects still get a useful diff base.
 */
declare function getMergeBase(args: GetMergeBaseArgs): Promise<string>;

interface CwdOnlyArgs {
    cwd: string;
}
interface AheadBehind {
    ahead: number;
    behind: number;
    /** The upstream ref (e.g. "origin/main"). Empty string when no upstream. */
    upstream: string;
}
/**
 * True iff the current branch has a remote upstream set (i.e. a
 * tracking ref). Returns false when no upstream is configured, when the
 * current branch is detached, or when the cwd is not a git repo.
 */
declare function hasUpstream(args: CwdOnlyArgs): Promise<boolean>;
/**
 * Return ahead / behind counts of HEAD relative to its upstream, along
 * with the upstream ref. Returns zeros + empty string when no upstream
 * exists, the cwd is not a repo, or the ref-list call fails for any
 * other reason - callers driving UI affordances should treat this as
 * "no remote sync state to show".
 */
declare function getAheadBehind(args: CwdOnlyArgs): Promise<AheadBehind>;
interface IsDirtyArgs extends CwdOnlyArgs {
    /**
     * Repo-relative path prefixes to NOT count as dirty, e.g. orchestration
     * metadata the deterministic driver writes mid-run (`.tdd/` log + phase
     * pointer, `.lakebase/` state). A porcelain line is excluded iff its path
     * equals or starts with one of these. With none set, ANY change is dirty
     * (the original behavior).
     */
    ignore?: string[];
}
/**
 * True iff the working tree has staged or unstaged changes (including
 * untracked files reported by porcelain status). Returns false on
 * non-git cwd or when `git status` fails. When `ignore` is given, changes
 * confined to those path prefixes do not count , so a caller can ask "is
 * there uncommitted CODE?" while tolerating expected workflow-metadata churn.
 */
declare function isDirty(args: IsDirtyArgs): Promise<boolean>;

interface ListMigrationsOnBranchArgs {
    cwd: string;
    /** Branch (or any tree-ish) to inspect. */
    branch: string;
    /**
     * Path within the repo containing migration files (e.g.
     * "src/main/resources/db/migration"). Trailing slash optional.
     */
    migrationPath: string;
    /**
     * Regex applied to the basename of each file. Default: Flyway-style
     * `V<n>...sql` (case-insensitive). Pass an explicit pattern for
     * Alembic, Knex, or custom layouts.
     */
    pattern?: RegExp;
}
/**
 * Return migration filenames (basenames only) on `branch` matching
 * `pattern`. Sorted lexically so versioned filenames come back in
 * apply order. Returns [] when the branch doesn't exist, the migration
 * path is empty, or any underlying git call fails - migration
 * comparisons across branches in the UI shouldn't crash on a fresh
 * branch with no migrations yet.
 */
declare function listMigrationsOnBranch(args: ListMigrationsOnBranchArgs): Promise<string[]>;

interface CommitArgs {
    cwd: string;
    message: string;
}
interface AmendArgs {
    cwd: string;
    /**
     * New message. When omitted, the existing message is preserved
     * (`git commit --amend --no-edit`). When provided, it replaces the
     * existing message (`git commit --amend -m ...`).
     */
    message?: string;
}
interface UndoLastCommitArgs {
    cwd: string;
}
interface DiscardAllChangesArgs {
    cwd: string;
    /**
     * Destructive: must be set to `true` to actually wipe the working
     * tree (runs `git checkout -- .` + `git clean -fd`). Required to
     * keep accidental invocations from nuking uncommitted work; the
     * extension's UI driver always sets it explicitly after user confirm.
     */
    confirm: true;
}
/** Commit ALREADY-staged changes. Throws when the message is empty. */
declare function commit(args: CommitArgs): Promise<void>;
/** `git add -A` + commit. Throws when the message is empty. */
declare function commitAll(args: CommitArgs): Promise<void>;
interface CommitAllArgs extends CommitArgs {
    /**
     * Repo-relative path prefixes to NOT stage, e.g. orchestration metadata that
     * churns mid-run (`.tdd/`, `.lakebase/`). Excluded via a magic `:(exclude)`
     * pathspec paired with an inclusive `.`, so the commit captures CODE only.
     * Committing churny metadata onto a short-lived branch makes its committed
     * copy diverge from the branch it merges into, which then breaks a later
     * `git checkout` of that branch , scope to code to avoid it.
     */
    exclude?: string[];
    /**
     * Repo-relative paths to FORCE-stage in addition to (and after) the
     * exclude-aware `git add -A`, even when they sit UNDER an `exclude` prefix.
     * The stable project-level `.tdd/design/` corpus is the motivating case: the
     * broad `.tdd` exclude (churn control) would otherwise drop the design guide,
     * so it never rides the feature branch's PR to the parent tier and the next
     * feature re-authors the whole design system. The churny `.tdd` state
     * (workflow-state.json, cycles/) must stay uncommitted so its copy doesn't
     * diverge from the feature branch and break accept's `git checkout`; the
     * design corpus is different, written ONCE in the design phase and never
     * touched during build, so committing it is safe. A path that does not exist
     * is skipped (git errors on an unmatched pathspec).
     */
    include?: string[];
}
/**
 * `git add -A` (optionally excluding path prefixes, then force-staging explicit
 * `include` paths), then commit only if something is actually staged. Returns
 * true when a commit was made, false when nothing matched (clean tree, or only
 * excluded paths changed). Throws on a genuine git failure (not a repo,
 * detached HEAD, hook rejection); callers that want best-effort behavior wrap it
 * in try/catch.
 */
declare function commitAllIfChanged(args: CommitAllArgs): Promise<boolean>;
/** Commit with DCO sign-off. Throws when the message is empty. */
declare function commitSignedOff(args: CommitArgs): Promise<void>;
/** `git add -A` + commit with DCO sign-off. Throws when message is empty. */
declare function commitAllSignedOff(args: CommitArgs): Promise<void>;
/**
 * Amend the previous commit. Without `message`, keeps the existing
 * commit message (`--no-edit`). With `message`, replaces it.
 */
declare function commitAmend(args: AmendArgs): Promise<void>;
/**
 * Soft-reset to HEAD~1, keeping the working tree + index intact. The
 * commit is removed from history but its changes remain staged so the
 * caller can re-commit with a corrected message / scope.
 */
declare function undoLastCommit(args: UndoLastCommitArgs): Promise<void>;
/**
 * Hard-discard ALL changes in the working tree (tracked + untracked).
 * Requires `confirm: true` as a typed safety latch so accidental calls
 * don't wipe uncommitted work. Equivalent to:
 *
 *   git checkout -- .
 *   git clean -fd
 */
declare function discardAllChanges(args: DiscardAllChangesArgs): Promise<void>;

interface PublishBranchArgs {
    cwd: string;
    /** Remote to push to. Default: "origin". */
    remote?: string;
}
interface PushCurrentBranchForPrArgs {
    cwd: string;
    /** Remote for the initial publish (when no upstream yet). Default: "origin". */
    remote?: string;
}
/** `git push` with no args. Uses the configured upstream. */
declare function push(args: CwdOnly): Promise<void>;
/** `git pull` with no args. Uses the configured upstream. */
declare function pull(args: CwdOnly): Promise<void>;
/**
 * First push of a local branch: `git push -u <remote> <current-branch>`.
 * Throws when no current branch exists (detached HEAD / empty repo).
 */
declare function publishBranch(args: PublishBranchArgs): Promise<void>;
/**
 * Ensure the current branch is pushed before PR creation. Publishes
 * with `-u <remote>` when no upstream exists; otherwise plain `git
 * push`. Throws when no current branch exists.
 *
 * Pairs with the host's PR-creation flow (e.g. extension's
 * GitHubService.createPullRequest): this handles git push, the caller
 * handles the REST API.
 */
declare function pushCurrentBranchForPr(args: PushCurrentBranchForPrArgs): Promise<void>;
interface FetchArgs {
    cwd: string;
    /** `--prune` to delete remote-tracking refs that no longer exist on the remote. */
    prune?: boolean;
    /** `--all` to fetch from every configured remote. */
    all?: boolean;
}
interface PullFromArgs {
    cwd: string;
    remote: string;
    branch: string;
}
interface PushToArgs {
    cwd: string;
    remote: string;
    branch: string;
}
/**
 * `git fetch` with optional `--prune` and `--all` flags. The flags
 * combine: passing both fetches all remotes with pruning enabled.
 *
 * The extension's GitService split this into three methods (fetch,
 * fetchPrune, fetchAll); the substrate consolidates with flags. The
 * extension proxies preserve the original signatures.
 */
declare function fetch(args: FetchArgs): Promise<void>;
/** `git pull <remote> <branch>`. */
declare function pullFrom(args: PullFromArgs): Promise<void>;
/** `git push <remote> <branch>`. */
declare function pushTo(args: PushToArgs): Promise<void>;
/**
 * Pull-then-push composite. Preserves the extension's GitService.sync
 * semantics (plain `git pull` followed by `git push`, no rebase). Fails
 * fast if pull errors; push does not run.
 */
declare function sync(args: CwdOnly): Promise<void>;

interface DeleteLocalBranchArgs {
    cwd: string;
    branch: string;
    /**
     * When true, uses `git branch -D` (force-delete unmerged branches);
     * otherwise `git branch -d` which refuses unmerged branches. Default
     * false.
     */
    force?: boolean;
    /**
     * Allow deleting a protected branch (production/main/master).
     * Default false. Set true ONLY when the caller has explicit user
     * confirmation; refuses with a typed error otherwise.
     */
    allowProtected?: boolean;
}
interface RenameBranchArgs {
    cwd: string;
    /** New name for the CURRENT branch. */
    newName: string;
}
interface MergeBranchArgs {
    cwd: string;
    branch: string;
}
interface CreateTagArgs {
    cwd: string;
    name: string;
    /** When provided, makes an annotated tag (`git tag -a -m ...`). */
    message?: string;
    /** When provided, tags this sha; otherwise tags HEAD. */
    sha?: string;
}
interface DeleteTagArgs {
    cwd: string;
    name: string;
}
interface DeleteRemoteTagArgs {
    cwd: string;
    name: string;
    /** Remote name. Default: "origin". */
    remote?: string;
}
declare class ProtectedBranchError extends Error {
    constructor(branch: string);
}
/**
 * Delete a local git branch. Refuses production/main/master without
 * `allowProtected: true`. The `force` flag controls -d vs -D
 * independently of the protection check.
 *
 * Named with the "Local" suffix to disambiguate from the Lakebase
 * `deleteBranch` (which deletes a Lakebase Postgres branch via API).
 * Both verbs live at the kit's top-level barrel and would collide
 * unqualified.
 */
declare function deleteLocalBranch(args: DeleteLocalBranchArgs): Promise<void>;
/** Rename the CURRENT branch (`git branch -m <newName>`). */
declare function renameBranch(args: RenameBranchArgs): Promise<void>;
/** Merge `branch` INTO the current branch (`git merge <branch>`). */
declare function mergeBranch(args: MergeBranchArgs): Promise<void>;
/**
 * Create a tag. With `message`, makes an annotated tag; without, a
 * lightweight tag. With `sha`, tags that commit; without, tags HEAD.
 */
declare function createTag(args: CreateTagArgs): Promise<void>;
/** Delete a local tag (`git tag -d <name>`). */
declare function deleteTag(args: DeleteTagArgs): Promise<void>;
/**
 * Delete a tag from the remote. Uses `git push <remote> --delete
 * refs/tags/<name>` so the call works whether or not the local tag
 * still exists.
 */
declare function deleteRemoteTag(args: DeleteRemoteTagArgs): Promise<void>;

interface StashWithMessageArgs {
    cwd: string;
    /** Optional stash description. When omitted, git uses its default. */
    message?: string;
}
interface StashIndexArgs {
    cwd: string;
    /** Stash index. Default: 0 (the most recent stash). */
    index?: number;
}
/** `git stash push [-m <message>]`. Includes tracked + index. */
declare function stash(args: StashWithMessageArgs): Promise<void>;
/** `git stash push --staged [-m <message>]`. Stashes only the index. */
declare function stashStaged(args: StashWithMessageArgs): Promise<void>;
/**
 * `git stash push --include-untracked [-m <message>]`. Stashes tracked
 * + index + untracked files (but not ignored ones).
 */
declare function stashIncludeUntracked(args: StashWithMessageArgs): Promise<void>;
/**
 * List stash entries as raw `git stash list` lines (one per stash).
 * Returns [] when no stashes exist or the cwd is not a repo.
 */
declare function stashList(args: CwdOnly): Promise<string[]>;
/** `git stash apply stash@{<index>}`. Default index = 0. */
declare function stashApply(args: StashIndexArgs): Promise<void>;
/**
 * `git stash pop` (apply the most recent stash AND drop it). The
 * extension's stashPop has no index parameter; preserved here.
 */
declare function stashPop(args: CwdOnly): Promise<void>;
/** `git stash drop stash@{<index>}`. Default index = 0. */
declare function stashDrop(args: StashIndexArgs): Promise<void>;
/** `git stash clear`. Drops ALL stashes. */
declare function stashDropAll(args: CwdOnly): Promise<void>;

interface RebaseBranchArgs {
    cwd: string;
    branch: string;
}
/** `git rebase --abort`. */
declare function abortRebase(args: CwdOnly): Promise<void>;
/**
 * True iff a rebase is currently in progress. Detected by the presence
 * of `.git/rebase-merge` (interactive rebase) or `.git/rebase-apply`
 * (am-style rebase). Returns false on non-git cwd or when the .git
 * directory is inaccessible.
 *
 * This is the same heuristic the extension's GitService uses. Note
 * that submodules and worktrees can put .git at a non-default path
 * (e.g. a worktree's .git is a file pointing at gitdir/<name>), so
 * this is a best-effort check.
 */
declare function isRebasing(args: CwdOnly): Promise<boolean>;
/** `git rebase <branch>`. */
declare function rebaseBranch(args: RebaseBranchArgs): Promise<void>;
/** `git pull --rebase`. */
declare function pullRebase(args: CwdOnly): Promise<void>;

interface CreateWorktreeArgs {
    cwd: string;
    /** Path where the new worktree directory will be created. */
    path: string;
    /** Branch to create + check out in the new worktree (`-b <branch>`). */
    branch: string;
}
interface RemoveWorktreeArgs {
    cwd: string;
    /** Path of the worktree to remove. */
    path: string;
}
/** `git worktree add <path> -b <branch>`. */
declare function createWorktree(args: CreateWorktreeArgs): Promise<void>;
/**
 * List worktrees as raw `git worktree list` lines (one per worktree).
 * Each line is "<path> <sha> [branch]". Returns [] on non-git cwd or
 * when the call fails.
 */
declare function listWorktrees(args: CwdOnly): Promise<string[]>;
/** `git worktree remove <path>`. */
declare function removeWorktree(args: RemoveWorktreeArgs): Promise<void>;

interface LogRawArgs {
    cwd: string;
    /** git log --format=<format> string. */
    format: string;
    /** Limit on number of commits returned. */
    limit: number;
    /**
     * Extra args appended to `git log` (e.g. " HEAD~10..HEAD",
     * " --first-parent main"). Pre-formatted by the caller; the
     * substrate does not interpolate refs through shq here since the
     * caller typically composes multiple refs / ranges.
     */
    refArgs: string;
}
interface OutgoingIncomingArgs {
    cwd: string;
}
interface RecentMergesArgs {
    cwd: string;
    /** Max number of merge commits to return. Default: 5. */
    limit?: number;
}
interface MergeCommit {
    sha: string;
    message: string;
}
interface BranchesAtCommitArgs {
    cwd: string;
    sha: string;
}
interface FileChangeShort {
    /** Single-letter git status code (A, M, D, R, ...). */
    status: string;
    path: string;
}
interface CommitFilesArgs {
    cwd: string;
    sha: string;
}
interface DiffFilesArgs {
    cwd: string;
    fromRef: string;
    /** Target ref, or null to diff `fromRef` against the working tree. */
    toRef: string | null;
}
/**
 * Raw `git log --date-order --format=<format> -<limit><refArgs>`
 * output. Returns "" on failure.
 */
declare function getLogRaw(args: LogRawArgs): Promise<string>;
/**
 * Same as getLogRaw but with `--shortstat` appended so each commit
 * includes the "N files changed, X insertions(+), Y deletions(-)"
 * footer.
 */
declare function getLogShortstat(args: LogRawArgs): Promise<string>;
/**
 * Local commits not on upstream (`git log --oneline @{u}..HEAD`).
 * Returns the leading SHA from each line. Returns [] when no upstream
 * is configured or the call fails.
 */
declare function getOutgoingCommits(args: OutgoingIncomingArgs): Promise<string[]>;
/**
 * Upstream commits not yet pulled (`git log --oneline HEAD..@{u}`).
 * Returns [] when no upstream is configured or the call fails.
 */
declare function getIncomingCommits(args: OutgoingIncomingArgs): Promise<string[]>;
/**
 * Most recent merge commits as { sha, message } pairs. Default limit
 * is 5. Returns [] on non-git cwd or when the call fails.
 */
declare function getRecentMerges(args: RecentMergesArgs): Promise<MergeCommit[]>;
/**
 * Local + remote branches that point at `sha`. Excludes HEAD-pointer
 * entries and the bare "origin" alias.
 */
declare function getBranchesAtCommit(args: BranchesAtCommitArgs): Promise<string[]>;
/**
 * Files changed by a single commit. For merge commits, diff-tree
 * returns empty, so we fall back to `git diff <sha>^1 <sha>` against
 * the first parent.
 */
declare function getCommitFiles(args: CommitFilesArgs): Promise<FileChangeShort[]>;
/**
 * Files changed between two refs, or between a ref and the working
 * tree (`toRef: null`). Returns [] on failure.
 */
declare function getDiffFiles(args: DiffFilesArgs): Promise<FileChangeShort[]>;

interface GetFileAtRefArgs {
    cwd: string;
    ref: string;
    filePath: string;
}
/**
 * Current branch name via `git rev-parse --abbrev-ref HEAD`. Returns
 * "" on non-git cwd or detached HEAD (where rev-parse returns the
 * literal "HEAD" string). Note: this swallows the detached-HEAD case
 * by checking for that literal so callers can treat "" uniformly as
 * "no usable current branch".
 */
declare function getCurrentBranch(args: CwdOnly): Promise<string>;
/**
 * Absolute path of the git repository root (`git rev-parse
 * --show-toplevel`). Returns "" on non-git cwd.
 */
declare function getRepoRoot(args: CwdOnly): Promise<string>;
/**
 * File contents at a given ref (`git show <ref>:<path>`). Returns ""
 * when the file doesn't exist at that ref (common for newly-added
 * files in a working-tree-vs-trunk diff) or when the call fails.
 */
declare function getFileAtRef(args: GetFileAtRefArgs): Promise<string>;
/**
 * List local tag names (`git tag -l`). Returns [] on non-git cwd or
 * when no tags exist.
 */
declare function listTags(args: CwdOnly): Promise<string[]>;

interface CheckoutBranchArgs {
    cwd: string;
    branch: string;
    /** When true, creates the branch (`-b`). Default false. */
    create?: boolean;
    /** Optional starting commit/ref for the new branch. */
    startPoint?: string;
}
interface ShaArgs {
    cwd: string;
    sha: string;
}
/**
 * Check out `branch`. With `create: true`, creates the branch via -b.
 * With `startPoint`, branches from that ref (only meaningful with
 * create: true). Mirrors the extension's GitService.checkoutBranch
 * signature exactly.
 */
declare function checkoutBranch(args: CheckoutBranchArgs): Promise<void>;
/** `git checkout --detach <sha>`. */
declare function checkoutDetached(args: ShaArgs): Promise<void>;
/**
 * `git revert --no-edit <sha>`. Auto-detects merge commits via
 * `git rev-parse <sha>^@` (parents listing) and passes `-m 1` so the
 * revert is taken relative to the first parent. Without this, reverts
 * of merge commits fail with "commit is a merge but no -m option was
 * given".
 */
declare function revert(args: ShaArgs): Promise<void>;
/** `git cherry-pick <sha>`. */
declare function cherryPick(args: ShaArgs): Promise<void>;

export { type AddRemoteArgs, type AheadBehind, type AmendArgs, type BranchesAtCommitArgs, type CheckoutBranchArgs, type CloneRepoArgs, type CommitAllArgs, type CommitAndPushArgs, type CommitArgs, type CommitFilesArgs, type CreateTagArgs, type CreateWorktreeArgs, type CwdOnlyArgs, type DeleteLocalBranchArgs, type DeleteRemoteBranchArgs, type DeleteRemoteTagArgs, type DeleteTagArgs, type DiffFilesArgs, type DiscardAllChangesArgs, type FetchArgs, type FileChangeShort, type GetFileAtRefArgs, type GetMergeBaseArgs, type GitBranchInfo, type HasRemoteBranchArgs, type IsDirtyArgs, type ListLocalBranchesArgs, type ListMigrationsOnBranchArgs, type ListRemoteBranchesArgs, type LogRawArgs, type MergeBranchArgs, type MergeCommit, type NearestParent, type OutgoingIncomingArgs, ProtectedBranchError, type PublishBranchArgs, type PullFromArgs, type PushCurrentBranchForPrArgs, type PushToArgs, type RebaseBranchArgs, type RecentMergesArgs, type RemoveRemoteArgs, type RemoveWorktreeArgs, type RenameBranchArgs, type ResolveNearestParentArgs, type ShaArgs, type StashIndexArgs, type StashWithMessageArgs, type UndoLastCommitArgs, WorkflowScopeError, abortRebase, addRemote, checkoutBranch, checkoutDetached, cherryPick, cloneRepo, commit, commitAll, commitAllIfChanged, commitAllSignedOff, commitAmend, commitAndPush, commitSignedOff, createTag, createWorktree, deleteLocalBranch, deleteRemoteBranch, deleteRemoteTag, deleteTag, discardAllChanges, fetch, getAheadBehind, getBranchesAtCommit, getCommitFiles, getCurrentBranch, getDiffFiles, getFileAtRef, getGitHubUrl, getIncomingCommits, getLogRaw, getLogShortstat, getMergeBase, getNearestParentName, getOutgoingCommits, getOwnerRepo, getRecentMerges, getRepoRoot, gitInit, hasRemoteBranch, hasUpstream, isDirty, isRebasing, listLocalBranches, listMigrationsOnBranch, listRemoteBranches, listRemotes, listTags, listWorktrees, mergeBranch, publishBranch, pull, pullFrom, pullRebase, push, pushCurrentBranchForPr, pushTo, rebaseBranch, removeRemote, removeWorktree, renameBranch, resolveNearestParent, revert, stash, stashApply, stashDrop, stashDropAll, stashIncludeUntracked, stashList, stashPop, stashStaged, sync, undoLastCommit };
