// sftdd-paths is the single source of truth for .tdd layout + format accessors.
// These tests pin the canonical behaviors that the scattered copies disagreed
// on (especially findFeatureDir's ambiguity handling and the disk-truth
// accessors), so a regression here is caught before it desyncs a producer from
// its consumer.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as P from "../../scripts/sftdd/sftdd-paths";

let tdd: string;
beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "sftdd-paths-"));
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

describe("path builders compose consistently", () => {
  it("feature/story/ac/cycle paths nest under the right roots", () => {
    expect(P.featureDir(tdd, "F1")).toBe(join(tdd, "features", "F1"));
    expect(P.storyDir(tdd, "F1", "S1")).toBe(join(tdd, "features", "F1", "stories", "S1"));
    expect(P.acJson(tdd, "F1", "S1", "AC1")).toBe(join(tdd, "features", "F1", "stories", "S1", "acs", "AC1.json"));
    expect(P.storyTestListJson(tdd, "F1", "S1")).toBe(join(P.storyDir(tdd, "F1", "S1"), "test-list-per-story.json"));
    expect(P.featureProposalsMd(tdd)).toBe(join(tdd, "planning", "feature-proposals.md"));
    expect(P.backlogJson(tdd, "sprint-1")).toBe(join(tdd, "sprints", "sprint-1", "backlog.json"));
  });
});

describe("findFeatureDir: one behavior", () => {
  function mkFeature(id: string): void {
    mkdirSync(join(tdd, "features", id), { recursive: true });
  }
  it("returns undefined when the features root is absent", () => {
    expect(P.findFeatureDir(tdd, "F1")).toBeUndefined();
  });
  it("resolves an exact id", () => {
    mkFeature("F1-initial");
    expect(P.findFeatureDir(tdd, "F1-initial")).toBe(join(tdd, "features", "F1-initial"));
  });
  it("resolves a unique <id>-<slug> prefix", () => {
    mkFeature("F1-initial-domain");
    expect(P.findFeatureDir(tdd, "F1-initial-domain")).toBe(join(tdd, "features", "F1-initial-domain"));
  });
  it("returns undefined on an AMBIGUOUS prefix (>1 match), never picks-first", () => {
    mkFeature("F1-a");
    mkFeature("F1-b");
    expect(P.findFeatureDir(tdd, "F1")).toBeUndefined();
  });
});

describe("storyAcIds: disk truth (union of story.json + acs/ files)", () => {
  function story(id: string, acs: unknown): void {
    mkdirSync(P.storyDir(tdd, "F1", id), { recursive: true });
    writeFileSync(P.storyJson(tdd, "F1", id), JSON.stringify({ id, acs }));
  }
  it("reads ids from story.json acs", () => {
    story("S1", ["AC1", "AC2"]);
    expect(P.storyAcIds(tdd, "F1", "S1").sort()).toEqual(["AC1", "AC2"]);
  });
  it("reads ids from acs/<AC>.json files even when story.json acs is null", () => {
    story("S2", null);
    mkdirSync(P.acsDir(tdd, "F1", "S2"), { recursive: true });
    // A real AC file self-names: acs/<id>.json holds { id: "<id>" }.
    writeFileSync(P.acJson(tdd, "F1", "S2", "AC1-file"), JSON.stringify({ id: "AC1-file" }));
    expect(P.storyAcIds(tdd, "F1", "S2")).toEqual(["AC1-file"]);
  });
  it("ignores non-AC files an agent drops into acs/ (e.g. <ac>-tests.json), no AC-set pollution", () => {
    // Live design-lane stall: the Spec Author wrote acs/<ac>-tests.json +
    // <ac>-test-list.json alongside the real <ac>.json. They are NOT ACs (their
    // `id` is the AC they test, not the suffixed basename), so storyAcIds must
    // exclude them; else every "AC" must have a layer for architectAnnotated,
    // the test files have none, and the Architect is re-dispatched forever.
    story("S3", null);
    mkdirSync(P.acsDir(tdd, "F1", "S3"), { recursive: true });
    writeFileSync(P.acJson(tdd, "F1", "S3", "ac-one"), JSON.stringify({ id: "ac-one", given: "g", when: "w", then: "t" }));
    writeFileSync(P.acJson(tdd, "F1", "S3", "ac-one-tests"), JSON.stringify({ id: "ac-one", tests: [{ id: "T1" }] }));
    writeFileSync(P.acJson(tdd, "F1", "S3", "ac-one-test-list"), JSON.stringify({ id: "ac-one", items: [{ id: "T1" }] }));
    expect(P.storyAcIds(tdd, "F1", "S3")).toEqual(["ac-one"]);
  });
});

describe("readAcLayer", () => {
  it("reads a valid layer from acs/<AC>.json", () => {
    mkdirSync(P.acsDir(tdd, "F1", "S1"), { recursive: true });
    writeFileSync(P.acJson(tdd, "F1", "S1", "AC1"), JSON.stringify({ id: "AC1", layer: "API" }));
    expect(P.readAcLayer(tdd, "F1", "AC1")).toBe("API");
  });
  it("undefined when no layer / absent", () => {
    expect(P.readAcLayer(tdd, "F1", "AC1")).toBeUndefined();
  });
});

describe("backlog read/write roundtrip", () => {
  it("writes then reads the feature list", () => {
    expect(P.readBacklog(tdd, "sprint-1").features).toEqual([]);
    P.writeBacklog(tdd, { sprint: "sprint-1", features: [{ id: "F1", size: "M" }, { id: "F2" }] });
    expect(P.readBacklog(tdd, "sprint-1").features).toEqual([{ id: "F1", size: "M" }, { id: "F2" }]);
  });
});

describe("hasFeatureRequest", () => {
  it("true once feature-request.md exists", () => {
    expect(P.hasFeatureRequest(tdd, "F1")).toBe(false);
    mkdirSync(P.featureDir(tdd, "F1"), { recursive: true });
    writeFileSync(P.featureRequestMd(tdd, "F1"), "# ask\n");
    expect(P.hasFeatureRequest(tdd, "F1")).toBe(true);
  });
});
