// History / log primitives (P6f). Lifted from extension's
// GitService log methods: getLogRaw, getLogShortstat, getOutgoingCommits,
// getIncomingCommits, getRecentMerges, plus getBranchesAtCommit,
// getCommitFiles, getDiffFiles which logically belong here too.
//
// All getters return safe empty defaults on failure (non-git cwd,
// missing upstream for incoming/outgoing) so callers driving status-
// bar / tree refreshes don't have to wrap every call.

import { exec, shq, type CwdOnly } from "../util/exec.js";

export interface LogRawArgs {
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

export interface OutgoingIncomingArgs {
  cwd: string;
}

export interface RecentMergesArgs {
  cwd: string;
  /** Max number of merge commits to return. Default: 5. */
  limit?: number;
}

export interface MergeCommit {
  sha: string;
  message: string;
}

export interface BranchesAtCommitArgs {
  cwd: string;
  sha: string;
}

export interface FileChangeShort {
  /** Single-letter git status code (A, M, D, R, ...). */
  status: string;
  path: string;
}

export interface CommitFilesArgs {
  cwd: string;
  sha: string;
}

export interface DiffFilesArgs {
  cwd: string;
  fromRef: string;
  /** Target ref, or null to diff `fromRef` against the working tree. */
  toRef: string | null;
}

/**
 * Raw `git log --date-order --format=<format> -<limit><refArgs>`
 * output. Returns "" on failure.
 */
export async function getLogRaw(args: LogRawArgs): Promise<string> {
  try {
    return await exec(
      `git log --date-order --format=${shq(args.format)} -${args.limit}${args.refArgs}`,
      { cwd: args.cwd }
    );
  } catch {
    return "";
  }
}

/**
 * Same as getLogRaw but with `--shortstat` appended so each commit
 * includes the "N files changed, X insertions(+), Y deletions(-)"
 * footer.
 */
export async function getLogShortstat(args: LogRawArgs): Promise<string> {
  try {
    return await exec(
      `git log --date-order --format=${shq(args.format)} --shortstat -${args.limit}${args.refArgs}`,
      { cwd: args.cwd }
    );
  } catch {
    return "";
  }
}

/**
 * Local commits not on upstream (`git log --oneline @{u}..HEAD`).
 * Returns the leading SHA from each line. Returns [] when no upstream
 * is configured or the call fails.
 */
export async function getOutgoingCommits(
  args: OutgoingIncomingArgs
): Promise<string[]> {
  try {
    const raw = await exec("git log --oneline @{u}..HEAD", { cwd: args.cwd });
    return raw.split("\n").filter(Boolean).map((l) => l.split(" ")[0]);
  } catch {
    return [];
  }
}

/**
 * Upstream commits not yet pulled (`git log --oneline HEAD..@{u}`).
 * Returns [] when no upstream is configured or the call fails.
 */
export async function getIncomingCommits(
  args: OutgoingIncomingArgs
): Promise<string[]> {
  try {
    const raw = await exec("git log --oneline HEAD..@{u}", { cwd: args.cwd });
    return raw.split("\n").filter(Boolean).map((l) => l.split(" ")[0]);
  } catch {
    return [];
  }
}

/**
 * Most recent merge commits as { sha, message } pairs. Default limit
 * is 5. Returns [] on non-git cwd or when the call fails.
 */
export async function getRecentMerges(
  args: RecentMergesArgs
): Promise<MergeCommit[]> {
  const limit = args.limit ?? 5;
  try {
    const raw = await exec(`git log --merges --oneline -${limit}`, {
      cwd: args.cwd,
    });
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const sp = line.indexOf(" ");
        return { sha: line.substring(0, sp), message: line.substring(sp + 1) };
      });
  } catch {
    return [];
  }
}

/**
 * Local + remote branches that point at `sha`. Excludes HEAD-pointer
 * entries and the bare "origin" alias.
 */
export async function getBranchesAtCommit(
  args: BranchesAtCommitArgs
): Promise<string[]> {
  try {
    const raw = await exec(
      `git branch -a --points-at ${shq(args.sha)} --format=${shq("%(refname:short)")}`,
      { cwd: args.cwd }
    );
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .filter((b) => !b.includes("HEAD") && b !== "origin");
  } catch {
    return [];
  }
}

/**
 * Files changed by a single commit. For merge commits, diff-tree
 * returns empty, so we fall back to `git diff <sha>^1 <sha>` against
 * the first parent.
 */
export async function getCommitFiles(
  args: CommitFilesArgs
): Promise<FileChangeShort[]> {
  try {
    let raw = await exec(
      `git diff-tree --no-commit-id --name-status -r ${shq(args.sha)}`,
      { cwd: args.cwd }
    );
    if (!raw.trim()) {
      try {
        raw = await exec(
          `git diff --name-status ${shq(`${args.sha}^1`)} ${shq(args.sha)}`,
          { cwd: args.cwd }
        );
      } catch {
        return [];
      }
    }
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("\t");
        return { status: parts[0][0], path: parts[parts.length - 1] };
      });
  } catch {
    return [];
  }
}

/**
 * Files changed between two refs, or between a ref and the working
 * tree (`toRef: null`). Returns [] on failure.
 */
export async function getDiffFiles(
  args: DiffFilesArgs
): Promise<FileChangeShort[]> {
  try {
    const cmd = args.toRef
      ? `git diff --name-status ${shq(args.fromRef)} ${shq(args.toRef)}`
      : `git diff --name-status ${shq(args.fromRef)}`;
    const raw = await exec(cmd, { cwd: args.cwd });
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("\t");
        return { status: parts[0][0], path: parts[parts.length - 1] };
      });
  } catch {
    return [];
  }
}
