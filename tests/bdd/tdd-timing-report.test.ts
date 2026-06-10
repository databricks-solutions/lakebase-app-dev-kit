// P0 (agent-loop optimization enabler): the per-turn timing report derived from
// the agent log. Spans are gaps between consecutive events, attributed to the
// ending event, then rolled up by phase / role / kind, with the slowest spans
// surfaced. These tests pin the math + the CLI contract on synthetic logs so the
// optimization work has a trustworthy measuring stick.

import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { AgentLogEvent } from "../../scripts/tdd/agent-log";
import { computeTiming, formatTimingReport, timingReportFromLog } from "../../scripts/tdd/timing-report";
import { runTimingCli } from "../../scripts/tdd/timing-report.cli";

function ev(timestamp: string, role: string, event: string, metadata?: Record<string, unknown>): AgentLogEvent {
  return { timestamp, level: "info", role: role as AgentLogEvent["role"], event, message: `${role} ${event}`, metadata };
}

// A small but representative S1-ish stream: design lane (architect -> a slow
// test-strategist) then one RED/GREEN build cycle. The test-strategist span is
// the deliberate outlier the plan's P1 attacks.
function sampleEvents(): AgentLogEvent[] {
  return [
    ev("2026-06-09T00:00:00.000Z", "orchestrator", "phase.start", { phase: "design" }),
    ev("2026-06-09T00:00:30.000Z", "architect-reviewer", "artifact.written", { phase: "design", story: "S1" }),
    // 200s test-strategist turn (the haiku outlier)
    ev("2026-06-09T00:03:50.000Z", "test-strategist", "artifact.written", { phase: "design", story: "S1" }),
    ev("2026-06-09T00:03:50.000Z", "orchestrator", "phase.start", { phase: "build", story: "S1" }),
    ev("2026-06-09T00:05:30.000Z", "navigator", "cycle.red", { phase: "build", story: "S1", ac: "AC1", cycle_id: "c1" }),
    ev("2026-06-09T00:06:40.000Z", "driver", "cycle.green", { phase: "build", story: "S1", ac: "AC1", cycle_id: "c1" }),
  ];
}

