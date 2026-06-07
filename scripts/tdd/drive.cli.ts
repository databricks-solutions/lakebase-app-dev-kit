#!/usr/bin/env node
// lakebase-tdd-drive: the deterministic orchestrator driver (phase 3b).
//
//   lakebase-tdd-drive --feature <id> [--project-dir <dir>] [--tdd-dir <dir>]
//                      [--instance <i>] [--deploy-target <t>] [--approver <a>]
//                      [--dry-run]
//
// Reads the project's persisted state, asks nextTransition for the next action,
// and performs it, looping to `done`. This replaces the LLM scrum-master with a
// code state-machine: instant routing, deterministic per-action logging, and
// the per-story pipeline actually streams (one process holds both lanes). Roles
// are still invoked as LLM subagents (claude -p --agent <role>); only the
// routing is code.
//
// --dry-run computes + prints the SINGLE next action and the commands it would
// run, then exits (no execution) - a safe "what will the driver do next?".

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { runDriver, driverBoundOptions, type DriveEffects, type DriverBound, type RunDriverResult, type RunDriverOptions } from "./orchestrator-run.js";
import { isHitlGateAction, type WorkflowAction } from "./orchestrator-drive.js";
import {
  buildDriveEffects,
  commandsForAction,
  planNextAction,
  type CommandRunner,
  type DriveCommand,
  type DriveEffectsConfig,
} from "./orchestrator-effects.js";
import {
  runSprint,
  readSprintBacklog,
  deriveSprintPlanningState,
  type SprintEffects,
} from "./orchestrator-sprint.js";
import { resolveModelForRole } from "./agent-models.js";
import type { AgentRole } from "./agent-log.js";
import { makeOnAction } from "./orchestrator-logging.js";

interface ParsedArgs {
  feature?: string;
  sprint?: string;
  projectDir?: string;
  tddDir?: string;
  instance?: string;
  deployTarget?: string;
  approver?: string;
  dryRun?: boolean;
  maxSteps?: number;
  planOnly?: boolean;
  only?: string;
  gates?: string;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature": out.feature = argv[++i]; break;
      case "--sprint": out.sprint = argv[++i]; break;
      case "--project-dir": out.projectDir = argv[++i]; break;
      case "--tdd-dir": out.tddDir = argv[++i]; break;
      case "--instance": out.instance = argv[++i]; break;
      case "--deploy-target": out.deployTarget = argv[++i]; break;
      case "--approver": out.approver = argv[++i]; break;
      case "--dry-run": out.dryRun = true; break;
      case "--max-steps": out.maxSteps = Number(argv[++i]); break;
      case "--plan-only": out.planOnly = true; break;
      case "--only": out.only = argv[++i]; break;
      case "--gates": out.gates = argv[++i]; break;
      case "--help": case "-h": out.help = true; break;
      default: break;
    }
  }
  return out;
}

function help(): string {
  return `lakebase-tdd-drive (deterministic orchestrator driver)

Usage:
  lakebase-tdd-drive --feature <id> [flags]

Flags:
  --feature <id>       Feature to drive (required)
  --project-dir <dir>  Project root (default: cwd)
  --tdd-dir <dir>      .tdd dir (default: <project-dir>/.tdd)
  --instance <id>      Lakebase instance id (threaded to experiment branch ops)
  --deploy-target <t>  Deploy target for the deploy phase (default: local)
  --approver <name>    Headless gate approver (default: human-proxy)
  --dry-run            Print the single next action + its commands, then exit
  --max-steps <n>      Stop after n actions (incremental/live testing + safety)
  --plan-only          Tier-2: run the sprint planning sub-machine only (/plan)
  --only <phase>       Tier-2 bound: design | build | deploy (one phase, then stop)
  --gates <mode>       proxy (default, headless: Human Proxy approves) | interactive
                       (stop AT each HITL gate so the human answers, then re-run)
`;
}

function writeWorkflowPhase(tddDir: string, phase: string): void {
  const file = path.join(tddDir, "workflow-state.json");
  let state: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    try { state = JSON.parse(fs.readFileSync(file, "utf8")); } catch { state = {}; }
  }
  state.phase = phase;
  fs.mkdirSync(tddDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
}

