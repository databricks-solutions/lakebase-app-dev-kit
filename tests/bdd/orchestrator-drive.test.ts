// FEIP (orchestrator-as-deterministic-driver), phase 1: the per-story DESIGN
// lane is a pure state machine, not an LLM judgment call. nextDesignAction maps
// the recorded state (breakdown done? each story's design progress + gate) to
// the single next action. It is exhaustively testable with no I/O, no model.
//
// The streaming invariant falls out for free: the function always advances the
// FIRST not-yet-gated story, so exactly one story is ever in design at a time,
// the spec-author is invoked per story, and batching is structurally impossible.

import { describe, it, expect } from "vitest";
import {
  nextDesignAction,
  nextTransition,
  type DesignDriveState,
  type DriveState,
  type StoryView,
} from "../../scripts/tdd/orchestrator-drive";

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

// --- Full workflow transition (planning + design + build + deploy) ----------

/** A story view fully through design + gate but not yet built. */
function gatedUnbuilt(): StoryView {
  return {
    gateApproved: true, gateSurfaced: true,
    design: { hasAcs: true, architectAnnotated: true, testListReady: true },
    build: { experimentCut: false, testsWritten: false, codeWritten: false, awaitingAcceptance: false, deployVerified: false, accepted: false },
  };
}
function freshStory(): StoryView {
  return {
    gateApproved: false, gateSurfaced: false,
    design: { hasAcs: false, architectAnnotated: false, testListReady: false },
    build: { experimentCut: false, testsWritten: false, codeWritten: false, awaitingAcceptance: false, deployVerified: false, accepted: false },
  };
}
function builtAccepted(): StoryView {
  return {
    gateApproved: true, gateSurfaced: true,
    design: { hasAcs: true, architectAnnotated: true, testListReady: true },
    build: { experimentCut: true, testsWritten: true, codeWritten: true, awaitingAcceptance: true, deployVerified: true, accepted: true },
  };
}
function ws(over: Partial<DriveState>): DriveState {
  return {
    phase: "feature", breakdownDone: true, storyOrder: ["S1"], stories: {},
    buildActive: null, ...over,
  };
}

describe("nextDesignAction: UX Designer (UI track)", () => {
  const stories = { S1: fresh(), S2: fresh(), S3: fresh() };
  it("emits ux-designer after breakdown when uiTrack is on and no design guide exists yet", () => {
    expect(nextDesignAction(state({ uiTrack: true, designGuideReady: false, stories })))
      .toEqual({ kind: "invoke-role", role: "ux-designer" });
  });
  it("skips ux-designer once the design guide exists, proceeds to the first story", () => {
    expect(nextDesignAction(state({ uiTrack: true, designGuideReady: true, stories })))
      .toEqual({ kind: "invoke-role", role: "spec-author", story: "S1" });
  });
  it("never emits ux-designer when uiTrack is off (API / CLI / Infra projects)", () => {
    expect(nextDesignAction(state({ uiTrack: false, designGuideReady: false, stories })))
      .toEqual({ kind: "invoke-role", role: "spec-author", story: "S1" });
  });
  it("runs the UX step only after breakdown, breakdown still comes first", () => {
    expect(nextDesignAction(state({ breakdownDone: false, uiTrack: true, designGuideReady: false, stories: {} })))
      .toEqual({ kind: "invoke-role", role: "spec-author", mode: "breakdown" });
  });
});

describe("nextTransition: UX Designer prerequisite (hoisted above build dispatch)", () => {
  it("a gate-approved story still WAITS for the design guide (UX wins over dispatch)", () => {
    // The reused-project / last-stage case: S1's spec gate is already approved
    // (would normally dispatch to build), but the project design guide does not
    // exist yet. The UX step must fire BEFORE the dispatch, so the UI is never
    // built against a guide that does not exist.
    const st = ws({ stories: { S1: gatedUnbuilt() }, uiTrack: true, designGuideReady: false });
    expect(nextTransition(st)).toEqual({ kind: "invoke-role", role: "ux-designer" });
  });
  it("once the design guide exists, the gate-approved story dispatches to build", () => {
    const st = ws({ stories: { S1: gatedUnbuilt() }, uiTrack: true, designGuideReady: true });
    expect(nextTransition(st)).toEqual({ kind: "dispatch", story: "S1" });
  });
  it("no UX gating for non-UI projects: the gate-approved story dispatches", () => {
    const st = ws({ stories: { S1: gatedUnbuilt() }, uiTrack: false, designGuideReady: false });
    expect(nextTransition(st)).toEqual({ kind: "dispatch", story: "S1" });
  });
});

