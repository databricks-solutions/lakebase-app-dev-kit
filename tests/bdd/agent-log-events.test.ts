// The closed agent-log event vocabulary + Jinja-style templates. Enforcement:
// renderEventMessage throws on an off-vocabulary event or a missing required
// slot (nothing dropped). A guard keeps the JSON-schema enum in sync with the
// TS vocabulary so the two validators cannot drift.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  EVENT_TEMPLATES,
  AGENT_LOG_EVENT_NAMES,
  isKnownEvent,
  requiredSlots,
  renderEventMessage,
  AgentLogEventError,
} from "../../scripts/sftdd/agent-log-events";

describe("agent-log-events vocabulary", () => {
  it("renders a template by substituting its slots", () => {
    expect(renderEventMessage("cycle.review", { ac: "AC1", refactor: true, rationale: "extract service" })).toBe(
      "REVIEW [AC1] refactor=true: extract service",
    );
  });

  it("throws on an off-vocabulary event (closed set)", () => {
    expect(() => renderEventMessage("not.an.event", {})).toThrow(AgentLogEventError);
    expect(() => renderEventMessage("not.an.event", {})).toThrow(/unknown agent-log event/i);
  });

  it("throws on a missing required slot (nothing rendered partial)", () => {
    expect(() => renderEventMessage("cycle.red", { test_id: "T1", ac: "AC1" })).toThrow(/missing required slot "asserts"/i);
  });

  it("treats undefined / null / empty-string slot values as missing", () => {
    expect(() => renderEventMessage("reasoning", { note: "" })).toThrow(/missing required slot "note"/i);
  });

  it("requiredSlots == the placeholders in the template", () => {
    expect(requiredSlots("deploy.verified").sort()).toEqual(["scope", "url", "verify_status"].sort());
    expect(requiredSlots("phase.end").sort()).toEqual(["outcome", "phase", "role"].sort());
  });

  it("every event in the vocabulary renders when given its required slots", () => {
    for (const event of AGENT_LOG_EVENT_NAMES) {
      const slots = Object.fromEntries(requiredSlots(event).map((s) => [s, `<${s}>`]));
      const msg = renderEventMessage(event, slots);
      expect(msg.length, `event ${event} renders`).toBeGreaterThan(0);
      expect(msg, `event ${event} leaves no unfilled placeholder`).not.toMatch(/\{\{/);
    }
  });

  it("isKnownEvent gates the closed set", () => {
    expect(isKnownEvent("cycle.green")).toBe(true);
    expect(isKnownEvent("cycle.green ")).toBe(false);
    expect(AGENT_LOG_EVENT_NAMES.length).toBe(Object.keys(EVENT_TEMPLATES).length);
  });

  it("the JSON-schema event enum stays in sync with the TS vocabulary", () => {
    const schema = JSON.parse(
      readFileSync(join(__dirname, "..", "..", "scripts", "sftdd", "schemas", "agent-log-event.schema.json"), "utf8"),
    );
    const schemaEnum: string[] = schema.properties.event.enum;
    expect(schemaEnum.slice().sort()).toEqual(AGENT_LOG_EVENT_NAMES.slice().sort());
  });
});
