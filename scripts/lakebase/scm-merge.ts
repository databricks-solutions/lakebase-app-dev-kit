// SCM workflow merge (phase B+): ci-green -> merged.
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

import {
  listWorkflowRuns,
  mergePairedPullRequest,
  type WorkflowRunSummary,
} from "../github/pr.js";
import { getOwnerRepo } from "../git/remote.js";
import { pollUntil } from "../util/poll-until.js";
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
      | "merge-failed"
      | "migrate-failed"
      | "migrate-timeout",
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
  /**
   * Wait for the downstream migrate workflow on parent_branch to complete
   * before returning. Default: true. Set false for "merge and walk away"
   * flows where the user does not need migration confirmation.
   */
  waitMigrate?: boolean;
  /** Total budget for the migrate poll loop, milliseconds. Default: 30 minutes. */
  migrateTimeoutMs?: number;
  /** Interval between migrate polls, milliseconds. Default: 30 seconds. */
  migratePollMs?: number;
  /**
   * Predicate identifying the downstream migrate workflow run among
   * recent runs on parent_branch. Default: any push-event run on
   * parent_branch newer than the merge timestamp. Tests can pass a
   * tighter predicate (e.g. filter by workflow name).
   */
  migrateRunPredicate?: (run: WorkflowRunSummary, mergedAt: Date) => boolean;
  /**
   * Override the workflow-runs fetcher (mostly for tests). The default
   * uses the substrate's listWorkflowRuns.
   */
  fetchRuns?: (ownerRepo: string, limit?: number) => Promise<WorkflowRunSummary[]>;
  /** Override the sleep step (for tests). */
  sleep?: (ms: number) => Promise<void>;
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
  /** Information about the downstream migrate workflow when --wait-migrate was on. */
  migrate?: {
    waited: boolean;
    runUrl?: string;
    conclusion?: string;
    polls: number;
  };
  warnings: string[];
}

const DEFAULT_MIGRATE_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_MIGRATE_POLL_MS = 30 * 1000;

