// observability: each role agent emits structured log events; a
// centralized logger appends them to .tdd/agent-log.jsonl (JSON Lines) so the
// whole relay-of-agents run is reconstructable. emit validates against
// agent-log-event.schema.json, stamps ts, and appends atomically.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { emitAgentLogEvent, readAgentLog } from "../../scripts/tdd/agent-log";

let tdd: string;
const clock = () => new Date("2026-06-05T10:00:00.000Z");

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "agent-log-"));
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

describe("emitAgentLogEvent", () => {
  it("stamps ts, validates, and appends a JSON line to .tdd/agent-log.jsonl", () => {
    const ev = emitAgentLogEvent(
      { role: "spec-author", level: "info", event: "artifact.written", message: "wrote feature-spec.json", feature_id: "F1-initial-domain", data: { path: "feature-spec.json" } },
      { tddDir: tdd, now: clock },
    );
    expect(ev.timestamp).toBe("2026-06-05T10:00:00.000Z");

    const file = join(tdd, "agent-log.jsonl");
    expect(existsSync(file)).toBe(true);
    const lines = readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.role).toBe("spec-author");
    expect(parsed.event).toBe("artifact.written");
    expect(parsed.metadata.path).toBe("feature-spec.json");
  });

  it("appends (does not overwrite) across multiple emits + roles", () => {
    emitAgentLogEvent({ role: "spec-author", level: "info", event: "phase.end", message: "spec done" }, { tddDir: tdd, now: clock });
    emitAgentLogEvent({ role: "architect-reviewer", level: "debug", event: "reasoning", message: "weighing enum placement" }, { tddDir: tdd, now: clock });
    const events = readAgentLog({ tddDir: tdd });
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.role)).toEqual(["spec-author", "architect-reviewer"]);
  });

  it("rejects an invalid event (bad role / missing field)", () => {
    expect(() =>
      emitAgentLogEvent({ role: "wizard" as never, level: "info", event: "x", message: "y" }, { tddDir: tdd, now: clock }),
    ).toThrow(/role/i);
    expect(() =>
      emitAgentLogEvent({ role: "driver", level: "info", event: "", message: "y" }, { tddDir: tdd, now: clock }),
    ).toThrow();
  });
});

describe("readAgentLog filtering", () => {
  beforeEach(() => {
    emitAgentLogEvent({ role: "spec-author", level: "info", event: "phase.end", message: "a", feature_id: "F1" }, { tddDir: tdd, now: clock });
    emitAgentLogEvent({ role: "driver", level: "debug", event: "reasoning", message: "b", feature_id: "F1" }, { tddDir: tdd, now: clock });
    emitAgentLogEvent({ role: "driver", level: "error", event: "gate.refused", message: "c", feature_id: "F2" }, { tddDir: tdd, now: clock });
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
