// Working-tree + upstream status primitives. Lifted from extension's
// GitService (hasUpstream, getAheadBehind, isDirty). All three operate
// on the cwd's current branch and return safe defaults when there's no
// upstream / no repo (rather than throwing) so call sites that drive
// status-bar items don't have to wrap every call.

import { exec } from "../util/exec.js";

export interface CwdOnlyArgs {
  cwd: string;
}

export interface AheadBehind {
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
export async function hasUpstream(args: CwdOnlyArgs): Promise<boolean> {
  try {
    await exec("git rev-parse --abbrev-ref @{u}", { cwd: args.cwd });
    return true;
  } catch {
    return false;
  }
}

/**
 * Return ahead / behind counts of HEAD relative to its upstream, along
 * with the upstream ref. Returns zeros + empty string when no upstream
 * exists, the cwd is not a repo, or the ref-list call fails for any
 * other reason - callers driving UI affordances should treat this as
 * "no remote sync state to show".
 */
export async function getAheadBehind(args: CwdOnlyArgs): Promise<AheadBehind> {
  const { cwd } = args;
  try {
    const upstream = await exec("git rev-parse --abbrev-ref @{u}", { cwd });
    const raw = await exec("git rev-list --left-right --count HEAD...@{u}", {
      cwd,
    });
    const parts = raw.trim().split(/\s+/);
    return {
      ahead: parseInt(parts[0], 10) || 0,
      behind: parseInt(parts[1], 10) || 0,
      upstream,
    };
  } catch {
    return { ahead: 0, behind: 0, upstream: "" };
  }
}

/**
 * True iff the working tree has staged or unstaged changes (including
 * untracked files reported by porcelain status). Returns false on
 * non-git cwd or when `git status` fails.
 */
export async function isDirty(args: CwdOnlyArgs): Promise<boolean> {
  try {
    const out = await exec("git status --porcelain", { cwd: args.cwd });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}
