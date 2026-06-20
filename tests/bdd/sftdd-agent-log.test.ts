// observability: each role agent emits structured log events; a centralized
// logger appends them to .tdd/agent-log.jsonl (JSON Lines) so the whole
// relay-of-agents run is reconstructable. The `event` is a CLOSED vocabulary
// (agent-log-events.ts); the message is RENDERED from that event's template +
// the supplied slots. emit THROWS on an off-vocabulary event or a missing
// required slot (nothing dropped), and on schema violation; then appends atomically.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { emitAgentLogEvent, readAgentLog } from "../../scripts/sftdd/agent-log";

let tdd: string;
const clock = () => new Date("2026-06-05T10:00:00.000Z");

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "agent-log-"));
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

describe("emitAgentLogEvent", () => {
  it("renders the message from the event template + slots, stamps ts, appends a JSON line", () => {
    const ev = emitAgentLogEvent(
      {
        role: "spec-author",
        level: "info",
        event: "artifact.written",
        feature_id: "F1-initial-domain",
        slots: { artifact: "feature-spec.json", summary: "drafted", path: "feature-spec.json" },
      },
      { tddDir: tdd, now: clock },
    );
    expect(ev.timestamp).toBe("2026-06-05T10:00:00.000Z");
    // message is rendered from "{{role}} wrote {{artifact}} , {{summary}}".
    expect(ev.message).toBe("spec-author wrote feature-spec.json , drafted");

    const file = join(tdd, "agent-log.jsonl");
    expect(existsSync(file)).toBe(true);
    const lines = readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.role).toBe("spec-author");
    expect(parsed.event).toBe("artifact.written");
    expect(parsed.metadata.path).toBe("feature-spec.json"); // slots folded into metadata
  });

  it("appends (does not overwrite) across multiple emits + roles", () => {
    emitAgentLogEvent({ role: "spec-author", level: "info", event: "phase.end", slots: { phase: "design", outcome: "complete" } }, { tddDir: tdd, now: clock });
    emitAgentLogEvent({ role: "architect-reviewer", level: "debug", event: "reasoning", slots: { note: "weighing enum placement" } }, { tddDir: tdd, now: clock });
    const events = readAgentLog({ tddDir: tdd });
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.role)).toEqual(["spec-author", "architect-reviewer"]);
  });

  it("rejects an off-vocabulary event (closed enum, nothing dropped)", () => {
    expect(() =>
      emitAgentLogEvent({ role: "driver", level: "info", event: "made.up.event" as never, slots: {} }, { tddDir: tdd, now: clock }),
    ).toThrow(/unknown agent-log event/i);
  });

  it("rejects an emit missing a required template slot (throws, not dropped)", () => {
    // phase.end's template "{{role}} END {{phase}} ({{outcome}})" requires phase + outcome.
    expect(() =>
      emitAgentLogEvent({ role: "driver", level: "info", event: "phase.end", slots: { phase: "story" } }, { tddDir: tdd, now: clock }),
    ).toThrow(/missing required slot "outcome"/i);
  });

  it("rejects an invalid role (schema enum)", () => {
    expect(() =>
      emitAgentLogEvent({ role: "wizard" as never, level: "info", event: "reasoning", slots: { note: "y" } }, { tddDir: tdd, now: clock }),
    ).toThrow(/role/i);
  });
});

describe("readAgentLog filtering", () => {
  beforeEach(() => {
    emitAgentLogEvent({ role: "spec-author", level: "info", event: "phase.end", slots: { phase: "design", outcome: "complete" }, feature_id: "F1" }, { tddDir: tdd, now: clock });
    emitAgentLogEvent({ role: "driver", level: "debug", event: "reasoning", slots: { note: "b" }, feature_id: "F1" }, { tddDir: tdd, now: clock });
    emitAgentLogEvent({ role: "driver", level: "error", event: "gate.rejected", slots: { gate: "spec", reason: "c" }, feature_id: "F2" }, { tddDir: tdd, now: clock });
  });

  it("filters by role", () => {
    expect(readAgentLog({ tddDir: tdd, role: "driver" })).toHaveLength(2);
  });
  it("filters by feature", () => {
    expect(readAgentLog({ tddDir: tdd, featureId: "F1" })).toHaveLength(2);
  });
  it("filters by minimum severity (info hides debug)", () => {
    const infoPlus = readAgentLog({ tddDir: tdd, minLevel: "info" });
    expect(infoPlus.map((e) => e.level).sort()).toEqual(["error", "info"]);
  });
  it("returns [] when no log file exists yet", () => {
    const empty = mkdtempSync(join(tmpdir(), "agent-log-empty-"));
    expect(readAgentLog({ tddDir: empty })).toEqual([]);
    rmSync(empty, { recursive: true, force: true });
  });
});
