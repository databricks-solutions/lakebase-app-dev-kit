// The orchestrator (deterministic driver) emits its lifecycle log as CODE, not
// via a prose-instructed LLM. orchestratorLogEvents is the pure action->event(s)
// mapper; makeOnAction wires it to the ONE common logger (emitAgentLogEvent), so
// every run produces a correct, ts-stamped, schema-valid orchestrator trail
// regardless of which model (if any) a role is on. There is ONE logging
// function, role is a parameter, not one function per agent.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { orchestratorLogEvents, makeOnAction } from "../../scripts/tdd/orchestrator-logging";
import { readAgentLog } from "../../scripts/tdd/agent-log";
import type { WorkflowAction } from "../../scripts/tdd/orchestrator-drive";

describe("orchestratorLogEvents: pure action -> canonical log events", () => {
  it("invoke-role emits an orchestrator handoff + a phase.start for the invoked role", () => {
    const action = { kind: "invoke-role", role: "spec-author", story: "S1-file-bug" } as WorkflowAction;
    const events = orchestratorLogEvents(action, { featureId: "F1-initial-domain" });
    // One orchestrator handoff naming the role it dispatched...
    const handoff = events.find((e) => e.event === "handoff");
    expect(handoff, "expected an orchestrator handoff").toBeTruthy();
    expect(handoff!.role).toBe("orchestrator");
    expect(handoff!.feature_id).toBe("F1-initial-domain");
    expect(handoff!.message).toMatch(/spec-author/);
    // ...and a phase.start STAMPED WITH THE INVOKED ROLE (so the role's
    // lifecycle is recorded even if the role's own model never logs).
    const start = events.find((e) => e.event === "phase.start");
    expect(start, "expected a role phase.start").toBeTruthy();
    expect(start!.role).toBe("spec-author");
    expect(start!.feature_id).toBe("F1-initial-domain");
  });

  it("a gate-surfacing action emits an orchestrator gate.surfaced", () => {
    const action = { kind: "surface-gate", gate: "spec", story: "S1" } as unknown as WorkflowAction;
    const events = orchestratorLogEvents(action, { featureId: "F1" });
    const surfaced = events.find((e) => e.event === "gate.surfaced");
    expect(surfaced).toBeTruthy();
    expect(surfaced!.role).toBe("orchestrator");
  });

  it("cut-experiment emits an orchestrator experiment.cut", () => {
    const action = { kind: "cut-experiment", story: "S1", slug: "arr" } as unknown as WorkflowAction;
    const events = orchestratorLogEvents(action, { featureId: "F1" });
    expect(events.some((e) => e.role === "orchestrator" && e.event === "experiment.cut")).toBe(true);
  });

  it("done emits an orchestrator phase.end (workflow complete)", () => {
    const events = orchestratorLogEvents({ kind: "done" } as WorkflowAction, { featureId: "F1" });
    expect(events.some((e) => e.role === "orchestrator" && e.event === "phase.end")).toBe(true);
  });

  it("every emitted event carries the required schema fields (role/level/event/message)", () => {
    const action = { kind: "invoke-role", role: "driver", story: "S1" } as WorkflowAction;
    for (const e of orchestratorLogEvents(action, { featureId: "F1" })) {
      expect(e.role, "role required").toBeTruthy();
      expect(e.level, "level required").toBeTruthy();
      expect(e.event, "event required").toBeTruthy();
      expect(e.message, "message required").toBeTruthy();
    }
  });
});

describe("makeOnAction: code-emits through the ONE common logger", () => {
  let tdd: string;
  beforeEach(() => {
    tdd = mkdtempSync(join(tmpdir(), "orch-log-"));
  });
  afterEach(() => rmSync(tdd, { recursive: true, force: true }));

  it("appends valid, ts-stamped orchestrator events to .tdd/agent-log.jsonl", () => {
    const onAction = makeOnAction({ tddDir: tdd, featureId: "F1-initial-domain" });
    onAction({ kind: "invoke-role", role: "spec-author", story: "S1" } as WorkflowAction, 0);

    const events = readAgentLog({ tddDir: tdd });
    expect(events.length).toBeGreaterThanOrEqual(2); // handoff + phase.start
    // emitAgentLogEvent stamps a real UTC ts (the malformed role logs used a
    // bare "timestamp" with a local clock; this proves we go through the logger).
    for (const e of events) {
      expect(e.ts, "logger stamps ts").toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
      expect((e as unknown as Record<string, unknown>).timestamp, "no stray 'timestamp' field").toBeUndefined();
    }
    expect(events.some((e) => e.role === "orchestrator")).toBe(true);
    expect(events.some((e) => e.role === "spec-author" && e.event === "phase.start")).toBe(true);
  });
});
