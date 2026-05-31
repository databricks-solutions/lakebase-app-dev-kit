// Branch + tag mutation primitives. Lifted from the extension's
// GitService deleteBranch / renameBranch / mergeBranch / createTag /
// deleteTag / deleteRemoteTag (P5d).
//
// Guardrail: deleteBranch refuses to operate on protected branches
// (production, main, master) without an explicit override. The
// reference_databricks_lakebase_skill memory notes "never delete the
// production branch" - this enforces that at the substrate layer so
// the rule survives across CLI, agent, and extension callers.

import { exec, shq } from "../util/exec.js";

const PROTECTED_BRANCHES = new Set(["production", "main", "master"]);

export interface DeleteLocalBranchArgs {
  cwd: string;
  branch: string;
  /**
   * When true, uses `git branch -D` (force-delete unmerged branches);
   * otherwise `git branch -d` which refuses unmerged branches. Default
   * false.
   */
  force?: boolean;
  /**
   * Allow deleting a protected branch (production/main/master).
   * Default false. Set true ONLY when the caller has explicit user
   * confirmation; refuses with a typed error otherwise.
   */
  allowProtected?: boolean;
}

export interface RenameBranchArgs {
  cwd: string;
  /** New name for the CURRENT branch. */
  newName: string;
}

export interface MergeBranchArgs {
  cwd: string;
  branch: string;
}

export interface CreateTagArgs {
  cwd: string;
  name: string;
  /** When provided, makes an annotated tag (`git tag -a -m ...`). */
  message?: string;
  /** When provided, tags this sha; otherwise tags HEAD. */
  sha?: string;
}

export interface DeleteTagArgs {
  cwd: string;
  name: string;
}

export interface DeleteRemoteTagArgs {
  cwd: string;
  name: string;
  /** Remote name. Default: "origin". */
  remote?: string;
}

export class ProtectedBranchError extends Error {
  constructor(branch: string) {
    super(
      `Refusing to delete protected branch "${branch}". Pass ` +
        `allowProtected: true to override (only after explicit user ` +
        `confirmation).`
    );
    this.name = "ProtectedBranchError";
  }
}

/**
 * Delete a local git branch. Refuses production/main/master without
 * `allowProtected: true`. The `force` flag controls -d vs -D
 * independently of the protection check.
 *
 * Named with the "Local" suffix to disambiguate from the Lakebase
 * `deleteBranch` (which deletes a Lakebase Postgres branch via API).
 * Both verbs live at the kit's top-level barrel and would collide
 * unqualified.
 */
export async function deleteLocalBranch(args: DeleteLocalBranchArgs): Promise<void> {
  if (PROTECTED_BRANCHES.has(args.branch) && !args.allowProtected) {
    throw new ProtectedBranchError(args.branch);
  }
  const flag = args.force ? "-D" : "-d";
  await exec(`git branch ${flag} ${shq(args.branch)}`, {
    cwd: args.cwd,
  });
}

/** Rename the CURRENT branch (`git branch -m <newName>`). */
export async function renameBranch(args: RenameBranchArgs): Promise<void> {
  await exec(`git branch -m ${shq(args.newName)}`, { cwd: args.cwd });
}

/** Merge `branch` INTO the current branch (`git merge <branch>`). */
export async function mergeBranch(args: MergeBranchArgs): Promise<void> {
  await exec(`git merge ${shq(args.branch)}`, { cwd: args.cwd });
}

/**
 * Create a tag. With `message`, makes an annotated tag; without, a
 * lightweight tag. With `sha`, tags that commit; without, tags HEAD.
 */
export async function createTag(args: CreateTagArgs): Promise<void> {
  const parts = ["git", "tag"];
  if (args.message) parts.push("-a");
  parts.push(shq(args.name));
  if (args.message) parts.push("-m", shq(args.message));
  if (args.sha) parts.push(shq(args.sha));
  await exec(parts.join(" "), { cwd: args.cwd });
}

/** Delete a local tag (`git tag -d <name>`). */
export async function deleteTag(args: DeleteTagArgs): Promise<void> {
  await exec(`git tag -d ${shq(args.name)}`, { cwd: args.cwd });
}

/**
 * Delete a tag from the remote. Uses `git push <remote> --delete
 * refs/tags/<name>` so the call works whether or not the local tag
 * still exists.
 */
export async function deleteRemoteTag(
  args: DeleteRemoteTagArgs
): Promise<void> {
  const remote = args.remote ?? "origin";
  await exec(`git push ${remote} --delete ${shq(`refs/tags/${args.name}`)}`, {
    cwd: args.cwd,
  });
}
