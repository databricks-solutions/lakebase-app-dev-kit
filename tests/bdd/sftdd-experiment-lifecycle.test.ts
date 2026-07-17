import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs";
import { execSync } from "node:child_process";
import { tmpdir } from "os";
import { join } from "path";
import {
  listExperiments,
  readOutcomes,
  writeOutcomes,
  deleteExperiment,
  cutExperiment,
  type CutExperimentDeps,
} from "../../scripts/sftdd/experiment";

// LIVE gate uses LAKEBASE_TEST_INSTANCE (the bare project id; substrate's
// `instance: string` parameter shape). Previously the test gated on
// LAKEBASE_TEST_PROJECT_PATH and fed that into `instance`, double-prefixing
// to "projects/projects/<id>" once branch-utils' projectPath() helper ran.
// Bare instance is the right consumer shape (see scripts/lakebase/branch-utils.ts).
const LIVE =
  process.env.LAKEBASE_TEST_E2E === "1" &&
  !!process.env.DATABRICKS_HOST &&
  !!process.env.LAKEBASE_TEST_INSTANCE;

let tdd: string;

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-exp-"));
});

afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

describe("experiment lifecycle (hermetic)", () => {
  it("listExperiments returns empty when no experiments dir exists", () => {
    expect(listExperiments(tdd, "F1", "S1")).toEqual([]);
  });

  // Finding 27: a re-cut after a discarded experiment must re-fork the polluted
  // paired branch. cutExperiment(resetStaleBranch) drops it BEFORE forking; the
  // ordering is proven hermetically via the injected paired-branch ops seam (the
  // live drop+fork is exercised by the LIVE gate above).
  function pairedSeam(calls: string[]): CutExperimentDeps {
    return {
      createPairedBranch: (async () => {
        calls.push("create");
        return { branch: { name: "experiment/S1-exp1" }, gitBranch: "experiment-s1-exp1", gitBranchCreated: true, envSynced: true, warnings: [] };
      }) as unknown as CutExperimentDeps["createPairedBranch"],
      deletePairedBranch: (async () => {
        calls.push("drop");
        return { deleted: true, warnings: [] };
      }) as unknown as CutExperimentDeps["deletePairedBranch"],
    };
  }
  const cutArgs = {
    instance: "lb", sftddDir: "", projectDir: "", featureId: "F1", storyId: "S1",
    experimentSlug: "exp1", branch: "experiment/S1-exp1", parentBranch: "feature/x",
  };

  it("resetStaleBranch drops the existing paired branch BEFORE forking (Finding 27)", async () => {
    const calls: string[] = [];
    const rec = await cutExperiment({ ...cutArgs, sftddDir: tdd, projectDir: tdd, resetStaleBranch: true }, pairedSeam(calls));
    expect(calls).toEqual(["drop", "create"]);
    expect(rec.branch_id).toBe("S1-exp1");
  });

  it("a first cut (no resetStaleBranch) forks WITHOUT dropping", async () => {
    const calls: string[] = [];
    await cutExperiment({ ...cutArgs, sftddDir: tdd, projectDir: tdd }, pairedSeam(calls));
    expect(calls).toEqual(["create"]);
  });

  it("a resetStaleBranch drop that throws (no stale branch) still forks clean", async () => {
    const calls: string[] = [];
    const seam: CutExperimentDeps = {
      ...pairedSeam(calls),
      deletePairedBranch: (async () => {
        calls.push("drop-throw");
        throw new Error("branch not found");
      }) as unknown as CutExperimentDeps["deletePairedBranch"],
    };
    const rec = await cutExperiment({ ...cutArgs, sftddDir: tdd, projectDir: tdd, resetStaleBranch: true }, seam);
    expect(calls).toEqual(["drop-throw", "create"]); // best-effort: the fork still ran
    expect(rec.branch_id).toBe("S1-exp1");
  });

  it("listExperiments reads existing experiment dirs", () => {
    const dir = join(tdd, "experiments", "F1", "S1", "exp-1-postgres");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "branch.txt"), "feature/test-exp-1");
    const list = listExperiments(tdd, "F1", "S1");
    expect(list.length).toBe(1);
    expect(list[0].branch_id).toBe("feature/test-exp-1");
    expect(list[0].experiment_slug).toBe("exp-1-postgres");
  });

  it("readOutcomes returns null when outcomes file is missing", () => {
    const dir = join(tdd, "experiments", "F1", "S1", "exp-1");
    mkdirSync(dir, { recursive: true });
    expect(readOutcomes(tdd, "F1", "S1", "exp-1")).toBeNull();
  });

  it("writeOutcomes then readOutcomes round-trip", () => {
    const dir = join(tdd, "experiments", "F1", "S1", "exp-1");
    mkdirSync(dir, { recursive: true });
    writeOutcomes(tdd, "F1", "S1", "exp-1", { status: "succeeded", tests_passed: 12 });
    const round = readOutcomes(tdd, "F1", "S1", "exp-1");
    expect(round?.status).toBe("succeeded");
    expect(round?.tests_passed).toBe(12);
  });

  it("writeOutcomes round-trips the per-tag breakdown (api/e2e/infra)", () => {
    const dir = join(tdd, "experiments", "F1", "S1", "exp-tags");
    mkdirSync(dir, { recursive: true });
    writeOutcomes(tdd, "F1", "S1", "exp-tags", {
      status: "running",
      tests_passed: 7,
      tests_failed: 2,
      by_tag: {
        api: { passed: 5, failed: 0 },
        e2e: { passed: 1, failed: 2 },
        infra: { passed: 1, failed: 0 },
      },
    });
    const round = readOutcomes(tdd, "F1", "S1", "exp-tags");
    expect(round?.by_tag?.api).toEqual({ passed: 5, failed: 0 });
    expect(round?.by_tag?.e2e).toEqual({ passed: 1, failed: 2 });
    expect(round?.by_tag?.infra).toEqual({ passed: 1, failed: 0 });
    // Top-level totals stay authoritative; the breakdown does not have to sum.
    expect(round?.tests_passed).toBe(7);
    expect(round?.tests_failed).toBe(2);
  });

  it("by_tag entries are individually optional (partial reporting is valid)", () => {
    const dir = join(tdd, "experiments", "F1", "S1", "exp-partial");
    mkdirSync(dir, { recursive: true });
    writeOutcomes(tdd, "F1", "S1", "exp-partial", {
      status: "running",
      tests_passed: 3,
      by_tag: { api: { passed: 3, failed: 0 } },
    });
    const round = readOutcomes(tdd, "F1", "S1", "exp-partial");
    expect(round?.by_tag?.api).toEqual({ passed: 3, failed: 0 });
    expect(round?.by_tag?.e2e).toBeUndefined();
    expect(round?.by_tag?.infra).toBeUndefined();
  });

  it("by_tag is omitted entirely when no tag breakdown is reported (backwards compatible)", () => {
    const dir = join(tdd, "experiments", "F1", "S1", "exp-no-tags");
    mkdirSync(dir, { recursive: true });
    writeOutcomes(tdd, "F1", "S1", "exp-no-tags", {
      status: "succeeded",
      tests_passed: 4,
      tests_failed: 0,
    });
    const round = readOutcomes(tdd, "F1", "S1", "exp-no-tags");
    expect(round?.by_tag).toBeUndefined();
    expect(round?.tests_passed).toBe(4);
  });

  it("deleteExperiment preserves on-disk record when deleteBranchToo is false", async () => {
    const dir = join(tdd, "experiments", "F1", "S1", "exp-1");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "branch.txt"), "feature/test-exp-1");
    await deleteExperiment({
      instance: "irrelevant",
      sftddDir: tdd,
      projectDir: tdd,
      featureId: "F1",
      storyId: "S1",
      experimentSlug: "exp-1",
      deleteBranchToo: false,
    });
    // Record preserved.
    expect(existsSync(join(dir, "branch.txt"))).toBe(true);
    expect(readFileSync(join(dir, "branch.txt"), "utf8")).toBe("feature/test-exp-1");
  });

  it("deleteExperiment throws when experiment does not exist", async () => {
    await expect(
      deleteExperiment({
        instance: "irrelevant",
        sftddDir: tdd,
        projectDir: tdd,
        featureId: "F1",
        storyId: "S1",
        experimentSlug: "ghost",
        deleteBranchToo: false,
      })
    ).rejects.toThrow(/not found/);
  });
});

