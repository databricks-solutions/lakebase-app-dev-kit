// phase 3: hermetic end-to-end re-validation of the streaming
// per-story design->build pipeline. Drives a 3-story feature through all three
// substrate layers together (pipeline state 2a + per-story spec gate 2b +
// per-story test-list scoping 2c) and asserts the headline behavior: the
// design lane runs ahead and gates later stories WHILE a single build lane
// drains the FIFO queue one story at a time. No live Lakebase; tmpdir only.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  initPipeline,
  setStoryStatus,
  surfaceForGate,
  approveStoryGate,
  withdrawStoryGate,
  dispatchNext,
  completeActive,
  getStoryGate,
  writePipeline,
  readPipeline,
} from "../../scripts/sftdd/story-pipeline";
import {
  writeMasterTestList,
  writeStoryTestList,
  readStoryTestList,
  type TestList,
} from "../../scripts/sftdd/test-list";
import { getValidator } from "../../scripts/sftdd/schema-loader";

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d) fs.rmSync(d, { recursive: true, force: true });
  }
});

const FEATURE = "F1-bug-tracker";
const STORIES = ["S1-submit", "S2-owner", "S3-list-view"] as const;
// AC ownership: S1 -> AC1, AC2; S2 -> AC3; S3 -> AC4.
const STORY_ACS: Record<string, string[]> = {
  "S1-submit": ["AC1", "AC2"],
  "S2-owner": ["AC3"],
  "S3-list-view": ["AC4"],
};

/** Scaffold .tdd/features/<F>/stories/<S>/acs/<AC>.json + a master test list. */
function scaffoldFeature(): string {
  const tdd = fs.mkdtempSync(path.join(os.tmpdir(), "feip7565-e2e-"));
  tmpDirs.push(tdd);
  const featureDir = path.join(tdd, "features", FEATURE);
  for (const story of STORIES) {
    const acsDir = path.join(featureDir, "stories", story, "acs");
    fs.mkdirSync(acsDir, { recursive: true });
    for (const ac of STORY_ACS[story]) {
      fs.writeFileSync(path.join(acsDir, `${ac}.json`), JSON.stringify({ id: ac, layer: "API" }));
    }
  }
  // Master list with items interleaved across stories, so per-story scoping
  // must select by AC membership (not contiguity) and preserve master order.
  const master: TestList = {
    feature_id: FEATURE,
    ordered_for: "risk-first",
    items: [
      { id: "T1", description: "submit forces API shape", ac_id: "AC1", status: "pending" },
      { id: "T2", description: "owner assignment", ac_id: "AC3", status: "pending" },
      { id: "T3", description: "submit happy path", ac_id: "AC2", status: "pending" },
      { id: "T4", description: "list view renders", ac_id: "AC4", status: "pending" },
    ],
  };
  writeMasterTestList(tdd, master);
  return tdd;
}

