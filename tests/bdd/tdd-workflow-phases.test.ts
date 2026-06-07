// FEIP-7510: the orchestrator obeys workflow-state.json, which now carries the
// planning (/plan) and deploy (/deploy) phases. Hermetic schema validation.

import { describe, it, expect } from "vitest";
import { getValidator } from "../../scripts/tdd/schema-loader";

const validate = getValidator("workflow-state.schema.json");

function state(phase: string) {
  return { phase, started_at: "2026-06-06T00:00:00.000Z" };
}

describe("workflow-state phase enum", () => {
  it("accepts the planning phase (/plan, sprint planning before discovery)", () => {
    expect(validate(state("planning"))).toBe(true);
  });

  it("accepts the deploy phase (/deploy, the working-software check before shipped)", () => {
    expect(validate(state("deploy"))).toBe(true);
  });

  it("still accepts the existing per-feature phases", () => {
    for (const p of [
      "discovery",
      "architectural-review",
      "test-list-construction",
      "design-spec-gate",
      "implementation",
      "synthesis",
      "review",
      "shipped",
      "abandoned",
    ]) {
      expect(validate(state(p)), `phase ${p} should validate`).toBe(true);
    }
  });

  it("rejects an unknown phase", () => {
    expect(validate(state("deploying-now"))).toBe(false);
  });
});
