// Worktree primitives (P6c). Lifted from extension's
// GitService worktree methods.

import { exec, shq, type CwdOnly } from "../util/exec.js";

export interface CreateWorktreeArgs {
  cwd: string;
  /** Path where the new worktree directory will be created. */
  path: string;
  /** Branch to create + check out in the new worktree (`-b <branch>`). */
  branch: string;
}

export interface RemoveWorktreeArgs {
  cwd: string;
  /** Path of the worktree to remove. */
  path: string;
}

/** `git worktree add <path> -b <branch>`. */
export async function createWorktree(
  args: CreateWorktreeArgs
): Promise<void> {
  await exec(
    `git worktree add ${shq(args.path)} -b ${shq(args.branch)}`,
    { cwd: args.cwd }
  );
}

/**
 * List worktrees as raw `git worktree list` lines (one per worktree).
 * Each line is "<path> <sha> [branch]". Returns [] on non-git cwd or
 * when the call fails.
 */
export async function listWorktrees(args: CwdOnly): Promise<string[]> {
  try {
    const raw = await exec("git worktree list", { cwd: args.cwd });
    return raw ? raw.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** `git worktree remove <path>`. */
export async function removeWorktree(
  args: RemoveWorktreeArgs
): Promise<void> {
  await exec(`git worktree remove ${shq(args.path)}`, { cwd: args.cwd });
}
