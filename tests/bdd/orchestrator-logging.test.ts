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

import { orchestratorLogEvents, makeOnAction } from "../../scripts/sftdd/orchestrator-logging";
import { renderEventMessage } from "../../scripts/sftdd/agent-log-events";
import { readAgentLog } from "../../scripts/sftdd/agent-log";
import { ALL_AGENT_ROLES } from "../../scripts/sftdd/agent-models";
import type { WorkflowAction } from "../../scripts/sftdd/orchestrator-drive";

describe("orchestratorLogEvents: pure action -> canonical log events", () => {
  it("invoke-role emits an orchestrator handoff + a phase.start for the invoked role", () => {
    const action = { kind: "invoke-role", role: "spec-author", story: "S1-file-bug" } as WorkflowAction;
    const events = orchestratorLogEvents(action, { featureId: "F1-initial-domain" });
    // One orchestrator handoff naming the role it dispatched...
    const handoff = events.find((e) => e.event === "handoff");
    expect(handoff, "expected an orchestrator handoff").toBeTruthy();
    expect(handoff!.role).toBe("orchestrator");
    expect(handoff!.feature_id).toBe("F1-initial-domain");
    // The dispatched role is a SLOT (the message is rendered from it at emit).
    expect(handoff!.slots?.to_role).toBe("spec-author");
    // ...and a phase.start STAMPED WITH THE INVOKED ROLE (so the role's
    // lifecycle is recorded even if the role's own model never logs).
    const start = events.find((e) => e.event === "phase.start");
    expect(start, "expected a role phase.start").toBeTruthy();
    expect(start!.role).toBe("spec-author");
    expect(start!.feature_id).toBe("F1-initial-domain");
  });

  it("stamps model + effort on the role phase.start (right after role) from the context resolvers", () => {
    const ctx = {
      featureId: "F1",
      modelForRole: (role: string) => (role === "navigator" ? "sonnet" : "opus"),
      effortForTurn: (_role: string, turn?: string) => (turn === "review" ? "low" : ""),
    };
    // Build REVIEW turn: navigator, effort low + model sonnet.
    const review = orchestratorLogEvents(
      { kind: "invoke-role", role: "navigator", story: "S1", buildMode: "review", ac: "AC1" } as WorkflowAction,
      ctx,
    ).find((e) => e.event === "phase.start");
    expect(review?.role).toBe("navigator");
    expect(review?.model).toBe("sonnet");
    expect(review?.effort).toBe("low");
    // Design turn (spec-author): model opus, no effort (resolver returns "" => omitted).
    const design = orchestratorLogEvents(
      { kind: "invoke-role", role: "spec-author", story: "S1" } as WorkflowAction,
      ctx,
    ).find((e) => e.event === "phase.start");
    expect(design?.model).toBe("opus");
    expect(design?.effort).toBeUndefined();
    // No resolvers -> no model/effort fields (back-compat).
    const bare = orchestratorLogEvents(
      { kind: "invoke-role", role: "driver", story: "S1" } as WorkflowAction,
      { featureId: "F1" },
    ).find((e) => e.event === "phase.start");
    expect(bare?.model).toBeUndefined();
    expect(bare?.effort).toBeUndefined();
  });

  it("await-acceptance narrates the release-engineer handoff + phase.start (it is the invisible deploy actor)", () => {
    // The Release Engineer runs the deterministic deploy at await-acceptance, but
    // the deploy is a CLI and the RE's own model may stay silent. The orchestrator
    // must still record that the RE was dispatched, so a run shows it was invoked.
    const action = { kind: "await-acceptance", story: "S1-file-bug" } as WorkflowAction;
    const events = orchestratorLogEvents(action, { featureId: "F1" });
    const handoff = events.find((e) => e.event === "handoff");
    expect(handoff, "expected a release-engineer handoff").toBeTruthy();
    expect(handoff!.slots?.to_role).toBe("release-engineer");
    const start = events.find((e) => e.event === "phase.start" && e.role === "release-engineer");
    expect(start, "expected a release-engineer phase.start").toBeTruthy();
    // The acceptance gate is still surfaced.
    expect(events.some((e) => e.event === "gate.surfaced")).toBe(true);
  });

  it("a gate-surfacing action emits an orchestrator gate.surfaced", () => {
    const action = { kind: "surface-gate", gate: "spec", story: "S1" } as unknown as WorkflowAction;
    const events = orchestratorLogEvents(action, { featureId: "F1" });
    const surfaced = events.find((e) => e.event === "gate.surfaced");
    expect(surfaced).toBeTruthy();
    expect(surfaced!.role).toBe("orchestrator");
  });

  it("dispatch (build-lane entry) emits an orchestrator phase.start build, NOT a self-handoff", () => {
    // Opening the per-story build lane is a phase entry, not an inter-agent
    // handoff: the build lane is the orchestrator's own pipeline. A `handoff` here
    // would be the orchestrator handing off to itself (to_role "build-lane", not a
    // real agent). The first true handoff is the navigator dispatch that follows.
    const action = { kind: "dispatch", story: "S1-create-bug-form" } as unknown as WorkflowAction;
    const events = orchestratorLogEvents(action, { featureId: "F1-file-bug" });
    expect(events.some((e) => e.event === "handoff"), "dispatch must NOT emit a handoff").toBe(false);
    const start = events.find((e) => e.event === "phase.start");
    expect(start, "expected an orchestrator phase.start").toBeTruthy();
    expect(start!.role).toBe("orchestrator");
    expect(start!.slots?.phase).toBe("build");
    expect(start!.slots?.story).toBe("S1-create-bug-form");
  });

  it("GUARD: every handoff to_role is a real spawnable agent role (never a lane / self-handoff)", () => {
    // A `handoff` denotes control crossing to a DIFFERENT agent. Its to_role must
    // be a spawnable role with a <role>.md def + a model, never a pipeline lane
    // ("build-lane") nor the orchestrator itself. This regresses the build-lane
    // self-handoff and any future lane sneaking into a handoff slot.
    const roles = new Set<string>(ALL_AGENT_ROLES);
    // One representative action per switch arm, covering every kind that runs.
    const actions: WorkflowAction[] = [
      ...ALL_AGENT_ROLES.map((role) => ({ kind: "invoke-role", role, story: "S1" }) as unknown as WorkflowAction),
      { kind: "surface-gate", gate: "spec", story: "S1" } as unknown as WorkflowAction,
      { kind: "await-acceptance", story: "S1" } as unknown as WorkflowAction,
      { kind: "approve-gate", story: "S1" } as unknown as WorkflowAction,
      { kind: "approve-plan-gate" } as unknown as WorkflowAction,
      { kind: "approve-deploy-gate" } as unknown as WorkflowAction,
      { kind: "accept", story: "S1" } as unknown as WorkflowAction,
      { kind: "cut-experiment", story: "S1" } as unknown as WorkflowAction,
      { kind: "dispatch", story: "S1" } as unknown as WorkflowAction,
      { kind: "deploy" } as unknown as WorkflowAction,
      { kind: "complete", story: "S1" } as unknown as WorkflowAction,
      { kind: "planning-complete" } as unknown as WorkflowAction,
      { kind: "design-complete" } as unknown as WorkflowAction,
      { kind: "feature-complete" } as unknown as WorkflowAction,
      { kind: "raise-to-hil", source: "navigator", reason: "x", story: "S1" } as unknown as WorkflowAction,
      { kind: "done" } as unknown as WorkflowAction,
    ];
    let handoffs = 0;
    for (const action of actions) {
      for (const e of orchestratorLogEvents(action, { featureId: "F1" })) {
        if (e.event !== "handoff") continue;
        handoffs += 1;
        const to = e.slots?.to_role as string | undefined;
        expect(roles.has(to ?? ""), `handoff to_role "${to}" must be a spawnable agent role`).toBe(true);
      }
    }
    // Sanity: the sample DID exercise real handoffs (invoke-role + await-acceptance).
    expect(handoffs).toBeGreaterThanOrEqual(ALL_AGENT_ROLES.length);
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

  it("the promote phase emits a release-engineer phase.start + a promote gate.approved", () => {
    // deploy-complete marks entry into the promote phase (release engineer owns it).
    const entry = orchestratorLogEvents({ kind: "deploy-complete" } as WorkflowAction, { featureId: "F1" });
    expect(entry).toEqual([
      expect.objectContaining({ role: "release-engineer", event: "phase.start", slots: { phase: "promote" } }),
    ]);
    // The HITL promote gate (PR acceptance) logs gate.approved {gate: promote}.
    const gate = orchestratorLogEvents({ kind: "approve-promote-gate" } as WorkflowAction, { featureId: "F1" });
    expect(gate.some((e) => e.event === "gate.approved" && (e.slots as { gate?: string }).gate === "promote")).toBe(true);
    // The SCM steps still emit an in-vocabulary, distinct marker (no throw, timing-visible).
    for (const k of ["prepare-pr", "wait-ci", "merge"] as const) {
      const evs = orchestratorLogEvents({ kind: k } as WorkflowAction, { featureId: "F1" });
      expect(evs.length).toBeGreaterThan(0);
      expect(evs[0].event).toBeTruthy();
    }
  });

  it("every emitted event has role/level/event AND renders from its template + slots (no missing slot)", () => {
    const action = { kind: "invoke-role", role: "driver", story: "S1" } as WorkflowAction;
    for (const e of orchestratorLogEvents(action, { featureId: "F1" })) {
      expect(e.role, "role required").toBeTruthy();
      expect(e.level, "level required").toBeTruthy();
      expect(e.event, "event required").toBeTruthy();
      // The message is rendered at emit; rendering must succeed (all required
      // slots supplied) for every event the orchestrator produces.
      const ctx = { role: e.role, ...(e.feature_id ? { feature_id: e.feature_id } : {}), ...(e.phase ? { phase: e.phase } : {}), ...(e.slots ?? {}) };
      expect(renderEventMessage(e.event, ctx).length, `event ${e.event} renders`).toBeGreaterThan(0);
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
    const onAction = makeOnAction({ sftddDir: tdd, featureId: "F1-initial-domain" });
    onAction({ kind: "invoke-role", role: "spec-author", story: "S1" } as WorkflowAction, 0);

    const events = readAgentLog({ sftddDir: tdd });
    expect(events.length).toBeGreaterThanOrEqual(2); // handoff + phase.start
    // emitAgentLogEvent stamps a real UTC timestamp; this proves we go through
    // the logger (not a role writing its own line with a local clock).
    for (const e of events) {
      expect(e.timestamp, "logger stamps timestamp").toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
      expect((e as unknown as Record<string, unknown>).ts, "no stray legacy 'ts' field").toBeUndefined();
    }
    expect(events.some((e) => e.role === "orchestrator")).toBe(true);
    expect(events.some((e) => e.role === "spec-author" && e.event === "phase.start")).toBe(true);
  });
});
