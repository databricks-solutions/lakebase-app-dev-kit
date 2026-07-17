import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SKILL_DIR = join(__dirname, "..", "..", "skills", "lakebase-sftdd-workflows");
const SKILL_PATH = join(SKILL_DIR, "SKILL.md");
const README_PATH = join(SKILL_DIR, "README.md");
const NAV_PATH = join(SKILL_DIR, "agents", "navigator.md");
const DRV_PATH = join(SKILL_DIR, "agents", "driver.md");
const TS_PATH = join(SKILL_DIR, "agents", "test-strategist.md");

const NINE_RULES_PHRASES = [
  "immutable until the test list itself is renegotiated",
  "minimal *honest* code",
  "would a fresh reader infer the right concept",
  "outermost public boundary",
  "correct refactor should not change the outer-boundary tests",
  "never make a private method public",
  "leading indicator is",
  "spike code is throwaway",
  "iterative refinement",
];

describe("lakebase-sftdd-workflows hard rules", () => {
  const skill = readFileSync(SKILL_PATH, "utf8");
  const readme = readFileSync(README_PATH, "utf8");

  it("SKILL.md contains a ## Hard rules section", () => {
    expect(skill).toMatch(/^##\s+Hard rules/m);
  });

  it("README.md ships a ## How to use section with worked prompts", () => {
    expect(readme).toMatch(/^##\s+How to use/m);
    // Flow 1: spec authoring + drift validation.
    expect(readme).toMatch(/Author a feature spec/i);
    // Flow 2: N=1 default – lead with feature-oriented language.
    expect(readme).toMatch(/Build a feature end-to-end/i);
    expect(readme).toMatch(/N=1 default/i);
    // Flow 3: N>=2 parallel experiments.
    expect(readme).toMatch(/Race parallel experiments/i);
  });

  it("README.md lexicon makes the experiment story-scoped explicit for N=1", () => {
    // Experiments are scoped to a story now: N=1 is the story's one isolated build.
    expect(readme).toMatch(/the story's one isolated build/i);
  });

  it("SKILL.md points readers to README.md for the human-facing overview", () => {
    expect(skill).toContain("README.md");
  });

  it("SKILL.md has at least 9 numbered rules", () => {
    const numbered = skill.match(/^[0-9]+\./gm) ?? [];
    expect(numbered.length).toBeGreaterThanOrEqual(9);
  });

  for (const phrase of NINE_RULES_PHRASES) {
    it(`SKILL.md hard rules include: "${phrase}"`, () => {
      // Rule content match is case-insensitive – sentence-start capitalization is incidental,
      // the rule wording itself is what matters.
      expect(skill.toLowerCase()).toContain(phrase.toLowerCase());
    });
  }

  it("SKILL.md points to navigator.md and driver.md for per-role specialization", () => {
    expect(skill).toContain("agents/navigator.md");
    expect(skill).toContain("agents/driver.md");
  });

  it("navigator.md affirms tests are immutable between approved gates", () => {
    const nav = readFileSync(NAV_PATH, "utf8");
    expect(nav).toMatch(/immutable/i);
  });

  it("driver.md prohibits deleting or weakening tests", () => {
    const drv = readFileSync(DRV_PATH, "utf8");
    expect(drv).toMatch(/never delete a test/i);
    expect(drv).toMatch(/never weaken/i);
  });

  it("driver.md prohibits mocking the database", () => {
    const drv = readFileSync(DRV_PATH, "utf8");
    expect(drv.toLowerCase()).toContain("no mocks for the database");
  });

  // Finding 30: a fixed-key seed with only `finally` cleanup poisons every later
  // run on a reused branch DB when a run is killed mid-test. The migration-test
  // guidance in BOTH design roles must require an idempotent seed at the START.
  it("test-strategist.md + navigator.md require an idempotent migration-test seed", () => {
    for (const p of [TS_PATH, NAV_PATH]) {
      const doc = readFileSync(p, "utf8");
      expect(doc.toLowerCase()).toMatch(/idempotent/);
      // A per-run key OR a delete/on-conflict guard before the insert.
      expect(doc).toMatch(/uuid|ON CONFLICT|DELETE the fixed key/i);
      // And it must say the finally cleanup alone is insufficient.
      expect(doc.toLowerCase()).toMatch(/finally/);
    }
  });
});
