// deriveDriveState (phase 3a) tests: map persisted pipeline + context + an
// artifact probe to a DriveState, and confirm nextTransition over the derived
// state picks the right next action for realistic on-disk situations.

import { describe, it, expect } from "vitest";
import {
  deriveDriveState,
  driverPhaseForTdd,
  assertStoryOrderCoversPipeline,
  type StoryArtifactProbe,
  type DriveContext,
} from "../../scripts/tdd/orchestrator-derive";
import { nextTransition } from "../../scripts/tdd/orchestrator-drive";
import type { StoryPipeline, StoryEntry } from "../../scripts/tdd/story-pipeline";

/** A probe driven by per-story boolean maps; absent story => all false. */
function fakeProbe(facts: Record<string, Partial<Record<keyof StoryArtifactProbe, boolean>>>): StoryArtifactProbe {
  const get = (s: string, k: keyof StoryArtifactProbe) => facts[s]?.[k] === true;
  return {
    hasAcs: (s) => get(s, "hasAcs"),
    architectAnnotated: (s) => get(s, "architectAnnotated"),
    testListReady: (s) => get(s, "testListReady"),
    testsWritten: (s) => get(s, "testsWritten"),
    codeWritten: (s) => get(s, "codeWritten"),
  };
}

function pipeline(stories: Record<string, StoryEntry>, opts: Partial<StoryPipeline> = {}): StoryPipeline {
  return {
    version: 1,
    feature_id: "F1",
    stories,
    build_queue: opts.build_queue ?? [],
    build_active: opts.build_active ?? null,
  };
}

const FEATURE: DriveContext = { phase: "feature", breakdownDone: true };

describe("deriveDriveState: gate + acceptance mapping", () => {
  it("maps an approved gate to gateApproved + gateSurfaced", () => {
    const p = pipeline({
      S1: { status: "ready", gate: { status: "approved", history: [] } },
    });
    const s = deriveDriveState(p, fakeProbe({}), FEATURE).stories.S1;
    expect(s.gateApproved).toBe(true);
    expect(s.gateSurfaced).toBe(true);
  });

  it("an open (surfaced, not approved) gate is surfaced but not approved", () => {
    const p = pipeline({ S1: { status: "awaiting-gate", gate: { status: "open", history: [] } } });
    const s = deriveDriveState(p, fakeProbe({}), FEATURE).stories.S1;
    expect(s.gateSurfaced).toBe(true);
    expect(s.gateApproved).toBe(false);
  });

  it("a done story is accepted; an active experiment is cut, a discarded one is not", () => {
    const p = pipeline({
      S1: {
        status: "done",
        gate: { status: "approved", history: [] },
        experiment: { slug: "e", branch: "exp/s1", parent: "feat", n: 1, status: "merged" },
        acceptance: { decision: "accepted", history: [] },
      },
      S2: {
        status: "designing",
        experiment: { slug: "e2", branch: "exp/s2", parent: "feat", n: 1, status: "discarded" },
      },
    });
    const st = deriveDriveState(p, fakeProbe({}), FEATURE);
    expect(st.stories.S1.build.accepted).toBe(true);
    expect(st.stories.S1.build.experimentCut).toBe(true);
    expect(st.stories.S2.build.experimentCut).toBe(false);
  });
});

describe("deriveDriveState + nextTransition: realistic on-disk situations", () => {
  it("planning: proposes the breakdown when nothing is recorded", () => {
    const ctx: DriveContext = { phase: "planning", breakdownDone: false, planning: { proposed: false, requestsAuthored: false } };
    const state = deriveDriveState(pipeline({}), fakeProbe({}), ctx);
    expect(nextTransition(state)).toEqual({ kind: "invoke-role", role: "spec-author", mode: "propose" });
  });

  it("design lane: a story with ACs but no architecture advances to the architect", () => {
    const p = pipeline({ S1: { status: "designing" } });
    const state = deriveDriveState(p, fakeProbe({ S1: { hasAcs: true } }), FEATURE);
    expect(nextTransition(state)).toEqual({ kind: "invoke-role", role: "architect-reviewer", story: "S1" });
  });

  it("dispatches a gate-approved ready story when the build lane is idle", () => {
    const p = pipeline(
      { S1: { status: "ready", gate: { status: "approved", history: [] } } },
      { build_queue: ["S1"], build_active: null },
    );
    const state = deriveDriveState(p, fakeProbe({}), FEATURE);
    expect(nextTransition(state)).toEqual({ kind: "dispatch", story: "S1" });
  });

  it("build lane: experiment cut + RED tests written but no GREEN code -> invoke the driver", () => {
    const p = pipeline(
      {
        S1: {
          status: "building",
          gate: { status: "approved", history: [] },
          experiment: { slug: "e", branch: "exp/s1", parent: "feat", n: 1, status: "active" },
        },
      },
      { build_active: "S1" },
    );
    const state = deriveDriveState(p, fakeProbe({ S1: { testsWritten: true } }), FEATURE);
    expect(nextTransition(state)).toEqual({ kind: "invoke-role", role: "driver", story: "S1" });
  });

  it("all stories accepted + lane idle -> feature-complete", () => {
    const done: StoryEntry = {
      status: "done",
      gate: { status: "approved", history: [] },
      acceptance: { decision: "accepted", history: [] },
    };
    const p = pipeline({ S1: done, S2: done }, { build_active: null });
    const state = deriveDriveState(p, fakeProbe({}), FEATURE);
    expect(nextTransition(state)).toEqual({ kind: "feature-complete" });
  });
});

describe("driverPhaseForTdd", () => {
  it("maps the TDD workflow phase to the driver's coarse phase", () => {
    expect(driverPhaseForTdd("planning")).toBe("planning");
    expect(driverPhaseForTdd("deploy")).toBe("deploy");
    expect(driverPhaseForTdd("shipped")).toBe("done");
    // the per-feature streaming phases all collapse to "feature"
    for (const p of ["discovery", "design", "implementation", "review", "anything"]) {
      expect(driverPhaseForTdd(p)).toBe("feature");
    }
  });
});

describe("assertStoryOrderCoversPipeline", () => {
  it("passes when the order matches the pipeline stories", () => {
    const p = pipeline({ S1: { status: "designing" }, S2: { status: "designing" } });
    expect(() => assertStoryOrderCoversPipeline(p, ["S1", "S2"])).not.toThrow();
  });
  it("throws when a story is missing or extra", () => {
    const p = pipeline({ S1: { status: "designing" } });
    expect(() => assertStoryOrderCoversPipeline(p, ["S1", "S2"])).toThrow(/storyOrder mismatch/);
    expect(() => assertStoryOrderCoversPipeline(p, [])).toThrow(/missing \[S1\]/);
  });
});
