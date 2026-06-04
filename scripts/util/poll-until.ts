// Generic polling primitive for test runner orchestration and any
// other caller that needs to wait on an asynchronous job.
//
// The three existing kit pollers (scm-wait-ci, scm-merge wait-migrate,
// branch-create waitForBranchReady) all share the same shape: probe a
// remote state, sleep, repeat until a terminal condition or a timeout.
// `pollUntil` factors out that shape so test orchestrators do not have
// to hand-roll a fourth copy.
//
// Why this exists in /util instead of /lakebase: it is substrate. No
// knowledge of GitHub workflow runs, Lakebase branch states, PR
// statuses, etc. The caller's probe encodes "done" however it wants.
//
// Design notes:
//   * The probe returns a discriminated `{ done: true, value }` or
//     `{ done: false }`. Callers that hit an irrecoverable condition
//     mid-probe (e.g. "PR vanished from GitHub") throw from inside the
//     probe; the throw propagates out of pollUntil unchanged.
//   * pollUntil itself does NOT throw on timeout. It returns
//     `{ outcome: 'timeout', polls, elapsedMs }` so test orchestrators
//     can assert timeout behavior without try/catch and can decide
//     whether timeout is fatal vs. advisory (the wait-migrate path
//     treats it as advisory; wait-ci treats it as fatal).
//   * `onPoll` fires after every probe with the result, the poll
//     index (1-based), and elapsed milliseconds. The test orchestrator
//     uses this to surface "still pending after Xs" lines so a 30
//     minute wait does not look frozen.
//   * `now` and `sleep` are injectable so unit tests can drive the
//     loop without real wall-clock waits.

import { delay } from "./delay.js";

export interface PollProbeDone<T> {
  done: true;
  value: T;
}
export interface PollProbePending {
  done: false;
}
export type PollProbeResult<T> = PollProbeDone<T> | PollProbePending;

export interface PollUntilArgs<T> {
  /**
   * The probe function. Returns `{ done: true, value }` to terminate
   * the loop with success, or `{ done: false }` to keep polling. Throw
   * from inside the probe for irrecoverable conditions; the throw
   * propagates out of pollUntil.
   */
  probe: (
    ctx: { pollIndex: number; elapsedMs: number },
  ) => Promise<PollProbeResult<T>>;
  /** Total budget for the loop, milliseconds. */
  timeoutMs: number;
  /** Interval between probes, milliseconds. */
  intervalMs: number;
  /**
   * Optional label embedded in the default `onPoll` log line. Has no
   * effect when `onPoll` is supplied.
   */
  label?: string;
  /**
   * Fires after every probe. The poll index is 1-based; elapsedMs is
   * since the loop started, not since the last probe. The default is a
   * no-op so silent polling stays silent unless the caller opts in.
   */
  onPoll?: (info: {
    pollIndex: number;
    elapsedMs: number;
    result: PollProbeResult<T>;
  }) => void;
  /** Inject `now` for tests. Default: `() => new Date()`. */
  now?: () => Date;
  /** Inject sleep for tests. Default: the shared `delay` util. */
  sleep?: (ms: number) => Promise<void>;
}

export interface PollUntilDoneResult<T> {
  outcome: "done";
  value: T;
  polls: number;
  elapsedMs: number;
}
export interface PollUntilTimeoutResult {
  outcome: "timeout";
  polls: number;
  elapsedMs: number;
}
export type PollUntilResult<T> = PollUntilDoneResult<T> | PollUntilTimeoutResult;

export async function pollUntil<T>(
  args: PollUntilArgs<T>,
): Promise<PollUntilResult<T>> {
  const now = args.now ?? (() => new Date());
  const sleep = args.sleep ?? delay;
  const startedAt = now().getTime();
  let polls = 0;

  while (true) {
    const elapsedMs = now().getTime() - startedAt;
    if (elapsedMs >= args.timeoutMs && polls > 0) {
      return { outcome: "timeout", polls, elapsedMs };
    }

    polls += 1;
    const result = await args.probe({ pollIndex: polls, elapsedMs });
    const afterProbeElapsed = now().getTime() - startedAt;

    if (args.onPoll) {
      args.onPoll({ pollIndex: polls, elapsedMs: afterProbeElapsed, result });
    } else if (args.label && !result.done) {
      // Default heartbeat so a long poll loop does not look frozen.
      // Only fires on pending probes so success/exit lines are not
      // double-logged with the caller's own success message.
      const seconds = Math.round(afterProbeElapsed / 1000);
      // eslint-disable-next-line no-console
      console.log(
        `[${args.label}] still pending after ${seconds}s (poll ${polls})`,
      );
    }

    if (result.done) {
      return {
        outcome: "done",
        value: result.value,
        polls,
        elapsedMs: afterProbeElapsed,
      };
    }

    if (afterProbeElapsed >= args.timeoutMs) {
      return { outcome: "timeout", polls, elapsedMs: afterProbeElapsed };
    }
    await sleep(args.intervalMs);
  }
}

/**
 * Convenience wrapper for the common case where the probe returns
 * `T | undefined` (undefined = keep polling). Defined values count as
 * done. Use this when the probe naturally returns optional data and
 * "defined" already means "ready" (e.g. branch lookups, workflow run
 * lookups).
 */
export async function pollUntilDefined<T>(
  probe: (ctx: { pollIndex: number; elapsedMs: number }) => Promise<T | undefined>,
  opts: Omit<PollUntilArgs<T>, "probe">,
): Promise<PollUntilResult<T>> {
  return pollUntil<T>({
    ...opts,
    probe: async (ctx) => {
      const value = await probe(ctx);
      return value === undefined ? { done: false } : { done: true, value };
    },
  });
}
