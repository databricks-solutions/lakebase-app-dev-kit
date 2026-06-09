// Mutation primitives (P6h). Checkout / revert / cherry-
// pick lifted from the extension's GitService. Branch + tag mutations
// (delete / rename / merge / tag CRUD) live in branch-tag.ts; commit
// mutations live in commits.ts.

import { exec, shq } from "../util/exec.js";

export interface CheckoutBranchArgs {
  cwd: string;
  branch: string;
  /** When true, creates the branch (`-b`). Default false. */
  create?: boolean;
  /** Optional starting commit/ref for the new branch. */
  startPoint?: string;
}

export interface ShaArgs {
  cwd: string;
  sha: string;
}

/**
 * Check out `branch`. With `create: true`, creates the branch via -b.
 * With `startPoint`, branches from that ref (only meaningful with
 * create: true). Mirrors the extension's GitService.checkoutBranch
 * signature exactly.
 */
export async function checkoutBranch(args: CheckoutBranchArgs): Promise<void> {
  const flag = args.create ? "-b " : "";
  const sp = args.startPoint ? ` ${shq(args.startPoint)}` : "";
  await exec(`git checkout ${flag}${shq(args.branch)}${sp}`, {
    cwd: args.cwd,
  });
}

/** `git checkout --detach <sha>`. */
export async function checkoutDetached(args: ShaArgs): Promise<void> {
  await exec(`git checkout --detach ${shq(args.sha)}`, { cwd: args.cwd });
}

/**
 * `git revert --no-edit <sha>`. Auto-detects merge commits via
 * `git rev-parse <sha>^@` (parents listing) and passes `-m 1` so the
 * revert is taken relative to the first parent. Without this, reverts
 * of merge commits fail with "commit is a merge but no -m option was
 * given".
 */
export async function revert(args: ShaArgs): Promise<void> {
  const parents = (
    await exec(`git rev-parse ${shq(`${args.sha}^@`)}`, { cwd: args.cwd })
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  const mFlag = parents.length > 1 ? " -m 1" : "";
  await exec(`git revert --no-edit${mFlag} ${shq(args.sha)}`, {
    cwd: args.cwd,
  });
}

/** `git cherry-pick <sha>`. */
export async function cherryPick(args: ShaArgs): Promise<void> {
  await exec(`git cherry-pick ${shq(args.sha)}`, { cwd: args.cwd });
}
