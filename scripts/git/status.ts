// Working-tree + upstream status primitives. Lifted from extension's
// GitService (hasUpstream, getAheadBehind, isDirty). All three operate
// on the cwd's current branch and return safe defaults when there's no
// upstream / no repo (rather than throwing) so call sites that drive
// status-bar items don't have to wrap every call.

import { exec, shq } from "../util/exec.js";

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

export interface IsDirtyArgs extends CwdOnlyArgs {
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
export async function isDirty(args: IsDirtyArgs): Promise<boolean> {
  try {
    const ignore = args.ignore ?? [];
    let command = "git status --porcelain";
    if (ignore.length > 0) {
      // Let GIT exclude the ignored paths via pathspec, rather than parsing the
      // porcelain ourselves , the leading status column is a space for unstaged
      // changes, and exec() trims the output, so a hand-sliced path is fragile.
      // A magic `:(exclude)` pathspec must be paired with an inclusive one (`.`).
      // A trailing slash on a prefix is dropped (`.tdd/` -> exclude the `.tdd` dir).
      const excludes = ignore.map((p) => shq(`:(exclude)${p.replace(/\/+$/, "")}`)).join(" ");
      command = `git status --porcelain -- . ${excludes}`;
    }
    const out = await exec(command, { cwd: args.cwd });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}
