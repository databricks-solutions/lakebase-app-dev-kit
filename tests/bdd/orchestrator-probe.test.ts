// diskArtifactProbe (phase 3b) tests: lay out real on-disk artifacts in a temp
// .tdd dir (using the substrate's own cycle writer) and assert the probe reads
// the per-story design + build facts deriveDriveState needs.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { diskArtifactProbe, readDriveContext } from "../../scripts/tdd/orchestrator-probe";
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

  it("hasAcs detects acs/<AC>.json files even when story.json acs is not backfilled", () => {
    // The live failure mode: the Spec Author wrote acs/<AC>.{md,json} but left
    // story.json `acs` null. Disk is the truth, so the probe must see them;
    // otherwise the story looks un-drafted forever and the driver stalls
    // re-issuing the same invoke-role.
    const probe = diskArtifactProbe(tddDir, FEATURE);
    mkdirSync(storyDir("S3"), { recursive: true });
    writeFileSync(join(storyDir("S3"), "story.json"), JSON.stringify({ id: "S3", acs: null }));
    expect(probe.hasAcs("S3")).toBe(false); // no acs/ files yet
    writeAcLayer("S3", "AC1-file", "API"); // writes acs/AC1-file.json
    writeFileSync(join(storyDir("S3"), "acs", "AC2-reject.json"), JSON.stringify({ id: "AC2-reject" }));
    expect(probe.hasAcs("S3")).toBe(true);
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

describe("readDriveContext", () => {
  const featureDir = () => join(tddDir, "features", FEATURE);
  const writeFeatureFile = (name: string, content: string) => {
    mkdirSync(featureDir(), { recursive: true });
    writeFileSync(join(featureDir(), name), content);
  };

  it("an empty project reads as conservative defaults (phase feature, nothing done)", () => {
    const ctx = readDriveContext(tddDir, FEATURE);
    expect(ctx.phase).toBe("feature");
    expect(ctx.breakdownDone).toBe(false);
    expect(ctx.planning).toEqual({ proposed: false, requestsAuthored: false });
    expect(ctx.deploy).toEqual({ deployed: false, gateApproved: false });
  });

  // A full, schema-valid gates.json the strict readGates can parse, with the
  // deploy gate at the given status.
  function gatesJson(deployStatus: "open" | "approved"): string {
    return JSON.stringify({
      feature_id: FEATURE,
      schema_version: 1,
      gates: {
        spec: { status: "approved", history: [] },
        plan: { status: "open", history: [] },
        test_list: { status: "open", history: [] },
        promote: { status: "open", history: [] },
        deploy: { status: deployStatus, history: [] },
      },
    });
  }
  // Minimal deploy-evidence.json: its mere presence makes deployed=true.
  function writeEvidence(): void {
    writeFeatureFile(
      "deploy-evidence.json",
      JSON.stringify({ schema_version: 1, feature_id: FEATURE, target: "local", url: "http://localhost:8000/", reachable: true, verify: { passed: true }, deployed_at: "2026-06-07T00:00:00.000Z" }),
    );
  }

  it("maps workflow-state phase + planning/deploy sub-flags from on-disk artifacts", () => {
    writeFileSync(join(tddDir, "workflow-state.json"), JSON.stringify({ phase: "implementation" }));
    writeFeatureFile("feature-request.md", "# request");
    writeFeatureFile("feature-spec.json", JSON.stringify({ id: FEATURE, stories: ["S1", "S2"] }));
    writeEvidence(); // deploy ran -> deployed:true
    writeFeatureFile("gates.json", gatesJson("open")); // gate not yet approved

    const ctx = readDriveContext(tddDir, FEATURE);
    expect(ctx.phase).toBe("feature"); // implementation -> feature
    expect(ctx.breakdownDone).toBe(true);
    expect(ctx.planning).toEqual({ proposed: true, requestsAuthored: true });
    // deploy ran (evidence present) but the deploy gate is not approved
    expect(ctx.deploy).toEqual({ deployed: true, gateApproved: false });
  });

  it("reads deploy phase + approved deploy gate (evidence + strict gate read)", () => {
    writeFileSync(join(tddDir, "workflow-state.json"), JSON.stringify({ phase: "deploy" }));
    writeEvidence();
    writeFeatureFile("gates.json", gatesJson("approved"));
    const ctx = readDriveContext(tddDir, FEATURE);
    expect(ctx.phase).toBe("deploy");
    expect(ctx.deploy).toEqual({ deployed: true, gateApproved: true });
  });

  it("deployed=false when no deploy-evidence.json was written, even with an approved gate", () => {
    writeFileSync(join(tddDir, "workflow-state.json"), JSON.stringify({ phase: "deploy" }));
    writeFeatureFile("gates.json", gatesJson("approved"));
    const ctx = readDriveContext(tddDir, FEATURE);
    expect(ctx.deploy).toEqual({ deployed: false, gateApproved: true });
  });
});
