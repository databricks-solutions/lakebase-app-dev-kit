// Sync primitives. P5c shipped push / pull / publishBranch /
// pushCurrentBranchForPr; P6e adds fetch / fetchPrune /
// fetchAll / pullFrom / pushTo / sync.
//
// publishBranch and pushCurrentBranchForPr both need the current
// branch name; they resolve it internally via `git rev-parse
// --abbrev-ref HEAD` so callers don't have to pass it (and so the
// "no current branch" error message is consistent).

import { exec, shq, type CwdOnly } from "../util/exec.js";
import { hasUpstream } from "./status.js";

export interface PublishBranchArgs {
  cwd: string;
  /** Remote to push to. Default: "origin". */
  remote?: string;
}

export interface PushCurrentBranchForPrArgs {
  cwd: string;
  /** Remote for the initial publish (when no upstream yet). Default: "origin". */
  remote?: string;
}

async function currentBranchName(cwd: string): Promise<string> {
  try {
    return await exec("git rev-parse --abbrev-ref HEAD", { cwd });
  } catch {
    return "";
  }
}

/** `git push` with no args. Uses the configured upstream. */
export async function push(args: CwdOnly): Promise<void> {
  await exec("git push", { cwd: args.cwd });
}

/** `git pull` with no args. Uses the configured upstream. */
export async function pull(args: CwdOnly): Promise<void> {
  await exec("git pull", { cwd: args.cwd });
}

/**
 * First push of a local branch: `git push -u <remote> <current-branch>`.
 * Throws when no current branch exists (detached HEAD / empty repo).
 */
export async function publishBranch(args: PublishBranchArgs): Promise<void> {
  const remote = args.remote ?? "origin";
  const branch = await currentBranchName(args.cwd);
  if (!branch) throw new Error("No current branch");
  await exec(`git push -u ${remote} ${shq(branch)}`, {
    cwd: args.cwd,
  });
}

/**
 * Ensure the current branch is pushed before PR creation. Publishes
 * with `-u <remote>` when no upstream exists; otherwise plain `git
 * push`. Throws when no current branch exists.
 *
 * Pairs with the host's PR-creation flow (e.g. extension's
 * GitHubService.createPullRequest): this handles git push, the caller
 * handles the REST API.
 */
export async function pushCurrentBranchForPr(
  args: PushCurrentBranchForPrArgs
): Promise<void> {
  const remote = args.remote ?? "origin";
  const branch = await currentBranchName(args.cwd);
  if (!branch) throw new Error("No current branch");
  const upstreamSet = await hasUpstream({ cwd: args.cwd });
  if (!upstreamSet) {
    await exec(`git push -u ${remote} ${shq(branch)}`, {
      cwd: args.cwd,
    });
  } else {
    await exec("git push", { cwd: args.cwd });
  }
}

// ---------- P6e additions ----------

export interface FetchArgs {
  cwd: string;
  /** `--prune` to delete remote-tracking refs that no longer exist on the remote. */
  prune?: boolean;
  /** `--all` to fetch from every configured remote. */
  all?: boolean;
}

export interface PullFromArgs {
  cwd: string;
  remote: string;
  branch: string;
}

export interface PushToArgs {
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
export async function fetch(args: FetchArgs): Promise<void> {
  const parts = ["git fetch"];
  if (args.prune) parts.push("--prune");
  if (args.all) parts.push("--all");
  await exec(parts.join(" "), { cwd: args.cwd });
}

/** `git pull <remote> <branch>`. */
export async function pullFrom(args: PullFromArgs): Promise<void> {
  await exec(`git pull ${shq(args.remote)} ${shq(args.branch)}`, {
    cwd: args.cwd,
  });
}

/** `git push <remote> <branch>`. */
export async function pushTo(args: PushToArgs): Promise<void> {
  await exec(`git push ${shq(args.remote)} ${shq(args.branch)}`, {
    cwd: args.cwd,
  });
}

/**
 * Pull-then-push composite. Preserves the extension's GitService.sync
 * semantics (plain `git pull` followed by `git push`, no rebase). Fails
 * fast if pull errors; push does not run.
 */
export async function sync(args: CwdOnly): Promise<void> {
  await exec("git pull", { cwd: args.cwd });
  await exec("git push", { cwd: args.cwd });
}
