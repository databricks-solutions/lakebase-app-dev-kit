// Stash primitives (P6a, FEIP-7333). Lifted from extension's
// GitService stash* methods. All shell-out args use shq().
//
// stash() is the basic "stash with optional message"; stashStaged()
// stashes only the index; stashIncludeUntracked() also captures
// untracked files. apply / drop / dropAll mirror git's verbs.

import { exec, shq, type CwdOnly } from "../util/exec.js";

export interface StashWithMessageArgs {
  cwd: string;
  /** Optional stash description. When omitted, git uses its default. */
  message?: string;
}

export interface StashIndexArgs {
  cwd: string;
  /** Stash index. Default: 0 (the most recent stash). */
  index?: number;
}

function maybeMessageFlag(message?: string): string {
  return message ? ` -m ${shq(message)}` : "";
}

/** `git stash push [-m <message>]`. Includes tracked + index. */
export async function stash(args: StashWithMessageArgs): Promise<void> {
  await exec(`git stash push${maybeMessageFlag(args.message)}`, {
    cwd: args.cwd,
  });
}

/** `git stash push --staged [-m <message>]`. Stashes only the index. */
export async function stashStaged(args: StashWithMessageArgs): Promise<void> {
  await exec(`git stash push --staged${maybeMessageFlag(args.message)}`, {
    cwd: args.cwd,
  });
}

/**
 * `git stash push --include-untracked [-m <message>]`. Stashes tracked
 * + index + untracked files (but not ignored ones).
 */
export async function stashIncludeUntracked(
  args: StashWithMessageArgs
): Promise<void> {
  await exec(
    `git stash push --include-untracked${maybeMessageFlag(args.message)}`,
    { cwd: args.cwd }
  );
}

/**
 * List stash entries as raw `git stash list` lines (one per stash).
 * Returns [] when no stashes exist or the cwd is not a repo.
 */
export async function stashList(args: CwdOnly): Promise<string[]> {
  try {
    const raw = await exec("git stash list", { cwd: args.cwd });
    return raw ? raw.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** `git stash apply stash@{<index>}`. Default index = 0. */
export async function stashApply(args: StashIndexArgs): Promise<void> {
  const index = args.index ?? 0;
  await exec(`git stash apply stash@{${index}}`, { cwd: args.cwd });
}

/**
 * `git stash pop` (apply the most recent stash AND drop it). The
 * extension's stashPop has no index parameter; preserved here.
 */
export async function stashPop(args: CwdOnly): Promise<void> {
  await exec("git stash pop", { cwd: args.cwd });
}

/** `git stash drop stash@{<index>}`. Default index = 0. */
export async function stashDrop(args: StashIndexArgs): Promise<void> {
  const index = args.index ?? 0;
  await exec(`git stash drop stash@{${index}}`, { cwd: args.cwd });
}

/** `git stash clear`. Drops ALL stashes. */
export async function stashDropAll(args: CwdOnly): Promise<void> {
  await exec("git stash clear", { cwd: args.cwd });
}