describe("computeTiming", () => {
  it("returns an empty report for no events", () => {
    const r = computeTiming([]);
    expect(r.events).toBe(0);
    expect(r.totalSeconds).toBe(0);
    expect(r.turns).toEqual([]);
    expect(r.byPhase).toEqual([]);
    expect(r.slowest).toEqual([]);
  });

  it("a single event has no spans", () => {
    const r = computeTiming([ev("2026-06-09T00:00:00.000Z", "orchestrator", "phase.start", { phase: "design" })]);
    expect(r.events).toBe(1);
    expect(r.totalSeconds).toBe(0);
    expect(r.turns).toEqual([]);
  });

  it("computes per-span durations attributed to the ending event", () => {
    const r = computeTiming(sampleEvents());
    expect(r.events).toBe(6);
    // total = 00:00:00 -> 00:06:40 = 400s
    expect(r.totalSeconds).toBe(400);
    expect(r.turns).toHaveLength(5);
    // first span: architect's artifact 30s after the design phase.start
    expect(r.turns[0]).toMatchObject({ role: "architect-reviewer", event: "artifact.written", seconds: 30 });
    // the test-strategist span is 200s, attributed to the test-strategist
    const ts = r.turns[1];
    expect(ts).toMatchObject({ role: "test-strategist", event: "artifact.written", seconds: 200, story: "S1" });
    // a same-timestamp pair is a 0s span (build phase.start lands with the test list)
    expect(r.turns[2].seconds).toBe(0);
    // RED then GREEN
    expect(r.turns[3]).toMatchObject({ role: "navigator", event: "cycle.red", seconds: 100, ac: "AC1" });
    expect(r.turns[4]).toMatchObject({ role: "driver", event: "cycle.green", seconds: 70, ac: "AC1" });
  });

  it("rolls up by phase, role, and kind (desc by total)", () => {
    const r = computeTiming(sampleEvents());
    expect(r.byPhase[0]).toMatchObject({ key: "design", seconds: 230, count: 2 });
    expect(r.byPhase.find((g) => g.key === "build")).toMatchObject({ seconds: 170, count: 3 });
    expect(r.byRole[0]).toMatchObject({ key: "test-strategist", seconds: 200, count: 1, maxSeconds: 200 });
    expect(r.byKind[0]).toMatchObject({ key: "test-strategist/artifact.written", seconds: 200 });
  });

  it("derives a coarse phase for events that carry NO phase slot (the fix: no giant (none) bucket)", () => {
    // These mirror the real gap: cycle.* are code-emitted with no phase; reasoning
    // / artifact.written are agent-emitted with no phase. They must still attribute
    // to build / design / deploy by role + event, not pile into "(none)".
    const r = computeTiming([
      ev("2026-06-09T00:00:00.000Z", "orchestrator", "phase.start", { phase: "design" }),
      ev("2026-06-09T00:00:10.000Z", "test-strategist", "reasoning"), // no phase -> design
      ev("2026-06-09T00:00:40.000Z", "navigator", "cycle.review", { ac: "AC1" }), // no phase -> build
      ev("2026-06-09T00:01:40.000Z", "driver", "reasoning"), // no phase -> build
      ev("2026-06-09T00:02:00.000Z", "release-engineer", "deploy.verified"), // -> deploy
    ]);
    const byKey = Object.fromEntries(r.byPhase.map((g) => [g.key, g.seconds]));
    expect(byKey["(none)"]).toBeUndefined(); // nothing falls through
    expect(byKey["design"]).toBe(10); // test-strategist reasoning span (10s after phase.start)
    expect(byKey["build"]).toBe(90); // cycle.review (30s) + driver reasoning (60s)
    expect(byKey["deploy"]).toBe(20); // deploy.verified (20s after driver reasoning)
  });

  it("surfaces the slowest spans first, capped at topN", () => {
    const r = computeTiming(sampleEvents(), { topN: 2 });
    expect(r.slowest).toHaveLength(2);
    expect(r.slowest[0]).toMatchObject({ role: "test-strategist", seconds: 200 });
    expect(r.slowest[1]).toMatchObject({ role: "navigator", seconds: 100 });
  });

  it("drops events with an unparseable timestamp and sorts out-of-order events", () => {
    const r = computeTiming([
      ev("2026-06-09T00:00:10.000Z", "driver", "cycle.green"),
      ev("not-a-timestamp", "navigator", "cycle.red"),
      ev("2026-06-09T00:00:00.000Z", "orchestrator", "phase.start"),
    ]);
    expect(r.events).toBe(2); // the bad one dropped
    expect(r.totalSeconds).toBe(10); // sorted: phase.start -> cycle.green
    expect(r.turns[0]).toMatchObject({ role: "driver", event: "cycle.green", seconds: 10 });
  });
});

describe("formatTimingReport", () => {
  it("says so when there is nothing to report", () => {
    expect(formatTimingReport(computeTiming([]))).toContain("no timestamped events");
  });

  it("renders the rollups + the slowest span with a m/s duration", () => {
    const text = formatTimingReport(computeTiming(sampleEvents()));
    expect(text).toContain("6 events over 6m40s");
    expect(text).toContain("by phase");
    expect(text).toContain("test-strategist/artifact.written");
    expect(text).toContain("3m20s"); // the 200s outlier
  });
});

describe("timingReportFromLog + CLI", () => {
  function seedLog(): string {
    const dir = mkdtempSync(join(tmpdir(), "tdd-timing-"));
    const tdd = join(dir, ".tdd");
    mkdirSync(tdd, { recursive: true });
    const lines = sampleEvents()
      .map((e) => JSON.stringify({ ...e, metadata: { feature_id: "F1", ...e.metadata } }))
      .join("\n");
    writeFileSync(join(tdd, "agent-log.jsonl"), `${lines}\n`, "utf8");
    return tdd;
  }

  it("reads + computes from a .tdd/agent-log.jsonl", () => {
    const tdd = seedLog();
    const r = timingReportFromLog({ tddDir: tdd, featureId: "F1" });
    expect(r.events).toBe(6);
    expect(r.byRole[0].key).toBe("test-strategist");
  });

  it("CLI --json prints a parseable TimingReport; bad arg exits 2", () => {
    const tdd = seedLog();
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((c: string | Uint8Array) => {
      chunks.push(typeof c === "string" ? c : c.toString());
      return true;
    });
    try {
      expect(runTimingCli(["--tdd-dir", tdd, "--feature", "F1", "--json"])).toBe(0);
    } finally {
      spy.mockRestore();
    }
    const parsed = JSON.parse(chunks.join("")) as { events: number; byRole: Array<{ key: string }> };
    expect(parsed.events).toBe(6);
    expect(parsed.byRole[0].key).toBe("test-strategist");

    expect(runTimingCli(["--bogus"])).toBe(2);
  });
});
