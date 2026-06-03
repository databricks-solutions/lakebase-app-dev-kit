// SCM workflow wait-ci (FEIP-7458 phase B+): pr-ready -> ci-green.
//
// Polls the PR's check-runs via getPullRequest until the aggregate
// ciStatus becomes "success" or "failure", up to a configurable
// timeout. On success, advances the workflow state to ci-green and
// records the run URL + green-at timestamp. On failure, surfaces the
// failed checks without advancing state (the user can re-push fixes
// and re-run the bin).

import { getPullRequest, type PullRequestInfo } from "../github/pr.js";
import { getOwnerRepo } from "../git/remote.js";
import { delay } from "../util/delay.js";
import {
  readWorkflowState,
  writeWorkflowState,
  type ScmWorkflowState,
} from "./scm-workflow-state.js";

export class ScmWaitCiError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "no-state-file"
      | "bad-precondition"
      | "no-github-remote"
      | "ci-failed"
      | "timeout"
      | "pr-not-found",
  ) {
    super(message);
    this.name = "ScmWaitCiError";
  }
}

export interface WaitCiArgs {
  projectDir: string;
  /** Total budget for the poll loop, milliseconds. Default: 30 minutes. */
  timeoutMs?: number;
  /** Interval between polls, milliseconds. Default: 30 seconds. */
  pollMs?: number;
  /** Clock injection for testability. */
  now?: () => Date;
  /**
   * Replace the underlying getPullRequest with a test double. The
   * default uses the real one. Internal/testing surface; the CLI does
   * not expose this flag.
   */
  fetchPr?: (
    ownerRepo: string,
    headBranch: string,
  ) => Promise<PullRequestInfo | undefined>;
  /**
   * Replace the sleep step so tests can run sub-second. Default:
   * the substrate's delay util.
   */
  sleep?: (ms: number) => Promise<void>;
}

export interface WaitCiResult {
  state: ScmWorkflowState;
  /** PR info captured at the moment CI went green. */
  pr: PullRequestInfo;
  /** Number of polls performed (>= 1). */
  polls: number;
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_POLL_MS = 30 * 1000;

export async function waitForCi(args: WaitCiArgs): Promise<WaitCiResult> {
  const current = readWorkflowState(args.projectDir);
  if (!current) {
    throw new ScmWaitCiError(
      "No SCM workflow state. Claim + prepare-pr first.",
      "no-state-file",
    );
  }
  if (current.state !== "pr-ready") {
    throw new ScmWaitCiError(
      `wait-ci refuses state "${current.state}". Allowed predecessor: pr-ready.`,
      "bad-precondition",
    );
  }
  if (!current.branch) {
    throw new ScmWaitCiError(
      "pr-ready row is missing branch; cannot resolve the PR.",
      "bad-precondition",
    );
  }
  const ownerRepo = await getOwnerRepo(args.projectDir);
  if (!ownerRepo) {
    throw new ScmWaitCiError(
      "No GitHub remote found at origin.",
      "no-github-remote",
    );
  }

  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollMs = args.pollMs ?? DEFAULT_POLL_MS;
  const fetchPr = args.fetchPr ?? getPullRequest;
  const sleep = args.sleep ?? delay;
  const now = args.now ?? (() => new Date());

  const startedAt = now().getTime();
  let polls = 0;
  let lastPr: PullRequestInfo | undefined;
  while (now().getTime() - startedAt < timeoutMs) {
    polls += 1;
    lastPr = await fetchPr(ownerRepo, current.branch);
    if (!lastPr) {
      throw new ScmWaitCiError(
        `No open PR found for head=${current.branch} on ${ownerRepo}. Did the PR get closed?`,
        "pr-not-found",
      );
    }
    if (lastPr.ciStatus === "success") {
      const runUrl = pickRunUrl(lastPr);
      const next: ScmWorkflowState = {
        ...current,
        state: "ci-green",
        ci_run_url: runUrl,
        ci_green_at: now().toISOString(),
      };
      writeWorkflowState(args.projectDir, next);
      return { state: next, pr: lastPr, polls };
    }
    if (lastPr.ciStatus === "failure") {
      const failed = lastPr.checks
        .filter((c) => /(FAILURE|TIMED_OUT|CANCELLED|ACTION_REQUIRED)/i.test(c.conclusion))
        .map((c) => `${c.name} (${c.conclusion})`);
      throw new ScmWaitCiError(
        `CI failed for PR ${lastPr.url}. Failed checks: ${failed.join(", ") || "(unknown)"}.`,
        "ci-failed",
      );
    }
    await sleep(pollMs);
  }
  throw new ScmWaitCiError(
    `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for CI on PR ${lastPr?.url ?? current.pr_url ?? "(unknown)"}. Last status: ${lastPr?.ciStatus ?? "(no poll completed)"}.`,
    "timeout",
  );
}

function pickRunUrl(pr: PullRequestInfo): string {
  const withUrl = pr.checks.find((c) => c.detailsUrl);
  return withUrl?.detailsUrl ?? pr.url;
}
