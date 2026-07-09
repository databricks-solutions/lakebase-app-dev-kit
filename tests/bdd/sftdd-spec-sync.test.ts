import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  validateSpec,
  readFeature,
  writeFeature,
  readWorkflowState,
  writeWorkflowState,
  normalizeStoryJson,
  type Feature,
  type WorkflowState,
} from "../../scripts/sftdd/spec-sync";

let tdd: string;

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-spec-"));
  mkdirSync(join(tdd, "features", "F1-test-feature", "stories", "S1-test-story", "acs"), { recursive: true });
});

afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

function fixture(): Feature {
  return {
    id: "F1",
    name: "Test Feature",
    status: "draft",
    tdd_mode: "N=1",
    stories: ["S1"],
  };
}

describe("spec-sync", () => {
  it("round-trips a feature: write then read returns the same object", () => {
    const feature = fixture();
    const featureDir = join(tdd, "features", "F1-test-feature");
    writeFileSync(join(featureDir, "feature-spec.json"), JSON.stringify(feature));
    writeFileSync(join(featureDir, "feature-spec.md"), "# Test Feature\n\nNarrative text.\n");
    const round = readFeature(tdd, "F1");
    expect(round).toEqual(feature);
  });

  it("writeFeature updates feature-spec.json", () => {
    const feature = fixture();
    const featureDir = join(tdd, "features", "F1-test-feature");
    writeFileSync(join(featureDir, "feature-spec.json"), JSON.stringify(feature));
    writeFileSync(join(featureDir, "feature-spec.md"), "# Test Feature\n\nNarrative text.\n");
    const updated: Feature = { ...feature, status: "spec-approved" };
    writeFeature(tdd, updated);
    const round = readFeature(tdd, "F1");
    expect(round.status).toBe("spec-approved");
  });

  it("validateSpec returns no reports for a valid tree", () => {
    const feature = fixture();
    const featureDir = join(tdd, "features", "F1-test-feature");
    writeFileSync(join(featureDir, "feature-spec.json"), JSON.stringify(feature));
    writeFileSync(join(featureDir, "feature-spec.md"), "# Test Feature\n\nNarrative text long enough to pass length check.\n");
    const storyDir = join(featureDir, "stories", "S1-test-story");
    writeFileSync(
      join(storyDir, "story.json"),
      JSON.stringify({ id: "S1", asA: "user", iWantTo: "do thing", soThat: "outcome", feature_id: "F1" })
    );
    writeFileSync(join(storyDir, "story.md"), "# Story\n\nNarrative long enough to satisfy length check.\n");
    const ac = {
      id: "AC1",
      layer: "API",
      given: "g",
      when: "w",
      then: "t",
      status: "draft",
      story_id: "S1",
    };
    writeFileSync(join(storyDir, "acs", "AC1.json"), JSON.stringify(ac));
    writeFileSync(join(storyDir, "acs", "AC1.md"), "# AC1\n\nAC narrative.\n");
    expect(validateSpec(tdd)).toEqual([]);
  });

  it("validateSpec reports schema violation for malformed feature-spec.json", () => {
    const featureDir = join(tdd, "features", "F1-test-feature");
    writeFileSync(join(featureDir, "feature-spec.json"), JSON.stringify({ id: "F1", name: "X" }));
    writeFileSync(join(featureDir, "feature-spec.md"), "# X\n\nLong enough narrative body.\n");
    const reports = validateSpec(tdd);
    expect(reports.find((r) => r.kind === "schema")).toBeTruthy();
  });

  it("validateSpec reports pair-missing when .md is absent", () => {
    const feature = fixture();
    const featureDir = join(tdd, "features", "F1-test-feature");
    writeFileSync(join(featureDir, "feature-spec.json"), JSON.stringify(feature));
    const reports = validateSpec(tdd);
    expect(reports.find((r) => r.kind === "pair-missing")).toBeTruthy();
  });

  it("validateSpec reports narrative-empty when .md is too short", () => {
    const feature = fixture();
    const featureDir = join(tdd, "features", "F1-test-feature");
    writeFileSync(join(featureDir, "feature-spec.json"), JSON.stringify(feature));
    writeFileSync(join(featureDir, "feature-spec.md"), "x");
    const reports = validateSpec(tdd);
    expect(reports.find((r) => r.kind === "narrative-empty")).toBeTruthy();
  });

  it("validateSpec reports id-mismatch when dir name disagrees with id", () => {
    const featureDir = join(tdd, "features", "Z9-wrong-dir");
    mkdirSync(featureDir, { recursive: true });
    const feature = { ...fixture(), id: "F1" };
    writeFileSync(join(featureDir, "feature-spec.json"), JSON.stringify(feature));
    writeFileSync(join(featureDir, "feature-spec.md"), "# X\n\nLong enough narrative body here.\n");
    const reports = validateSpec(tdd);
    expect(reports.find((r) => r.kind === "id-mismatch")).toBeTruthy();
  });

  it("writeWorkflowState / readWorkflowState round-trip", () => {
    const state: WorkflowState = {
      phase: "implementation",
      started_at: new Date().toISOString(),
      feature_id: "F1",
    };
    writeWorkflowState(tdd, state);
    const round = readWorkflowState(tdd);
    expect(round).toEqual(state);
  });

  it("readWorkflowState returns null when no state file exists", () => {
    expect(readWorkflowState(tdd)).toBeNull();
  });
});

