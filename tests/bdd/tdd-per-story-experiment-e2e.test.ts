// phase 5: hermetic end-to-end of the per-story experiment workflow.
// Drives a 3-story feature through the full pipeline (spec gate -> dispatch ->
// cut experiment -> build -> await acceptance) and the lifecycle (accept = merge,
// discard, revise), with the branch ops faked. Asserts the headline guarantees:
// the single build lane stays serial, ONLY accepted experiments merge into the
// feature branch, discarded/revised experiments leave no trace, and a revised
// story re-builds and can then be accepted. No git, no Lakebase.

import { describe, it, expect } from "vitest";
import {
  initPipeline,
  setStoryStatus,
  surfaceForGate,
  approveStoryGate,
  dispatchNext,
  cutStoryExperiment,
  awaitAcceptance,
  acceptStory,
  discardStory,
  reviseStory,
  getStoryGate,
  getStoryAcceptance,
  type StoryPipeline,
} from "../../scripts/tdd/story-pipeline";
import {
  mergeExperimentIntoFeature,
  discardExperimentBranch,
  type ExperimentBranchOps,
} from "../../scripts/tdd/experiment-lifecycle";

const AT = "2026-06-07T12:00:00.000Z";
const FEATURE_BRANCH = "feature/F1";

function recordingOps(): { ops: ExperimentBranchOps; merged: string[]; tornDown: string[] } {
  const merged: string[] = [];
  const tornDown: string[] = [];
  const ops: ExperimentBranchOps = {
    gitMerge: async ({ from }) => {
      merged.push(from);
    },
    runMigrations: async () => {},
    teardown: async ({ experimentSlug }) => {
      tornDown.push(experimentSlug);
    },
  };
  return { ops, merged, tornDown };
}

// One story's full build-lane turn: cut its experiment, build, surface for the
// PO. Mirrors what the orchestrator + lakebase-tdd-experiment CLI do.
function dispatchAndCut(p: StoryPipeline, storyId: string, slug: string): string {
  const dispatched = dispatchNext(p);
  expect(dispatched).toBe(storyId); // single lane: this story is the head
  const branch = `exp/F1/${slug}`;
  cutStoryExperiment(p, storyId, { slug, branch, parent: FEATURE_BRANCH, at: AT });
  awaitAcceptance(p, storyId); // built + deployed, PO reviewing
  return branch;
}

async function accept(p: StoryPipeline, storyId: string, slug: string, branch: string, ops: ExperimentBranchOps) {
  await mergeExperimentIntoFeature(
    { tddDir: "/tmp/.tdd", featureId: "F1", storyId, experimentSlug: slug, featureBranch: FEATURE_BRANCH, experimentBranch: branch, instance: "lb", projectDir: "/tmp" },
    ops,
  );
  acceptStory(p, storyId, { approver: "po", at: AT });
}

async function discard(p: StoryPipeline, storyId: string, slug: string, ops: ExperimentBranchOps, reason: string) {
  await discardExperimentBranch({ tddDir: "/tmp/.tdd", projectDir: "/tmp", featureId: "F1", storyId, experimentSlug: slug, instance: "lb" }, ops);
  discardStory(p, storyId, { approver: "po", at: AT, reason });
}

async function revise(p: StoryPipeline, storyId: string, slug: string, ops: ExperimentBranchOps, reason: string) {
  await discardExperimentBranch({ tddDir: "/tmp/.tdd", projectDir: "/tmp", featureId: "F1", storyId, experimentSlug: slug, instance: "lb" }, ops);
  reviseStory(p, storyId, { approver: "po", at: AT, reason });
}

describe("per-story experiment e2e: accept / discard / revise across a 3-story feature", () => {
  it("merges only accepted experiments into the feature; discarded + revised leave no trace", async () => {
    const { ops, merged, tornDown } = recordingOps();
    const p = initPipeline("F1");

    // Design lane runs ahead: all three stories designed + spec-gate approved.
    for (const s of ["S1", "S2", "S3"]) {
      setStoryStatus(p, s, "designing");
      surfaceForGate(p, s);
      approveStoryGate(p, s, { approver: "po", at: AT }); // -> ready, queued
    }
    expect(p.build_queue).toEqual(["S1", "S2", "S3"]);

    // --- Drain the single build lane in FIFO order ---

    // S1: build -> PO accepts -> experiment merges into the feature.
    const s1Branch = dispatchAndCut(p, "S1", "s1-exp");
    await accept(p, "S1", "s1-exp", s1Branch, ops);
    expect(p.stories.S1.status).toBe("done");
    expect(p.build_active).toBeNull(); // lane freed

    // S2: build -> PO discards -> torn down, out of sprint, spec gate withdrawn.
    dispatchAndCut(p, "S2", "s2-exp");
    await discard(p, "S2", "s2-exp", ops, "PO does not want it");
    expect(p.stories.S2.status).toBe("discarded");
    expect(getStoryGate(p, "S2").status).toBe("withdrawn");
    expect(p.build_active).toBeNull();

    // S3: build -> PO sends back to revise -> torn down, back to designing.
    dispatchAndCut(p, "S3", "s3-exp");
    await revise(p, "S3", "s3-exp", ops, "close, needs rework");
    expect(p.stories.S3.status).toBe("designing");
    expect(getStoryAcceptance(p, "S3").decision).toBe("revise");
    expect(p.build_active).toBeNull();
    expect(p.build_queue).toEqual([]); // queue drained

    // S3 re-designed, re-gated, re-built on a FRESH experiment, then accepted.
    surfaceForGate(p, "S3");
    approveStoryGate(p, "S3", { approver: "po", at: AT });
    const s3Branch2 = dispatchAndCut(p, "S3", "s3-exp-v2");
    await accept(p, "S3", "s3-exp-v2", s3Branch2, ops);
    expect(p.stories.S3.status).toBe("done");

    // --- Terminal assertions ---
    // Only S1 + the accepted S3 retry merged into the feature; S2 + the revised
    // S3 attempt never touched the feature branch.
    expect(merged).toEqual(["exp/F1/s1-exp", "exp/F1/s3-exp-v2"]);
    // Every cut experiment was torn down (accept teardown x2, discard, revise).
    expect(tornDown.sort()).toEqual(["s1-exp", "s2-exp", "s3-exp", "s3-exp-v2"]);
    // Final pipeline: S1 done, S2 discarded, S3 done.
    expect(p.stories.S1.status).toBe("done");
    expect(p.stories.S2.status).toBe("discarded");
    expect(p.stories.S3.status).toBe("done");
  });

  it("keeps the single-lane invariant: a second story never dispatches while one builds", async () => {
    const p = initPipeline("F1");
    for (const s of ["S1", "S2"]) {
      surfaceForGate(p, s);
      approveStoryGate(p, s, { approver: "po", at: AT });
    }
    expect(dispatchNext(p)).toBe("S1");
    cutStoryExperiment(p, "S1", { slug: "s1", branch: "exp/F1/s1", parent: FEATURE_BRANCH, at: AT });
    awaitAcceptance(p, "S1"); // lane occupied during PO review
    expect(dispatchNext(p)).toBeNull(); // S2 must wait, even though it is ready + queued
    expect(p.build_queue).toEqual(["S2"]);
  });
});
