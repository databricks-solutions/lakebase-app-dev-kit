// Wrapper for `git clone`. Same one-liner the extension's GitService uses,
// promoted to a focused module so create-project can call it without
// pulling in the 1046-line gitService.

import { exec, shq } from "../util/exec.js";

export interface CloneRepoArgs {
  /** Git URL (https:// or ssh://). */
  repoUrl: string;
  /**
   * Directory that will contain the cloned repo. Git creates the
   * target directory as a subdir of `parentDir`, named after the repo.
   */
  parentDir: string;
  /** Milliseconds before SIGTERM. Default: 60_000. */
  timeoutMs?: number;
}

/**
 * Clone a Git repository into `parentDir`. Git creates the target dir
 * as a subdir of `parentDir` named after the repo.
 *
 * For HTTPS URLs, git uses the configured credential helper (typically
 * the macOS keychain or `osxkeychain`). For SSH URLs, the user's ssh
 * agent. No GitHub token plumbing happens here.
 *
 * The URL is shq-escaped: shell-active characters in the URL (e.g. `$`
 * or backticks in unusual self-hosted endpoints) are suppressed rather
 * than expanded.
 *
 * @throws Error if the clone subprocess exits non-zero (auth failure,
 *   repo not found, network error, etc.).
 */
export async function cloneRepo(args: CloneRepoArgs): Promise<void> {
  await exec(`git clone ${shq(args.repoUrl)}`, {
    cwd: args.parentDir,
    timeout: args.timeoutMs ?? 60_000,
  });
}
