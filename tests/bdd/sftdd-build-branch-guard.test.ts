// FEIP-8023: a Tier-2 drive of a fresh feature (with a prior feature shipped
// out-of-band and never reconciled) committed the GREEN build straight onto the
// shared `staging` tier , the feature branch was never cut and the build-commit
// helper committed onto whatever branch happened to be checked out. The safety
// net is a protected-branch guard: build/experiment commits MUST land on an
// experiment or feature branch, never on a protected tier (main/master/staging/
// dev + configured tiers). It throws loud (ProtectedBranchCommitError) rather
// than silently polluting a shared branch, and the cycle-commit wrapper RE-THROWS
// it instead of swallowing (so the run fails loud, not silently un-committed).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  commitExperimentCode,
  ProtectedBranchCommitError,
  beginNextPendingCycle,
  greenOpenCycle,
  type GreenVerifier,
} from "../../scripts/sftdd/cycle-record.js";

const pass: GreenVerifier = async () => ({ passed: true, summary: "verify passed (test stub)" });

/** A real git repo at `dir` on `branch` with a seed commit. */
function initRepoOn(dir: string, branch: string): void {
  execSync("git init -q", { cwd: dir });
  execSync("git config user.email t@example.com && git config user.name tester", { cwd: dir });
  execSync(`git checkout -q -b ${branch}`, { cwd: dir });
  writeFileSync(join(dir, "README.md"), "seed\n");
  execSync("git add -A && git commit -q -m seed", { cwd: dir });
}

function writeJson(file: string, obj: unknown): void {
  writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

describe("commitExperimentCode refuses a protected tier branch (FEIP-8023)", () => {
  let proj: string;
  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), "sftdd-branch-guard-"));
  });
  afterEach(() => {
    rmSync(proj, { recursive: true, force: true });
    delete process.env.LAKEBASE_TIER_NAMES;
  });

  for (const tier of ["staging", "dev", "main", "master"]) {
    it(`throws on the protected tier "${tier}" (never commits build output there)`, async () => {
      initRepoOn(proj, tier);
      mkdirSync(join(proj, "app"), { recursive: true });
      writeFileSync(join(proj, "app", "main.py"), "x = 1\n");
      await expect(commitExperimentCode(proj, "green: T1")).rejects.toBeInstanceOf(ProtectedBranchCommitError);
      // Nothing was committed onto the tier.
      expect(execSync("git log --oneline", { cwd: proj }).toString()).not.toMatch(/green: T1/);
    });
  }

  it("commits normally on an experiment branch (no false positive)", async () => {
    initRepoOn(proj, "experiment-s1-adjust-quantity-exp1");
    mkdirSync(join(proj, "app"), { recursive: true });
    writeFileSync(join(proj, "app", "main.py"), "x = 1\n");
    await expect(commitExperimentCode(proj, "green: T1")).resolves.toBe(true);
    expect(execSync("git log --oneline", { cwd: proj }).toString()).toMatch(/green: T1/);
  });

  it("commits normally on a feature branch (no false positive)", async () => {
    initRepoOn(proj, "feature-f2-adjust-stock");
    mkdirSync(join(proj, "app"), { recursive: true });
    writeFileSync(join(proj, "app", "main.py"), "x = 1\n");
    await expect(commitExperimentCode(proj, "accept: merge")).resolves.toBe(true);
  });

  it("honors a project-configured extra tier name via LAKEBASE_TIER_NAMES", async () => {
    process.env.LAKEBASE_TIER_NAMES = "qa";
    initRepoOn(proj, "qa");
    mkdirSync(join(proj, "app"), { recursive: true });
    writeFileSync(join(proj, "app", "main.py"), "x = 1\n");
    await expect(commitExperimentCode(proj, "green: T1")).rejects.toBeInstanceOf(ProtectedBranchCommitError);
  });
});

describe("greenOpenCycle fails loud on a protected tier (re-throw wiring, FEIP-8023)", () => {
  let proj: string;
  let ptdd: string;
  const F = "F1";
  const S = "S1";

  function seedCycleTree(): void {
    const acsDir = join(ptdd, "features", F, "stories", S, "acs");
    mkdirSync(acsDir, { recursive: true });
    writeJson(join(acsDir, "AC1.json"), { id: "AC1", layer: "API", text: "the API returns" });
    const items = [{ id: "T1", description: "first thing fails", ac_id: "AC1", status: "pending" }];
    writeJson(join(ptdd, "features", F, "stories", S, "test-list-per-story.json"), { feature_id: F, story_id: S, items });
    writeJson(join(ptdd, "features", F, "test-list.json"), { feature_id: F, items });
    const expDir = join(ptdd, "experiments", F, S, "exp1");
    mkdirSync(expDir, { recursive: true });
    writeFileSync(join(expDir, "branch.txt"), "experiment-s1-exp1");
    writeJson(join(expDir, "outcomes.json"), { status: "running" });
  }

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), "sftdd-green-guard-"));
    ptdd = join(proj, ".tdd");
    seedCycleTree();
  });
  afterEach(() => {
    rmSync(proj, { recursive: true, force: true });
  });

  it("rejects with ProtectedBranchCommitError when the build is checked out on staging", async () => {
    initRepoOn(proj, "staging");
    beginNextPendingCycle({ sftddDir: ptdd, featureId: F, story: S });
    writeFileSync(join(proj, "app.py"), "x = 1\n");
    // The GREEN commit is attempted onto staging , the guard must surface loud
    // (commitCycleWork re-throws it) rather than silently proceeding un-committed.
    await expect(greenOpenCycle({ sftddDir: ptdd, featureId: F, story: S, verify: pass })).rejects.toBeInstanceOf(
      ProtectedBranchCommitError,
    );
  });

  it("greens normally on the experiment branch (no false positive)", async () => {
    initRepoOn(proj, "experiment-s1-exp1");
    beginNextPendingCycle({ sftddDir: ptdd, featureId: F, story: S });
    writeFileSync(join(proj, "app.py"), "x = 1\n");
    const g = await greenOpenCycle({ sftddDir: ptdd, featureId: F, story: S, verify: pass });
    expect(g.recorded).toBe(true);
  });
});
