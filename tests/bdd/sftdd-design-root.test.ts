// FEIP-8038: design subagents resolved a MALFORMED absolute project root
// (dirname(projectDir)-basename(projectDir), the parent + project joined with a
// hyphen) and wrote every artifact outside the real project, so the out-of-root
// guard bailed and the "re-run" recovery looped forever.
//
// A (prevention): every design-role directive names the ABSOLUTE artifact root
//   for its write targets, so no role ever resolves the project root itself.
// B (self-heal): relocateStrayDesignArtifacts moves a stray .sftdd/.tdd tree at
//   the known malformed sibling back into the real root, so a mis-resolved write
//   self-heals instead of deadlocking.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { commandsForAction, type DriveEffectsConfig } from "../../scripts/sftdd/orchestrator-effects";
import { relocateStrayDesignArtifacts } from "../../scripts/sftdd/stray-artifact-recovery";

function cfg(over: Partial<DriveEffectsConfig> = {}): DriveEffectsConfig {
  return {
    projectDir: "/code/app-dev-kit-demo/stockflow-interactive",
    sftddDir: "/code/app-dev-kit-demo/stockflow-interactive/.sftdd",
    featureId: "F2-adjust-stock",
    runner: { async run() {} },
    modelForRole: () => "sonnet",
    approver: "human-proxy",
    deployTarget: "local",
    instance: "inst-x",
    ...over,
  };
}
const claudeTask = (cmds: ReturnType<typeof commandsForAction>): string =>
  (cmds.find((c) => (c as { kind: string }).kind === "claude") as { task: string }).task;

describe("A: every design directive names the absolute artifact root (FEIP-8038)", () => {
  const c = cfg();
  for (const action of [
    { kind: "invoke-role", role: "spec-author", story: "S1" },
    { kind: "invoke-role", role: "architect-reviewer", story: "S1" },
    { kind: "invoke-role", role: "test-strategist", story: "S1" },
  ] as const) {
    it(`${action.role} (story-scoped) directive contains the absolute root`, () => {
      const task = claudeTask(commandsForAction(action, c));
      expect(task).toContain(c.sftddDir); // absolute path, no root-guessing
    });
  }
});

describe("B: relocateStrayDesignArtifacts (FEIP-8038)", () => {
  let root: string; // ~/code/<parent>/<project>
  let project: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "malformed-root-"));
    // A parent/project layout, so the malformed sibling is parent-project.
    project = join(root, "parent", "project");
    mkdirSync(project, { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const malformed = (): string => `${dirname(project)}-${basename(project)}`; // .../parent-project

  it("relocates a stray .sftdd tree at the malformed sibling into the real project root", () => {
    const strayFeature = join(malformed(), ".sftdd", "features", "F2-adjust-stock");
    mkdirSync(strayFeature, { recursive: true });
    writeFileSync(join(strayFeature, "feature-spec.json"), '{"id":"F2-adjust-stock","stories":["S1"]}\n');

    const r = relocateStrayDesignArtifacts(project);
    expect(r.relocated).toBe(true);
    // The artifact now lives under the REAL project root.
    const realSpec = join(project, ".sftdd", "features", "F2-adjust-stock", "feature-spec.json");
    expect(existsSync(realSpec)).toBe(true);
    expect(JSON.parse(readFileSync(realSpec, "utf8")).id).toBe("F2-adjust-stock");
    // The stray sibling tree is gone.
    expect(existsSync(join(malformed(), ".sftdd"))).toBe(false);
  });

  it("is a no-op when no malformed sibling exists", () => {
    const r = relocateStrayDesignArtifacts(project);
    expect(r.relocated).toBe(false);
  });

  it("is a no-op when the sibling exists but carries no .sftdd/.tdd tree", () => {
    mkdirSync(join(malformed(), "src"), { recursive: true });
    const r = relocateStrayDesignArtifacts(project);
    expect(r.relocated).toBe(false);
  });
});
