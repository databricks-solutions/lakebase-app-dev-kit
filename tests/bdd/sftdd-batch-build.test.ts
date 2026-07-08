// P8b (loopGranularity=hybrid-a): the layer-batched build. ONE RED cycle covers
// a layer's test-list items (capped); ONE GREEN flips them all green together;
// the per-AC REVIEW queue still falls out (derive-from-disk). These pin the
// substrate core: coveredTestIds (incl. the empty-array guard), beginNextPendingBatch
// (layer grouping + cap + empty guard), and batch-aware green propagation +
// progress.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  beginNextPendingBatch,
  greenOpenCycle,
  storyTestProgress,
  storyCycles,
  acReviewStates,
  firstReviewPendingAc,
  DEFAULT_BATCH_CAP,
  type GreenVerifier,
} from "../../scripts/sftdd/cycle-record.js";
import { coveredTestIds } from "../../scripts/sftdd/run-cycle.js";

const pass: GreenVerifier = async () => ({ passed: true, summary: "ok" });

let tdd: string;
const F = "F1";
const S = "S1";
const writeJson = (file: string, obj: unknown): void => writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");

/** Seed a story: each entry is [acId, layer, [testIds...]]. */
function seedStory(acs: Array<[string, string, string[]]>): void {
  const acsDir = join(tdd, "features", F, "stories", S, "acs");
  mkdirSync(acsDir, { recursive: true });
  const items: Array<{ id: string; description: string; ac_id: string; status: string }> = [];
  for (const [acId, layer, testIds] of acs) {
    writeJson(join(acsDir, `${acId}.json`), { id: acId, layer, text: `${acId} does a thing` });
    for (const t of testIds) items.push({ id: t, description: `${t} asserts`, ac_id: acId, status: "pending" });
  }
  writeJson(join(tdd, "features", F, "stories", S, "test-list-per-story.json"), { feature_id: F, story_id: S, items });
  writeJson(join(tdd, "features", F, "test-list.json"), { feature_id: F, items });
  const expDir = join(tdd, "experiments", F, S, "exp1");
  mkdirSync(expDir, { recursive: true });
  writeFileSync(join(expDir, "branch.txt"), "experiment-s1-exp1");
  writeJson(join(expDir, "outcomes.json"), { status: "running" });
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-batch-"));
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

describe("coveredTestIds: reads single + batch shapes, guards the empty array", () => {
  it("a per-test cycle yields [test_id]", () => {
    expect(coveredTestIds({ test_id: "T1" })).toEqual(["T1"]);
  });
  it("a batch cycle yields its test_ids", () => {
    expect(coveredTestIds({ test_id: "T1", test_ids: ["T1", "T2", "T3"] })).toEqual(["T1", "T2", "T3"]);
  });
  it("an EMPTY test_ids[] falls back to [test_id], never 'covers nothing'", () => {
    expect(coveredTestIds({ test_id: "T1", test_ids: [] })).toEqual(["T1"]);
  });
  it("no ids at all yields []", () => {
    expect(coveredTestIds({ test_id: "", test_ids: [] })).toEqual([]);
  });
});

describe("beginNextPendingBatch: one RED cycle per layer-chunk", () => {
  it("batches all pending items of the first pending layer into ONE cycle", () => {
    seedStory([
      ["AC1", "API", ["T1"]],
      ["AC2", "API", ["T2"]],
      ["AC3", "API", ["T3"]],
    ]);
    const r = beginNextPendingBatch({ sftddDir: tdd, featureId: F, story: S });
    expect(r.recorded).toBe(true);
    const cycles = storyCycles(tdd, F, S);
    expect(cycles).toHaveLength(1);
    expect(coveredTestIds(cycles[0])).toEqual(["T1", "T2", "T3"]);
    expect(cycles[0].chunk).toBe("API-1");
    // All three are now cycled (none pending), one open RED.
    const p = storyTestProgress(tdd, F, S);
    expect(p.pending).toHaveLength(0);
    expect(p.openRed).toHaveLength(1);
  });

  it("respects the cap (DEFAULT_BATCH_CAP) , a 4th same-layer item stays pending", () => {
    seedStory([
      ["AC1", "API", ["T1"]],
      ["AC2", "API", ["T2"]],
      ["AC3", "API", ["T3"]],
      ["AC4", "API", ["T4"]],
    ]);
    expect(DEFAULT_BATCH_CAP).toBe(3);
    beginNextPendingBatch({ sftddDir: tdd, featureId: F, story: S });
    const p = storyTestProgress(tdd, F, S);
    expect(p.pending.map((i) => i.id)).toEqual(["T4"]);
  });

  it("does NOT cross layers , an E2E AC is left for its own batch", () => {
    seedStory([
      ["AC1", "API", ["T1"]],
      ["AC2", "API", ["T2"]],
      ["AC3", "E2E", ["T3"]],
    ]);
    const r = beginNextPendingBatch({ sftddDir: tdd, featureId: F, story: S });
    expect(r.recorded).toBe(true);
    expect(coveredTestIds(storyCycles(tdd, F, S)[0])).toEqual(["T1", "T2"]); // API only
    expect(storyTestProgress(tdd, F, S).pending.map((i) => i.id)).toEqual(["T3"]); // E2E waits
  });

  it("recorded:false when nothing is pending", () => {
    seedStory([["AC1", "API", ["T1"]]]);
    beginNextPendingBatch({ sftddDir: tdd, featureId: F, story: S });
    // openRed exists but nothing pending -> a second begin records nothing.
    expect(beginNextPendingBatch({ sftddDir: tdd, featureId: F, story: S }).recorded).toBe(false);
  });
});

describe("batch GREEN: one cycle greens every covered item + the per-AC review queue surfaces", () => {
  it("greenOpenCycle on a batch flips all covered tests green and makes each AC reviewable", async () => {
    seedStory([
      ["AC1", "API", ["T1"]],
      ["AC2", "API", ["T2"]],
    ]);
    beginNextPendingBatch({ sftddDir: tdd, featureId: F, story: S });
    const g = await greenOpenCycle({ sftddDir: tdd, featureId: F, story: S, verify: pass });
    expect(g.recorded).toBe(true);
    // The whole batch is green: storyTestProgress.allGreen, no open RED.
    const p = storyTestProgress(tdd, F, S);
    expect(p.allGreen).toBe(true);
    expect(p.openRed).toHaveLength(0);
    // Per-AC review still derives: both ACs are all-green and review-pending.
    const states = acReviewStates(tdd, F, S);
    expect(states.map((s) => s.acId)).toEqual(["AC1", "AC2"]);
    expect(states.every((s) => s.allTestsGreen && !s.reviewed)).toBe(true);
    expect(firstReviewPendingAc(tdd, F, S)).toBe("AC1");
  });
});