describe("nextTransition: planning lane", () => {
  it("proposes, estimates, authors requests, approves the PLAN GATE, then completes", () => {
    const base = ws({ phase: "planning", planning: { proposed: false, estimated: false, requestsAuthored: false } });
    expect(nextTransition(base)).toEqual({ kind: "invoke-role", role: "spec-author", mode: "propose" });
    // Proposed -> the Architect t-shirt-sizes the candidates before the PO commits.
    expect(nextTransition(ws({ phase: "planning", planning: { proposed: true, estimated: false, requestsAuthored: false } })))
      .toEqual({ kind: "invoke-role", role: "architect-reviewer", mode: "estimate" });
    // Estimated -> the PO commits the backlog (authors the feature-requests).
    expect(nextTransition(ws({ phase: "planning", planning: { proposed: true, estimated: true, requestsAuthored: false } })))
      .toEqual({ kind: "invoke-role", role: "product-owner", mode: "author-requests" });
    // Backlog committed -> the sprint plan gate (HITL) before execution.
    expect(nextTransition(ws({ phase: "planning", planning: { proposed: true, estimated: true, requestsAuthored: true } })))
      .toEqual({ kind: "approve-plan-gate" });
    // Gate approved -> planning complete (the human "passing" = approve as-is).
    expect(nextTransition(ws({ phase: "planning", planning: { proposed: true, estimated: true, requestsAuthored: true, gateApproved: true } })))
      .toEqual({ kind: "planning-complete" });
  });

  it("--no-sizing (skipSizing) routes proposed -> author-requests, never estimating", () => {
    // With sizing skipped, the Architect estimate step is dropped entirely: a
    // proposed-but-unestimated sprint goes straight to the PO authoring requests.
    expect(nextTransition(ws({ phase: "planning", planning: { proposed: true, estimated: false, requestsAuthored: false, skipSizing: true } })))
      .toEqual({ kind: "invoke-role", role: "product-owner", mode: "author-requests" });
    // The rest of the planning sequence is unchanged.
    expect(nextTransition(ws({ phase: "planning", planning: { proposed: true, estimated: false, requestsAuthored: true, skipSizing: true } })))
      .toEqual({ kind: "approve-plan-gate" });
    expect(nextTransition(ws({ phase: "planning", planning: { proposed: true, estimated: false, requestsAuthored: true, gateApproved: true, skipSizing: true } })))
      .toEqual({ kind: "planning-complete" });
    // skipSizing never suppresses the propose step.
    expect(nextTransition(ws({ phase: "planning", planning: { proposed: false, estimated: false, requestsAuthored: false, skipSizing: true } })))
      .toEqual({ kind: "invoke-role", role: "spec-author", mode: "propose" });
  });
});

describe("nextTransition: build lane (after a story is gated)", () => {
  it("dispatches a gate-approved story into the idle build lane", () => {
    expect(nextTransition(ws({ stories: { S1: gatedUnbuilt() }, buildActive: null })))
      .toEqual({ kind: "dispatch", story: "S1" });
  });

  it("drives the active build cut -> navigator -> driver -> await -> accept -> complete", () => {
    const v = gatedUnbuilt();
    const st = ws({ stories: { S1: v }, buildActive: "S1" });
    expect(nextTransition(st)).toEqual({ kind: "cut-experiment", story: "S1" });
    v.build.experimentCut = true;
    expect(nextTransition(st)).toEqual({ kind: "invoke-role", role: "navigator", story: "S1" });
    v.build.testsWritten = true;
    expect(nextTransition(st)).toEqual({ kind: "invoke-role", role: "driver", story: "S1" });
    v.build.codeWritten = true;
    expect(nextTransition(st)).toEqual({ kind: "await-acceptance", story: "S1" });
    v.build.awaitingAcceptance = true;
    // Teeth: not yet deploy-verified -> re-deploy (await-acceptance), not accept.
    expect(nextTransition(st)).toEqual({ kind: "await-acceptance", story: "S1" });
    v.build.deployVerified = true;
    expect(nextTransition(st)).toEqual({ kind: "accept", story: "S1" });
    v.build.accepted = true;
    expect(nextTransition(st)).toEqual({ kind: "complete", story: "S1" });
  });

  it("builds a gated story before designing the next (per-story flow on a single lane)", () => {
    // S1 gated+unbuilt, S2 fresh, lane idle -> dispatch S1 (build precedes designing S2).
    const st = ws({ storyOrder: ["S1", "S2"], stories: { S1: gatedUnbuilt(), S2: freshStory() }, buildActive: null });
    expect(nextTransition(st)).toEqual({ kind: "dispatch", story: "S1" });
  });

  it("advances the design lane when the build lane is idle and nothing is ready to build", () => {
    // S1 fresh (not gated), nothing ready -> design lane works S1.
    const st = ws({ storyOrder: ["S1", "S2"], stories: { S1: freshStory(), S2: freshStory() }, buildActive: null });
    expect(nextTransition(st)).toEqual({ kind: "invoke-role", role: "spec-author", story: "S1" });
  });
});

describe("nextTransition: deploy + done", () => {
  it("moves to deploy when every story is built + accepted", () => {
    expect(nextTransition(ws({ stories: { S1: builtAccepted() } }))).toEqual({ kind: "feature-complete" });
  });

  it("deploys, surfaces the deploy gate, then is done", () => {
    expect(nextTransition(ws({ phase: "deploy", deploy: { deployed: false, gateApproved: false } })))
      .toEqual({ kind: "deploy" });
    expect(nextTransition(ws({ phase: "deploy", deploy: { deployed: true, gateApproved: false } })))
      .toEqual({ kind: "approve-deploy-gate" });
    expect(nextTransition(ws({ phase: "deploy", deploy: { deployed: true, gateApproved: true } })))
      .toEqual({ kind: "done" });
  });
});
