// replayDesignTurn copies a design role's recorded output per-turn so the
// fast-forward driver VISITS every stage (not pre-seed-and-skip). The key
// faithfulness property: the Spec Author turn copies each AC VERBATIM (the spec
// author authors `layer`), and the Architect turn , when dispatched , re-copies
// them idempotently + adds architecture.json. The design probe dispatches/skips
// the Architect on architectural_notes + architecture.json + the canon, NOT on
// `layer`, so the Spec Author must not strip it (a cleanly-mapping story gets its
// notes PROJECTED with no Architect turn to restore a stripped layer). A story the
// corpus lacks returns false: the caller (drive.cli.ts) treats a replay corpus miss
// as a HARD FAILURE (ReplayCorpusMissError) , a replay is a recording and must never
// fall through to a live agent.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { replayDesignTurn, restoreReflectVerdict } from "../../scripts/sftdd/replay-artifacts.js";

const F = "F1-file-bug";
const S = "S1-file-bug";
let corpus: string;
let tdd: string;

function wj(p: string, o: unknown) {
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, JSON.stringify(o, null, 2) + "\n");
}

beforeEach(() => {
  corpus = mkdtempSync(join(tmpdir(), "ff-corpus-"));
  tdd = mkdtempSync(join(tmpdir(), "ff-tdd-"));
  const cf = join(corpus, "features", F);
  wj(join(cf, "feature-spec.json"), { id: F, stories: [{ id: S }] });
  writeFileSync(join(cf, "feature-spec.md"), "# spec\n");
  mkdirSync(join(cf, "stories", S), { recursive: true });
  wj(join(cf, "stories", S, "story.json"), { id: S, title: "file a bug" });
  writeFileSync(join(cf, "stories", S, "story.md"), "# story\n");
  wj(join(cf, "stories", S, "acs", "AC1.json"), { id: "AC1", given: "g", layer: "E2E" });
  wj(join(cf, "architecture.json"), { feature_id: F, layers: [] });
  writeFileSync(join(cf, "architecture.md"), "# arch\n");
  wj(join(cf, "test-list.json"), { feature_id: F, items: [{ id: "T1", ac_id: "AC1" }] });
  writeFileSync(join(cf, "test-list.md"), "# tests\n");
  mkdirSync(join(corpus, "design"), { recursive: true });
  wj(join(corpus, "design", "design-guide.json"), { tokens: {} });
  mkdirSync(join(corpus, "planning"), { recursive: true });
  writeFileSync(join(corpus, "planning", "feature-proposals.md"), "# proposals\n");
});

afterEach(() => {
  rmSync(corpus, { recursive: true, force: true });
  rmSync(tdd, { recursive: true, force: true });
});

const acFile = () => join(tdd, "features", F, "stories", S, "acs", "AC1.json");

describe("replayDesignTurn: each stage's output is replayed per-turn", () => {
  it("spec-author breakdown copies feature-spec + story stubs, NOT the ACs", () => {
    expect(replayDesignTurn({ turn: { role: "spec-author", mode: "breakdown" }, replayDir: corpus, sftddDir: tdd, featureId: F })).toBe(true);
    expect(existsSync(join(tdd, "features", F, "feature-spec.json"))).toBe(true);
    expect(existsSync(join(tdd, "features", F, "stories", S, "story.json"))).toBe(true);
    expect(existsSync(acFile())).toBe(false); // ACs are the per-story Spec Author turn
  });

  it("spec-author per-story copies the ACs VERBATIM, preserving `layer` (the spec author authors it)", () => {
    expect(replayDesignTurn({ turn: { role: "spec-author", story: S }, replayDir: corpus, sftddDir: tdd, featureId: F })).toBe(true);
    expect(existsSync(acFile())).toBe(true);
    expect(JSON.parse(readFileSync(acFile(), "utf8")).layer).toBe("E2E");
  });

  it("architect-reviewer re-copies the ACs (idempotent) + copies architecture", () => {
    replayDesignTurn({ turn: { role: "spec-author", story: S }, replayDir: corpus, sftddDir: tdd, featureId: F });
    expect(replayDesignTurn({ turn: { role: "architect-reviewer", story: S }, replayDir: corpus, sftddDir: tdd, featureId: F })).toBe(true);
    expect(JSON.parse(readFileSync(acFile(), "utf8")).layer).toBe("E2E");
    expect(existsSync(join(tdd, "features", F, "architecture.json"))).toBe(true);
  });

  it("test-strategist copies the feature test-list; ux-designer copies the design guide", () => {
    expect(replayDesignTurn({ turn: { role: "test-strategist", story: S }, replayDir: corpus, sftddDir: tdd, featureId: F })).toBe(true);
    expect(existsSync(join(tdd, "features", F, "test-list.json"))).toBe(true);
    expect(replayDesignTurn({ turn: { role: "ux-designer" }, replayDir: corpus, sftddDir: tdd, featureId: F })).toBe(true);
    expect(existsSync(join(tdd, "design", "design-guide.json"))).toBe(true);
  });

  it("a story the corpus does not cover returns false (a corpus miss; the driver hard-fails, never runs a live agent)", () => {
    expect(replayDesignTurn({ turn: { role: "spec-author", story: "S2-not-recorded" }, replayDir: corpus, sftddDir: tdd, featureId: F })).toBe(false);
  });
});

describe("restoreReflectVerdict: the reflect turn's .sftdd verdict (filtered by the code-only build restore)", () => {
  it("restores the recorded reflect-verdict.json from the design corpus into the project", () => {
    // The reflect turn replays as a build turn (code only, .sftdd filtered), so its
    // verdict must be brought back from recorded-artifacts or the drive aborts.
    const src = join(corpus, "features", F, "stories", S, "reflect-verdict.json");
    wj(src, { version: 1, passed: true, findings: [] });
    expect(restoreReflectVerdict({ replayDir: corpus, sftddDir: tdd, featureId: F, story: S })).toBe(true);
    const dst = join(tdd, "features", F, "stories", S, "reflect-verdict.json");
    expect(existsSync(dst)).toBe(true);
    expect(JSON.parse(readFileSync(dst, "utf8")).passed).toBe(true);
  });

  it("returns false when the corpus has no verdict (a corpus miss; the driver hard-fails, never runs the reflect live)", () => {
    expect(restoreReflectVerdict({ replayDir: corpus, sftddDir: tdd, featureId: F, story: S })).toBe(false);
  });
});
