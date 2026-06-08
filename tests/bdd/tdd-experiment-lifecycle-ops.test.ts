// FEIP-7566 phase 2: orchestration of the experiment branch lifecycle
// (merge = git-merge + migrate + teardown; discard = teardown only). Hermetic:
// the side-effectful ops are faked so we assert ORDER + fail-closed semantics
// without touching git or Lakebase.

import { describe, it, expect } from "vitest";
import {
  mergeExperimentIntoFeature,
  discardExperimentBranch,
  type ExperimentBranchOps,
} from "../../scripts/tdd/experiment-lifecycle";

function recordingOps(overrides: Partial<ExperimentBranchOps> = {}): {
  ops: ExperimentBranchOps;
  calls: string[];
} {
  const calls: string[] = [];
  const ops: ExperimentBranchOps = {
    gitMerge: async () => {
      calls.push("gitMerge");
    },
    runMigrations: async () => {
      calls.push("runMigrations");
    },
    teardown: async () => {
      calls.push("teardown");
    },
    ...overrides,
  };
  return { ops, calls };
}

const MERGE_ARGS = {
  tddDir: "/tmp/.tdd",
  featureId: "F1",
  storyId: "S1",
  experimentSlug: "s1-exp",
  featureBranch: "feature/F1",
  experimentBranch: "exp/F1/S1-exp",
  instance: "lb-instance",
  projectDir: "/tmp/proj",
};

const DISCARD_ARGS = {
  tddDir: "/tmp/.tdd",
  projectDir: "/tmp/proj",
  featureId: "F1",
  storyId: "S1",
  experimentSlug: "s1-exp",
  instance: "lb-instance",
};

describe("experiment-lifecycle: merge (accept)", () => {
  it("runs git-merge, then migrations, then teardown, in that order", async () => {
    const { ops, calls } = recordingOps();
    const result = await mergeExperimentIntoFeature(MERGE_ARGS, ops);
    expect(calls).toEqual(["gitMerge", "runMigrations", "teardown"]);
    expect(result).toEqual({ merged: true, feature_branch: "feature/F1", experiment_slug: "s1-exp" });
  });

  it("passes the experiment branch as the merge source and the feature branch as the target", async () => {
    const seen: { from?: string; into?: string } = {};
    const { ops } = recordingOps({
      gitMerge: async (a) => {
        seen.from = a.from;
        seen.into = a.into;
      },
    });
    await mergeExperimentIntoFeature(MERGE_ARGS, ops);
    expect(seen).toEqual({ from: "exp/F1/S1-exp", into: "feature/F1" });
  });

  it("runs migrations against the FEATURE branch's Lakebase DB (not the experiment's)", async () => {
    let migrateBranch: string | undefined;
    const { ops } = recordingOps({
      runMigrations: async (a) => {
        migrateBranch = a.branch;
      },
    });
    await mergeExperimentIntoFeature(MERGE_ARGS, ops);
    expect(migrateBranch).toBe("feature/F1");
  });

  it("does NOT migrate or tear down when the git-merge fails (experiment preserved for retry)", async () => {
    const { ops, calls } = recordingOps({
      gitMerge: async () => {
        throw new Error("merge conflict");
      },
    });
    await expect(mergeExperimentIntoFeature(MERGE_ARGS, ops)).rejects.toThrow(/merge conflict/);
    expect(calls).toEqual([]); // nothing after the failed merge
  });

  it("does NOT tear down when the migration run fails (experiment preserved for diagnosis)", async () => {
    const { ops, calls } = recordingOps({
      runMigrations: async () => {
        throw new Error("migration failed");
      },
    });
    await expect(mergeExperimentIntoFeature(MERGE_ARGS, ops)).rejects.toThrow(/migration failed/);
    expect(calls).toEqual(["gitMerge"]); // merged, but not torn down
  });
});

describe("experiment-lifecycle: discard / revise", () => {
  it("tears down the experiment with no merge and no migration run", async () => {
    const { ops, calls } = recordingOps();
    await discardExperimentBranch(DISCARD_ARGS, ops);
    expect(calls).toEqual(["teardown"]);
  });

  it("forwards the experiment identity to teardown", async () => {
    let seen: { featureId?: string; storyId?: string; experimentSlug?: string } = {};
    const { ops } = recordingOps({
      teardown: async (a) => {
        seen = { featureId: a.featureId, storyId: a.storyId, experimentSlug: a.experimentSlug };
      },
    });
    await discardExperimentBranch(DISCARD_ARGS, ops);
    expect(seen).toEqual({ featureId: "F1", storyId: "S1", experimentSlug: "s1-exp" });
  });
});
