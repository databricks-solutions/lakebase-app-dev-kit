import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  archiveExperiment,
  ArchiveExperimentError,
} from "../../scripts/sftdd/archive-experiment";

let tdd: string;

function seedExperiment(slug: string, outcomes: object): string {
  const dir = join(tdd, "experiments", "F1", "S1",slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "branch.txt"), `feature/${slug}`);
  writeFileSync(join(dir, "outcomes.json"), JSON.stringify(outcomes));
  return dir;
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-archive-"));
});

afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

describe("archiveExperiment", () => {
  it("throws when hitlApproved is false", async () => {
    seedExperiment("exp-a", { status: "running" });
    await expect(
      archiveExperiment({
        tddDir: tdd,
        featureId: "F1",
        storyId: "S1",
        experimentSlug: "exp-a",
        hitlApproved: false,
      })
    ).rejects.toThrow(/HITL/);
  });

  it("throws when experimentSlug does not exist", async () => {
    await expect(
      archiveExperiment({
        tddDir: tdd,
        featureId: "F1",
        storyId: "S1",
        experimentSlug: "ghost",
        hitlApproved: true,
      })
    ).rejects.toThrow(/not found/);
  });

  it("moves the dir under _archive/, marks outcomes abandoned, appends selection-log", async () => {
    seedExperiment("exp-a", { status: "running", api_pass: true });
    const result = await archiveExperiment({
      tddDir: tdd,
      featureId: "F1",
      storyId: "S1",
      experimentSlug: "exp-a",
      hitlApproved: true,
      approverEmail: "kevin@example.com",
    });
    expect(result.experiment_slug).toBe("exp-a");
    expect(existsSync(join(tdd, "experiments", "F1", "S1","exp-a"))).toBe(false);
    expect(existsSync(join(tdd, "experiments", "F1", "S1","_archive", "exp-a"))).toBe(true);
    // outcomes.json preserved in the moved dir + marked abandoned
    const archivedOutcomes = JSON.parse(
      readFileSync(
        join(tdd, "experiments", "F1", "S1","_archive", "exp-a", "outcomes.json"),
        "utf8"
      )
    );
    expect(archivedOutcomes.status).toBe("abandoned");
    expect(archivedOutcomes.api_pass).toBe(true); // prior state preserved
    // selection-log entry written
    const log = readFileSync(join(tdd, "selection-log.md"), "utf8");
    expect(log).toMatch(/Archive exp-a for F1/);
    expect(log).toMatch(/kevin@example.com/);
  });

  it("invokes deleteLakebaseBranch with the experiment's branch_id", async () => {
    seedExperiment("exp-a", { status: "running" });
    const seen: string[] = [];
    const result = await archiveExperiment({
      tddDir: tdd,
      featureId: "F1",
      storyId: "S1",
      experimentSlug: "exp-a",
      hitlApproved: true,
      deleteLakebaseBranch: async (branchId) => {
        seen.push(branchId);
      },
    });
    expect(seen).toEqual(["feature/exp-a"]);
    expect(result.lakebase_branch_deleted).toBe(true);
  });

  it("rolls back dir + outcomes when deleteLakebaseBranch throws", async () => {
    seedExperiment("exp-a", { status: "running" });
    await expect(
      archiveExperiment({
        tddDir: tdd,
        featureId: "F1",
        storyId: "S1",
        experimentSlug: "exp-a",
        hitlApproved: true,
        deleteLakebaseBranch: async () => {
          throw new Error("lakebase branch delete failed");
        },
      })
    ).rejects.toBeInstanceOf(ArchiveExperimentError);

    // Dir restored
    expect(existsSync(join(tdd, "experiments", "F1", "S1","exp-a"))).toBe(true);
    expect(existsSync(join(tdd, "experiments", "F1", "S1","_archive", "exp-a"))).toBe(false);
    // Outcomes restored
    const outcomes = JSON.parse(
      readFileSync(join(tdd, "experiments", "F1", "S1","exp-a", "outcomes.json"), "utf8")
    );
    expect(outcomes.status).toBe("running");
    // Selection-log records partial state
    const log = readFileSync(join(tdd, "selection-log.md"), "utf8");
    expect(log).toMatch(/PARTIAL \/ rolled back/);
    expect(log).toMatch(/lakebase branch delete failed/);
  });

  it("rolls back when deleteAppDeployment throws (after Lakebase delete succeeded)", async () => {
    seedExperiment("exp-a", { status: "running" });
    let lakebaseCalled = false;
    await expect(
      archiveExperiment({
        tddDir: tdd,
        featureId: "F1",
        storyId: "S1",
        experimentSlug: "exp-a",
        hitlApproved: true,
        deleteLakebaseBranch: async () => {
          lakebaseCalled = true;
        },
        deleteAppDeployment: async () => {
          throw new Error("app teardown failed");
        },
      })
    ).rejects.toBeInstanceOf(ArchiveExperimentError);

    expect(lakebaseCalled).toBe(true);
    // Dir restored despite lakebase having been deleted
    expect(existsSync(join(tdd, "experiments", "F1", "S1","exp-a"))).toBe(true);
    const log = readFileSync(join(tdd, "selection-log.md"), "utf8");
    expect(log).toMatch(/Lakebase branch deleted:\*\* true/);
    expect(log).toMatch(/App deployment deleted:\*\* false/);
  });

  it("is idempotent: re-archiving an already-archived experiment writes a re-run log entry", async () => {
    seedExperiment("exp-a", { status: "running" });
    await archiveExperiment({
      tddDir: tdd,
      featureId: "F1",
      storyId: "S1",
      experimentSlug: "exp-a",
      hitlApproved: true,
    });
    const second = await archiveExperiment({
      tddDir: tdd,
      featureId: "F1",
      storyId: "S1",
      experimentSlug: "exp-a",
      hitlApproved: true,
    });
    expect(second.archived_dir).toBe(
      join(tdd, "experiments", "F1", "S1","_archive", "exp-a")
    );
    const log = readFileSync(join(tdd, "selection-log.md"), "utf8");
    expect(log).toMatch(/idempotent re-run/);
  });

  it("when no callbacks are provided, both deletion flags are false but archive still succeeds", async () => {
    seedExperiment("exp-a", { status: "running" });
    const result = await archiveExperiment({
      tddDir: tdd,
      featureId: "F1",
      storyId: "S1",
      experimentSlug: "exp-a",
      hitlApproved: true,
    });
    expect(result.lakebase_branch_deleted).toBe(false);
    expect(result.app_deployment_deleted).toBe(false);
    // Dir moved, outcomes marked
    expect(existsSync(join(tdd, "experiments", "F1", "S1","_archive", "exp-a"))).toBe(true);
    const log = readFileSync(join(tdd, "selection-log.md"), "utf8");
    expect(log).toMatch(/Lakebase branch deleted:\*\* false \(no callback\)/);
    expect(log).toMatch(/App deployment deleted:\*\* false \(no callback\)/);
  });
});
