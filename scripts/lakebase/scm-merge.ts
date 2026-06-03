// SCM workflow merge (FEIP-7458 phase B+): ci-green -> merged.
//
// Merges the PR via mergePairedPullRequest (handles the GitHub merge +
// remote branch delete + Lakebase feature branch delete), then switches
// the local HEAD to the parent branch and deletes the local feature
// branch. Writes the merged_at timestamp + flips state to merged.
//
// The substrate already covers the GitHub + Lakebase side. This helper
// adds the workflow concerns: state-file transition, local-branch
// cleanup, HEAD restoration. Phase C will add a downstream-CI wait
// (merge.yml applying migrations to production) once the kit emits a
// stable surface for that signal.

import { mergePairedPullRequest } from "../github/pr.js";
import { getOwnerRepo } from "../git/remote.js";
import { exec } from "../util/exec.js";
import { getCurrentBranch } from "../git/inspect.js";
import {
  readWorkflowState,
  writeWorkflowState,
  type ScmWorkflowState,
} from "./scm-workflow-state.js";

export class ScmMergeError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "no-state-file"
      | "bad-precondition"
      | "no-github-remote"
      | "no-pr-url"
      | "bad-pr-url"
      | "merge-failed",
  ) {
    super(message);
    this.name = "ScmMergeError";
  }
}

export interface MergeArgs {
  projectDir: string;
  /** Merge method. Default: "squash" (matches the workflow expectation of a single rolled-up commit on the parent). */
  method?: "merge" | "squash" | "rebase";
  /** Override instance from workflow state. */
  instance?: string;
  /** Switch HEAD to this branch after merge. Default: workflow.parent_branch. */
  switchTo?: string;
  /** Skip the local branch + HEAD switch (useful for CI-only merges). */
  skipLocalCleanup?: boolean;
  /** Clock injection for testability. */
  now?: () => Date;
}

export interface MergeResult {
  state: ScmWorkflowState;
  /** Result from the underlying paired-merge primitive. */
  paired: Awaited<ReturnType<typeof mergePairedPullRequest>>;
  /** True iff the local feature branch was deleted. */
  localBranchDeleted: boolean;
  /** Branch HEAD points at after the merge step (parent_branch on success). */
  headAfter: string;
  warnings: string[];
}

export async function mergeFeature(args: MergeArgs): Promise<MergeResult> {
  const current = readWorkflowState(args.projectDir);
  if (!current) {
    throw new ScmMergeError(
      "No SCM workflow state. wait-ci first.",
      "no-state-file",
    );
  }
  if (current.state !== "ci-green") {
    throw new ScmMergeError(
      `merge refuses state "${current.state}". Allowed predecessor: ci-green.`,
      "bad-precondition",
    );
  }
  if (!current.pr_url) {
    throw new ScmMergeError(
      "ci-green row is missing pr_url; cannot resolve the PR to merge.",
      "no-pr-url",
    );
  }
  if (!current.branch || !current.parent_branch) {
    throw new ScmMergeError(
      "ci-green row missing branch / parent_branch; refusing to merge.",
      "bad-precondition",
    );
  }

  const ownerRepo = await getOwnerRepo(args.projectDir);
  if (!ownerRepo) {
    throw new ScmMergeError(
      "No GitHub remote found at origin.",
      "no-github-remote",
    );
  }

  const pullNumber = extractPullNumber(current.pr_url);
  if (!pullNumber) {
    throw new ScmMergeError(
      `Could not extract PR number from URL: ${current.pr_url}`,
      "bad-pr-url",
    );
  }

  const instance = args.instance ?? current.project_id;
  let paired: Awaited<ReturnType<typeof mergePairedPullRequest>>;
  try {
    paired = await mergePairedPullRequest({
      ownerRepo,
      pullNumber,
      lakebaseInstance: instance,
      method: args.method ?? "squash",
    });
  } catch (err) {
    throw new ScmMergeError(
      `mergePairedPullRequest failed: ${err instanceof Error ? err.message : String(err)}`,
      "merge-failed",
    );
  }

  const warnings: string[] = [...paired.warnings];
  let localBranchDeleted = false;
  let headAfter = current.branch;
  if (!args.skipLocalCleanup) {
    const switchTo = args.switchTo ?? current.parent_branch;
    const head = await getCurrentBranch({ cwd: args.projectDir });
    if (head === current.branch) {
      try {
        await exec(`git checkout ${shellEscape(switchTo)}`, {
          cwd: args.projectDir,
          timeout: 10_000,
        });
        headAfter = switchTo;
      } catch (err) {
        warnings.push(
          `git checkout ${switchTo} failed: ${err instanceof Error ? err.message : String(err)}. Local branch was NOT deleted.`,
        );
      }
    } else {
      headAfter = head || current.branch;
    }
    if (headAfter !== current.branch) {
      try {
        await exec(
          `git branch -D ${shellEscape(current.branch)}`,
          { cwd: args.projectDir, timeout: 10_000 },
        );
        localBranchDeleted = true;
      } catch (err) {
        warnings.push(
          `git branch -D ${current.branch} failed: ${err instanceof Error ? err.message : String(err)}.`,
        );
      }
    }
  }

  const now = (args.now ?? (() => new Date()))();
  const next: ScmWorkflowState = {
    ...current,
    state: "merged",
    merged_at: now.toISOString(),
  };
  writeWorkflowState(args.projectDir, next);

  return {
    state: next,
    paired,
    localBranchDeleted,
    headAfter,
    warnings,
  };
}

/** Pull "123" out of "https://github.com/owner/repo/pull/123" (and similar). */
export function extractPullNumber(prUrl: string): number | undefined {
  const m = prUrl.match(/\/pull\/(\d+)(?:[\/?#].*)?$/);
  if (!m) return undefined;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : undefined;
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
