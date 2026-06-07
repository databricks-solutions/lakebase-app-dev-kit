// FEIP-7565 phase 2a: per-story pipeline state + single-lane FIFO ready queue.
// Hermetic (in-memory + tmpdir); no live Lakebase.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  initPipeline,
  setStoryStatus,
  enqueueReady,
  dispatchNext,
  completeActive,
  readPipeline,
  writePipeline,
} from "../../scripts/tdd/story-pipeline";
import { getValidator } from "../../scripts/tdd/schema-loader";

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d) fs.rmSync(d, { recursive: true, force: true });
  }
});
function mkTdd(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "feip7565-"));
  tmpDirs.push(d);
  return d;
}

describe("story-pipeline: init + status", () => {
  it("initializes empty (no stories, empty queue, idle lane)", () => {
    const p = initPipeline("F1-initial-domain");
    expect(p).toEqual({ version: 1, feature_id: "F1-initial-domain", stories: {}, build_queue: [], build_active: null });
  });

  it("setStoryStatus records the design-lane statuses", () => {
    const p = initPipeline("F1");
    setStoryStatus(p, "S1", "designing");
    setStoryStatus(p, "S1", "awaiting-gate");
    expect(p.stories.S1.status).toBe("awaiting-gate");
  });
});

describe("story-pipeline: ready queue + single build lane", () => {
  it("enqueueReady marks ready + queues FIFO, idempotent", () => {
    const p = initPipeline("F1");
    enqueueReady(p, "S1");
    enqueueReady(p, "S2");
    enqueueReady(p, "S1"); // re-enqueue must not duplicate
    expect(p.build_queue).toEqual(["S1", "S2"]);
    expect(p.stories.S1.status).toBe("ready");
    expect(p.stories.S2.status).toBe("ready");
  });

  it("dispatchNext pulls the FIFO head into the single lane + marks building", () => {
    const p = initPipeline("F1");
    enqueueReady(p, "S1");
    enqueueReady(p, "S2");
    expect(dispatchNext(p)).toBe("S1");
    expect(p.build_active).toBe("S1");
    expect(p.stories.S1.status).toBe("building");
    expect(p.build_queue).toEqual(["S2"]);
  });

  it("does NOT dispatch a second story while the lane is busy (single-lane invariant)", () => {
    const p = initPipeline("F1");
    enqueueReady(p, "S1");
    enqueueReady(p, "S2");
    dispatchNext(p); // S1 building
    expect(dispatchNext(p)).toBeNull(); // busy
    expect(p.build_active).toBe("S1");
    expect(p.build_queue).toEqual(["S2"]); // S2 still queued, untouched
  });

  it("completeActive frees the lane, then the next ready story dispatches", () => {
    const p = initPipeline("F1");
    enqueueReady(p, "S1");
    enqueueReady(p, "S2");
    dispatchNext(p); // S1 building
    expect(completeActive(p)).toBe("S1");
    expect(p.stories.S1.status).toBe("done");
    expect(p.build_active).toBeNull();
    expect(dispatchNext(p)).toBe("S2");
    expect(p.build_active).toBe("S2");
  });

  it("dispatch/complete are no-ops on an idle/empty pipeline", () => {
    const p = initPipeline("F1");
    expect(dispatchNext(p)).toBeNull();
    expect(completeActive(p)).toBeNull();
  });

  it("models design-ahead: S2 gates + queues while S1 is still building", () => {
    const p = initPipeline("F1");
    enqueueReady(p, "S1");
    dispatchNext(p); // S1 building
    // design lane finishes S2 and gates it while S1 builds:
    enqueueReady(p, "S2");
    expect(p.build_active).toBe("S1"); // S1 keeps building
    expect(p.build_queue).toEqual(["S2"]); // S2 waits
    completeActive(p); // S1 done
    expect(dispatchNext(p)).toBe("S2"); // lane pulls S2
  });
});

describe("story-pipeline: persistence + schema", () => {
  it("write/read roundtrips through .tdd/features/<F>/pipeline.json", () => {
    const tdd = mkTdd();
    const p = initPipeline("F1-initial-domain");
    enqueueReady(p, "S1");
    dispatchNext(p);
    writePipeline(tdd, p);
    expect(fs.existsSync(path.join(tdd, "features", "F1-initial-domain", "pipeline.json"))).toBe(true);
    expect(readPipeline(tdd, "F1-initial-domain")).toEqual(p);
  });

  it("readPipeline returns an empty pipeline when absent", () => {
    expect(readPipeline(mkTdd(), "F9-x")).toEqual(initPipeline("F9-x"));
  });

  it("a produced pipeline validates against story-pipeline.schema.json", () => {
    const validate = getValidator("story-pipeline.schema.json");
    const p = initPipeline("F1-initial-domain");
    enqueueReady(p, "S1-submit");
    enqueueReady(p, "S2-owner");
    dispatchNext(p);
    expect(validate(p)).toBe(true);
  });
});
