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
    // [claude, cycle green, reconcile]: the Driver runs (writes code + runs the
    // project's tests), then the ORCHESTRATION records the cycle (stamps GREEN
    // via the substrate, not the agent), then reconcile logs what landed.
    expect(cmds).toHaveLength(3);
    // resumeKey = the role: the runner resumes this role's warm Claude session
    // across its invocations instead of a cold respawn per story/cycle.
    expect(cmds[0]).toMatchObject({ kind: "claude", role: "driver", model: "opus", resumeKey: "driver" });
    expect((cmds[0] as { task: string }).task).toMatch(/GREEN/);
    expect(cmds[1]).toMatchObject({ kind: "cli", bin: "lakebase-tdd-cycle" });
    expect((cmds[1] as { args: string[] }).args[0]).toBe("green");
    expect(cmds[2]).toMatchObject({ kind: "cli", bin: "lakebase-tdd-log" });
    expect((cmds[2] as { args: string[] }).args).toContain("--reconcile");
  });

  it("navigator: agent writes the test, orchestration stamps the RED cycle (agent records nothing)", () => {
    const cmds = commandsForAction({ kind: "invoke-role", role: "navigator", story: "S1" }, cfg());
    // [claude, cycle begin, reconcile]. The Navigator is pure; the cycle CLI
    // (orchestration) records RED so the probe's red_at reading never depends
    // on the agent hand-writing a cycle artifact.
    expect(cmds[0]).toMatchObject({ kind: "claude", role: "navigator" });
    const cycle = cmds.find((c) => (c as { bin?: string }).bin === "lakebase-tdd-cycle") as { args: string[] } | undefined;
    expect(cycle).toBeTruthy();
    expect(cycle!.args[0]).toBe("begin");
    expect(cycle!.args).toContain("S1");
    // The agent is NOT told to record the cycle or touch git.
    expect((cmds[0] as { task: string }).task).not.toMatch(/beginCycle|markGreen|git /i);
  });

  it("propose gets a mode-specific task", () => {
    const propose = commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "propose" }, cfg());
    expect((propose[0] as { task: string }).task).toMatch(/breakdown/i);
  });

  it("propose + breakdown carry the UI-track E2E directive only when the UI track is on", () => {
    const task = (cmds: ReturnType<typeof commandsForAction>) => (cmds[0] as { task: string }).task;
    // Off: no UI directive.
    expect(task(commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "propose" }, cfg()))).not.toMatch(/UI track/i);
    expect(task(commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "breakdown" }, cfg()))).not.toMatch(/UI track/i);
    // On: propose + breakdown both instruct E2E (UI) stories.
    const onPropose = task(commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "propose" }, cfg({ uiTrack: true })));
    expect(onPropose).toMatch(/UI track is ON/);
    expect(onPropose).toMatch(/E2E/);
    const onBreakdown = task(commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "breakdown" }, cfg({ uiTrack: true })));
    expect(onBreakdown).toMatch(/UI track is ON/);
    expect(onBreakdown).toMatch(/E2E/);
  });

  it("scopes the spec-author per-story draft to ONE story (directive + inlined stub)", () => {
    // Level-1 input scoping (FEIP-7461): the draft invocation is handed only the
    // target story's stub + a single-story directive, so the agent can't batch
    // every story's ACs (which would delay the first story's gate + build).
    const tmp = mkdtempSync(join(tmpdir(), "effects-specauthor-"));
    const tddDir = join(tmp, ".tdd");
    mkdirSync(join(tddDir, "features", "F1", "stories", "S1"), { recursive: true });
    writeFileSync(
      join(tddDir, "features", "F1", "stories", "S1", "story.json"),
      JSON.stringify({ id: "S1", asA: "team member", iWantTo: "file a bug", soThat: "it is tracked" }),
    );
    const task = (commandsForAction({ kind: "invoke-role", role: "spec-author", story: "S1" }, cfg({ tddDir }))[0] as { task: string }).task;
    expect(task).toMatch(/story S1 and NOTHING else/);
    expect(task).toMatch(/Do not create, draft, or modify acceptance criteria for any other story/);
    expect(task).toMatch(/once per story/);
    // The target story's stub is inlined so the prompt is self-contained.
    expect(task).toMatch(/As a team member/);
    expect(task).toMatch(/I want to file a bug/);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("spec-author draft falls back to the directive alone when the story stub is unreadable", () => {
    // No story.json on disk (cfg's tddDir does not exist): still one-story-scoped,
    // just without the inlined stub sentence.
    const task = (commandsForAction({ kind: "invoke-role", role: "spec-author", story: "S2" }, cfg())[0] as { task: string }).task;
    expect(task).toMatch(/story S2 and NOTHING else/);
    expect(task).not.toMatch(/The story:/);
  });

  it("author-requests supplies the PO's requests via the Human Proxy + sync-backlog (no LLM spawned)", () => {
    // author-requests is a human-input step: the state machine asks, and headless
    // the Human Proxy supplies the recorded feature-requests (logging each), then
    // sync-backlog projects the backlog. No claude agent invents them.
    const author = commandsForAction({ kind: "invoke-role", role: "product-owner", mode: "author-requests" }, cfg());
    expect(author).toHaveLength(2);
    expect(author[0]).toMatchObject({ kind: "cli", bin: "lakebase-tdd-human-proxy" });
    expect((author[0] as { args: string[] }).args[0]).toBe("supply-requests");
    expect(author[1]).toMatchObject({ kind: "sync-backlog" });
    expect(author.some((c) => (c as { kind?: string }).kind === "claude")).toBe(false);
  });

  it("spec-author breakdown also seeds the pipeline (claude + sync-breakdown)", () => {
    const cmds = commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "breakdown" }, cfg());
    // [claude, sync-breakdown, reconcile].
    expect(cmds).toHaveLength(3);
    expect(cmds[0]).toMatchObject({ kind: "claude", role: "spec-author" });
    expect(cmds[1]).toMatchObject({ kind: "cli", bin: "lakebase-tdd-pipeline" });
    expect((cmds[1] as { args: string[] }).args[0]).toBe("sync-breakdown");
    expect(cmds[2]).toMatchObject({ kind: "cli", bin: "lakebase-tdd-log" });
    expect((cmds[2] as { args: string[] }).args).toContain("--reconcile");
  });

  it("sprint-scoped planning roles (propose/author-requests) do NOT reconcile", () => {
    // No feature artifacts to reconcile at planning time.
    const propose = commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "propose" }, cfg());
    expect(propose).toHaveLength(1);
    expect(propose.some((c) => (c as { bin?: string }).bin === "lakebase-tdd-log")).toBe(false);
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

  it("cut-experiment routes to a COMPLETE lakebase-tdd-experiment cut command", () => {
    const cmds = commandsForAction({ kind: "cut-experiment", story: "S1" }, cfg({ featureBranch: "feature/x" }));
    const cmd = cmds[0] as { bin: string; args: string[] };
    expect(cmd.bin).toBe("lakebase-tdd-experiment");
    expect(cmd.args[0]).toBe("cut");
    // Every flag the experiment CLI requires for `cut` must be emitted (the bug
    // that broke the smoke was an incomplete command; the contract test in
    // orchestrator-experiment-contract.test.ts validates it through the CLI's
    // own validator, this asserts the flags are present at all).
    for (const flag of ["--feature", "--story", "--slug", "--branch", "--parent", "--instance"]) {
      expect(cmd.args, `cut missing ${flag}`).toContain(flag);
    }
    expect(cmd.args).toContain("inst-x");
    expect(cmd.args).toContain("feature/x");
  });

  it("ux-designer translates the design brief into the project style guide", () => {
    const cmds = commandsForAction({ kind: "invoke-role", role: "ux-designer" }, cfg());
    expect(cmds[0]).toMatchObject({ kind: "claude", role: "ux-designer" });
    const task = (cmds[0] as { task: string }).task;
    expect(task).toMatch(/design-brief\.md/);
    expect(task).toMatch(/design-guide\.md/);
    expect(task).toMatch(/design-guide\.json/);
  });

  it("navigator + driver get the design guide as a build input only when the UI track is on", () => {
    const task = (action: Parameters<typeof commandsForAction>[0], over = {}) =>
      (commandsForAction(action, cfg(over))[0] as { task: string }).task;
    // Off: no design-guide directive.
    expect(task({ kind: "invoke-role", role: "navigator", story: "S1" })).not.toMatch(/design guide/i);
    // On: both build roles are pointed at the design guide.
    expect(task({ kind: "invoke-role", role: "navigator", story: "S1" }, { uiTrack: true })).toMatch(/design guide/i);
    expect(task({ kind: "invoke-role", role: "driver", story: "S1" }, { uiTrack: true })).toMatch(/design guide/i);
  });

  it("accept merges the experiment AND records the pipeline acceptance (two commands)", () => {
    const cmds = commandsForAction({ kind: "accept", story: "S1" }, cfg());
    expect(cmds).toHaveLength(2);
    expect((cmds[0] as { bin: string; args: string[] }).bin).toBe("lakebase-tdd-experiment");
    expect((cmds[0] as { args: string[] }).args[0]).toBe("merge");
    expect((cmds[1] as { bin: string; args: string[] }).bin).toBe("lakebase-tdd-pipeline");
    expect((cmds[1] as { args: string[] }).args[0]).toBe("accept");
  });

  it("deploy goes through the release-engineer role (deploy + verify + evidence)", () => {
    const cmds = commandsForAction({ kind: "deploy" }, cfg());
    expect(cmds[0]).toMatchObject({ kind: "claude", role: "release-engineer" });
    expect((cmds[0] as { task: string }).task).toMatch(/verify/i);
  });

  it("await-acceptance deploys the story for review (release-engineer) then marks awaiting", () => {
    const cmds = commandsForAction({ kind: "await-acceptance", story: "S1" }, cfg());
    expect(cmds[0]).toMatchObject({ kind: "claude", role: "release-engineer" });
    expect(cmds[1]).toMatchObject({ kind: "cli", bin: "lakebase-tdd-pipeline" });
    expect((cmds[1] as { args: string[] }).args[0]).toBe("await-acceptance");
  });

  it("approve-deploy-gate is the PO gate via the Human Proxy", () => {
    const g = commandsForAction({ kind: "approve-deploy-gate" }, cfg())[0] as { bin: string; args: string[] };
    expect(g.bin).toBe("lakebase-tdd-human-proxy");
    expect(g.args).toContain("--gate");
    expect(g.args).toContain("deploy");
  });

  it("approve-plan-gate is the sprint plan gate via the Human Proxy (sprint-scoped)", () => {
    const g = commandsForAction({ kind: "approve-plan-gate" }, cfg({ sprintName: "sprint-1" }))[0] as { bin: string; args: string[] };
    expect(g.bin).toBe("lakebase-tdd-human-proxy");
    expect(g.args).toContain("--sprint");
    expect(g.args).toContain("sprint-1");
    expect(g.args).toContain("--gate");
    expect(g.args).toContain("plan");
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
    // Planning, proposed (feature-spec exists) + estimated (Architect sized the
    // candidates) but the PO has not authored requests -> next is product-owner
    // author-requests.
    const featureDir = join(tddDir, "features", "F1");
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(tddDir, "workflow-state.json"), JSON.stringify({ phase: "planning" }));
    writeFileSync(join(featureDir, "feature-spec.json"), JSON.stringify({ id: "F1", stories: [] }));
    mkdirSync(join(tddDir, "planning"), { recursive: true });
    writeFileSync(
      join(tddDir, "planning", "estimates.json"),
      JSON.stringify({ estimates: [{ feature_id: "F1", size: "M" }] }),
    );
    writeFileSync(
      join(featureDir, "pipeline.json"),
      JSON.stringify({ version: 1, feature_id: "F1", build_queue: [], build_active: null, stories: {} }),
    );

    const plan = await planNextAction(cfg({ tddDir }));
    expect(plan.action).toEqual({ kind: "invoke-role", role: "product-owner", mode: "author-requests" });
    // author-requests is a human-input step: the Human Proxy supplies the PO's
    // recorded feature-requests when asked, then sync-backlog. No LLM.
    expect(plan.commands[0]).toMatchObject({ kind: "cli", bin: "lakebase-tdd-human-proxy" });
    expect((plan.commands[0] as { args: string[] }).args[0]).toBe("supply-requests");
  });
});
