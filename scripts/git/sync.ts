// Sync primitives: push, pull, publish-branch, push-for-PR. Lifted
// from the extension's GitService methods (P5c).
//
// publishBranch and pushCurrentBranchForPr both need the current
// branch name; they resolve it internally via `git rev-parse
// --abbrev-ref HEAD` so callers don't have to pass it (and so the
// "no current branch" error message is consistent).

import { exec, shq } from "../util/exec.js";
import { hasUpstream } from "./status.js";

export interface CwdOnly {
  cwd: string;
}

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
