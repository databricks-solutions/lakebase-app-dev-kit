// FEIP (orchestrator-as-deterministic-driver), phase 1: the per-story DESIGN
// lane is a pure state machine, not an LLM judgment call. nextDesignAction maps
// the recorded state (breakdown done? each story's design progress + gate) to
// the single next action. It is exhaustively testable with no I/O, no model.
//
// The streaming invariant falls out for free: the function always advances the
// FIRST not-yet-gated story, so exactly one story is ever in design at a time,
// the spec-author is invoked per story, and batching is structurally impossible.

import { describe, it, expect } from "vitest";
import { nextDesignAction, type DesignDriveState } from "../../scripts/tdd/orchestrator-drive";

/** A story fully through design + gate (so the loop skips it). */
function gated(): DesignDriveState["stories"][string] {
  return {
    gateApproved: true,
    gateSurfaced: false,
    design: { hasAcs: true, architectAnnotated: true, testListReady: true },
  };
}
/** A blank story: nothing designed yet. */
function fresh(): DesignDriveState["stories"][string] {
  return {
    gateApproved: false,
    gateSurfaced: false,
    design: { hasAcs: false, architectAnnotated: false, testListReady: false },
  };
}

function state(over: Partial<DesignDriveState>): DesignDriveState {
  return { breakdownDone: true, storyOrder: ["S1", "S2", "S3"], stories: {}, ...over };
}

describe("nextDesignAction (per-story design lane state machine)", () => {
  it("breaks the feature down first when the breakdown is not done", () => {
    expect(nextDesignAction(state({ breakdownDone: false, stories: {} }))).toEqual({
      kind: "invoke-role",
      role: "spec-author",
      mode: "breakdown",
    });
  });

  it("drives the first story through spec -> architect -> test-strategist in order", () => {
    const s = { S1: fresh(), S2: fresh(), S3: fresh() };
    // needs ACs -> spec-author
    expect(nextDesignAction(state({ stories: s }))).toEqual({
      kind: "invoke-role", role: "spec-author", story: "S1",
    });
    // has ACs, needs architecture -> architect-reviewer
    s.S1.design.hasAcs = true;
    expect(nextDesignAction(state({ stories: s }))).toEqual({
      kind: "invoke-role", role: "architect-reviewer", story: "S1",
    });
    // has ACs + arch, needs tests -> test-strategist
    s.S1.design.architectAnnotated = true;
    expect(nextDesignAction(state({ stories: s }))).toEqual({
      kind: "invoke-role", role: "test-strategist", story: "S1",
    });
  });

  it("surfaces the gate once a story's design is complete, then approves it", () => {
    const s = { S1: fresh(), S2: fresh(), S3: fresh() };
    s.S1.design = { hasAcs: true, architectAnnotated: true, testListReady: true };
    // fully designed, not surfaced -> surface
    expect(nextDesignAction(state({ stories: s }))).toEqual({ kind: "surface-gate", story: "S1" });
    // surfaced, not approved -> approve
    s.S1.gateSurfaced = true;
    expect(nextDesignAction(state({ stories: s }))).toEqual({ kind: "approve-gate", story: "S1" });
  });

  it("only advances to the next story after the current one is gate-approved (streaming invariant)", () => {
    const s = { S1: fresh(), S2: fresh(), S3: fresh() };
    // S1 not yet approved -> work S1, never S2, even though S2 is also fresh.
    expect(nextDesignAction(state({ stories: s }))).toMatchObject({ story: "S1" });
    // S1 approved -> now the first non-approved is S2.
    s.S1 = gated();
    expect(nextDesignAction(state({ stories: s }))).toEqual({
      kind: "invoke-role", role: "spec-author", story: "S2",
    });
  });

  it("never drafts a later story while an earlier one is still in design", () => {
    // Even if S2 somehow has ACs, the first non-approved story (S1) is driven.
    const s = { S1: fresh(), S2: { ...fresh(), design: { hasAcs: true, architectAnnotated: false, testListReady: false } }, S3: fresh() };
    expect(nextDesignAction(state({ stories: s }))).toMatchObject({ story: "S1", role: "spec-author" });
  });

  it("reports design-complete when every story is gate-approved", () => {
    const s = { S1: gated(), S2: gated(), S3: gated() };
    expect(nextDesignAction(state({ stories: s }))).toEqual({ kind: "design-complete" });
  });
});
