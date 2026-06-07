// Orchestrator driver loop (phase 2) integration tests.
//
// Drives a whole feature through runDriver() with an in-memory fake whose
// perform() applies each action's effect exactly as the real effects would on
// disk. This proves the loop converges, the per-story pipeline STREAMS (build
// starts on story 1 before later stories finish designing), the single build
// lane stays serialized, and a non-advancing effect is caught as a stall.

import { describe, it, expect } from "vitest";
import {
  runDriver,
  driverBoundOptions,
  DriverStalledError,
  type DriveEffects,
} from "../../scripts/tdd/orchestrator-run";
import type { DriveState, StoryView, WorkflowAction } from "../../scripts/tdd/orchestrator-drive";

function freshStory(): StoryView {
  return {
    gateApproved: false,
    gateSurfaced: false,
    design: { hasAcs: false, architectAnnotated: false, testListReady: false },
    build: {
      experimentCut: false,
      testsWritten: false,
      codeWritten: false,
      awaitingAcceptance: false,
      deployVerified: false,
      accepted: false,
    },
  };
}

/** In-memory reference model: perform(action) mutates the state the same way
 *  the real disk-backed effects would, so the loop can drive it to done. */
function makeFakeWorld(storyIds: string[]) {
  const state: DriveState = {
    phase: "planning",
    planning: { proposed: false, requestsAuthored: false },
    breakdownDone: false,
    storyOrder: [],
    stories: {},
    buildActive: null,
    deploy: { deployed: false, gateApproved: false },
  };
  const log: WorkflowAction[] = [];

  const effects: DriveEffects = {
    async readState() {
      return state;
    },
    onAction(action) {
      log.push(action);
    },
    async perform(action) {
      switch (action.kind) {
        case "invoke-role": {
          if ("mode" in action) {
            if (action.role === "spec-author" && action.mode === "propose") {
              state.planning!.proposed = true;
            } else if (action.role === "product-owner" && action.mode === "author-requests") {
              state.planning!.requestsAuthored = true;
            } else if (action.role === "spec-author" && action.mode === "breakdown") {
              state.breakdownDone = true;
              state.storyOrder = [...storyIds];
              for (const id of storyIds) state.stories[id] = freshStory();
            }
          } else {
            const s = state.stories[action.story];
            if (action.role === "spec-author") s.design.hasAcs = true;
            else if (action.role === "architect-reviewer") s.design.architectAnnotated = true;
            else if (action.role === "test-strategist") s.design.testListReady = true;
            else if (action.role === "navigator") s.build.testsWritten = true;
            else if (action.role === "driver") s.build.codeWritten = true;
          }
          break;
        }
        case "surface-gate":
          state.stories[action.story].gateSurfaced = true;
          break;
        case "approve-gate":
          state.stories[action.story].gateApproved = true;
          break;
        case "dispatch":
          state.buildActive = action.story;
          break;
        case "cut-experiment":
          state.stories[action.story].build.experimentCut = true;
          break;
        case "await-acceptance":
          // The story deploy (release-engineer) passed: present for acceptance
          // AND record the verified evidence (the teeth on accept).
          state.stories[action.story].build.awaitingAcceptance = true;
          state.stories[action.story].build.deployVerified = true;
          break;
        case "accept":
          state.stories[action.story].build.accepted = true;
          break;
        case "complete":
          state.buildActive = null;
          break;
        case "approve-plan-gate":
          state.planning!.gateApproved = true;
          break;
        case "planning-complete":
          state.phase = "feature";
          break;
        case "feature-complete":
          state.phase = "deploy";
          break;
        case "deploy":
          state.deploy!.deployed = true;
          break;
        case "approve-deploy-gate":
          state.deploy!.gateApproved = true;
          break;
        case "done":
          // Terminal effect: mark the feature finished so a re-read settles.
          state.phase = "done";
          break;
      }
    },
  };

  return { state, log, effects };
}

const firstIndex = (log: WorkflowAction[], pred: (a: WorkflowAction) => boolean): number =>
  log.findIndex(pred);

describe("runDriver: drives a whole feature to done", () => {
  it("planning -> per-story design+build -> deploy -> done, all stories accepted", async () => {
    const { state, effects } = makeFakeWorld(["S1", "S2", "S3"]);
    const result = await runDriver(effects);

    expect(state.phase).toBe("done");
    expect(state.planning).toEqual({ proposed: true, requestsAuthored: true, gateApproved: true });
    expect(state.deploy).toEqual({ deployed: true, gateApproved: true });
    for (const id of ["S1", "S2", "S3"]) {
      expect(state.stories[id].gateApproved, `${id} gate`).toBe(true);
      expect(state.stories[id].build.accepted, `${id} accepted`).toBe(true);
    }
    expect(state.buildActive).toBeNull();
    expect(result.iterations).toBeGreaterThan(0);
  });
});

