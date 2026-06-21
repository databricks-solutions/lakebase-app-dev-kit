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
} from "../../scripts/sftdd/orchestrator-effects";
import { existsSync, readFileSync } from "node:fs";
import { handbackFile } from "../../scripts/sftdd/sftdd-paths";

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
    // P5: the Driver resumes PER STORY by default (story-scoped resumeKey), warm
    // across the story's cycles and fresh at each new story. The on-disk artifact
    // remains its only inter-role context, so correctness is unchanged.
    expect(cmds[0]).toMatchObject({ kind: "claude", role: "driver", model: "opus", resumeKey: "driver:S1" });
    expect((cmds[0] as { task: string }).task).toMatch(/GREEN/);
    expect(cmds[1]).toMatchObject({ kind: "cli", bin: "lakebase-sftdd-cycle" });
    expect((cmds[1] as { args: string[] }).args[0]).toBe("green");
    expect(cmds[2]).toMatchObject({ kind: "cli", bin: "lakebase-sftdd-log" });
    expect((cmds[2] as { args: string[] }).args).toContain("--reconcile");
  });

  it("resume scoping: non-build roles warm across the feature; build roles warm PER STORY (P5)", () => {
    // spec-author / architect-reviewer / etc. resume across the whole feature
    // (keyed by role). The build roles (navigator/driver) resume per STORY , a
    // fresh session each story bounds context growth (the per-story spec gate
    // keeps stories small); the detailed scoping is covered in the build-lane
    // perf describe below.
    const specAuthor = commandsForAction({ kind: "invoke-role", role: "spec-author", story: "S1" }, cfg());
    expect(specAuthor[0]).toMatchObject({ kind: "claude", role: "spec-author", resumeKey: "spec-author" });
    const navigator = commandsForAction({ kind: "invoke-role", role: "navigator", story: "S1" }, cfg());
    const driver = commandsForAction({ kind: "invoke-role", role: "driver", story: "S1" }, cfg());
    expect((navigator[0] as { resumeKey?: string }).resumeKey).toBe("navigator:S1");
    expect((driver[0] as { resumeKey?: string }).resumeKey).toBe("driver:S1");
  });

  it("navigator: agent writes the test, orchestration stamps the RED cycle (agent records nothing)", () => {
    const cmds = commandsForAction({ kind: "invoke-role", role: "navigator", story: "S1" }, cfg());
    // [claude, cycle begin, reconcile]. The Navigator is pure; the cycle CLI
    // (orchestration) records RED so the probe's red_at reading never depends
    // on the agent hand-writing a cycle artifact.
    expect(cmds[0]).toMatchObject({ kind: "claude", role: "navigator" });
    // P5: Navigator resumes per story (story-scoped resumeKey).
    expect((cmds[0] as { resumeKey?: string }).resumeKey).toBe("navigator:S1");
    const cycle = cmds.find((c) => (c as { bin?: string }).bin === "lakebase-sftdd-cycle") as { args: string[] } | undefined;
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
    // Level-1 input scoping: the draft invocation is handed only the
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

  it("test-strategist task inlines the story's AC ids so it need not re-derive them (P1)", () => {
    // P1 outlier fix: hand the strategist the exact AC ids up front (it re-scanned
    // the acs/ dir to re-derive them, a slow step on a small model) and pin the
    // ac_id mapping the response-formatter enforces.
    const tmp = mkdtempSync(join(tmpdir(), "effects-strategist-"));
    const tddDir = join(tmp, ".tdd");
    mkdirSync(join(tddDir, "features", "F1", "stories", "S1"), { recursive: true });
    writeFileSync(
      join(tddDir, "features", "F1", "stories", "S1", "story.json"),
      JSON.stringify({ id: "S1", acs: ["AC1-create-form", "AC2-validate-input"] }),
    );
    const task = (commandsForAction({ kind: "invoke-role", role: "test-strategist", story: "S1" }, cfg({ tddDir }))[0] as { task: string }).task;
    expect(task).toMatch(/story S1's ordered tests/);
    expect(task).toMatch(/APPEND them to the feature master test list/);
    expect(task).toMatch(/Do NOT author any test-list-per-story\.json/);
    expect(task).toContain("AC1-create-form");
    expect(task).toContain("AC2-validate-input");
    expect(task).toMatch(/EXACT ids/);
    expect(task).toMatch(/cover each AC at least once/);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("test-strategist task falls back to the bare directive when no ACs are on disk yet", () => {
    const task = (commandsForAction({ kind: "invoke-role", role: "test-strategist", story: "S9" }, cfg())[0] as { task: string }).task;
    expect(task).toMatch(/story S9's ordered tests/);
    expect(task).toMatch(/APPEND them to the feature master test list/);
    expect(task).not.toMatch(/The story's ACs are:/);
  });

  it("author-requests supplies the PO's requests via the Human Proxy + sync-backlog (no LLM spawned)", () => {
    // author-requests is a human-input step: the state machine asks, and headless
    // the Human Proxy supplies the recorded feature-requests (logging each), then
    // sync-backlog projects the backlog. No claude agent invents them.
    const author = commandsForAction({ kind: "invoke-role", role: "product-owner", mode: "author-requests" }, cfg());
    expect(author).toHaveLength(2);
    expect(author[0]).toMatchObject({ kind: "cli", bin: "lakebase-sftdd-human-proxy" });
    expect((author[0] as { args: string[] }).args[0]).toBe("supply-requests");
    expect(author[1]).toMatchObject({ kind: "sync-backlog" });
    expect(author.some((c) => (c as { kind?: string }).kind === "claude")).toBe(false);
  });

  it("spec-author breakdown also seeds the pipeline (claude + sync-breakdown)", () => {
    const cmds = commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "breakdown" }, cfg());
    // [claude, sync-breakdown, reconcile].
    expect(cmds).toHaveLength(3);
    expect(cmds[0]).toMatchObject({ kind: "claude", role: "spec-author" });
    expect(cmds[1]).toMatchObject({ kind: "cli", bin: "lakebase-sftdd-pipeline" });
    expect((cmds[1] as { args: string[] }).args[0]).toBe("sync-breakdown");
    expect(cmds[2]).toMatchObject({ kind: "cli", bin: "lakebase-sftdd-log" });
    expect((cmds[2] as { args: string[] }).args).toContain("--reconcile");
  });

  it("sprint-scoped planning roles (propose/author-requests) do NOT reconcile", () => {
    // No feature artifacts to reconcile at planning time.
    const propose = commandsForAction({ kind: "invoke-role", role: "spec-author", mode: "propose" }, cfg());
    expect(propose).toHaveLength(1);
    expect(propose.some((c) => (c as { bin?: string }).bin === "lakebase-sftdd-log")).toBe(false);
  });
});

describe("commandsForAction: unified config model-side payload (effort per turn + fallback + budget)", () => {
  const claudeOf = (cmds: ReturnType<typeof commandsForAction>) =>
    cmds.find((c) => (c as { kind: string }).kind === "claude") as
      | { effort?: string; fallbackModel?: string; maxBudgetUsd?: number }
      | undefined;

  it("effortForTurn governs ANY turn (not just review); fallback + budget reach the claude command", () => {
    const c = cfg({
      effortForTurn: (_role, turn) => (turn === "green" ? "high" : turn === "review" ? "low" : ""),
      fallbackModelForRole: (role) => (role === "navigator" ? "haiku" : undefined),
      maxBudgetUsdForRole: (role) => (role === "driver" ? 1.5 : undefined),
    });
    // Driver GREEN: effort high (per the resolver) + budget 1.5, no fallback.
    const green = claudeOf(commandsForAction({ kind: "invoke-role", role: "driver", story: "S1" }, c));
    expect(green?.effort).toBe("high");
    expect(green?.maxBudgetUsd).toBe(1.5);
    expect(green?.fallbackModel).toBeUndefined();
    // Navigator REVIEW: effort low + fallback haiku.
    const review = claudeOf(
      commandsForAction({ kind: "invoke-role", role: "navigator", story: "S1", buildMode: "review", ac: "AC1" }, c),
    );
    expect(review?.effort).toBe("low");
    expect(review?.fallbackModel).toBe("haiku");
  });

  it("effort '' / 'default' from the resolver omits --effort entirely", () => {
    const c = cfg({ effortForTurn: () => "" });
    const red = claudeOf(commandsForAction({ kind: "invoke-role", role: "navigator", story: "S1" }, c));
    expect(red?.effort).toBeUndefined();
  });

  it("back-compat: no effortForTurn -> review-only reviewEffort still applies", () => {
    const c = cfg({ reviewEffort: "low" }); // no effortForTurn
    const review = claudeOf(
      commandsForAction({ kind: "invoke-role", role: "navigator", story: "S1", buildMode: "review", ac: "AC1" }, c),
    );
    const green = claudeOf(commandsForAction({ kind: "invoke-role", role: "driver", story: "S1" }, c));
    expect(review?.effort).toBe("low");
    expect(green?.effort).toBeUndefined(); // authoring turns keep model default
  });
});

describe("commandsForAction: P8b loop granularity (hybrid-a layer-batched build)", () => {
  const cycleArgs = (cmds: ReturnType<typeof commandsForAction>): string[] =>
    (cmds.find((c) => (c as { bin?: string }).bin === "lakebase-sftdd-cycle") as { args: string[] }).args;
  const navTask = (cmds: ReturnType<typeof commandsForAction>): string => (cmds[0] as { task: string }).task;

  it("default (ac): the navigator begin command carries NO --loop flag", () => {
    const cmds = commandsForAction({ kind: "invoke-role", role: "navigator", story: "S1" }, cfg());
    const args = cycleArgs(cmds);
    expect(args[0]).toBe("begin");
    expect(args).not.toContain("--loop");
  });

  it("hybrid-a: the navigator begin command appends --loop hybrid-a + --batch-cap", () => {
    const cmds = commandsForAction(
      { kind: "invoke-role", role: "navigator", story: "S1" },
      cfg({ loopGranularity: "hybrid-a", batchCap: 3 }),
    );
    const args = cycleArgs(cmds);
    expect(args[0]).toBe("begin");
    expect(args).toContain("--loop");
    expect(args[args.indexOf("--loop") + 1]).toBe("hybrid-a");
    expect(args).toContain("--batch-cap");
    expect(args[args.indexOf("--batch-cap") + 1]).toBe("3");
    // The RED prompt tells the Navigator to write the layer-batch, not one test.
    expect(navTask(cmds)).toMatch(/layer-batch/i);
  });

  it("hybrid-a does NOT add --loop to the REVIEW verb (review stays per-AC)", () => {
    const cmds = commandsForAction(
      { kind: "invoke-role", role: "navigator", story: "S1", buildMode: "review", ac: "AC1" },
      cfg({ loopGranularity: "hybrid-a", batchCap: 3 }),
    );
    const args = cycleArgs(cmds);
    expect(args[0]).toBe("review");
    expect(args).not.toContain("--loop");
  });

  it("hybrid-a: the driver GREEN prompt asks to green the whole batch in one pass", () => {
    const cmds = commandsForAction(
      { kind: "invoke-role", role: "driver", story: "S1" },
      cfg({ loopGranularity: "hybrid-a" }),
    );
    expect(navTask(cmds)).toMatch(/layer-batch|ALL GREEN/i);
  });
});

describe("commandsForAction: state transitions -> kit CLIs", () => {
  it("dispatch / surface / approve-gate / complete route to lakebase-sftdd-pipeline", () => {
    expect(commandsForAction({ kind: "dispatch", story: "S1" }, cfg())).toEqual([
      { kind: "cli", bin: "lakebase-sftdd-pipeline", args: ["dispatch", "--feature", "F1", "--tdd-dir", "/p/.tdd"] },
    ]);
    expect(commandsForAction({ kind: "surface-gate", story: "S1" }, cfg())[0]).toMatchObject({
      bin: "lakebase-sftdd-pipeline",
    });
    const approve = commandsForAction({ kind: "approve-gate", story: "S1" }, cfg())[0] as { args: string[] };
    expect(approve.args).toContain("approve-gate");
    expect(approve.args).toContain("--approver");
    expect(approve.args).toContain("human-proxy");
  });

  it("approve-promote-gate supplies a non-empty --promote-ref (else the gate skips + the driver stalls)", () => {
    // The promote-phase stall: the Human Proxy SKIPS the promote gate without a
    // promote_ref ("nothing to promote"), so the orchestrator MUST pass one or
    // the gate never approves and approve-promote-gate loops forever. The ref is
    // the feature's canonical branch (what gets merged into the parent tier).
    const cmd = commandsForAction({ kind: "approve-promote-gate" }, cfg({ featureBranch: "feature-f1" }))[0] as { args: string[] };
    expect(cmd.args).toContain("--gate");
    expect(cmd.args[cmd.args.indexOf("--gate") + 1]).toBe("promote");
    expect(cmd.args).toContain("--promote-ref");
    expect(cmd.args[cmd.args.indexOf("--promote-ref") + 1]).toBe("feature-f1");
  });

  it("approve-promote-gate falls back to the feature id when no featureBranch is set", () => {
    const cmd = commandsForAction({ kind: "approve-promote-gate" }, cfg())[0] as { args: string[] };
    const ref = cmd.args[cmd.args.indexOf("--promote-ref") + 1];
    expect(ref).toBe("F1");
    expect(ref.length).toBeGreaterThan(0);
  });

  it("cut-experiment routes to a COMPLETE lakebase-sftdd-experiment cut command", () => {
    const cmds = commandsForAction({ kind: "cut-experiment", story: "S1" }, cfg({ featureBranch: "feature/x" }));
    const cmd = cmds[0] as { bin: string; args: string[] };
    expect(cmd.bin).toBe("lakebase-sftdd-experiment");
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

  it("cut-experiment emits only the cut (build replay is now per-turn, not a post-cut skip)", () => {
    // The monolithic replay-build step is gone: build replay happens turn by turn
    // in the runner (per Navigator/Driver turn), so cut-experiment just cuts.
    const cmds = commandsForAction({ kind: "cut-experiment", story: "S1" }, cfg({ featureBranch: "feature/x" }));
    expect(cmds[0]).toMatchObject({ kind: "cli", bin: "lakebase-sftdd-experiment" });
    expect(cmds.some((c) => (c as { kind: string }).kind === "replay-build")).toBe(false);
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
    expect((cmds[0] as { bin: string; args: string[] }).bin).toBe("lakebase-sftdd-experiment");
    expect((cmds[0] as { args: string[] }).args[0]).toBe("merge");
    expect((cmds[1] as { bin: string; args: string[] }).bin).toBe("lakebase-sftdd-pipeline");
    expect((cmds[1] as { args: string[] }).args[0]).toBe("accept");
  });

  it("deploy is run by the orchestration (deterministic lakebase-sftdd-deploy --gate), not the LLM", () => {
    const cmds = commandsForAction({ kind: "deploy" }, cfg());
    // teardown first (free the port), then the gated feature deploy.
    expect(cmds[0]).toMatchObject({ kind: "cli", bin: "lakebase-sftdd-deploy" });
    expect((cmds[0] as { args: string[] }).args).toContain("--stop");
    expect(cmds[1]).toMatchObject({ kind: "cli", bin: "lakebase-sftdd-deploy" });
    const g = (cmds[1] as { args: string[] }).args;
    expect(g).toContain("--gate"); // gate deploy: records evidence + escalates, never an LLM claim
    expect(g).toContain("--feature");
    expect(g).not.toContain("--story"); // feature-level deploy (ambient feature branch)
    // No release-engineer LLM turn in the deploy path.
    expect(cmds.some((c) => "role" in c && (c as { role?: string }).role === "release-engineer")).toBe(false);
  });

  it("await-acceptance: the Release Engineer is dispatched to RUN the deterministic deploy gate, then marks awaiting", () => {
    const cmds = commandsForAction({ kind: "await-acceptance", story: "S1" }, cfg());
    // teardown first (free the port).
    expect(cmds[0]).toMatchObject({ kind: "cli", bin: "lakebase-sftdd-deploy" });
    expect((cmds[0] as { args: string[] }).args).toContain("--stop");
    // the RELEASE ENGINEER takes over (visible actor) , a claude turn whose task
    // is to run the deterministic deploy gate (the deploy is the CLI, not the
    // model's word; deploy-evidence is the backstop).
    const re = cmds[1] as { kind: string; role?: string; task?: string };
    expect(re.kind).toBe("claude");
    expect(re.role).toBe("release-engineer");
    expect(re.task).toContain("lakebase-sftdd-deploy");
    expect(re.task).toEqual(expect.stringContaining("--gate"));
    expect(re.task).toEqual(expect.stringContaining("--story S1"));
    expect(re.task).toEqual(expect.stringContaining("--lakebase-branch"));
    // then the pipeline marks awaiting-acceptance.
    expect(cmds[2]).toMatchObject({ kind: "cli", bin: "lakebase-sftdd-pipeline" });
    expect((cmds[2] as { args: string[] }).args[0]).toBe("await-acceptance");
  });

  it("approve-deploy-gate is the PO gate via the Human Proxy", () => {
    const g = commandsForAction({ kind: "approve-deploy-gate" }, cfg())[0] as { bin: string; args: string[] };
    expect(g.bin).toBe("lakebase-sftdd-human-proxy");
    expect(g.args).toContain("--gate");
    expect(g.args).toContain("deploy");
  });

  it("approve-plan-gate is the sprint plan gate via the Human Proxy (sprint-scoped)", () => {
    const g = commandsForAction({ kind: "approve-plan-gate" }, cfg({ sprintName: "sprint-1" }))[0] as { bin: string; args: string[] };
    expect(g.bin).toBe("lakebase-sftdd-human-proxy");
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
    expect(plan.commands[0]).toMatchObject({ kind: "cli", bin: "lakebase-sftdd-human-proxy" });
    expect((plan.commands[0] as { args: string[] }).args[0]).toBe("supply-requests");
  });
});

describe("hand-back delivery: onHandback writes, roleTask consumes (informed retry)", () => {
  let tdd: string;
  beforeEach(() => {
    tdd = mkdtempSync(join(tmpdir(), "hb-eff-"));
    mkdirSync(join(tdd, "features", "F1", "stories", "S2", "acs"), { recursive: true });
  });
  afterEach(() => rmSync(tdd, { recursive: true, force: true }));

  it("buildDriveEffects.onHandback writes the hand-back note where the role's prompt will read it", () => {
    const eff = buildDriveEffects(cfg({ tddDir: tdd, projectDir: tdd }));
    eff.onHandback!(
      { signature: "x", responder: "test-strategist", story: "S2", expected: "a per-story test list", satisfiedBy: () => false },
      "HANDBACK (attempt 1): your previous turn did not return a per-story test list for story S2.",
    );
    const file = handbackFile(tdd, "F1", "test-strategist", "S2");
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8")).toMatch(/HANDBACK \(attempt 1\)/);
  });

  it("commandsForAction CONSUMES the hand-back: it prefixes the role task once, then deletes the note", () => {
    const eff = buildDriveEffects(cfg({ tddDir: tdd, projectDir: tdd }));
    eff.onHandback!(
      { signature: "x", responder: "test-strategist", story: "S2", expected: "a per-story test list", satisfiedBy: () => false },
      "HANDBACK: fix the empty test list for S2.",
    );
    const action = { kind: "invoke-role", role: "test-strategist", story: "S2" } as const;
    const cmds = commandsForAction(action, cfg({ tddDir: tdd, projectDir: tdd }));
    const task = (cmds[0] as { task: string }).task;
    expect(task).toMatch(/HANDBACK: fix the empty test list for S2\./);
    // Consume-once: the note is deleted so it is not re-injected on later turns.
    expect(existsSync(handbackFile(tdd, "F1", "test-strategist", "S2"))).toBe(false);
    const again = commandsForAction(action, cfg({ tddDir: tdd, projectDir: tdd }));
    expect((again[0] as { task: string }).task).not.toMatch(/HANDBACK/);
  });
});

describe("commandsForAction: build-lane perf (P2 review rubric / P5 session scope / P6 effort)", () => {
  const review = { kind: "invoke-role", role: "navigator", story: "S1", ac: "AC1-create", buildMode: "review" } as const;
  const red = { kind: "invoke-role", role: "navigator", story: "S1" } as const;
  const green = { kind: "invoke-role", role: "driver", story: "S1" } as const;
  const claudeCmd = (a: Parameters<typeof commandsForAction>[0], over = {}) =>
    commandsForAction(a, cfg(over))[0] as { task: string; resumeKey?: string; effort?: string };

  // ── P2: pre-digested REVIEW rubric ─────────────────────────────────────────
  it("inlines an AC-scoped rubric (layer + applicable NFRs) and tells the reviewer NOT to re-read the full files", () => {
    const tmp = mkdtempSync(join(tmpdir(), "effects-rubric-"));
    const tdd = join(tmp, ".tdd");
    mkdirSync(join(tdd, "features", "F1", "stories", "S1", "acs"), { recursive: true });
    writeFileSync(
      join(tdd, "features", "F1", "architecture.json"),
      JSON.stringify({
        nfrs: [
          { id: "NFR-R2-status-validation", brief: "status is always a recognized state", applies_to: "S1" },
          { id: "NFR-additive-migrations", brief: "migrations are additive", applies_to: "F1" },
          { id: "NFR-other-story", brief: "n/a here", applies_to: "S2" },
        ],
      }),
    );
    writeFileSync(
      join(tdd, "features", "F1", "stories", "S1", "acs", "AC1-create.json"),
      JSON.stringify({ id: "AC1-create", layer: "API" }),
    );
    const task = claudeCmd(review, { tddDir: tdd }).task;
    expect(task).toMatch(/RUBRIC \(pre-extracted/);
    expect(task).toContain("layer=API");
    expect(task).toContain("NFR-R2-status-validation"); // story-scoped NFR
    expect(task).toContain("NFR-additive-migrations"); // feature-wide NFR
    expect(task).not.toContain("NFR-other-story"); // a sibling story's NFR is excluded
    expect(task).toMatch(/do not re-read them by default/);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("the review rubric degrades gracefully when architecture.json is absent", () => {
    // cfg's tddDir does not exist -> no layer, no NFRs -> bare review prompt, no RUBRIC clause.
    const task = claudeCmd(review).task;
    expect(task).toMatch(/REVIEW the implementation of AC AC1-create/);
    expect(task).not.toMatch(/RUBRIC \(pre-extracted/);
  });

  // ── P5: build session scope ────────────────────────────────────────────────
  it("by default resumes Navigator/Driver PER STORY (story-scoped resumeKey), fresh at each new story", () => {
    expect(claudeCmd(red).resumeKey).toBe("navigator:S1");
    expect(claudeCmd(green).resumeKey).toBe("driver:S1");
    expect(claudeCmd(review).resumeKey).toBe("navigator:S1"); // review shares the story session
    // a different story is a different (fresh) session
    expect(claudeCmd({ kind: "invoke-role", role: "navigator", story: "S2" }).resumeKey).toBe("navigator:S2");
  });

  it("buildSessionScope=cycle cold-spawns every build turn (no resumeKey) , the overflow safety valve", () => {
    expect(claudeCmd(red, { buildSessionScope: "cycle" }).resumeKey).toBeUndefined();
    expect(claudeCmd(green, { buildSessionScope: "cycle" }).resumeKey).toBeUndefined();
  });

  it("non-build roles still resume across the whole feature (keyed by role)", () => {
    expect(claudeCmd({ kind: "invoke-role", role: "architect-reviewer", story: "S1" }).resumeKey).toBe("architect-reviewer");
  });

  // ── P6: fast review via --effort ───────────────────────────────────────────
  it("sets effort=low on the REVIEW turn only (the headless 'fast' knob)", () => {
    expect(claudeCmd(review).effort).toBe("low");
    expect(claudeCmd(red).effort).toBeUndefined(); // RED authors a test
    expect(claudeCmd(green).effort).toBeUndefined(); // GREEN authors code
  });

  it("reviewEffort is configurable; an empty reviewEffort drops the flag (model default)", () => {
    expect(claudeCmd(review, { reviewEffort: "medium" }).effort).toBe("medium");
    expect(claudeCmd(review, { reviewEffort: "" }).effort).toBeUndefined();
  });
});

describe("commandsForAction: promote phase (PR review + merge to parent)", () => {
  it("deploy-complete sets the coarse phase to promote", () => {
    expect(commandsForAction({ kind: "deploy-complete" }, cfg())).toEqual([{ kind: "set-phase", phase: "promote" }]);
  });

  it("prepare-pr / wait-ci / merge invoke the SCM-workflow CLIs against --project-dir", () => {
    expect(commandsForAction({ kind: "prepare-pr" }, cfg())).toEqual([
      { kind: "cli", bin: "lakebase-scm-prepare-pr", args: ["--project-dir", "/p"] },
    ]);
    expect(commandsForAction({ kind: "wait-ci" }, cfg())).toEqual([
      { kind: "cli", bin: "lakebase-scm-wait-ci", args: ["--project-dir", "/p"] },
    ]);
    // The merge waits for the downstream migrate so staging gets code + schema,
    // but a slow/absent migrate run is non-fatal (the merge already landed) so
    // the drive reaches `done` instead of hanging then failing.
    expect(commandsForAction({ kind: "merge" }, cfg())).toEqual([
      {
        kind: "cli",
        bin: "lakebase-scm-merge",
        args: [
          "--project-dir",
          "/p",
          "--wait-migrate",
          "--migrate-timeout-nonfatal",
          "--migrate-timeout-sec",
          "600",
        ],
      },
    ]);
  });

  it("approve-promote-gate approves the `promote` gate via the Human Proxy (with a promote-ref)", () => {
    const cmds = commandsForAction({ kind: "approve-promote-gate" }, cfg());
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({ kind: "cli", bin: "lakebase-sftdd-human-proxy" });
    // The promote gate REQUIRES a non-empty promote_ref or the Human Proxy skips it
    // (and the driver stalls), so the orchestrator always supplies one (the feature
    // being promoted; falls back to the feature id when no featureBranch is set).
    expect((cmds[0] as { args: string[] }).args).toEqual(
      ["--feature", "F1", "--gate", "promote", "--approver", "human-proxy", "--tdd-dir", "/p/.tdd", "--promote-ref", "F1"],
    );
  });

  it("done switches the working tree back to the parent tier as the last step (when the parent is known)", () => {
    // Feature wrap-up: end on the parent (staging), not the just-merged feature
    // branch, so the next feature forks from a clean parent. Deterministic +
    // idempotent guarantee on top of scm-merge's conditional switch.
    const cmds = commandsForAction({ kind: "done" }, cfg({ parentBranch: "staging" }));
    // Force (-f): at `done` the feature is merged + its code committed; only the
    // per-run .tdd/.lakebase metadata is dirty, and a plain `git checkout` refuses
    // to overwrite those tracked-churny files. The switch must land on the parent
    // regardless (the fork-guard ignores the same metadata).
    expect(cmds[0]).toEqual({ kind: "cli", bin: "git", args: ["checkout", "-f", "staging"] });
    expect(cmds[cmds.length - 1]).toMatchObject({ kind: "set-phase", phase: "shipped" });
  });

  it("done emits ONLY the set-phase when the parent tier is unknown (no SCM state)", () => {
    const cmds = commandsForAction({ kind: "done" }, cfg({ parentBranch: undefined }));
    expect(cmds).toEqual([{ kind: "set-phase", phase: "shipped" }]);
  });
});