function spawnCmd(bin: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: "inherit" });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${bin} exited ${code}`))));
  });
}

// Resolve a kit child-CLI bin name to its compiled JS, a SIBLING of this file
// in dist/scripts/tdd/. Spawning `node <sibling>.js` makes the driver
// self-contained: its kit children resolve from its own install location, with
// no dependency on the bins being on PATH (the smoke runs the kit via npx, not
// a global install). External tools (claude) stay bare on PATH.
const KIT_CLI_JS: Record<string, string> = {
  "lakebase-tdd-pipeline": "story-pipeline.cli.js",
  "lakebase-tdd-experiment": "story-experiment.cli.js",
  "lakebase-tdd-deploy": "deploy.cli.js",
  "lakebase-tdd-human-proxy": "human-proxy.cli.js",
};

/** The live runner: claude -p for roles, the kit CLIs for state, a direct
 *  workflow-state write for the coarse phase. */
function execRunner(cfg: DriveEffectsConfig): CommandRunner {
  return {
    async run(cmd: DriveCommand) {
      if (cmd.kind === "set-phase") {
        writeWorkflowPhase(cfg.tddDir, cmd.phase);
        return;
      }
      if (cmd.kind === "claude") {
        await spawnCmd(
          "claude",
          ["-p", cmd.task, "--agent", cmd.role, "--model", cmd.model, "--strict-mcp-config"],
          cfg.projectDir,
        );
        return;
      }
      // cmd.kind === "cli": resolve the kit bin to its sibling JS so it runs
      // regardless of PATH; fall back to the bare name for anything unmapped.
      const sibling = KIT_CLI_JS[cmd.bin];
      if (sibling) {
        await spawnCmd("node", [path.join(__dirname, sibling), ...cmd.args], cfg.projectDir);
      } else {
        await spawnCmd(cmd.bin, cmd.args, cfg.projectDir);
      }
    },
  };
}

/** Build a DriveEffectsConfig for a feature (or planning, featureId ""). */
function buildCfg(args: ParsedArgs, featureId: string): DriveEffectsConfig {
  const projectDir = args.projectDir ?? process.cwd();
  const tddDir = args.tddDir ?? path.join(projectDir, ".tdd");
  return {
    projectDir,
    tddDir,
    featureId,
    sprintName: args.sprint,
    instance: args.instance,
    deployTarget: args.deployTarget ?? "local",
    approver: args.approver ?? "human-proxy",
    modelForRole: (role) => resolveModelForRole(role as AgentRole, projectDir),
    runner: { async run() {} },
    onAction: composeOnAction(
      (action, i) => process.stderr.write(`[drive] ${String(i).padStart(3, "0")} ${JSON.stringify(action)}\n`),
      // Code-emit the orchestrator's lifecycle (handoff / phase.start /
      // gate.surfaced / experiment.* / phase.end) through the ONE common logger,
      // so the structured trail is written every run with no LLM in the loop.
      makeOnAction({ tddDir, featureId }),
    ),
  };
}

/** Run several onAction hooks in order (stderr trace + structured emit). */
function composeOnAction(
  ...hooks: Array<(action: WorkflowAction, i: number) => void>
): (action: WorkflowAction, i: number) => void {
  return (action, i) => {
    for (const h of hooks) h(action, i);
  };
}

/** Compose a phase bound's stopWhen with the interactive gate stop: in
 *  interactive mode the driver also halts at each HITL gate for the human. */
function gatedStopWhen(
  base: RunDriverOptions["stopWhen"],
  interactive: boolean,
): RunDriverOptions["stopWhen"] {
  if (!interactive) return base;
  return (a) => (base?.(a) ?? false) || isHitlGateAction(a);
}

/** The HITL gate a bounded run halted at (interactive mode), or undefined. */
function pendingGateOf(r: RunDriverResult): WorkflowAction | undefined {
  return r.stoppedAtBound && r.stoppedAt && isHitlGateAction(r.stoppedAt) ? r.stoppedAt : undefined;
}

function reportGate(gate: WorkflowAction): void {
  process.stderr.write(
    `[drive] GATE awaiting human approval: ${JSON.stringify(gate)}. ` +
      `Surface it to the human; on approval record their decision (the approver), then re-run to continue.\n`,
  );
}

/**
 * Tier-1 sprint mode (`--sprint <name>`, no `--feature`): the `/sprint`
 * orchestrator. Drives sprint planning to the plan gate, then claims + drives
 * each backlog feature. `--plan-only` runs planning only (the `/plan` command).
 * `--gates interactive` halts at each HITL gate for the human + re-runs to resume.
 */
async function runSprintMode(args: ParsedArgs): Promise<number> {
  const sprint = args.sprint as string;
  const projectDir = args.projectDir ?? process.cwd();
  const tddDir = args.tddDir ?? path.join(projectDir, ".tdd");
  // The claim CLI lives in dist/scripts/lakebase/, a sibling-of-parent of this
  // file's dist dir, so it resolves regardless of PATH (the smoke runs via npx).
  const claimJs = path.join(__dirname, "..", "lakebase", "scm-claim-feature.cli.js");
  const interactive = args.gates === "interactive";

  const effects: SprintEffects = {
    async drivePlanning() {
      const cfg = buildCfg(args, "");
      cfg.runner = execRunner(cfg);
      const planning: DriveEffects = {
        readState: async () => deriveSprintPlanningState(tddDir, sprint),
        async perform(action) {
          for (const cmd of commandsForAction(action, cfg)) await cfg.runner.run(cmd);
        },
        onAction: cfg.onAction,
      };
      const base = driverBoundOptions("plan");
      const r = await runDriver(planning, { ...base, stopWhen: gatedStopWhen(base.stopWhen, interactive) });
      return { pendingGate: pendingGateOf(r) };
    },
    async readBacklog() {
      return readSprintBacklog(tddDir, sprint).features;
    },
    async claimFeature(featureId) {
      await spawnCmd("node", [claimJs, featureId, "--project-dir", projectDir, "--json"], projectDir);
    },
    async driveFeature(featureId) {
      const cfg = buildCfg(args, featureId);
      cfg.runner = execRunner(cfg);
      const r = await runDriver(buildDriveEffects(cfg), { stopWhen: gatedStopWhen(undefined, interactive) });
      return { pendingGate: pendingGateOf(r) };
    },
    onFeature: (f, i) => process.stderr.write(`[sprint] feature ${i + 1}: ${f}\n`),
  };

  // /plan: planning only (do not enter the per-feature loop).
  if (args.planOnly) {
    try {
      const planning = await effects.drivePlanning();
      if (planning.pendingGate) reportGate(planning.pendingGate);
      else process.stderr.write(`[plan] ${sprint} planning complete (plan gate approved)\n`);
      return 0;
    } catch (err) {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  }

  try {
    const result = await runSprint(effects);
    if (result.pendingGate) {
      if (result.pendingFeature) process.stderr.write(`[sprint] paused on ${result.pendingFeature}\n`);
      reportGate(result.pendingGate);
    } else {
      process.stderr.write(`[sprint] ${sprint} complete: ${result.features.length} feature(s)\n`);
    }
    return 0;
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(help());
    return 0;
  }
  // Tier-1: `--sprint <name>` with no `--feature` runs the whole-sprint orchestrator.
  if (args.sprint && !args.feature) {
    return runSprintMode(args);
  }
  if (!args.feature) {
    process.stderr.write(`lakebase-tdd-drive: --feature is required.\n\n${help()}`);
    return 2;
  }

  // Resolve the Tier-2 phase bound (at most one). --plan-only is the sprint
  // planning bound; --only <phase> bounds a feature run to one phase.
  let bound: DriverBound | undefined;
  if (args.planOnly) bound = "plan";
  if (args.only) {
    if (!["design", "build", "deploy"].includes(args.only)) {
      process.stderr.write(`lakebase-tdd-drive: --only must be design|build|deploy (got "${args.only}").\n`);
      return 2;
    }
    bound = args.only as DriverBound;
  }
  const boundOpts = bound ? driverBoundOptions(bound) : {};

  const cfg = buildCfg(args, args.feature);

  if (args.dryRun) {
    const plan = await planNextAction(cfg, boundOpts.transition);
    process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
    return 0;
  }

  cfg.runner = execRunner(cfg);
  const interactive = args.gates === "interactive";
  try {
    const result = await runDriver(buildDriveEffects(cfg), {
      maxSteps: args.maxSteps,
      transition: boundOpts.transition,
      stopWhen: gatedStopWhen(boundOpts.stopWhen, interactive),
    });
    const pendingGate = pendingGateOf(result);
    if (result.stoppedAtMax) {
      process.stderr.write(`[drive] stopped at --max-steps ${args.maxSteps} (${result.iterations} actions)\n`);
    } else if (pendingGate) {
      reportGate(pendingGate);
    } else if (result.stoppedAtBound) {
      process.stderr.write(`[drive] ${bound ?? "phase"} complete in ${result.iterations} actions (bounded)\n`);
    } else {
      process.stderr.write(`[drive] done in ${result.iterations} actions\n`);
    }
    return 0;
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
