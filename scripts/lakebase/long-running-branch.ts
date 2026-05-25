/**
 * Create a long-running branch tier from another tier.
 *
 * Part of the release-workflows convention (see
 * skills/lakebase-release-workflows/SKILL.md). A long-running branch
 * is a tier the architect declares in the project's chain (e.g.
 * staging, dev). This primitive cuts a Lakebase branch named `name`
 * forked from the project's current default branch (per the substrate's
 * "no parent → fork from current" convention) AND pushes a matching
 * git branch from `forkFromBranch` so release PRs can target it.
 *
 * Both sides are idempotent:
 *   - createBranch returns the existing branch if `name` already exists.
 *   - `git push -u origin <name>` won't fail on re-push.
 *
 * Intended caller: integration test suites bootstrapping their declared
 * chain, OR a future `bootstrap-branch-convention` orchestrator that
 * sets up all the architect's tiers from a fresh prod project.
 */

import * as cp from "child_process";
import { createBranch as createLakebaseBranch } from "./branch-create.js";
import { LakebaseBranchInfo } from "./branch-utils.js";

export interface CreateLongRunningBranchArgs {
  /** Tier name to create (e.g. 'staging', 'dev'). Used as both the git
   *  branch name and the Lakebase branch name. */
  name: string;
  /** Existing git branch the new tier forks from. For two-tier the
   *  staging tier forks from 'main'; for three-tier the dev tier forks
   *  from 'staging' and the staging tier forks from 'main'. */
  forkFromBranch: string;
  /** Lakebase project ID. */
  projectId: string;
  /** Local git work tree where the git operations run (typically the
   *  scaffolded project directory). */
  workTreeDir: string;
  /** Workspace URL. Forwarded to the substrate's createBranch via env. */
  databricksHost?: string;
}

export interface CreateLongRunningBranchResult {
  /** Full Lakebase resource path of the created branch
   *  (`projects/<projectId>/branches/<name>`). */
  lakebaseBranchName: string;
  /** Git branch name that was pushed to origin (same as `args.name`). */
  gitBranch: string;
  /** Lakebase branch info for callers that need uid / state. */
  lakebase: LakebaseBranchInfo;
}

/**
 * Cut a long-running tier off another tier. Returns once both the
 * Lakebase branch and the git branch are pushed and ready.
 *
 * Throws if Lakebase branch creation fails. The git side uses
 * `cp.execSync` with `stdio: 'pipe'` so substrate consumers can capture
 * output if needed; failures propagate as exceptions.
 */
export async function createLongRunningBranch(
  args: CreateLongRunningBranchArgs,
): Promise<CreateLongRunningBranchResult> {
  // Lakebase side: forks from the project's current branch per the
  // convention (no explicit parent). At suite-bootstrap time the
  // project's .env doesn't yet point at any tier, so substrate's
  // resolveCreateBranchParent falls through to the project default,
  // which IS the parent the architect wants for the first tier they
  // cut (e.g. staging forked from production).
  const created = await createLakebaseBranch({
    instance: args.projectId,
    branch: args.name,
    // Long-running tiers (staging, uat, perf, ...) are permanent by
    // definition; without this they'd inherit Lakebase's default
    // expiry and silently disappear.
    noExpiry: true,
  });

  // Git side: build the new tier off `forkFromBranch` on the remote.
  const opts = { cwd: args.workTreeDir, stdio: "pipe" as const };
  cp.execSync(`git fetch origin ${args.forkFromBranch}`, opts);
  cp.execSync(`git checkout ${args.forkFromBranch}`, opts);
  cp.execSync(`git pull --ff-only origin ${args.forkFromBranch}`, opts);
  cp.execSync(`git branch -f ${args.name} ${args.forkFromBranch}`, opts);
  cp.execSync(`git push -u origin ${args.name}`, opts);
  // Leave the local working tree on the new tier so the caller's
  // subsequent operations pick up the right parent.
  cp.execSync(`git checkout ${args.name}`, opts);

  return {
    lakebaseBranchName: created.name ?? `projects/${args.projectId}/branches/${args.name}`,
    gitBranch: args.name,
    lakebase: created,
  };
}
