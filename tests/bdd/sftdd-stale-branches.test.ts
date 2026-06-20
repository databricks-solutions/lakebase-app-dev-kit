// stale spike vs experiment classification for scm-doctor. Hermetic
// (.tdd records only).

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findStaleBranches } from "../../scripts/sftdd/stale-branches";
import {
  initPipeline,
  setStoryStatus,
  surfaceForGate,
  approveStoryGate,
  cutStoryExperiment,
  dispatchNext,
  acceptStory,
  awaitAcceptance,
  writePipeline,
} from "../../scripts/sftdd/story-pipeline";

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d) fs.rmSync(d, { recursive: true, force: true });
  }
});
function mkTdd(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "feip7566-stale-"));
  tmpDirs.push(d);
  return d;
}

const AT = "2026-06-07T12:00:00.000Z";

function buildStory(tdd: string) {
  const p = initPipeline("F1-bug-tracker");
  surfaceForGate(p, "S1");
  approveStoryGate(p, "S1", { approver: "po", at: AT });
  dispatchNext(p); // S1 building
  cutStoryExperiment(p, "S1", { slug: "s1-exp", branch: "exp/F1/S1", parent: "feature/F1", at: AT });
  return p;
}

function seedSpike(tdd: string, slug: string): void {
  const dir = path.join(tdd, "spikes", slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "branch.txt"), `spike-${slug}`);
}

describe("stale-branches: experiments", () => {
  it("flags an experiment still active while its story is done (teardown failed)", () => {
    const tdd = mkTdd();
    const p = buildStory(tdd);
    // Simulate a crashed merge: story forced done but experiment never merged.
    setStoryStatus(p, "S1", "done");
    writePipeline(tdd, p);
    const findings = findStaleBranches(tdd);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "experiment",
      slug: "s1-exp",
      feature_id: "F1-bug-tracker",
      story_id: "S1",
      branch: "exp/F1/S1",
    });
  });

  it("does NOT flag a healthy accepted experiment (status merged)", () => {
    const tdd = mkTdd();
    const p = buildStory(tdd);
    awaitAcceptance(p, "S1");
    acceptStory(p, "S1", { approver: "po", at: AT }); // experiment -> merged, story -> done
    writePipeline(tdd, p);
    expect(findStaleBranches(tdd).filter((f) => f.kind === "experiment")).toEqual([]);
  });

  it("does NOT flag an experiment that is still mid-build (story not terminal)", () => {
    const tdd = mkTdd();
    const p = buildStory(tdd); // S1 building, experiment active
    writePipeline(tdd, p);
    expect(findStaleBranches(tdd).filter((f) => f.kind === "experiment")).toEqual([]);
  });
});

describe("stale-branches: spikes", () => {
  it("flags every spike with a paired branch (spikes are throwaway)", () => {
    const tdd = mkTdd();
    seedSpike(tdd, "explore-arrays");
    seedSpike(tdd, "explore-jsonb");
    const findings = findStaleBranches(tdd).filter((f) => f.kind === "spike");
    expect(findings.map((f) => f.slug).sort()).toEqual(["explore-arrays", "explore-jsonb"]);
    expect(findings[0].branch).toMatch(/^spike-/);
  });

  it("returns [] on an empty .tdd (no experiments, no spikes)", () => {
    expect(findStaleBranches(mkTdd())).toEqual([]);
  });
});
