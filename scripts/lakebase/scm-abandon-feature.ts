// SCM workflow abandon (phase B+): unwind a feature claim.
//
// Transitions feature-claimed -> scaffold-complete. Best-effort cleanup
// of the paired Lakebase + git pair via deletePairedBranch, then resets
// the workflow-state row so the next claim can proceed. Refuses on a
// dirty working tree by default (uncommitted work would be lost when
// the branch is deleted) unless --force.
//
// The substrate primitive (deletePairedBranch) is non-throwing and
// returns per-side success flags; this helper records those as
// warnings rather than failing the transition, so a partial cleanup
// (e.g. Lakebase already deleted by an out-of-band script) still
// completes the state reset.

import { deletePairedBranch } from "./paired-branch.js";
import { getCurrentBranch } from "../git/inspect.js";
import { isDirty } from "../git/status.js";
import { exec } from "../util/exec.js";
import {
  readWorkflowState,
  writeWorkflowState,
  type ScmWorkflowState,
} from "./scm-workflow-state.js";

export class ScmAbandonError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "no-state-file"
      | "bad-precondition"
      | "dirty-working-tree"
      | "missing-claim-fields",
  ) {
    super(message);
    this.name = "ScmAbandonError";
  }
}

export interface AbandonFeatureArgs {
  projectDir: string;
  /** Override the workflow's recorded instance. */
  instance?: string;
  /**
   * Skip the dirty-working-tree refusal. Uncommitted edits on the
   * feature branch are lost when the git branch is deleted; the
   * default refusal protects against that.
   */
  force?: boolean;
  /**
   * Switch HEAD to this branch before deleting the feature branch.
   * Defaults to the workflow row's parent_branch.
   */
  switchTo?: string;
}

export interface AbandonFeatureResult {
  state: ScmWorkflowState;
  lakebaseDeleted: boolean;
  gitLocalDeleted: boolean;
  gitRemoteDeleted: boolean;
  warnings: string[];
}

export async function abandonFeatureBranch(
  args: AbandonFeatureArgs,
): Promise<AbandonFeatureResult> {
  const current = readWorkflowState(args.projectDir);
  if (!current) {
    throw new ScmAbandonError(
      `No SCM workflow state found at ${args.projectDir}/.lakebase/workflow-state.json.`,
      "no-state-file",
    );
  }
  if (current.state !== "feature-claimed") {
    throw new ScmAbandonError(
      `abandon refuses state "${current.state}". Only feature-claimed is abandonable; later states must complete or be reverted via gh.`,
      "bad-precondition",
    );
  }
  if (
    !current.feature_id ||
    !current.branch ||
    !current.parent_branch ||
    !current.lakebase_branch_uid
  ) {
    throw new ScmAbandonError(
      "feature-claimed row is missing required invariants. Cannot abandon safely; consider re-adopting state first.",
      "missing-claim-fields",
    );
  }

  if (!args.force) {
    const dirty = await isDirty({ cwd: args.projectDir });
    if (dirty) {
      throw new ScmAbandonError(
        "Working tree has uncommitted changes; refusing to abandon (the branch delete would lose them). Commit / stash / discard first, or pass --force.",
        "dirty-working-tree",
      );
    }
  }

  const instance = args.instance ?? current.project_id;
  const switchTo = args.switchTo ?? current.parent_branch;
  const warnings: string[] = [];

  // Switch HEAD off the feature branch first so deletePairedBranch can
  // delete the local git branch (it skips when the branch is checked out).
  const headBranch = await getCurrentBranch({ cwd: args.projectDir });
  if (headBranch === current.branch) {
    try {
      await exec(`git checkout ${JSON.stringify(switchTo)}`, {
        cwd: args.projectDir,
        timeout: 10_000,
      });
    } catch (err) {
      warnings.push(
        `git checkout ${switchTo} failed: ${err instanceof Error ? err.message : String(err)}. Local branch delete may be skipped.`,
      );
    }
  }

  const del = await deletePairedBranch({
    instance,
    branch: current.branch,
    cwd: args.projectDir,
  });
  warnings.push(...del.warnings);

  const reset: ScmWorkflowState = {
    $schema: current.$schema,
    version: 1,
    state: "scaffold-complete",
    tier_topology: current.tier_topology,
    project_id: current.project_id,
  };
  writeWorkflowState(args.projectDir, reset);

  return {
    state: reset,
    lakebaseDeleted: del.lakebaseDeleted,
    gitLocalDeleted: del.gitLocalDeleted,
    gitRemoteDeleted: del.gitRemoteDeleted,
    warnings,
  };
}
