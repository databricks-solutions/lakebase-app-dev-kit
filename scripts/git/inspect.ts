// Inspection primitives (P6g, FEIP-7339). Read-only "what's the
// state?" calls that don't fit cleanly into branches.ts, ancestry.ts,
// or log.ts. All return safe empty defaults on failure so callers
// driving status-bar / tree refreshes don't have to wrap every call.

import { exec, shq, type CwdOnly } from "../util/exec.js";

export interface GetFileAtRefArgs {
  cwd: string;
  ref: string;
  filePath: string;
}

/**
 * Current branch name via `git rev-parse --abbrev-ref HEAD`. Returns
 * "" on non-git cwd or detached HEAD (where rev-parse returns the
 * literal "HEAD" string). Note: this swallows the detached-HEAD case
 * by checking for that literal so callers can treat "" uniformly as
 * "no usable current branch".
 */
export async function getCurrentBranch(args: CwdOnly): Promise<string> {
  try {
    const name = await exec("git rev-parse --abbrev-ref HEAD", {
      cwd: args.cwd,
    });
    return name === "HEAD" ? "" : name;
  } catch {
    return "";
  }
}

/**
 * Absolute path of the git repository root (`git rev-parse
 * --show-toplevel`). Returns "" on non-git cwd.
 */
export async function getRepoRoot(args: CwdOnly): Promise<string> {
  try {
    return await exec("git rev-parse --show-toplevel", { cwd: args.cwd });
  } catch {
    return "";
  }
}

/**
 * File contents at a given ref (`git show <ref>:<path>`). Returns ""
 * when the file doesn't exist at that ref (common for newly-added
 * files in a working-tree-vs-trunk diff) or when the call fails.
 */
export async function getFileAtRef(args: GetFileAtRefArgs): Promise<string> {
  try {
    return await exec(
      `git show ${shq(`${args.ref}:${args.filePath}`)}`,
      { cwd: args.cwd }
    );
  } catch {
    return "";
  }
}

/**
 * List local tag names (`git tag -l`). Returns [] on non-git cwd or
 * when no tags exist.
 */
export async function listTags(args: CwdOnly): Promise<string[]> {
  try {
    const raw = await exec("git tag -l", { cwd: args.cwd });
    return raw ? raw.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}
