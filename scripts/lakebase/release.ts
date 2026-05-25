/**
 * Release a `from` branch into a long-running `to` tier.
 *
 * In the release-workflows convention (see
 * skills/lakebase-release-workflows/SKILL.md), a release is any merge
 * that lands in a long-running tier. The four-phase shape (cut ci-pr
 * branch / regression test / cut backup / migrate) runs at every
 * adjacent-tier release; only the from/to labels change. Phases 1-2
 * happen automatically when the PR opens (pr.yml); phases 3-4 happen
 * on PR merge (merge.yml on the `to` push).
 *
 * This primitive is the orchestrator for phases 3-4: open + merge the
 * PR + wait for merge.yml. Phases 1-2 are gated by GitHub branch
 * protection (must be green before merge is allowed). Phases 3-4 land
 * the migration on `to`.
 *
 * Same primitive serves every adjacent-tier release:
 *   - `feature/X → staging`: from=feature/X, to=staging
 *   - `dev → staging` (3-tier shop): from=dev, to=staging
 *   - `staging → main`: from=staging, to=main
 */

import {
  createPullRequest,
  mergePullRequest,
  listWorkflowRuns,
  WorkflowRunSummary,
} from "../github/pr.js";

export interface ReleaseArgs {
  /** Source branch. Can be a working branch (feature/test/uat/perf) or
   *  a long-running tier. */
  from: string;
  /** Target tier. MUST be a long-running tier (the release primitive
   *  doesn't make sense without merge.yml triggering on push). */
  to: string;
  /** GitHub owner/repo (e.g. "kevin-hartman/ecom-mpk123"). */
  ownerRepo: string;
  /** Human-readable label appended to the PR title for traceability.
   *  Example: "post-scenario-7" → "Release: staging → main (post-scenario-7)". */
  releaseLabel: string;
  /** Bound the wait for merge.yml. Default: 10 minutes (comfortable
   *  headroom for cut-backup + migrate). */
  timeoutMs?: number;
  /** Bound the wait for pr.yml (the CI gate) to complete before
   *  merging. Default: 10 minutes. */
  prGateTimeoutMs?: number;
  /** How often to poll listWorkflowRuns while waiting. Default: 15s. */
  pollIntervalMs?: number;
  /** Workflow file basename for the merge gate (Phases 3-4), matched
   *  against the run's `name` field. Default: 'merge.yml'. */
  workflowFile?: string;
  /** Workflow file basename for the PR gate (Phases 1-2), matched
   *  against the run's `name` field. Default: 'pr.yml'. */
  prWorkflowFile?: string;
  /** When true (default), `release()` itself waits for pr.yml to
   *  complete with conclusion=success before merging. This is the
   *  belt-and-suspenders enforcement of the CI gate - it works even
   *  in repos without branch protection (free-tier private repos
   *  cannot configure required status checks, so the GitHub-side gate
   *  silently allows any merge there). Set false ONLY if the caller
   *  is enforcing the gate some other way. */
  requireCiGate?: boolean;
}

export interface ReleaseResult {
  /** PR number used for the from→to release. */
  prNumber: number;
  /** Workflow run that fired on the `to` push. */
  workflowRun: WorkflowRunSummary;
  /** The workflow run's conclusion (expected: 'success'). Convenience
   *  alias for `workflowRun.conclusion`. */
  conclusion: string;
}

const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_POLL_INTERVAL_MS = 15_000;

