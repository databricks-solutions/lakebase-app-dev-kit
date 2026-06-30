// Remote primitives. The origin-URL resolution (getGitHubUrl,
// getOwnerRepo) shipped earlier; the CRUD verbs (addRemote,
// removeRemote, listRemotes, deleteRemoteBranch) are P6d
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
 * Returns empty string if not a git repo / no origin.
 *
 * Host-alias aware: the host segment must NOT be hardcoded to `github.com`.
 * EMU (Enterprise Managed Users) setups commonly point origin at an SSH `Host`
 * alias from ~/.ssh/config , e.g. `org-140212977@github-emu:databricks-field-eng/
 * partner-asset-tracker.git`. The old normalizer only rewrote a literal
 * `git@github.com:`, so the alias passed through unchanged and parseOwnerRepo
 * then split it into a garbage owner (`org-...@github-emu:databricks-field-eng`),
 * which 404s every owner/repo-derived op (Create PR, runner setup, PR status).
 * We extract the owner/repo PATH after the host regardless of the host/user and
 * re-home it on github.com (this module is GitHub-only).
 */
export async function getGitHubUrl(cwd: string): Promise<string> {
  try {
    const raw = (await exec("git remote get-url origin", { cwd, timeout: 5_000 })).trim();
    if (!raw) { return ""; }
    const url = raw.replace(/\.git$/, "");
    // SCP-style: "[user@]host:owner/repo" (host may be an alias). The path
    // starts right after the first ":" and must not begin with "/" (that would
    // be a scheme like "https://").
    const scp = url.match(/^(?:[^@/]+@)?[^/:]+:([^/].*)$/);
    if (scp) { return `https://github.com/${scp[1]}`; }
    // "ssh://[user@]host[:port]/owner/repo"
    const ssh = url.match(/^ssh:\/\/(?:[^@/]+@)?[^/]+\/(.+)$/);
    if (ssh) { return `https://github.com/${ssh[1]}`; }
    // "http(s)://host/owner/repo" , rewrite any host (incl. an alias) to github.com.
    const https = url.match(/^https?:\/\/[^/]+\/(.+)$/);
    if (https) { return `https://github.com/${https[1]}`; }
    return "";
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