function defaultMigratePredicate(
  run: WorkflowRunSummary,
  mergedAt: Date,
): boolean {
  if (!run.createdAt) return false;
  const created = Date.parse(run.createdAt);
  if (!Number.isFinite(created)) return false;
  // Workflow runs on the parent branch triggered by the merge commit are
  // ALWAYS push-event runs (gh's merge POSTs to base, which fires
  // `on: push`). Filtering out non-push runs avoids matching
  // workflow_dispatch / schedule runs that happen to land in the window.
  if (run.event && run.event !== "push") return false;
  // Allow a small grace window in case the merge endpoint returns
  // before the workflow_run record is fully created (observed lag up
  // to a few seconds).
  return created >= mergedAt.getTime() - 5_000;
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
        // The PR merged SERVER-SIDE (into origin/<parent>), so the LOCAL <parent>
        // ref is still at its pre-merge commit. Fast-forward it to the merged
        // commit so the working tree carries what was merged (the feature's
        // files, incl. its migration) and matches the parent's paired DB, which
        // the downstream migrate just advanced. Without this, a post-merge
        // `run-tests.sh` / `run-dev.sh` on <parent> runs STALE code against an
        // already-migrated DB and alembic fails "Can't locate revision <id>".
        // Best-effort: the merge already succeeded remotely, so a local sync
        // failure is a warning (a human runs `git pull --ff-only`), not a throw.
        try {
          await exec(`git fetch origin ${shellEscape(switchTo)}`, {
            cwd: args.projectDir,
            timeout: 30_000,
          });
          await exec(`git merge --ff-only ${shellEscape(`origin/${switchTo}`)}`, {
            cwd: args.projectDir,
            timeout: 10_000,
          });
        } catch (err) {
          warnings.push(
            `local fast-forward of ${switchTo} to origin/${switchTo} failed: ` +
              `${err instanceof Error ? err.message : String(err)}. The PR merged remotely; ` +
              `your local ${switchTo} may be stale, run \`git pull --ff-only\`.`,
          );
        }
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

  const nowFn = args.now ?? (() => new Date());
  const mergedAt = nowFn();
  let next: ScmWorkflowState = {
    ...current,
    state: "merged",
    merged_at: mergedAt.toISOString(),
  };
  writeWorkflowState(args.projectDir, next);

  // ─── Optional: wait for the downstream migrate workflow ───────
  // After a feature PR merges, the kit's templated merge.yml fires on
  // the parent branch (typically staging or main) and applies the
  // feature's migrations to that branch's Lakebase pair. When the
  // parent is the production tier, that pair IS prod. Waiting here
  // turns "PR merged" into "migrations applied" as the workflow's
  // observable success condition.
  let migrate: MergeResult["migrate"];
  const waitMigrate = args.waitMigrate !== false;
  if (waitMigrate) {
    const timeoutMs = args.migrateTimeoutMs ?? DEFAULT_MIGRATE_TIMEOUT_MS;
    const pollMs = args.migratePollMs ?? DEFAULT_MIGRATE_POLL_MS;
    const fetchRuns = args.fetchRuns ?? listWorkflowRuns;
    const predicate = args.migrateRunPredicate ?? defaultMigratePredicate;

    // The poll deadline is measured from mergedAt (the moment GitHub
    // recorded the merge), not from the start of the probe, so the
    // budget reflects "how long after merge can the downstream
    // workflow take." Translate that into a timeoutMs relative to
    // pollUntil's startedAt by shrinking the budget by however long
    // we've already burned between mergedAt and now.
    const elapsedSinceMerge = nowFn().getTime() - mergedAt.getTime();
    const remainingTimeoutMs = Math.max(0, timeoutMs - elapsedSinceMerge);

    let polls = 0;
    let matched: WorkflowRunSummary | undefined;
    let lastSeen: WorkflowRunSummary | undefined;
    try {
      const result = await pollUntil<WorkflowRunSummary>({
        timeoutMs: remainingTimeoutMs,
        intervalMs: pollMs,
        now: nowFn,
        sleep: args.sleep,
        probe: async () => {
          const runs = await fetchRuns(ownerRepo, 20);
          const candidates = runs
            .filter((r) => r.branch === current.parent_branch)
            .filter((r) => predicate(r, mergedAt));
          if (candidates.length === 0) {
            return { done: false };
          }
          // Newest matching run wins.
          candidates.sort(
            (a, b) =>
              Date.parse(b.createdAt ?? "0") - Date.parse(a.createdAt ?? "0"),
          );
          lastSeen = candidates[0];
          const status = (lastSeen.status ?? "").toLowerCase();
          return status === "completed"
            ? { done: true, value: lastSeen }
            : { done: false };
        },
      });
      polls = result.polls;
      if (result.outcome === "done") {
        matched = result.value;
      }
    } catch (err) {
      warnings.push(
        `Downstream migrate poll errored: ${err instanceof Error ? err.message : String(err)}. Treating as advisory.`,
      );
    }
    if (matched) {
      const runUrl = workflowRunUrl(ownerRepo, matched);
      const conclusion = (matched.conclusion ?? "").toLowerCase();
      migrate = {
        waited: true,
        runUrl,
        conclusion,
        polls,
      };
      if (conclusion === "success") {
        next = {
          ...next,
          migrate_run_url: runUrl,
          migrate_completed_at: nowFn().toISOString(),
        };
        writeWorkflowState(args.projectDir, next);
      } else {
        throw new ScmMergeError(
          `Downstream migrate workflow finished with conclusion=${conclusion}. Run ${runUrl} for details.`,
          "migrate-failed",
        );
      }
    } else {
      migrate = { waited: true, polls };
      throw new ScmMergeError(
        `Timed out after ${Math.round((args.migrateTimeoutMs ?? DEFAULT_MIGRATE_TIMEOUT_MS) / 1000)}s waiting for the downstream migrate workflow on "${current.parent_branch}". Last seen status: ${lastSeen?.status ?? "(no matching run)"}.`,
        "migrate-timeout",
      );
    }
  } else {
    migrate = { waited: false, polls: 0 };
  }

  return {
    state: next,
    paired,
    localBranchDeleted,
    headAfter,
    migrate,
    warnings,
  };
}

function workflowRunUrl(ownerRepo: string, run: WorkflowRunSummary): string {
  return `https://github.com/${ownerRepo}/actions/runs/${run.id}`;
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
