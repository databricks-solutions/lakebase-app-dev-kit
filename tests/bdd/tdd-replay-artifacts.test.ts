// replayDesignTurn copies a design role's recorded output per-turn so the
// fast-forward driver VISITS every stage (not pre-seed-and-skip). The key
// faithfulness property: the Spec Author turn copies ACs with `layer` STRIPPED
// (so the Architect still has work), and the Architect turn restores the
// layer-annotated ACs. A story the corpus lacks returns false (-> real agent).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { replayDesignTurn } from "../../scripts/tdd/replay-artifacts.js";

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
    expect(replayDesignTurn({ turn: { role: "spec-author", mode: "breakdown" }, replayDir: corpus, tddDir: tdd, featureId: F })).toBe(true);
    expect(existsSync(join(tdd, "features", F, "feature-spec.json"))).toBe(true);
    expect(existsSync(join(tdd, "features", F, "stories", S, "story.json"))).toBe(true);
    expect(existsSync(acFile())).toBe(false); // ACs are the per-story Spec Author turn
  });

  it("spec-author per-story copies the ACs with `layer` STRIPPED (Architect still has work)", () => {
    expect(replayDesignTurn({ turn: { role: "spec-author", story: S }, replayDir: corpus, tddDir: tdd, featureId: F })).toBe(true);
    expect(existsSync(acFile())).toBe(true);
    expect(JSON.parse(readFileSync(acFile(), "utf8")).layer).toBeUndefined();
  });

  it("architect-reviewer restores the layer-annotated ACs + copies architecture", () => {
    replayDesignTurn({ turn: { role: "spec-author", story: S }, replayDir: corpus, tddDir: tdd, featureId: F }); // strip
    expect(replayDesignTurn({ turn: { role: "architect-reviewer", story: S }, replayDir: corpus, tddDir: tdd, featureId: F })).toBe(true);
    expect(JSON.parse(readFileSync(acFile(), "utf8")).layer).toBe("E2E"); // restored
    expect(existsSync(join(tdd, "features", F, "architecture.json"))).toBe(true);
  });

  it("test-strategist copies the feature test-list; ux-designer copies the design guide", () => {
    expect(replayDesignTurn({ turn: { role: "test-strategist", story: S }, replayDir: corpus, tddDir: tdd, featureId: F })).toBe(true);
    expect(existsSync(join(tdd, "features", F, "test-list.json"))).toBe(true);
    expect(replayDesignTurn({ turn: { role: "ux-designer" }, replayDir: corpus, tddDir: tdd, featureId: F })).toBe(true);
    expect(existsSync(join(tdd, "design", "design-guide.json"))).toBe(true);
  });

  it("a story the corpus does not cover returns false (driver falls back to the real agent)", () => {
    expect(replayDesignTurn({ turn: { role: "spec-author", story: "S2-not-recorded" }, replayDir: corpus, tddDir: tdd, featureId: F })).toBe(false);
  });
});
