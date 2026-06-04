// Delete a Lakebase branch by uid, branchId, or full resource name.
// The CLI requires the full resource name (projects/.../branches/...);
// this module looks it up first.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  LakebaseBranchError,
  BranchLookupOpts,
  getBranchByName,
  resolveBranchPath,
} from "./branch-utils.js";
import { KIT_TIMEOUTS } from "./kit-config.js";

const execFileP = promisify(execFile);

export interface DeleteBranchArgs extends BranchLookupOpts {
  /** Branch uid, branchId, or full resource name. */
  branch: string;
  /**
   * Escape hatch: allow deleting the project's default branch.
   * Default false: the guard refuses to delete a branch whose
   * `isDefault=true`, since that's the trunk every other branch was
   * forked from. Without this guard, a thin-wrapped shell that loops
   * `delete-lakebase-branches.sh production some-feature-branch`
   * could wipe the project's root.
   */
  allowDefault?: boolean;
}

/**
 * Delete a Lakebase branch. Throws when the branch can't be resolved
 * (no silent no-op – caller should catch + ignore if they want
 * idempotent semantics). By default, refuses to delete the project's
 * default branch; pass `allowDefault: true` to override.
 */
export async function deleteBranch(args: DeleteBranchArgs): Promise<void> {
  const fullPath = await resolveBranchPath(args.branch, {
    instance: args.instance,
    host: args.host,
  });
  if (!fullPath) {
    throw new LakebaseBranchError(`Branch "${args.branch}" not found in instance "${args.instance}"`);
  }
  if (!args.allowDefault) {
    // Refuse to delete the default branch unless the caller explicitly
    // opted in. The default branch is the source-of-truth trunk all
    // feature/tier branches were forked from; deleting it would orphan
    // every downstream branch and is almost always a bug (typically a
    // thin-wrapped shell looping over an unfiltered list).
    const info = await getBranchByName(args.branch, {
      instance: args.instance,
      host: args.host,
    });
    if (info?.isDefault) {
      const leaf = info.name.split("/branches/").pop() ?? info.uid;
      throw new LakebaseBranchError(
        `Refusing to delete the project's default Lakebase branch "${leaf}". ` +
          `This branch is the trunk every other branch was forked from. ` +
          `Pass allowDefault=true (or --allow-default on the CLI) only when you ` +
          `intend to tear down the entire project.`
      );
    }
  }
  await dbcli(["postgres", "delete-branch", fullPath], args.host);
}

async function dbcli(args: string[], host?: string): Promise<string> {
  const trimmedHost = host?.replace(/\/+$/, "");
  const env = trimmedHost
    ? ({ ...process.env, DATABRICKS_HOST: trimmedHost } as NodeJS.ProcessEnv)
    : process.env;
  try {
    const { stdout } = await execFileP("databricks", args, { env, timeout: KIT_TIMEOUTS.cliDefault });
    return stdout.toString();
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string | Buffer };
    const stderr =
      typeof e.stderr === "string"
        ? e.stderr
        : Buffer.isBuffer(e.stderr)
          ? e.stderr.toString("utf8")
          : "";
    throw new LakebaseBranchError(
      `databricks ${args.join(" ")} failed: ${e.message}${stderr ? `\nstderr: ${stderr.trim()}` : ""}`
    );
  }
}