describe("normalizeStoryJson", () => {
  const storyDir = () => join(tdd, "features", "F1-test-feature", "stories", "S1-test-story");

  it("maps a stray `feature` to feature_id and strips non-spec keys, leaving a conformant object", () => {
    // The exact field-drift the spec-author LLM produced live: `feature` instead of
    // feature_id + `status` (pipeline runtime state, not in story.schema).
    writeFileSync(
      join(storyDir(), "story.json"),
      JSON.stringify({ id: "S1", asA: "user", iWantTo: "do thing", soThat: "outcome", feature: "F1", status: "draft" })
    );
    const changed = normalizeStoryJson(tdd, "F1");
    expect(changed).toEqual(["S1-test-story"]);
    const obj = JSON.parse(readFileSync(join(storyDir(), "story.json"), "utf8"));
    expect(obj).toEqual({ id: "S1", asA: "user", iWantTo: "do thing", soThat: "outcome", feature_id: "F1" });
    // The normalized artifact now passes the schema-backed validator.
    writeFileSync(join(storyDir(), "story.md"), "# Story\n\nNarrative long enough to satisfy the length check.\n");
    const featureDir = join(tdd, "features", "F1-test-feature");
    writeFileSync(join(featureDir, "feature-spec.json"), JSON.stringify(fixture()));
    writeFileSync(join(featureDir, "feature-spec.md"), "# Test Feature\n\nNarrative body long enough to pass.\n");
    expect(validateSpec(tdd).find((r) => r.file.endsWith("story.json"))).toBeUndefined();
  });

  it("does not clobber an existing feature_id when both feature and feature_id are present", () => {
    writeFileSync(
      join(storyDir(), "story.json"),
      JSON.stringify({ id: "S1", asA: "u", iWantTo: "w", soThat: "s", feature: "WRONG", feature_id: "F1" })
    );
    normalizeStoryJson(tdd, "F1");
    const obj = JSON.parse(readFileSync(join(storyDir(), "story.json"), "utf8"));
    expect(obj.feature_id).toBe("F1");
    expect(obj.feature).toBeUndefined();
  });

  it("is idempotent + a no-op (returns []) for an already-conformant story", () => {
    writeFileSync(
      join(storyDir(), "story.json"),
      JSON.stringify({ id: "S1", asA: "u", iWantTo: "w", soThat: "s", feature_id: "F1" })
    );
    expect(normalizeStoryJson(tdd, "F1")).toEqual([]);
    // Second pass over a file it already normalized also changes nothing.
    writeFileSync(
      join(storyDir(), "story.json"),
      JSON.stringify({ id: "S1", asA: "u", iWantTo: "w", soThat: "s", feature: "F1", status: "draft" })
    );
    expect(normalizeStoryJson(tdd, "F1")).toEqual(["S1-test-story"]);
    expect(normalizeStoryJson(tdd, "F1")).toEqual([]);
  });
});
