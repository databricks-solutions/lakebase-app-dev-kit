// Rebase primitives (P6b). Lifted from extension's
// GitService rebase methods. isRebasing() detects in-progress rebase
// state by checking .git/rebase-merge and .git/rebase-apply paths
// (same heuristic the extension uses).

import * as fs from "node:fs";
import * as path from "node:path";
import { exec, shq, type CwdOnly } from "../util/exec.js";

export interface RebaseBranchArgs {
  cwd: string;
  branch: string;
}

/** `git rebase --abort`. */
export async function abortRebase(args: CwdOnly): Promise<void> {
  await exec("git rebase --abort", { cwd: args.cwd });
}

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
export async function isRebasing(args: CwdOnly): Promise<boolean> {
  try {
    return (
      fs.existsSync(path.join(args.cwd, ".git/rebase-merge")) ||
      fs.existsSync(path.join(args.cwd, ".git/rebase-apply"))
    );
  } catch {
    return false;
  }
}

/** `git rebase <branch>`. */
export async function rebaseBranch(args: RebaseBranchArgs): Promise<void> {
  await exec(`git rebase ${shq(args.branch)}`, { cwd: args.cwd });
}

/** `git pull --rebase`. */
export async function pullRebase(args: CwdOnly): Promise<void> {
  await exec("git pull --rebase", { cwd: args.cwd });
}