const liveDescribe = LIVE ? describe : describe.skip;

liveDescribe("experiment lifecycle (live, LAKEBASE_TEST_E2E=1)", () => {
  const instance = process.env.LAKEBASE_TEST_INSTANCE;
  const parentBranch = process.env.LAKEBASE_TEST_PARENT || "staging";

  it("cuts and tears down a real PAIRED branch (Lakebase + git) + on-disk record", async () => {
    if (!instance) throw new Error("LAKEBASE_TEST_INSTANCE required for live test");
    // The PAIRED cut needs a real git repo + .env at projectDir (it creates a
    // git branch + syncs .env alongside the Lakebase branch).
    const projectDir = mkdtempSync(join(tmpdir(), "tdd-exp-proj-"));
    const gitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
    };
    execSync("git init -q", { cwd: projectDir });
    execSync("git commit -q --allow-empty -m init", { cwd: projectDir, env: gitEnv });
    writeFileSync(join(projectDir, ".env"), `LAKEBASE_PROJECT_ID=${instance}\n`);
    try {
      const slug = `exp-test-${Date.now()}`;
      const rec = await cutExperiment({
        instance,
        sftddDir: tdd,
        projectDir,
        featureId: "F1",
        storyId: "S1",
        experimentSlug: slug,
        branch: slug,
        parentBranch,
      });
      expect(rec.dir).toContain(slug);
      expect(existsSync(join(rec.dir, "branch.txt"))).toBe(true);
      expect(existsSync(join(rec.dir, "outcomes.json"))).toBe(true);
      expect(existsSync(join(rec.dir, "timeline.json"))).toBe(true);
      expect(rec.branch_id).toBeTruthy();
      // The cut is PAIRED: a git branch with the same id exists.
      const branches = execSync("git branch --list", { cwd: projectDir, encoding: "utf8" });
      expect(branches).toContain(rec.branch_id);
      await deleteExperiment({
        instance,
        sftddDir: tdd,
        projectDir,
        featureId: "F1",
        storyId: "S1",
        experimentSlug: slug,
        deleteBranchToo: true,
      });
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  }, 600_000);
});
