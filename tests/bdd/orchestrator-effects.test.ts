// Real DriveEffects (phase 3b act half) tests: the pure action->commands
// mapping per WorkflowAction kind, plus buildDriveEffects routing through an
// injected runner and reading a DriveState from a temp .tdd.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  commandsForAction,
  buildDriveEffects,
  planNextAction,
  type DriveCommand,
  type DriveEffectsConfig,
  type CommandRunner,
} from "../../scripts/tdd/orchestrator-effects";

function recordingRunner(): { runner: CommandRunner; calls: DriveCommand[] } {
  const calls: DriveCommand[] = [];
  return { calls, runner: { async run(cmd) { calls.push(cmd); } } };
}

function cfg(over: Partial<DriveEffectsConfig> = {}): DriveEffectsConfig {
  return {
    projectDir: "/p",
    tddDir: "/p/.tdd",
    featureId: "F1",
    runner: { async run() {} },
    modelForRole: () => "sonnet",
    approver: "human-proxy",
    deployTarget: "local",
    instance: "inst-x",
    ...over,
  };
}

describe("commandsForAction: invoke-role -> claude", () => {
  it("maps a build role to a claude command with the resolved model", () => {
    const c = cfg({ modelForRole: (r) => (r === "driver" ? "opus" : "sonnet") });
    const cmds = commandsForAction({ kind: "invoke-role", role: "driver", story: "S1" }, c);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({ kind: "claude", role: "driver", model: "opus" });
    expect((cmds[0] as { task: string }).task).toMatch(/GREEN/);
  });

  it("planning roles get mode-specific tasks", () => {
    const propose = commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "propose" }, cfg());
    expect((propose[0] as { task: string }).task).toMatch(/breakdown/i);
    const author = commandsForAction({ kind: "invoke-role", role: "product-owner", mode: "author-requests" }, cfg());
    expect((author[0] as { task: string }).task).toMatch(/feature-request/i);
  });

  it("spec-author breakdown also seeds the pipeline (claude + sync-breakdown)", () => {
    const cmds = commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "breakdown" }, cfg());
    expect(cmds).toHaveLength(2);
    expect(cmds[0]).toMatchObject({ kind: "claude", role: "spec-author" });
    expect(cmds[1]).toMatchObject({ kind: "cli", bin: "lakebase-tdd-pipeline" });
    expect((cmds[1] as { args: string[] }).args[0]).toBe("sync-breakdown");
  });
});

describe("commandsForAction: state transitions -> kit CLIs", () => {
  it("dispatch / surface / approve-gate / complete route to lakebase-tdd-pipeline", () => {
    expect(commandsForAction({ kind: "dispatch", story: "S1" }, cfg())).toEqual([
      { kind: "cli", bin: "lakebase-tdd-pipeline", args: ["dispatch", "--feature", "F1", "--tdd-dir", "/p/.tdd"] },
    ]);
    expect(commandsForAction({ kind: "surface-gate", story: "S1" }, cfg())[0]).toMatchObject({
      bin: "lakebase-tdd-pipeline",
    });
    const approve = commandsForAction({ kind: "approve-gate", story: "S1" }, cfg())[0] as { args: string[] };
    expect(approve.args).toContain("approve-gate");
    expect(approve.args).toContain("--approver");
    expect(approve.args).toContain("human-proxy");
  });

  it("cut-experiment routes to lakebase-tdd-experiment with story + instance", () => {
    const cmds = commandsForAction({ kind: "cut-experiment", story: "S1" }, cfg());
    const cmd = cmds[0] as { bin: string; args: string[] };
    expect(cmd.bin).toBe("lakebase-tdd-experiment");
    expect(cmd.args.slice(0, 2)).toEqual(["cut", "--story"]);
    expect(cmd.args).toContain("--instance");
    expect(cmd.args).toContain("inst-x");
  });

  it("accept merges the experiment AND records the pipeline acceptance (two commands)", () => {
    const cmds = commandsForAction({ kind: "accept", story: "S1" }, cfg());
    expect(cmds).toHaveLength(2);
    expect((cmds[0] as { bin: string; args: string[] }).bin).toBe("lakebase-tdd-experiment");
    expect((cmds[0] as { args: string[] }).args[0]).toBe("merge");
    expect((cmds[1] as { bin: string; args: string[] }).bin).toBe("lakebase-tdd-pipeline");
    expect((cmds[1] as { args: string[] }).args[0]).toBe("accept");
  });

  it("deploy + approve-deploy-gate route to deploy + human-proxy", () => {
    expect((commandsForAction({ kind: "deploy" }, cfg())[0] as { bin: string }).bin).toBe("lakebase-tdd-deploy");
    const g = commandsForAction({ kind: "approve-deploy-gate" }, cfg())[0] as { bin: string; args: string[] };
    expect(g.bin).toBe("lakebase-tdd-human-proxy");
    expect(g.args).toContain("--gate");
    expect(g.args).toContain("deploy");
  });
});

