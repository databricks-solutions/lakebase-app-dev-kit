// Branch listing + existence primitives.
//
// Lifted from lakebase-scm-extension's GitService (listLocalBranches,
// listRemoteBranches, hasRemoteBranch). Substrate signatures take an
// explicit cwd; the extension's VS-Code-workspace resolution layer stays
// in the extension. Behavior is preserved verbatim so callers can swap
// without recalibrating downstream consumers.

import { exec } from "../util/exec.js";

export interface GitBranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  tracking?: string;
  ahead?: number;
  behind?: number;
}

export interface ListLocalBranchesArgs {
  cwd: string;
}

export interface ListRemoteBranchesArgs {
  cwd: string;
  /** Remote name. Default: "origin". */
  remote?: string;
}

export interface HasRemoteBranchArgs {
  cwd: string;
  branch: string;
  /** Remote name. Default: "origin". */
  remote?: string;
}

async function currentBranchName(cwd: string): Promise<string> {
  try {
    return await exec("git rev-parse --abbrev-ref HEAD", { cwd });
  } catch {
    return "";
  }
}

/**
 * List local branches with tracking + ahead/behind metadata. Returns []
 * when the directory is not a git repo. Each entry carries the upstream
 * ref (when set) and ahead/behind counts parsed from
 * `git branch --format`.
 */
export async function listLocalBranches(
  args: ListLocalBranchesArgs
): Promise<GitBranchInfo[]> {
  const { cwd } = args;
  let raw: string;
  try {
    raw = await exec(
      'git branch --format="%(refname:short)|%(upstream:short)|%(upstream:track)"',
      { cwd }
    );
  } catch {
    return [];
  }
  if (!raw) return [];

  const current = await currentBranchName(cwd);

  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, tracking, trackInfo] = line.split("|");
      let ahead = 0;
      let behind = 0;
      if (trackInfo) {
        const aheadMatch = trackInfo.match(/ahead (\d+)/);
        const behindMatch = trackInfo.match(/behind (\d+)/);
        if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
        if (behindMatch) behind = parseInt(behindMatch[1], 10);
      }
      return {
        name,
        isCurrent: name === current,
        isRemote: false,
        tracking: tracking || undefined,
        ahead,
        behind,
      };
    });
}

/**
 * List remote branches that are NOT already checked out locally. Strips
 * the remote prefix from the returned `name` and preserves the full
 * `origin/<branch>` ref in `tracking`. Useful for "switch to existing
 * remote branch" pickers that want to hide branches the caller can
 * already reach locally.
 */
export async function listRemoteBranches(
  args: ListRemoteBranchesArgs
): Promise<GitBranchInfo[]> {
  const { cwd, remote = "origin" } = args;
  try {
    const localBranches = await listLocalBranches({ cwd });
    const localNames = new Set(localBranches.map((b) => b.name));

    const raw = await exec(`git branch -r --format="%(refname:short)"`, {
      cwd,
    });
    if (!raw) return [];

    const remotePrefix = `${remote}/`;
    return raw
      .split("\n")
      .filter(Boolean)
      .filter((name) => !name.includes("HEAD"))
      .map((name) => {
        const shortName = name.startsWith(remotePrefix)
          ? name.slice(remotePrefix.length)
          : name;
        return { fullName: name, shortName };
      })
      .filter(({ shortName }) => !localNames.has(shortName))
      .map(({ fullName, shortName }) => ({
        name: shortName,
        isCurrent: false,
        isRemote: true,
        tracking: fullName,
      }));
  } catch {
    return [];
  }
}

/**
 * True iff `branch` exists on the given remote. Returns false when the
 * remote is unreachable or the branch is absent. Uses `git ls-remote
 * --heads`, which does not require a fetch.
 */
export async function hasRemoteBranch(
  args: HasRemoteBranchArgs
): Promise<boolean> {
  const { cwd, branch, remote = "origin" } = args;
  try {
    const out = await exec(
      `git ls-remote --heads "${remote}" "${branch}"`,
      { cwd }
    );
    return out.trim().length > 0;
  } catch {
    return false;
  }
}
