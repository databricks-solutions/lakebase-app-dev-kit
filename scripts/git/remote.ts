// Remote primitives. The origin-URL resolution (getGitHubUrl,
// getOwnerRepo) shipped earlier; the CRUD verbs (addRemote,
// removeRemote, listRemotes, deleteRemoteBranch) are P6d (FEIP-7336)
// lifted from the extension's GitService.

import { exec, shq, type CwdOnly } from "../util/exec.js";
import { parseOwnerRepo, formatOwnerRepo } from "../util/parse-owner-repo.js";

export interface AddRemoteArgs {
  cwd: string;
  /** Remote name (e.g. "upstream"). */
  name: string;
  /** Remote URL (https:// or ssh://). */
  url: string;
}

export interface RemoveRemoteArgs {
  cwd: string;
  name: string;
}

export interface DeleteRemoteBranchArgs {
  cwd: string;
  branch: string;
  /** Remote name. Default: "origin". */
  remote?: string;
}

/**
 * Read `git remote get-url origin` and normalize to https://github.com/owner/repo.
 * Returns empty string if not a git repo or origin isn't GitHub.
 */
export async function getGitHubUrl(cwd: string): Promise<string> {
  try {
    const url = (await exec("git remote get-url origin", { cwd, timeout: 5_000 })).trim();
    return url
      .replace(/\.git$/, "")
      .replace(/^git@github\.com:/, "https://github.com/")
      .replace(/^ssh:\/\/git@github\.com\//, "https://github.com/");
  } catch {
    return "";
  }
}

/** owner/repo slug for the origin remote; empty string if not GitHub. */
export async function getOwnerRepo(cwd: string): Promise<string> {
  const url = await getGitHubUrl(cwd);
  if (!url) return "";
  try {
    const { owner, repo } = parseOwnerRepo(url);
    return formatOwnerRepo(owner, repo);
  } catch {
    return "";
  }
}

/** `git remote add <name> <url>`. */
export async function addRemote(args: AddRemoteArgs): Promise<void> {
  await exec(`git remote add ${shq(args.name)} ${shq(args.url)}`, {
    cwd: args.cwd,
  });
}

/** `git remote remove <name>`. */
export async function removeRemote(args: RemoveRemoteArgs): Promise<void> {
  await exec(`git remote remove ${shq(args.name)}`, { cwd: args.cwd });
}

/**
 * List remote names as parsed `git remote` lines. Returns [] when the
 * cwd is not a git repo or has no remotes configured.
 */
export async function listRemotes(args: CwdOnly): Promise<string[]> {
  try {
    const raw = await exec("git remote", { cwd: args.cwd });
    return raw ? raw.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Delete a branch on the remote. Uses `git push <remote> --delete
 * <branch>`. Default remote = "origin".
 */
export async function deleteRemoteBranch(
  args: DeleteRemoteBranchArgs
): Promise<void> {
  const remote = args.remote ?? "origin";
  await exec(`git push ${remote} --delete ${shq(args.branch)}`, {
    cwd: args.cwd,
  });
}
