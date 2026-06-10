///7566: the per-story design pipeline streams ONE story's acceptance
// criteria at a time. Nothing structural used to enforce that, so the Spec
// Author could (and repeatedly did) batch every story's ACs in a single pass,
// defeating the pipeline. findBatchedDraftStories is the forcing function: at
// the moment a story is surfaced/approved for its per-story spec gate, it
// detects any OTHER not-yet-gated story that already has ACs on disk. The CLI
// turns a non-empty result into a hard, actionable error instead of silently
// proceeding. Pure filesystem; hermetic.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  initPipeline,
  setStoryStatus,
  writePipeline,
  readPipeline,
  findBatchedDraftStories,
  type StoryStatus,
} from "../../scripts/tdd/story-pipeline";

const tmps: string[] = [];
afterEach(() => {
  while (tmps.length) {
    const d = tmps.pop();
    if (d) try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ }
  }
});

function mkTdd(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbscm-draft-"));
  tmps.push(dir);
  return path.join(dir, ".tdd");
}

/** Write N AC json files into a story's acs/ dir (a story "has ACs"). */
function writeAcs(tddDir: string, feature: string, story: string, n: number): void {
  const acsDir = path.join(tddDir, "features", feature, "stories", story, "acs");
  fs.mkdirSync(acsDir, { recursive: true });
  for (let i = 1; i <= n; i++) {
    fs.writeFileSync(path.join(acsDir, `AC${i}.json`), JSON.stringify({ id: `AC${i}` }));
  }
}

const F = "F1-bug-tracker";

describe("findBatchedDraftStories", () => {
  it("returns [] when only the story being gated has ACs (correct per-story scope)", () => {
    const tddDir = mkTdd();
    const p = initPipeline(F);
    setStoryStatus(p, "S1", "designing");
    setStoryStatus(p, "S2", "designing");
    setStoryStatus(p, "S3", "designing");
    writePipeline(tddDir, p);
    writeAcs(tddDir, F, "S1", 2); // only S1 drafted

    expect(findBatchedDraftStories(tddDir, F, readPipeline(tddDir, F), "S1")).toEqual([]);
  });

  it("flags sibling designing stories that already have ACs (batching)", () => {
    const tddDir = mkTdd();
    const p = initPipeline(F);
    for (const s of ["S1", "S2", "S3"]) setStoryStatus(p, s, "designing");
    writePipeline(tddDir, p);
    // The Spec Author batched all three stories' ACs at once.
    writeAcs(tddDir, F, "S1", 2);
    writeAcs(tddDir, F, "S2", 1);
    writeAcs(tddDir, F, "S3", 3);

    expect(findBatchedDraftStories(tddDir, F, readPipeline(tddDir, F), "S1")).toEqual(["S2", "S3"]);
  });

  it("allows already-gated stories (past designing) to have ACs while a later story is gated", () => {
    const tddDir = mkTdd();
    const p = initPipeline(F);
    setStoryStatus(p, "S1", "building"); // gated + dispatched earlier (legit design-ahead)
    setStoryStatus(p, "S2", "designing"); // now being gated
    setStoryStatus(p, "S3", "designing"); // not yet drafted
    writePipeline(tddDir, p);
    writeAcs(tddDir, F, "S1", 2); // legitimately has ACs
    writeAcs(tddDir, F, "S2", 1); // the story being gated

    expect(findBatchedDraftStories(tddDir, F, readPipeline(tddDir, F), "S2")).toEqual([]);
  });

  it("treats a story absent from the pipeline but with ACs on disk as batched", () => {
    const tddDir = mkTdd();
    const p = initPipeline(F);
    setStoryStatus(p, "S1", "designing");
    writePipeline(tddDir, p); // S2 never entered the pipeline
    writeAcs(tddDir, F, "S1", 1);
    writeAcs(tddDir, F, "S2", 1); // drafted out of turn, not even tracked

    expect(findBatchedDraftStories(tddDir, F, readPipeline(tddDir, F), "S1")).toEqual(["S2"]);
  });

  it("ignores story dirs that have no ACs yet", () => {
    const tddDir = mkTdd();
    const p = initPipeline(F);
    for (const s of ["S1", "S2"]) setStoryStatus(p, s, "designing");
    writePipeline(tddDir, p);
    // Both stubs exist on disk but only S1 has ACs.
    fs.mkdirSync(path.join(tddDir, "features", F, "stories", "S2"), { recursive: true });
    writeAcs(tddDir, F, "S1", 1);

    expect(findBatchedDraftStories(tddDir, F, readPipeline(tddDir, F), "S1")).toEqual([]);
  });
});
