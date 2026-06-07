// diskArtifactProbe (phase 3b) tests: lay out real on-disk artifacts in a temp
// .tdd dir (using the substrate's own cycle writer) and assert the probe reads
// the per-story design + build facts deriveDriveState needs.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { diskArtifactProbe } from "../../scripts/tdd/orchestrator-probe";
import { writeCycleArtifact, type CycleArtifact } from "../../scripts/tdd/run-cycle";

let tddDir: string;
const FEATURE = "F1";

beforeEach(() => {
  tddDir = mkdtempSync(join(tmpdir(), "drive-probe-"));
});
afterEach(() => {
  rmSync(tddDir, { recursive: true, force: true });
});

function storyDir(story: string): string {
  return join(tddDir, "features", FEATURE, "stories", story);
}
function writeStory(story: string, acs: string[]): void {
  mkdirSync(storyDir(story), { recursive: true });
  writeFileSync(join(storyDir(story), "story.json"), JSON.stringify({ id: story, acs }));
}
function writeAcLayer(story: string, ac: string, layer: string): void {
  const dir = join(storyDir(story), "acs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${ac}.json`), JSON.stringify({ id: ac, layer }));
}
function writeTestList(story: string, tests: unknown[]): void {
  mkdirSync(storyDir(story), { recursive: true });
  writeFileSync(join(storyDir(story), "test-list.json"), JSON.stringify({ tests }));
}
function cycle(story: string, ac: string, id: string, extra: Partial<CycleArtifact>): void {
  writeCycleArtifact(
    { tddDir, feature_id: FEATURE, story_id: story, ac_id: ac },
    {
      cycle_id: id,
      feature_id: FEATURE,
      story_id: story,
      ac_id: ac,
      test_id: `${ac}-t1`,
      test_description: "t",
      ...extra,
    },
  );
}

describe("diskArtifactProbe: design facts", () => {
  it("hasAcs reflects story.json acs (and is false when the story file is absent)", () => {
    const probe = diskArtifactProbe(tddDir, FEATURE);
    expect(probe.hasAcs("S1")).toBe(false);
    writeStory("S1", ["AC1", "AC2"]);
    expect(probe.hasAcs("S1")).toBe(true);
    writeStory("S2", []);
    expect(probe.hasAcs("S2")).toBe(false);
  });

  it("architectAnnotated is true only once EVERY AC has a layer", () => {
    const probe = diskArtifactProbe(tddDir, FEATURE);
    writeStory("S1", ["AC1", "AC2"]);
    expect(probe.architectAnnotated("S1")).toBe(false);
    writeAcLayer("S1", "AC1", "API");
    expect(probe.architectAnnotated("S1")).toBe(false); // AC2 still unannotated
    writeAcLayer("S1", "AC2", "Infra");
    expect(probe.architectAnnotated("S1")).toBe(true);
  });

  it("testListReady requires a non-empty test list", () => {
    const probe = diskArtifactProbe(tddDir, FEATURE);
    expect(probe.testListReady("S1")).toBe(false);
    writeTestList("S1", []);
    expect(probe.testListReady("S1")).toBe(false);
    writeTestList("S1", [{ id: "T1" }]);
    expect(probe.testListReady("S1")).toBe(true);
  });
});

describe("diskArtifactProbe: build facts from cycle artifacts", () => {
  it("testsWritten once a RED cycle exists; codeWritten once every RED is GREEN", () => {
    const probe = diskArtifactProbe(tddDir, FEATURE);
    expect(probe.testsWritten("S1")).toBe(false);
    expect(probe.codeWritten("S1")).toBe(false);

    // Navigator writes RED for AC1.
    cycle("S1", "AC1", "cycle-001", { red_at: "2026-06-07T10:00:00Z" });
    expect(probe.testsWritten("S1")).toBe(true);
    expect(probe.codeWritten("S1")).toBe(false); // RED not yet GREEN

    // Driver turns it GREEN.
    cycle("S1", "AC1", "cycle-001", { red_at: "2026-06-07T10:00:00Z", green_at: "2026-06-07T10:05:00Z" });
    expect(probe.codeWritten("S1")).toBe(true);

    // A new RED in another AC drops codeWritten until it too is GREEN.
    cycle("S1", "AC2", "cycle-001", { red_at: "2026-06-07T10:10:00Z" });
    expect(probe.codeWritten("S1")).toBe(false);
    cycle("S1", "AC2", "cycle-001", { red_at: "2026-06-07T10:10:00Z", green_at: "2026-06-07T10:12:00Z" });
    expect(probe.codeWritten("S1")).toBe(true);
  });

  it("scopes cycles per story (S2's cycles do not affect S1)", () => {
    const probe = diskArtifactProbe(tddDir, FEATURE);
    cycle("S2", "AC1", "cycle-001", { red_at: "2026-06-07T10:00:00Z" });
    expect(probe.testsWritten("S1")).toBe(false);
    expect(probe.testsWritten("S2")).toBe(true);
  });
});
