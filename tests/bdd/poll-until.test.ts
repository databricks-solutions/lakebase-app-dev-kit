// Unit tests for the generic pollUntil primitive.
//
// Drives the loop with a virtual clock + virtual sleep: `now()`
// returns a controlled mutable Date, and the injected `sleep` advances
// it by `ms`. This way the loop runs sub-second under vitest while
// still exercising the elapsed-ms math.

import { describe, it, expect, vi } from "vitest";
import {
  pollUntil,
  pollUntilDefined,
  type PollProbeResult,
} from "../../scripts/util/poll-until.js";

function virtualClock(startMs = 0) {
  let current = startMs;
  return {
    now: () => new Date(current),
    advance: (ms: number) => {
      current += ms;
    },
    get currentMs() {
      return current;
    },
  };
}

function virtualSleep(clock: ReturnType<typeof virtualClock>) {
  return async (ms: number) => {
    clock.advance(ms);
  };
}

describe("pollUntil", () => {
  it("resolves on the first probe when done is true immediately", async () => {
    const clock = virtualClock();
    const probe = vi.fn(async () =>
      ({ done: true, value: "hello" }) as PollProbeResult<string>,
    );
    const result = await pollUntil<string>({
      probe,
      timeoutMs: 10_000,
      intervalMs: 100,
      now: clock.now,
      sleep: virtualSleep(clock),
    });
    expect(result.outcome).toBe("done");
    if (result.outcome === "done") {
      expect(result.value).toBe("hello");
      expect(result.polls).toBe(1);
    }
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("polls until done flips, then returns the value + poll count", async () => {
    const clock = virtualClock();
    let polled = 0;
    const result = await pollUntil<number>({
      probe: async () => {
        polled += 1;
        return polled >= 3 ? { done: true, value: polled } : { done: false };
      },
      timeoutMs: 10_000,
      intervalMs: 50,
      now: clock.now,
      sleep: virtualSleep(clock),
    });
    expect(result.outcome).toBe("done");
    if (result.outcome === "done") {
      expect(result.value).toBe(3);
      expect(result.polls).toBe(3);
    }
    // 2 sleeps of 50ms each between the 3 probes.
    expect(clock.currentMs).toBe(100);
  });

  it("returns timeout when probes never report done", async () => {
    const clock = virtualClock();
    const probe = vi.fn(async () =>
      ({ done: false }) as PollProbeResult<unknown>,
    );
    const result = await pollUntil({
      probe,
      timeoutMs: 200,
      intervalMs: 100,
      now: clock.now,
      sleep: virtualSleep(clock),
    });
    expect(result.outcome).toBe("timeout");
    if (result.outcome === "timeout") {
      // 2 probes fit: t=0 probe -> sleep 100 -> probe at t=100 ->
      // sleep 100 -> elapsed=200 >= 200, exit.
      expect(result.polls).toBe(2);
      expect(result.elapsedMs).toBeGreaterThanOrEqual(200);
    }
  });

  it("propagates errors thrown from inside the probe", async () => {
    const clock = virtualClock();
    await expect(
      pollUntil({
        probe: async () => {
          throw new Error("probe blew up");
        },
        timeoutMs: 10_000,
        intervalMs: 100,
        now: clock.now,
        sleep: virtualSleep(clock),
      }),
    ).rejects.toThrow("probe blew up");
  });

  it("fires onPoll for each probe with index + elapsed + result", async () => {
    const clock = virtualClock();
    const events: Array<{ idx: number; elapsed: number; done: boolean }> = [];
    let polled = 0;
    await pollUntil<string>({
      probe: async () => {
        polled += 1;
        return polled === 2 ? { done: true, value: "ok" } : { done: false };
      },
      timeoutMs: 10_000,
      intervalMs: 25,
      onPoll: ({ pollIndex, elapsedMs, result }) => {
        events.push({ idx: pollIndex, elapsed: elapsedMs, done: result.done });
      },
      now: clock.now,
      sleep: virtualSleep(clock),
    });
    expect(events).toEqual([
      { idx: 1, elapsed: 0, done: false },
      { idx: 2, elapsed: 25, done: true },
    ]);
  });

  it("emits a default heartbeat log when label is set and onPoll is not", async () => {
    const clock = virtualClock();
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((msg: string) => {
      logs.push(msg);
    });
    try {
      let polled = 0;
      await pollUntil<string>({
        probe: async () => {
          polled += 1;
          return polled === 2 ? { done: true, value: "ok" } : { done: false };
        },
        timeoutMs: 10_000,
        intervalMs: 1000,
        label: "ci-runner",
        now: clock.now,
        sleep: virtualSleep(clock),
      });
    } finally {
      logSpy.mockRestore();
    }
    // Only the pending probe emits a heartbeat; the done probe should
    // not double-log alongside the caller's success message.
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/\[ci-runner\] still pending after 0s \(poll 1\)/);
  });
});

describe("pollUntilDefined", () => {
  it("treats undefined as pending and any defined value as done", async () => {
    const clock = virtualClock();
    const states: Array<string | undefined> = [undefined, undefined, "ready"];
    let idx = 0;
    const result = await pollUntilDefined<string>(
      async () => states[idx++],
      { timeoutMs: 5_000, intervalMs: 10, now: clock.now, sleep: virtualSleep(clock) },
    );
    expect(result.outcome).toBe("done");
    if (result.outcome === "done") {
      expect(result.value).toBe("ready");
      expect(result.polls).toBe(3);
    }
  });

  it("treats null as a defined (done) value", async () => {
    const clock = virtualClock();
    const result = await pollUntilDefined<null>(
      async () => null,
      { timeoutMs: 1_000, intervalMs: 10, now: clock.now, sleep: virtualSleep(clock) },
    );
    expect(result.outcome).toBe("done");
    if (result.outcome === "done") {
      expect(result.value).toBeNull();
    }
  });

  it("times out when the probe never returns a defined value", async () => {
    const clock = virtualClock();
    const result = await pollUntilDefined<string>(
      async () => undefined,
      { timeoutMs: 100, intervalMs: 50, now: clock.now, sleep: virtualSleep(clock) },
    );
    expect(result.outcome).toBe("timeout");
  });
});