describe("runDriver: the per-story pipeline streams", () => {
  it("starts building S1 before S3 finishes designing", async () => {
    const { log, effects } = makeFakeWorld(["S1", "S2", "S3"]);
    await runDriver(effects);

    // S1 enters the build lane (cut-experiment) ...
    const s1BuildStart = firstIndex(log, (a) => a.kind === "cut-experiment" && a.story === "S1");
    // ... before S3's gate is even approved (i.e. before S3 finishes designing).
    const s3DesignDone = firstIndex(log, (a) => a.kind === "approve-gate" && a.story === "S3");

    expect(s1BuildStart).toBeGreaterThanOrEqual(0);
    expect(s3DesignDone).toBeGreaterThanOrEqual(0);
    expect(s1BuildStart).toBeLessThan(s3DesignDone);
  });

  it("serializes the build lane: S1 completes before S2 is cut", async () => {
    const { log, effects } = makeFakeWorld(["S1", "S2"]);
    await runDriver(effects);

    const s1Complete = firstIndex(log, (a) => a.kind === "complete" && a.story === "S1");
    const s2Cut = firstIndex(log, (a) => a.kind === "cut-experiment" && a.story === "S2");
    expect(s1Complete).toBeGreaterThanOrEqual(0);
    expect(s2Cut).toBeGreaterThan(s1Complete);
  });
});

describe("runDriver: maxSteps", () => {
  it("stops after maxSteps actions without reaching done", async () => {
    const { effects } = makeFakeWorld(["S1", "S2", "S3"]);
    const result = await runDriver(effects, { maxSteps: 3 });
    expect(result.stoppedAtMax).toBe(true);
    expect(result.iterations).toBe(3);
  });
});

describe("runDriver: stall detection", () => {
  it("throws DriverStalledError when an effect does not advance state", async () => {
    const state: DriveState = {
      phase: "planning",
      planning: { proposed: false, requestsAuthored: false },
      breakdownDone: false,
      storyOrder: [],
      stories: {},
      buildActive: null,
    };
    // perform() is a no-op: the first action (invoke spec-author propose) never
    // records, so nextTransition keeps returning it -> stall on the 2nd pass.
    const effects: DriveEffects = {
      async readState() {
        return state;
      },
      async perform() {
        /* intentionally does nothing */
      },
    };
    await expect(runDriver(effects)).rejects.toBeInstanceOf(DriverStalledError);
  });
});

describe("runDriver: Tier-2 phase bounds (driverBoundOptions, FEIP-7461)", () => {
  it("--plan-only runs planning to the approved plan gate, then stops (gate is the terminal)", async () => {
    const { state, log, effects } = makeFakeWorld(["S1", "S2"]);
    const result = await runDriver(effects, driverBoundOptions("plan"));
    expect(result.stoppedAtBound).toBe(true);
    expect(state.planning).toEqual({ proposed: true, requestsAuthored: true, gateApproved: true });
    // Stops AT planning-complete: not performed, so the phase stays planning and
    // no feature work (breakdown/build) happened.
    expect(state.phase).toBe("planning");
    expect(log.some((a) => a.kind === "planning-complete")).toBe(false);
    expect(log.some((a) => a.kind === "invoke-role" && "mode" in a && a.mode === "breakdown")).toBe(false);
    expect(log.some((a) => a.kind === "cut-experiment")).toBe(false);
  });

  it("--only design designs every story through its gate but builds none", async () => {
    const { state, log, effects } = makeFakeWorld(["S1", "S2"]);
    state.phase = "feature"; // design assumes planning done + feature claimed
    const result = await runDriver(effects, driverBoundOptions("design"));
    expect(result.stoppedAtBound).toBe(true);
    for (const id of ["S1", "S2"]) expect(state.stories[id].gateApproved, `${id} gated`).toBe(true);
    expect(log.some((a) => a.kind === "dispatch")).toBe(false); // never entered the build lane
    expect(log.some((a) => a.kind === "cut-experiment")).toBe(false);
  });

  it("--only build builds gate-approved stories then stops before deploy", async () => {
    const { state, log, effects } = makeFakeWorld(["S1", "S2"]);
    state.phase = "feature";
    state.breakdownDone = true;
    state.storyOrder = ["S1", "S2"];
    for (const id of ["S1", "S2"]) {
      const v = freshStory();
      v.design = { hasAcs: true, architectAnnotated: true, testListReady: true };
      v.gateApproved = true;
      v.gateSurfaced = true;
      state.stories[id] = v;
    }
    const result = await runDriver(effects, driverBoundOptions("build"));
    expect(result.stoppedAtBound).toBe(true);
    for (const id of ["S1", "S2"]) expect(state.stories[id].build.accepted, `${id} accepted`).toBe(true);
    expect(log.some((a) => a.kind === "feature-complete")).toBe(false); // stopped before deploy
    expect(log.some((a) => a.kind === "deploy")).toBe(false);
  });

  it("--only build refuses (stops at iteration 0) when design is not done", async () => {
    const { log, effects } = makeFakeWorld(["S1"]);
    const state = await effects.readState();
    state.phase = "feature"; // breakdown not done, nothing designed
    const result = await runDriver(effects, driverBoundOptions("build"));
    expect(result.stoppedAtBound).toBe(true);
    expect(result.iterations).toBe(0);
    expect(log.length).toBe(0);
  });

  it("--only deploy runs the deploy phase to done", async () => {
    const { state, log, effects } = makeFakeWorld([]);
    state.phase = "deploy";
    const result = await runDriver(effects, driverBoundOptions("deploy"));
    expect(state.deploy).toEqual({ deployed: true, gateApproved: true });
    expect(log.some((a) => a.kind === "deploy")).toBe(true);
    expect(result.stoppedAtBound).toBeUndefined(); // completed at done, not a bound stop
  });
});
