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
      | "migrate-timeout"
      | "migrate-auth",
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
   * Whether a migrate-poll TIMEOUT (the downstream run never completed within
   * the budget, or no matching run ever appeared) is fatal. Default: true,
   * the standalone "merge and confirm migrations" contract. Set false for
   * fire-and-confirm callers (the TDD orchestrator's promote/merge step) where
   * the GitHub merge + local fast-forward have ALREADY succeeded and the state
   * is already `merged`: a slow/absent downstream-migrate run should then
   * surface as a warning + `migrate.timedOut`, not hang then fail the whole
   * drive 30 minutes in. A migrate run that completes with a FAILURE
   * conclusion is still fatal regardless of this flag, that is a real
   * migration failure, not a wait timeout.
   */
  migrateTimeoutFatal?: boolean;
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
  /**
   * Interim mitigation for the short-lived-CI-token failure (FEIP-8020): a
   * migrate-AUTH precondition run BEFORE the merge. The downstream migrate
   * applies the parent's migrations with a Databricks credential; when that
   * credential is unusable the migrate fails and git promotes without the schema
   * (a partial promotion). This probe verifies migrations CAN be applied (the
   * local credential is usable, so the local-migrate fallback below is viable)
   * before merging, so an unusable credential fails fast rather than merging into
   * a divergence. Returns {ok:false, detail} to refuse the merge (migrate-auth).
   * Only runs when waitMigrate is on. Injected in tests; the CLI wires it to a
   * local `databricks current-user me` check.
   */
  verifyMigrateAuth?: () => Promise<{ ok: boolean; detail?: string }>;
  /**
   * Interim mitigation for FEIP-8020: apply the parent-tier migrations LOCALLY
   * (with a freshly-minted token) when the downstream migrate does NOT confirm
   * (a FAILED conclusion, or a fatal timeout). On success the promote's schema
   * step is satisfied locally, so git and Lakebase schema do not diverge; on
   * failure the original migrate error is thrown with the fallback detail
   * appended. Injected in tests; the CLI wires it to
   * `lakebase-schema-migrate apply --instance <i> --branch <parent>` (HEAD is
   * already on the parent branch after the merge).
   */
  localMigrateFallback?: () => Promise<{ ok: boolean; detail?: string }>;
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
    /** True iff the poll budget elapsed without a completed run AND the caller
     *  asked for a non-fatal timeout (migrateTimeoutFatal=false). The merge has
     *  already landed; this records that migration confirmation was not observed. */
    timedOut?: boolean;
    /** True iff the migrate-auth precondition ran and passed (FEIP-8020). */
    authVerified?: boolean;
    /** True iff the downstream migrate did not confirm and the local-migrate
     *  fallback applied the parent migrations locally instead (FEIP-8020). */
    appliedLocally?: boolean;
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

/**
 * Preferred predicate: match the downstream run by the exact merge commit SHA.
 *
 * The merge API returns the SHA it created on the base branch; the `push`
 * workflow run that GitHub fires on that base runs against that same SHA
 * (`head_sha`). Matching on it is clock-independent, so it does NOT
 * false-negative when local post-merge bookkeeping (checkout, fetch,
 * fast-forward, branch delete) pushes our `mergedAt` clock reading seconds to
 * tens of seconds past the moment GitHub recorded the merge, the exact skew
 * that made the timestamp window drop the real run and burn the whole budget
 * on "(no matching run)". Falls back to the timestamp window only when the
 * merge SHA is unavailable.
 */
function shaMigratePredicate(
  mergeCommitSha: string,
): (run: WorkflowRunSummary, mergedAt: Date) => boolean {
  return (run) => {
    if (run.event && run.event !== "push") return false;
    return !!run.headSha && run.headSha === mergeCommitSha;
  };
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

  // ─── Interim mitigation (FEIP-8020): migrate-auth precondition ───
  // The downstream migrate applies the parent's migrations with a Databricks
  // credential; when that credential is unusable the migrate fails and git
  // promotes WITHOUT the schema (a partial promotion, git ahead of Lakebase).
  // Verify migrations CAN be applied (the local credential is usable, so the
  // local-migrate fallback is viable) BEFORE merging, so an unusable credential
  // fails fast rather than merging into a divergence. Only when waiting on the
  // migrate; a "merge and walk away" caller (waitMigrate=false) is not promising
  // a schema outcome, so the precondition does not apply.
  const wantMigrate = args.waitMigrate !== false;
  let authVerified = false;
  if (wantMigrate && args.verifyMigrateAuth) {
    const probe = await args.verifyMigrateAuth();
    if (!probe.ok) {
      throw new ScmMergeError(
        `Migrate-auth precondition failed: ${probe.detail ?? "the Databricks credential is not usable"}. ` +
          `Refusing to merge: the downstream migrate would promote git without applying the schema. ` +
          `Refresh your credential (databricks auth login), then re-run.`,
        "migrate-auth",
      );
    }
    authVerified = true;
  }

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
    // Prefer clock-independent SHA matching (the merge commit the API just
    // reported), falling back to the timestamp window only when the SHA is
    // unavailable. A caller-supplied predicate (tests) always wins.
    const predicate =
      args.migrateRunPredicate ??
      (paired.mergeCommitSha
        ? shaMigratePredicate(paired.mergeCommitSha)
        : defaultMigratePredicate);

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
    // Interim mitigation (FEIP-8020): when the downstream migrate does not
    // confirm (a FAILED conclusion, or a fatal timeout), apply the parent
    // migrations LOCALLY with a freshly-minted token so git and Lakebase schema
    // do not diverge (a partial promotion). Returns true iff it applied; false
    // (no fallback provided, or the fallback itself failed) leaves the caller to
    // throw the original migrate error.
    const applyLocalFallback = async (reason: string): Promise<boolean> => {
      if (!args.localMigrateFallback) return false;
      const r = await args.localMigrateFallback();
      if (!r.ok) {
        warnings.push(
          `Local-migrate fallback FAILED after ${reason}: ${r.detail ?? "unknown error"}. ` +
            `git promoted but the parent schema is NOT applied (partial promotion); apply it manually.`,
        );
        return false;
      }
      next = { ...next, migrate_completed_at: nowFn().toISOString() };
      writeWorkflowState(args.projectDir, next);
      migrate = { ...(migrate ?? { waited: true, polls }), appliedLocally: true, authVerified };
      warnings.push(
        `Downstream migrate did not confirm (${reason}); applied the parent migrations LOCALLY instead. ` +
          `git and Lakebase schema are in sync${r.detail ? ` (${r.detail})` : ""}.`,
      );
      return true;
    };

    if (matched) {
      const runUrl = workflowRunUrl(ownerRepo, matched);
      const conclusion = (matched.conclusion ?? "").toLowerCase();
      migrate = {
        waited: true,
        runUrl,
        conclusion,
        polls,
        authVerified,
      };
      if (conclusion === "success") {
        next = {
          ...next,
          migrate_run_url: runUrl,
          migrate_completed_at: nowFn().toISOString(),
        };
        writeWorkflowState(args.projectDir, next);
      } else {
        const applied = await applyLocalFallback(`the downstream migrate finished conclusion=${conclusion} (${runUrl})`);
        if (!applied) {
          throw new ScmMergeError(
            `Downstream migrate workflow finished with conclusion=${conclusion}. Run ${runUrl} for details.`,
            "migrate-failed",
          );
        }
      }
    } else {
      const budgetSec = Math.round(
        (args.migrateTimeoutMs ?? DEFAULT_MIGRATE_TIMEOUT_MS) / 1000,
      );
      const lastStatus = lastSeen?.status ?? "(no matching run)";
      const timeoutFatal = args.migrateTimeoutFatal !== false;
      if (timeoutFatal) {
        migrate = { waited: true, polls, authVerified };
        const applied = await applyLocalFallback(
          `the downstream migrate did not complete within ${budgetSec}s (last seen: ${lastStatus})`,
        );
        if (!applied) {
          throw new ScmMergeError(
            `Timed out after ${budgetSec}s waiting for the downstream migrate workflow on "${current.parent_branch}". Last seen status: ${lastStatus}.`,
            "migrate-timeout",
          );
        }
      } else {
        // Non-fatal: the GitHub merge + local fast-forward already landed and the
        // state is already `merged`. Surface the unconfirmed downstream migrate as
        // a warning + migrate.timedOut so the caller (e.g. the TDD drive) reaches
        // `done` instead of failing 30 minutes in on a slow/absent migrate run.
        migrate = { waited: true, polls, timedOut: true, authVerified };
        warnings.push(
          `Downstream migrate workflow on "${current.parent_branch}" was not confirmed within ${budgetSec}s ` +
            `(last seen status: ${lastStatus}). The PR merged and your local ${current.parent_branch} is synced; ` +
            `the migrate run may still be pending or running. Confirm it later via the Actions tab or re-run with --wait-migrate.`,
        );
      }
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
