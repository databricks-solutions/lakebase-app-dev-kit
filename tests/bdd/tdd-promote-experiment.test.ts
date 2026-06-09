import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { promoteExperiment } from "../../scripts/tdd/promote-experiment";

let tdd: string;

function seedExperiment(slug: string, outcomes: object): string {
  const dir = join(tdd, "experiments", "F1", "S1",slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "branch.txt"), `feature/${slug}`);
  writeFileSync(join(dir, "outcomes.json"), JSON.stringify(outcomes));
  return dir;
}

function seedFeature(): void {
  const dir = join(tdd, "features", "F1-test");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "feature-spec.json"),
    JSON.stringify({ id: "F1", name: "Test", status: "in-progress", tdd_mode: "N>=2" })
  );
  writeFileSync(join(dir, "feature-spec.md"), "# Test feature\n\nNarrative long enough to satisfy length.\n");
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-promote-"));
});

afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

describe("promoteExperiment", () => {
  it("throws when hitlApproved is false", async () => {
    seedExperiment("exp-winner", { status: "succeeded" });
    await expect(
      promoteExperiment({ tddDir: tdd, featureId: "F1", storyId: "S1", winnerSlug: "exp-winner", hitlApproved: false })
    ).rejects.toThrow(/HITL/);
  });

  it("throws when winnerSlug does not exist", async () => {
    seedExperiment("exp-a", { status: "succeeded" });
    await expect(
      promoteExperiment({ tddDir: tdd, featureId: "F1", storyId: "S1", winnerSlug: "ghost", hitlApproved: true })
    ).rejects.toThrow(/not found/);
  });

  it("marks winner succeeded and losers abandoned", async () => {
    seedExperiment("exp-a", { status: "succeeded" });
    seedExperiment("exp-b", { status: "running" });
    seedExperiment("exp-c", { status: "running" });
    const result = await promoteExperiment({
      tddDir: tdd,
      featureId: "F1",
      storyId: "S1",
      winnerSlug: "exp-a",
      hitlApproved: true,
      approverEmail: "kevin@example.com",
    });
    expect(result.winner_slug).toBe("exp-a");
    expect(result.archived_slugs.sort()).toEqual(["exp-b", "exp-c"]);
    const winnerOutcomes = JSON.parse(
      readFileSync(join(tdd, "experiments", "F1", "S1","exp-a", "outcomes.json"), "utf8")
    );
    expect(winnerOutcomes.status).toBe("succeeded");
    expect(
      existsSync(join(tdd, "experiments", "F1", "S1","_archive", "exp-b", "outcomes.json"))
    ).toBe(true);
  });

  it("transitions feature status to ready-for-review when feature-spec.json exists", async () => {
    seedFeature();
    seedExperiment("exp-a", { status: "succeeded" });
    const result = await promoteExperiment({
      tddDir: tdd,
      featureId: "F1",
      storyId: "S1",
      winnerSlug: "exp-a",
      hitlApproved: true,
    });
    expect(result.feature_status).toBe("ready-for-review");
    const feature = JSON.parse(
      readFileSync(join(tdd, "features", "F1-test", "feature-spec.json"), "utf8")
    );
    expect(feature.status).toBe("ready-for-review");
  });

  it("appends a decision record to selection-log.md", async () => {
    seedExperiment("exp-a", { status: "succeeded" });
    await promoteExperiment({
      tddDir: tdd,
      featureId: "F1",
      storyId: "S1",
      winnerSlug: "exp-a",
      hitlApproved: true,
      approverEmail: "kevin@example.com",
    });
    const log = readFileSync(join(tdd, "selection-log.md"), "utf8");
    expect(log).toContain("Promote exp-a for F1");
    expect(log).toContain("kevin@example.com");
  });
});
