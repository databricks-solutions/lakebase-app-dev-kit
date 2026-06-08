// tdd-paths is the single source of truth for .tdd layout + format accessors.
// These tests pin the canonical behaviors that the scattered copies disagreed
// on (especially findFeatureDir's ambiguity handling and the disk-truth
// accessors), so a regression here is caught before it desyncs a producer from
// its consumer.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as P from "../../scripts/tdd/tdd-paths";

let tdd: string;
beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-paths-"));
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

describe("path builders compose consistently", () => {
  it("feature/story/ac/cycle paths nest under the right roots", () => {
    expect(P.featureDir(tdd, "F1")).toBe(join(tdd, "features", "F1"));
    expect(P.storyDir(tdd, "F1", "S1")).toBe(join(tdd, "features", "F1", "stories", "S1"));
    expect(P.acJson(tdd, "F1", "S1", "AC1")).toBe(join(tdd, "features", "F1", "stories", "S1", "acs", "AC1.json"));
    expect(P.storyTestListJson(tdd, "F1", "S1")).toBe(join(P.storyDir(tdd, "F1", "S1"), "test-list.json"));
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
    writeFileSync(P.acJson(tdd, "F1", "S2", "AC1-file"), "{}");
    expect(P.storyAcIds(tdd, "F1", "S2")).toEqual(["AC1-file"]);
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
    P.writeBacklog(tdd, { sprint: "sprint-1", features: ["F1", "F2"] });
    expect(P.readBacklog(tdd, "sprint-1").features).toEqual(["F1", "F2"]);
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
