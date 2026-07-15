// FEIP-8013: the shared merge+accept core that both `lakebase-sftdd-experiment
// merge` and `lakebase-sftdd-pipeline accept` route through, so following the
// acceptance gate's instruction (`pipeline accept`) actually git-merges the
// story's code onto the feature branch instead of recording state only.
// Hermetic: the side-effectful ops are faked (no git / Lakebase).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  mergeAndAcceptStory,
  resolveAcceptMergeArgs,
} from "../../scripts/sftdd/experiment-merge";
import type { ExperimentBranchOps } from "../../scripts/sftdd/experiment-lifecycle";
import { readPipeline, writePipeline, type StoryPipeline } from "../../scripts/sftdd/story-pipeline";

const F = "F1";
const S = "S1";
let tdd: string;

function recordingOps(): { ops: ExperimentBranchOps; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    ops: {
      gitMerge: async () => void calls.push("gitMerge"),
      runMigrations: async () => void calls.push("runMigrations"),
      teardown: async () => void calls.push("teardown"),
    },
  };
}

function seedExperiment(status: "active" | "merged"): void {
  const pipeline: StoryPipeline = {
    version: 1,
    feature_id: F,
    build_queue: [],
    build_active: S,
    stories: {
      [S]: {
        status: "awaiting-acceptance",
        experiment: { slug: "s1-exp", branch: "exp/F1/s1-exp", parent: "feature-F1", status, n: 1 },
      },
    },
  } as StoryPipeline;
  writePipeline(tdd, pipeline);
}

const acceptArgs = () => ({
  sftddDir: tdd,
  projectDir: "/tmp/proj",
  featureId: F,
  storyId: S,
  experimentSlug: "s1-exp",
  experimentBranch: "exp/F1/s1-exp",
  featureBranch: "feature-F1",
  instance: "lb-instance",
  approver: "kevin.hartman",
});

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "exp-merge-"));
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

describe("mergeAndAcceptStory", () => {
  it("an ACTIVE experiment: git-merges (+ migrate + teardown), then records acceptance", async () => {
    seedExperiment("active");
    const { ops, calls } = recordingOps();
    await mergeAndAcceptStory(acceptArgs(), ops);
    // The merge actually ran (the code lands on the feature branch), in order.
    expect(calls).toEqual(["gitMerge", "runMigrations", "teardown"]);
    // ...and the pipeline records the acceptance.
    const p = readPipeline(tdd, F);
    expect(p.stories[S].experiment?.status).toBe("merged");
    expect(p.stories[S].status).toBe("done");
    expect(p.stories[S].acceptance?.decision).toBe("accepted");
  });

  it("is idempotent: an already-MERGED experiment skips the merge but ensures acceptance", async () => {
    seedExperiment("merged");
    const { ops, calls } = recordingOps();
    await mergeAndAcceptStory(acceptArgs(), ops);
    // No re-merge (a re-run must not git-merge twice).
    expect(calls).toEqual([]);
    const p = readPipeline(tdd, F);
    expect(p.stories[S].status).toBe("done");
    expect(p.stories[S].acceptance?.decision).toBe("accepted");
  });
});

describe("resolveAcceptMergeArgs", () => {
  it("resolves slug/branches from the experiment record + an explicit --instance", () => {
    seedExperiment("active");
    const r = resolveAcceptMergeArgs(tdd, "/tmp/proj", F, S, { instance: "lb-x" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.experimentSlug).toBe("s1-exp");
      expect(r.experimentBranch).toBe("exp/F1/s1-exp");
      expect(r.featureBranch).toBe("feature-F1"); // the forked-from feature branch
      expect(r.instance).toBe("lb-x");
    }
  });

  it("errors when no experiment is recorded for the story (nothing to merge)", () => {
    writePipeline(tdd, { version: 1, feature_id: F, build_queue: [], build_active: null, stories: { [S]: { status: "awaiting-acceptance" } } } as StoryPipeline);
    const r = resolveAcceptMergeArgs(tdd, "/tmp/proj", F, S, { instance: "lb-x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no experiment/i);
  });

  it("errors when the instance cannot be resolved (no --instance, no scm-state)", () => {
    seedExperiment("active");
    const r = resolveAcceptMergeArgs(tdd, "/tmp/proj-without-scm-state", F, S);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/instance/i);
  });
});
