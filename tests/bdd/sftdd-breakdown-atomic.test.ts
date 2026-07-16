// FEIP-8024: a /design breakdown deadlocked when the spec-author wrote the story
// stubs but not feature-spec.json , the drive gates on feature-spec.json, and on
// re-run the agent saw its stubs present and no-oped, so every retry failed the
// same missing-feature-spec.json guard forever. Fix: (a) the breakdown directive
// requires feature-spec.json + names the ABSOLUTE artifact root; (b) before every
// breakdown dispatch, a deterministic reset clears an INCOMPLETE breakdown (stubs
// present but feature-spec.json absent/empty-stories) so the re-dispatch always
// regenerates from a clean slate, regardless of the agent's idempotency behavior.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetIncompleteBreakdown } from "../../scripts/sftdd/story-pipeline";
import { storiesDir, storyJson, featureSpecJson } from "../../scripts/sftdd/sftdd-paths";
import { commandsForAction, type DriveEffectsConfig } from "../../scripts/sftdd/orchestrator-effects";

const F = "F1";

let tdd: string;
beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "sftdd-breakdown-"));
});
afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

function writeStub(story: string): void {
  mkdirSync(join(storiesDir(tdd, F), story), { recursive: true });
  writeFileSync(storyJson(tdd, F, story), JSON.stringify({ id: story, scope: "does a thing" }) + "\n");
  writeFileSync(join(storiesDir(tdd, F), story, "story.md"), `# ${story}\n`);
}
function writeSpec(stories: string[]): void {
  mkdirSync(join(tdd, "features", F), { recursive: true });
  writeFileSync(
    featureSpecJson(tdd, F),
    JSON.stringify({ id: F, name: "Feature One", status: "draft", tdd_mode: "N>=2", stories }) + "\n",
  );
}

describe("resetIncompleteBreakdown (FEIP-8024)", () => {
  it("resets a partial breakdown: stubs present but NO feature-spec.json", () => {
    writeStub("S1");
    writeStub("S2");
    const r = resetIncompleteBreakdown(tdd, F);
    expect(r.reset).toBe(true);
    expect(existsSync(storiesDir(tdd, F))).toBe(false); // stubs cleared for a clean re-dispatch
  });

  it("resets when feature-spec.json exists but has an EMPTY stories[] (incomplete)", () => {
    writeStub("S1");
    writeSpec([]);
    const r = resetIncompleteBreakdown(tdd, F);
    expect(r.reset).toBe(true);
    expect(existsSync(storiesDir(tdd, F))).toBe(false);
    expect(existsSync(featureSpecJson(tdd, F))).toBe(false); // the empty spec is cleared too
  });

  it("is a NO-OP on a complete breakdown (feature-spec.json with a non-empty stories[])", () => {
    writeStub("S1");
    writeSpec(["S1"]);
    const r = resetIncompleteBreakdown(tdd, F);
    expect(r.reset).toBe(false);
    expect(existsSync(storyJson(tdd, F, "S1"))).toBe(true); // untouched
    expect(existsSync(featureSpecJson(tdd, F))).toBe(true);
  });

  it("is a NO-OP (no throw) on a clean slate (nothing written yet)", () => {
    const r = resetIncompleteBreakdown(tdd, F);
    expect(r.reset).toBe(false);
  });
});

function cfg(over: Partial<DriveEffectsConfig> = {}): DriveEffectsConfig {
  return {
    projectDir: "/p",
    sftddDir: "/p/.sftdd",
    featureId: F,
    runner: { async run() {} },
    modelForRole: () => "sonnet",
    approver: "human-proxy",
    deployTarget: "local",
    instance: "inst-x",
    ...over,
  };
}

describe("commandsForAction: breakdown is atomic + self-cleaning (FEIP-8024)", () => {
  it("prepends a reset-breakdown before the spec-author breakdown turn", () => {
    const cmds = commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "breakdown" }, cfg());
    const resetIdx = cmds.findIndex(
      (c) => c.kind === "cli" && Array.isArray((c as { args?: string[] }).args) && (c as { args: string[] }).args[0] === "reset-breakdown",
    );
    const claudeIdx = cmds.findIndex((c) => c.kind === "claude");
    expect(resetIdx).toBeGreaterThanOrEqual(0);
    expect(claudeIdx).toBeGreaterThanOrEqual(0);
    expect(resetIdx).toBeLessThan(claudeIdx); // reset runs FIRST, so the re-dispatch is clean
  });

  it("the breakdown directive names the absolute root + requires feature-spec.json with stories", () => {
    const c = cfg();
    const cmds = commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "breakdown" }, c);
    const claude = cmds.find((x) => x.kind === "claude") as { task: string };
    expect(claude.task).toContain(c.sftddDir); // absolute artifact root (no path guessing)
    expect(claude.task).toMatch(/feature-spec\.json/);
    expect(claude.task).toMatch(/stories/);
  });

  it("does NOT reset-breakdown for a non-breakdown action (propose)", () => {
    const cmds = commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "propose" }, cfg());
    const hasReset = cmds.some(
      (c) => c.kind === "cli" && (c as { args?: string[] }).args?.[0] === "reset-breakdown",
    );
    expect(hasReset).toBe(false);
  });
});
