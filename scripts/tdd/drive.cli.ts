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

import { runDriver } from "./orchestrator-run.js";
import {
  buildDriveEffects,
  planNextAction,
  type CommandRunner,
  type DriveCommand,
  type DriveEffectsConfig,
} from "./orchestrator-effects.js";
import { resolveModelForRole } from "./agent-models.js";
import type { AgentRole } from "./agent-log.js";

interface ParsedArgs {
  feature?: string;
  projectDir?: string;
  tddDir?: string;
  instance?: string;
  deployTarget?: string;
  approver?: string;
  dryRun?: boolean;
  maxSteps?: number;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--feature": out.feature = argv[++i]; break;
      case "--project-dir": out.projectDir = argv[++i]; break;
      case "--tdd-dir": out.tddDir = argv[++i]; break;
      case "--instance": out.instance = argv[++i]; break;
      case "--deploy-target": out.deployTarget = argv[++i]; break;
      case "--approver": out.approver = argv[++i]; break;
      case "--dry-run": out.dryRun = true; break;
      case "--max-steps": out.maxSteps = Number(argv[++i]); break;
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

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(help());
    return 0;
  }
  if (!args.feature) {
    process.stderr.write(`lakebase-tdd-drive: --feature is required.\n\n${help()}`);
    return 2;
  }
  const projectDir = args.projectDir ?? process.cwd();
  const tddDir = args.tddDir ?? path.join(projectDir, ".tdd");

  const cfg: DriveEffectsConfig = {
    projectDir,
    tddDir,
    featureId: args.feature,
    instance: args.instance,
    deployTarget: args.deployTarget ?? "local",
    approver: args.approver ?? "human-proxy",
    modelForRole: (role) => resolveModelForRole(role as AgentRole, projectDir),
    runner: { async run() {} }, // replaced below
    onAction: (action, i) => {
      process.stderr.write(`[drive] ${String(i).padStart(3, "0")} ${JSON.stringify(action)}\n`);
    },
  };

  if (args.dryRun) {
    const plan = await planNextAction(cfg);
    process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
    return 0;
  }

  cfg.runner = execRunner(cfg);
  try {
    const result = await runDriver(buildDriveEffects(cfg), { maxSteps: args.maxSteps });
    if (result.stoppedAtMax) {
      process.stderr.write(`[drive] stopped at --max-steps ${args.maxSteps} (${result.iterations} actions)\n`);
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