describe("commandsForAction: coarse phase transitions -> set-phase", () => {
  it("planning-complete -> discovery, feature-complete -> deploy, done -> shipped", () => {
    expect(commandsForAction({ kind: "planning-complete" }, cfg())).toEqual([{ kind: "set-phase", phase: "discovery" }]);
    expect(commandsForAction({ kind: "feature-complete" }, cfg())).toEqual([{ kind: "set-phase", phase: "deploy" }]);
    expect(commandsForAction({ kind: "done" }, cfg())).toEqual([{ kind: "set-phase", phase: "shipped" }]);
  });
});

describe("buildDriveEffects", () => {
  let tddDir: string;
  beforeEach(() => {
    tddDir = mkdtempSync(join(tmpdir(), "drive-eff-"));
  });
  afterEach(() => {
    rmSync(tddDir, { recursive: true, force: true });
  });

  it("perform routes an action's commands through the runner", async () => {
    const { runner, calls } = recordingRunner();
    const eff = buildDriveEffects(cfg({ runner, tddDir }));
    await eff.perform({ kind: "accept", story: "S1" });
    expect(calls).toHaveLength(2);
    expect((calls[0] as { args: string[] }).args[0]).toBe("merge");
  });

  it("readState rebuilds a DriveState from pipeline.json + workflow-state", async () => {
    const featureDir = join(tddDir, "features", "F1");
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(tddDir, "workflow-state.json"), JSON.stringify({ phase: "implementation" }));
    writeFileSync(
      join(featureDir, "pipeline.json"),
      JSON.stringify({
        version: 1,
        feature_id: "F1",
        build_queue: [],
        build_active: "S1",
        stories: { S1: { status: "building", gate: { status: "approved", history: [] } } },
      }),
    );
    const eff = buildDriveEffects(cfg({ tddDir }));
    const state = await eff.readState();
    expect(state.phase).toBe("feature"); // implementation -> feature
    expect(state.buildActive).toBe("S1");
    expect(state.stories.S1.gateApproved).toBe(true);
  });

  it("planNextAction (the --dry-run core) reports the next action + its commands", async () => {
    // Planning, breakdown proposed (feature-spec exists) but PO has not authored
    // -> next action is invoke product-owner author-requests.
    const featureDir = join(tddDir, "features", "F1");
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(tddDir, "workflow-state.json"), JSON.stringify({ phase: "planning" }));
    writeFileSync(join(featureDir, "feature-spec.json"), JSON.stringify({ id: "F1", stories: [] }));
    writeFileSync(
      join(featureDir, "pipeline.json"),
      JSON.stringify({ version: 1, feature_id: "F1", build_queue: [], build_active: null, stories: {} }),
    );

    const plan = await planNextAction(cfg({ tddDir }));
    expect(plan.action).toEqual({ kind: "invoke-role", role: "product-owner", mode: "author-requests" });
    expect(plan.commands[0]).toMatchObject({ kind: "claude", role: "product-owner" });
  });
});