function matchesWorkflowFile(run: { name: string }, workflowFile: string): boolean {
  const stem = workflowFile.replace(/\.ya?ml$/i, "");
  return (
    run.name === stem ||
    run.name.toLowerCase() === stem.toLowerCase() ||
    run.name.includes(stem)
  );
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Open + merge a from→to PR and wait for the workflow run that fires
 * on the `to` push to complete. Returns the run + conclusion so the
 * caller can assert success.
 *
 * The caller is responsible for:
 *   - Verifying the snapshot lifecycle (cut on merge, cleaned on green).
 *   - Verifying schema effects on the `to` Lakebase branch.
 * Both verifications are test-suite-specific and live with the consumer.
 */
export async function release(args: ReleaseArgs): Promise<ReleaseResult> {
  const workflowFile = args.workflowFile ?? "merge.yml";
  const prWorkflowFile = args.prWorkflowFile ?? "pr.yml";
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const prGateTimeoutMs = args.prGateTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = args.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const requireCiGate = args.requireCiGate ?? true;

  // Capture the latest runs BEFORE opening the PR so the waits can
  // filter to "runs created after this point" - protects against
  // picking up a pre-existing run from a previous release attempt.
  const before = await listWorkflowRuns(args.ownerRepo, 25);
  const mergeBaselineRunId =
    before.find((r) => matchesWorkflowFile(r, workflowFile))?.id ?? 0;
  const prBaselineRunId =
    before.find((r) => matchesWorkflowFile(r, prWorkflowFile))?.id ?? 0;

  // Phase setup: open the from→to PR.
  const url = await createPullRequest({
    ownerRepo: args.ownerRepo,
    headBranch: args.from,
    baseBranch: args.to,
    title: `Release: ${args.from} → ${args.to} (${args.releaseLabel})`,
    body:
      `Automated release: promote \`${args.from}\` into \`${args.to}\`. ` +
      `Triggers ${workflowFile} on the ${args.to} push, which runs the ` +
      `substrate-routed lakebase-cut-backup + lakebase-migrate apply ` +
      `against the ${args.to} Lakebase branch.`,
  });
  const match = url.match(/\/pull\/(\d+)/);
  if (!match) {
    throw new Error(`Could not extract PR number from: ${url}`);
  }
  const prNumber = parseInt(match[1], 10);

  // Phases 1-2 (ci-pr branch + regression test) run automatically on
  // PR open via pr.yml. We wait for that run to complete with
  // conclusion=success BEFORE merging.
  //
  // Why we don't trust GitHub branch protection alone: required status
  // checks are a paid feature on private repos. Free-tier private repos
  // (including every test scaffold this primitive creates) cannot
  // configure them - the merge button is unconditional. Without this
  // explicit wait, mergePullRequest fires the instant the PR opens and
  // code lands on the target tier even when pr.yml would have rejected
  // the changes. That breaks the entire promotion methodology.
  //
  // In a properly-configured production repo with branch protection
  // configured, this wait is redundant-but-cheap belt-and-suspenders;
  // mergePullRequest would also be blocked by GitHub until pr.yml
  // passes. Set requireCiGate: false to skip this wait when the caller
  // is enforcing the gate some other way.
  if (requireCiGate) {
    const prDeadline = Date.now() + prGateTimeoutMs;
    let prGatePassed = false;
    while (Date.now() < prDeadline && !prGatePassed) {
      try {
        const runs = await listWorkflowRuns(args.ownerRepo, 25);
        const candidate = runs
          .filter((r) => matchesWorkflowFile(r, prWorkflowFile))
          .filter((r) => r.id > prBaselineRunId)
          .filter((r) => r.event === "pull_request")
          .filter((r) => r.branch === args.from)[0];
        if (candidate && candidate.status === "completed") {
          if (candidate.conclusion !== "success") {
            throw new Error(
              `Release ${args.from} → ${args.to}: PR #${prNumber} ${prWorkflowFile} ` +
                `concluded with '${candidate.conclusion}'. Refusing to merge.`,
            );
          }
          prGatePassed = true;
          break;
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("Refusing to merge")) {
          throw e;
        }
        // Transient API errors during poll - keep waiting.
      }
      await sleep(pollIntervalMs);
    }
    if (!prGatePassed) {
      throw new Error(
        `Release ${args.from} → ${args.to}: ${prWorkflowFile} did not complete ` +
          `on PR #${prNumber} within ${prGateTimeoutMs / 1000}s. Refusing to merge.`,
      );
    }
  }

  // CI gate passed. Now safe to merge.
  await mergePullRequest({
    ownerRepo: args.ownerRepo,
    pullNumber: prNumber,
    method: "merge",
    deleteRemoteBranch: false, // long-running source tiers are persistent
  });

  // Phases 3-4 run via merge.yml on the `to` push. Wait for them.
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const runs = await listWorkflowRuns(args.ownerRepo, 25);
      const matching = runs.filter((r) => matchesWorkflowFile(r, workflowFile));
      for (const run of matching) {
        if (run.id <= mergeBaselineRunId) continue;
        if (run.branch !== args.to) continue;
        if (run.event !== "push") continue;
        if (run.status === "completed") {
          return {
            prNumber,
            workflowRun: run,
            conclusion: run.conclusion,
          };
        }
        break;
      }
    } catch {
      // Transient API errors during poll - log shape kept minimal.
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(
    `Release ${args.from} → ${args.to}: ${workflowFile} did not complete on '${args.to}' push within ${timeoutMs / 1000}s.`,
  );
}