describe("per-story pipeline e2e: design runs ahead, single build lane drains the gated queue", () => {
  it("streams a 3-story feature through gate + build with the single-lane invariant intact", () => {
    const tdd = scaffoldFeature();
    const p = initPipeline(FEATURE);

    // --- Design lane starts on every story (running ahead) ---
    for (const s of STORIES) setStoryStatus(p, s, "designing");

    // S1 finishes design first: surface + the PO approves its gate, which
    // enqueues it. S2 and S3 are still being designed.
    surfaceForGate(p, "S1-submit");
    approveStoryGate(p, "S1-submit", { approver: "po@bugtracker", at: "2026-06-07T10:00:00Z" });
    expect(p.build_queue).toEqual(["S1-submit"]);
    expect(p.stories["S2-owner"].status).toBe("designing"); // still designing
    expect(p.stories["S3-list-view"].status).toBe("designing");

    // Build lane is idle -> dispatch S1. Write S1's scoped test list for the pair.
    expect(dispatchNext(p)).toBe("S1-submit");
    expect(p.build_active).toBe("S1-submit");
    const s1List = writeStoryTestList(tdd, FEATURE, "S1-submit");
    expect(s1List).not.toBeNull();
    expect(readStoryTestList(tdd, FEATURE, "S1-submit")!.items.map((i) => i.id)).toEqual(["T1", "T3"]);

    // --- While S1 builds, the design lane finishes S2 and the PO gates it. ---
    surfaceForGate(p, "S2-owner");
    approveStoryGate(p, "S2-owner", { approver: "po@bugtracker", at: "2026-06-07T10:05:00Z" });
    // S1 keeps building; S2 waits in the queue (single-lane invariant).
    expect(p.build_active).toBe("S1-submit");
    expect(p.build_queue).toEqual(["S2-owner"]);
    expect(dispatchNext(p)).toBeNull(); // lane busy, no second story dispatched

    // --- S3 design finishes + gated too; queues behind S2. ---
    surfaceForGate(p, "S3-list-view");
    approveStoryGate(p, "S3-list-view", { approver: "po@bugtracker", at: "2026-06-07T10:08:00Z" });
    expect(p.build_queue).toEqual(["S2-owner", "S3-list-view"]);

    // --- Build lane drains the queue in FIFO order, one at a time. ---
    expect(completeActive(p)).toBe("S1-submit");
    expect(p.stories["S1-submit"].status).toBe("done");
    expect(dispatchNext(p)).toBe("S2-owner");
    expect(readStoryTestList(tdd, FEATURE, "S2-owner") ?? writeStoryTestList(tdd, FEATURE, "S2-owner")).toBeTruthy();
    expect(readStoryTestList(tdd, FEATURE, "S2-owner")!.items.map((i) => i.id)).toEqual(["T2"]);

    expect(completeActive(p)).toBe("S2-owner");
    expect(dispatchNext(p)).toBe("S3-list-view");
    writeStoryTestList(tdd, FEATURE, "S3-list-view");
    expect(readStoryTestList(tdd, FEATURE, "S3-list-view")!.items.map((i) => i.id)).toEqual(["T4"]);
    expect(completeActive(p)).toBe("S3-list-view");

    // --- Terminal state: everything built, lane idle, queue drained. ---
    expect(p.build_active).toBeNull();
    expect(p.build_queue).toEqual([]);
    for (const s of STORIES) {
      expect(p.stories[s].status).toBe("done");
      expect(getStoryGate(p, s).status).toBe("approved"); // every built story was gated
    }

    // The accumulated pipeline persists + validates against its schema.
    writePipeline(tdd, p);
    expect(readPipeline(tdd, FEATURE)).toEqual(p);
    expect(getValidator("story-pipeline.schema.json")(p)).toBe(true);
  });

  it("a withdrawn gate mid-build pulls the story back and the lane is free for the next ready story", () => {
    const tdd = scaffoldFeature();
    const p = initPipeline(FEATURE);
    for (const s of STORIES) setStoryStatus(p, s, "designing");

    surfaceForGate(p, "S1-submit");
    approveStoryGate(p, "S1-submit", { approver: "po", at: "2026-06-07T10:00:00Z" });
    surfaceForGate(p, "S2-owner");
    approveStoryGate(p, "S2-owner", { approver: "po", at: "2026-06-07T10:01:00Z" });
    dispatchNext(p); // S1 building, S2 queued

    // The HIL rescinds S1 after a problem is found mid-build.
    withdrawStoryGate(p, "S1-submit", { approver: "po", at: "2026-06-07T10:02:00Z", reason: "missing AC" });
    expect(p.build_active).toBeNull(); // lane freed
    expect(p.stories["S1-submit"].status).toBe("awaiting-gate");
    expect(getStoryGate(p, "S1-submit").status).toBe("withdrawn");

    // The next ready story dispatches into the freed lane.
    expect(dispatchNext(p)).toBe("S2-owner");
    expect(p.build_active).toBe("S2-owner");
  });
});
