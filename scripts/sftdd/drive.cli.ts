#!/usr/bin/env node
// lakebase-sftdd-drive: the deterministic orchestrator driver (phase 3b).
//
//   lakebase-sftdd-drive --feature <id> [--project-dir <dir>] [--tdd-dir <dir>]
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
import { sftddEnv } from "./sftdd-env.js";
import { resolveTddDir, ARTIFACT_ROOT, LEGACY_ARTIFACT_ROOT } from "./sftdd-paths.js";
import { migrateLegacyArtifactDir } from "./migrate-artifact-dir.js";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

import { replayDesignTurn, REPLAYABLE_DESIGN_ROLES } from "./replay-artifacts.js";
import { replayBuildTurn } from "./replay-build.js";
import { recordBuildTurn } from "./record-build.js";
import { recordTurn, seedRecorderBaseline } from "./turn-recorder.js";
import { runDriver, driverBoundOptions, ProtocolViolationError, UnexpectedCallbackError, type DriveEffects, type DriverBound, type RunDriverResult, type RunDriverOptions } from "./orchestrator-run.js";
import { writeEscalation } from "./escalation.js";
import { emitAgentLogEvent } from "./agent-log.js";
import { writeWorkflowPhase, resetStaleTerminalPhase } from "./workflow-phase.js";
import {
  isHitlGateAction,
  isHumanInputAction,
  pauseBeforeMilestone,
  type PauseMilestone,
  type WorkflowAction,
} from "./orchestrator-drive.js";
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
  backlogFeatureIds,
  syncBacklog,
  deriveSprintPlanningState,
  type SprintEffects,
} from "./orchestrator-sprint.js";
import { resolveModelForRole } from "./agent-models.js";
import { resolveSftddSettings, applyProjectOverrides } from "./sftdd-config.js";
import { parseTurnUsage, assistantTextFromLine, assistantEventSummary, type TurnUsage } from "./claude-usage.js";
import { resumeFitsBudget, turnContextTokens, CONTEXT_FREE_FRACTION_REQUIRED, isPromptTooLongSignal, startsFreshEachTurn } from "./context-budget.js";
import { writeRunConfig } from "./run-config.js";
import type { AgentRole } from "./agent-log.js";
import { makeOnAction, describeAction } from "./orchestrator-logging.js";
import { readWorkflowState } from "../lakebase/scm-workflow-state.js";

// How many times a single role turn that overflows the model window mid-turn
// ("Prompt is too long") is retried on a FRESH session before the failure
// propagates. Each retry inherits the prior attempt's on-disk progress, so a
// small bound converges; it is a backstop, not a substitute for chunking work.
const MAX_PROMPT_TOO_LONG_RETRIES = 2;

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
  pauseBefore?: string;
  gates?: string;
  noSizing?: boolean;
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
      case "--pause-before": out.pauseBefore = argv[++i]; break;
      case "--gates": out.gates = argv[++i]; break;
      // Sizing (the Architect's t-shirt-sizing / planning-poker step) is ON by
      // default. --no-sizing opts OUT: planning goes propose -> author-requests
      // with no estimate, for a backlog small enough not to need capacity sizing.
      case "--no-sizing":
      case "--no-planning-poker":
      case "--no-t-shirt-sizing": out.noSizing = true; break;
      case "--help": case "-h": out.help = true; break;
      default: break;
    }
  }
  return out;
}

function help(): string {
  return `lakebase-sftdd-drive (deterministic orchestrator driver)

Usage:
  lakebase-sftdd-drive --feature <id> [flags]

Flags:
  --feature <id>       Feature to drive (required)
  --project-dir <dir>  Project root (default: cwd)
  --tdd-dir <dir>      artifact root (default: <project-dir>/.sftdd, honors a legacy .tdd)
  --instance <id>      Lakebase instance id (threaded to experiment branch ops)
  --deploy-target <t>  Deploy target for the deploy phase (default: local)
  --approver <name>    Headless gate approver (default: human-proxy)
  --dry-run            Print the single next action + its commands, then exit
  --max-steps <n>      Stop after n actions (incremental/live testing + safety)
  --plan-only          Tier-2: run the sprint planning sub-machine only (/plan)
  --only <phase>       Tier-2 bound: design | build | deploy (one phase, then stop)
  --pause-before <m>   PAUSE (not stop) just before a handoff: navigator (the
                       build kickoff) | release-engineer (the deploy/verify). The
                       driver blocks for a human [Y/n], then RESUMES the same run
                       on Y , it never leaves the state machine. n re-asks. Set
                       LAKEBASE_SFTDD_AUTO_CONTINUE=1 to auto-confirm (non-interactive).
  --gates <mode>       proxy (default, headless: Human Proxy approves) | interactive
                       (stop AT each HITL gate so the human answers, then re-run)
  --no-sizing          Skip the Architect's t-shirt-sizing (planning-poker) step:
                       planning goes propose -> author-requests, no estimate.
                       Sizing is ON by default. Aliases: --no-planning-poker,
                       --no-t-shirt-sizing.
`;
}

function spawnCmd(bin: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: "inherit" });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${bin} exited ${code}`))));
  });
}


/**
 * Spawn a `claude -p --output-format stream-json --verbose` turn, TEE the
 * human-readable assistant text to stderr (so the live console still shows the
 * agent working, not raw JSON), and return the turn's usage from the terminal
 * `result` event , the per-turn CONTEXT SIZE (input_tokens) + output + cache +
 * cost. stderr is inherited so claude's own errors surface. Usage parsing is
 * best-effort: a missing result event yields undefined (never breaks the turn).
 */
/** A claude turn that exited non-zero. `promptTooLong` flags the recoverable
 *  context-overflow case: the turn itself ballooned past the model window
 *  WITHIN the turn (many tool calls in one shot), the "Prompt is too long"
 *  failure the resume-time context guard cannot pre-empt. The runner retries
 *  this case on a FRESH session; any other non-zero exit is a hard failure. */
class ClaudeTurnError extends Error {
  constructor(
    message: string,
    readonly promptTooLong: boolean,
  ) {
    super(message);
    this.name = "ClaudeTurnError";
  }
}

function spawnClaudeStreaming(args: string[], cwd: string): Promise<TurnUsage | undefined> {
  return new Promise((resolve, reject) => {
    // Capture BOTH stdout (the stream-json events) and stderr (claude's own
    // errors), teeing the human-readable parts to the console, so a context-
    // overflow message printed to either stream is detectable for the retry.
    const child = spawn("claude", args, { cwd, stdio: ["inherit", "pipe", "pipe"] });
    const lines: string[] = [];
    let sawTooLong = false;
    // Tee a COMPACT trace: each tool action (liveness) as it streams, and the
    // turn's FINAL assistant text (the outcome) at close. The interstitial
    // "now I'll... / let me check..." prose is buffered and overwritten, so only
    // the last text (the result line) survives , the deliberation never hits the
    // log. Set LAKEBASE_SFTDD_VERBOSE_AGENT=1 to tee every assistant text delta.
    const verboseAgent = !!sftddEnv("VERBOSE_AGENT");
    let lastText = "";
    const rl = readline.createInterface({ input: child.stdout! });
    rl.on("line", (line) => {
      lines.push(line);
      if (isPromptTooLongSignal(line)) sawTooLong = true;
      if (verboseAgent) {
        const text = assistantTextFromLine(line);
        if (text) process.stderr.write(text);
        return;
      }
      const { text, tools } = assistantEventSummary(line);
      for (const t of tools) process.stderr.write(`  · ${t}\n`);
      if (text) lastText = text; // hold; only the final one is printed at close
    });
    const erl = readline.createInterface({ input: child.stderr! });
    erl.on("line", (line) => {
      if (isPromptTooLongSignal(line)) sawTooLong = true;
      process.stderr.write(`${line}\n`); // tee: keep claude's own errors visible
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      rl.close();
      erl.close();
      // The turn's final assistant text = the outcome (rule 5). Print it once,
      // after the tool trace, so the log shows actions + result, not the prose.
      if (!verboseAgent && lastText) process.stderr.write(`${lastText}\n`);
      if (code !== 0) return reject(new ClaudeTurnError(`claude exited ${code}`, sawTooLong));
      resolve(parseTurnUsage(lines));
    });
  });
}

// Resolve a kit child-CLI bin name to its compiled JS via the kit's OWN
// package.json `bin` map (the single authoritative source). Spawning
// `node <dist/...>` makes the driver self-contained: its kit children resolve
// from its own install location, with no dependency on the bins being on PATH
// (the smoke runs the kit via lk/npx, not a global install). Deriving from the
// bin map , instead of a hand-maintained list , means a new kit bin the driver
// emits can never silently drift out of sync (a missing entry once caused a
// `spawn <bin> ENOENT` the moment the feature drive emitted lakebase-sftdd-log).
// External tools (claude) are not in the bin map, so they stay bare on PATH.
//
// This running file is <kitRoot>/dist/scripts/sftdd/drive.cli.js, so the kit root
// (which holds package.json) is three directories up.
const KIT_ROOT = path.resolve(__dirname, "..", "..", "..");
let kitBinMap: Record<string, string> | null = null;
function resolveKitBinJs(bin: string): string | null {
  if (kitBinMap === null) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(KIT_ROOT, "package.json"), "utf8")) as {
        bin?: Record<string, string>;
      };
      kitBinMap = pkg.bin ?? {};
    } catch {
      kitBinMap = {};
    }
  }
  const rel = kitBinMap[bin];
  return rel ? path.join(KIT_ROOT, rel) : null;
}

/** The live runner: claude -p for roles, the kit CLIs for state, a direct
 *  workflow-state write for the coarse phase. */
function execRunner(cfg: DriveEffectsConfig): CommandRunner {
  // Per-role Claude session ids, scoped to this runner (one feature drive). A
  // role's first invocation creates a session (--session-id); later invocations
  // resume it (--resume) so the agent's context + prompt cache stay warm instead
  // of a cold respawn per story/cycle. Resume is an optimization layered on top
  // of the artifact-as-API contract: each role still reads/writes its artifacts,
  // so correctness never depends on the retained session, only speed.
  const sessions = new Map<string, string>();
  // Per-resumeKey running CONTEXT SIZE (the last turn's total prompt tokens:
  // input + cache + the response it added). The context-budget guard reads this
  // to decide whether a RESUME would blow the model window; a fresh session
  // resets it. Keeps the warm-resume optimization while never starting a turn
  // that cannot fit, the "Prompt is too long" failure that killed F5.
  const sessionContext = new Map<string, number>();
  // Per-story Navigator/Driver turn ordinal, for per-turn build replay: the Kth
  // build turn of this story maps to the Kth recorded turn dir in the corpus.
  const buildTurns = new Map<string, number>();
  return {
    async run(cmd: DriveCommand) {
      if (cmd.kind === "set-phase") {
        writeWorkflowPhase(cfg.tddDir, cmd.phase);
        return;
      }
      if (cmd.kind === "sync-backlog") {
        // Deterministic, in-process (no CLI): project backlog.json from the
        // PO's committed feature-requests + the Architect's estimates.
        syncBacklog(cfg.tddDir, cmd.sprint);
        return;
      }
      if (cmd.kind === "claude") {
        // Per-turn BUILD replay: when LAKEBASE_SFTDD_REPLAY_BUILD_DIR is set, a
        // Navigator/Driver turn overlays its recorded artifact (code + cycle/
        // experiment records) from the corpus instead of spawning the model. The
        // orchestrator still VISITS the turn (logs + transitions + runs the live
        // cycle-record CLIs that stamp RED/GREEN against the overlaid code), so
        // every Navigator<->Driver event is reproduced , only the artifact
        // delivery is mocked. The Kth Navigator/Driver turn maps to the Kth
        // recorded turn dir. A turn the corpus lacks falls through to the real agent.
        const replayBuildDir = sftddEnv("REPLAY_BUILD_DIR");
        const story = cmd.replay?.story;
        if (replayBuildDir && story && (cmd.role === "navigator" || cmd.role === "driver")) {
          const turnIndex = (buildTurns.get(story) ?? 0) + 1;
          buildTurns.set(story, turnIndex);
          const replayed = replayBuildTurn({
            replayBuildDir,
            projectDir: cfg.projectDir,
            tddDir: cfg.tddDir,
            featureId: cfg.featureId,
            story,
            turnIndex,
          });
          if (replayed) {
            process.stderr.write(
              `[drive] replayed build turn ${turnIndex} (${cmd.role}${cmd.replay?.mode ? `/${cmd.replay.mode}` : ""} ${story}) from corpus (no model spawn)\n`,
            );
            return;
          }
          process.stderr.write(`[drive] build replay miss for ${cmd.role} turn ${turnIndex} (${story}); running the real agent\n`);
        }
        // Fast-forward replay: when LAKEBASE_SFTDD_REPLAY_DIR is set, a design-lane
        // Fast-forward replay: when LAKEBASE_SFTDD_REPLAY_DIR is set, a design-lane
        // role's turn copies its recorded output from the corpus instead of
        // spawning the model. The orchestrator still VISITS the turn (logs +
        // transitions + runs its deterministic effects); only the LLM generation
        // is replaced. Navigator/Driver are never replayed (not design roles),
        // so the real TDD begins at the Navigator handoff. A turn the corpus
        // lacks (e.g. an un-recorded story) falls through to the real agent.
        const replayDir = sftddEnv("REPLAY_DIR");
        if (replayDir && REPLAYABLE_DESIGN_ROLES.has(cmd.role)) {
          const replayed = replayDesignTurn({
            turn: { role: cmd.role, mode: cmd.replay?.mode, story: cmd.replay?.story },
            replayDir,
            tddDir: cfg.tddDir,
            featureId: cfg.featureId,
          });
          if (replayed) {
            process.stderr.write(
              `[drive] replayed ${cmd.role}${cmd.replay?.mode ? `/${cmd.replay.mode}` : ""}${cmd.replay?.story ? ` ${cmd.replay.story}` : ""} from corpus (no model spawn)\n`,
            );
            return;
          }
          process.stderr.write(`[drive] replay miss for ${cmd.role} (no corpus artifact); running the real agent\n`);
        }
        // stream-json (requires --verbose with --print) lets us capture the turn's
        // token usage from the result event while teeing readable text to the console.
        const baseArgs = ["-p", cmd.task, "--agent", cmd.role, "--model", cmd.model, "--strict-mcp-config", "--output-format", "stream-json", "--verbose"];
        // Per-role/turn model-side knobs (sftdd-config.json): effort (set on judgment
        // turns to run fast), fallback model (auto-failover when the primary is
        // overloaded), and a per-invocation dollar cap.
        if (cmd.effort) baseArgs.push("--effort", cmd.effort);
        if (cmd.fallbackModel) baseArgs.push("--fallback-model", cmd.fallbackModel);
        if (typeof cmd.maxBudgetUsd === "number") baseArgs.push("--max-budget-usd", String(cmd.maxBudgetUsd));
        // Resolve this attempt's session flags. `forceFresh` ignores the warm
        // session (used when retrying after a mid-turn "Prompt is too long").
        const sessionArgsFor = (forceFresh: boolean): string[] => {
          if (!cmd.resumeKey) return [];
          // Proactive per-turn context cap: a HEAVY role (Driver/Navigator) starts
          // EVERY turn on a fresh session, so no turn inherits a prior turn's
          // accumulated context. This is the deterministic companion to the reactive
          // budget guard below (which only resets AFTER a session already grew too
          // big). Artifact-as-API makes a cold turn always correct: the turn reloads
          // exactly what it needs from disk. Overridable via LAKEBASE_SFTDD_HEAVY_ROLES.
          if (startsFreshEachTurn(cmd.role)) {
            const id = randomUUID();
            sessions.set(cmd.resumeKey, id);
            sessionContext.delete(cmd.resumeKey);
            return ["--session-id", id];
          }
          const existing = sessions.get(cmd.resumeKey);
          // Context-budget guard: only resume when the warm session still leaves
          // >= the required free fraction of the model window; otherwise the turn
          // would risk "Prompt is too long". When it would not fit (or we are
          // forcing fresh after a mid-turn overflow), start FRESH (new session-id,
          // reset the tracked size) instead of failing the turn.
          const priorCtx = sessionContext.get(cmd.resumeKey) ?? 0;
          const wouldFit = !forceFresh && resumeFitsBudget(priorCtx, cmd.model);
          if (existing && wouldFit) return ["--resume", existing];
          if (existing && !forceFresh && !wouldFit) {
            process.stderr.write(
              `[drive] context guard: fresh ${cmd.role} session ` +
                `(warm ~${priorCtx.toLocaleString()} tok < ${Math.round(CONTEXT_FREE_FRACTION_REQUIRED * 100)}% of ${cmd.model} window free)\n`,
            );
          }
          const id = randomUUID();
          sessions.set(cmd.resumeKey, id);
          sessionContext.delete(cmd.resumeKey);
          return ["--session-id", id];
        };
        // Spawn with a bounded retry on a MID-TURN context overflow. The resume-time
        // guard above cannot pre-empt a turn that balloons WITHIN itself (one shot,
        // many tool calls , the failure that killed F6/S3-split-drop-old). When that
        // turn fails with "Prompt is too long", restart it on a FRESH session: the
        // artifacts the failed attempt already wrote (.sftdd + code + tests) persist,
        // so each retry has strictly less to do and converges, instead of aborting
        // the whole drive. A non-overflow failure (or exhausted retries) still throws.
        let usage: TurnUsage | undefined;
        const turnStart = Date.now();
        for (let attempt = 0; ; attempt++) {
          const args = [...baseArgs, ...sessionArgsFor(attempt > 0)];
          try {
            usage = await spawnClaudeStreaming(args, cfg.projectDir);
            break;
          } catch (e) {
            if (e instanceof ClaudeTurnError && e.promptTooLong && attempt < MAX_PROMPT_TOO_LONG_RETRIES) {
              process.stderr.write(
                `[drive] context guard (mid-turn): ${cmd.role} overflowed ${cmd.model}; ` +
                  `fresh-session retry ${attempt + 1}/${MAX_PROMPT_TOO_LONG_RETRIES}\n`,
              );
              continue;
            }
            throw e;
          }
        }
        // Log the turn's CONTEXT SIZE + usage right after it returns (role + model
        // + effort after role; the token counts in metadata). Best-effort: never
        // let a logging hiccup break the turn.
        const turnMs = Date.now() - turnStart;
        if (usage) {
          // Record this turn's total context so the next resume decision for this
          // session can apply the context-budget guard above.
          if (cmd.resumeKey) sessionContext.set(cmd.resumeKey, turnContextTokens(usage));
          // Wall-clock per turn: the missing signal for perf work. Emitted on the
          // turn.usage event (+ a terse console line) so a run's log shows WHERE the
          // seconds go (which role/turn) instead of guessing.
          process.stderr.write(`[drive] ${cmd.role} turn ${(turnMs / 1000).toFixed(1)}s (${cmd.model})\n`);
          try {
            emitAgentLogEvent(
              {
                role: cmd.role as AgentRole,
                level: "info",
                event: "turn.usage",
                model: cmd.model,
                ...(cmd.effort ? { effort: cmd.effort } : {}),
                feature_id: cfg.featureId,
                slots: {
                  duration_ms: turnMs,
                  input_tokens: usage.inputTokens,
                  output_tokens: usage.outputTokens,
                  ...(usage.cacheReadTokens !== undefined ? { cache_read_tokens: usage.cacheReadTokens } : {}),
                  ...(usage.cacheCreationTokens !== undefined ? { cache_creation_tokens: usage.cacheCreationTokens } : {}),
                  ...(usage.costUsd !== undefined ? { cost_usd: usage.costUsd } : {}),
                  ...(cmd.replay?.story ? { story: cmd.replay.story } : {}),
                  ...(cmd.replay?.mode ? { phase: cmd.replay.mode } : {}),
                },
              },
              { tddDir: cfg.tddDir },
            );
          } catch {
            /* usage logging is observability, never load-bearing */
          }
        }
        return;
      }
      // cmd.kind === "cli": resolve the kit bin to its dist JS via the kit's
      // package.json bin map so it runs regardless of PATH; fall back to the
      // bare name for anything not a kit bin (external tools on PATH).
      const js = resolveKitBinJs(cmd.bin);
      if (js) {
        await spawnCmd("node", [js, ...cmd.args], cfg.projectDir);
      } else {
        await spawnCmd(cmd.bin, cmd.args, cfg.projectDir);
      }
    },
  };
}

/** Build a DriveEffectsConfig for a feature (or planning, featureId ""). */
function buildCfg(args: ParsedArgs, featureId: string): DriveEffectsConfig {
  const projectDir = args.projectDir ?? process.cwd();
  const tddDir = args.tddDir ?? resolveTddDir(projectDir);
  // Resolve the Lakebase instance + the feature's branch from the SCM workflow
  // state (.lakebase/workflow-state.json, written at claim). The per-story
  // experiment ops need both: the instance to create/merge the paired branch,
  // and the feature branch as the experiment's parent + merge target. --instance
  // overrides the recorded project_id when given.
  const scm = readWorkflowState(projectDir);
  // Unified config: one resolution of the per-role/turn model+effort matrix + the
  // build/plan/project knobs (sftdd-config.json -> LAKEBASE_SFTDD_* env -> default).
  const settings = resolveSftddSettings({ projectDir });
  return {
    projectDir,
    tddDir,
    featureId,
    sprintName: args.sprint,
    instance: args.instance ?? scm?.project_id,
    featureBranch: scm?.branch,
    parentBranch: scm?.parent_branch,
    // Deploy target from the config (the --deploy-target flag wrote through to it).
    deployTarget: settings.project.deployTarget,
    approver: args.approver ?? "human-proxy",
    // UI track: the config (project.uiTrack, the single source) decides whether the
    // Spec Author frames user-facing capabilities as E2E (browser/screen) stories vs API-only.
    uiTrack: settings.project.uiTrack,
    // P5: Navigator/Driver session scope (story warm-resume vs cycle cold-spawn).
    buildSessionScope: settings.build.sessionScope,
    // P6 (back-compat): the navigator REVIEW turn's effort, still surfaced for
    // run-config + any caller without effortForTurn. effortForTurn (below) is the
    // primary, per-role/turn resolver and supersedes this.
    reviewEffort: ((): string => {
      const e = settings.effortFor("navigator", "review");
      return e === "default" ? "" : e;
    })(),
    // P8b: build loop granularity + batch cap (config / env).
    loopGranularity: settings.build.loopGranularity,
    batchCap: settings.build.batchCap,
    // Unified per-role/turn model-side resolvers ("" => omit --effort).
    effortForTurn: (role, turn) => {
      const e = settings.effortFor(role, turn);
      return e === "default" ? "" : e;
    },
    fallbackModelForRole: (role) => settings.fallbackModels[role],
    maxBudgetUsdForRole: (role) => settings.budgets[role],
    modelForRole: (role) => settings.models[role] ?? resolveModelForRole(role as AgentRole, projectDir),
    // Model tiering: per-turn model (driver GREEN/REFACTOR on a cheaper model than
    // its RED). Falls through to the role's base model when no per-turn map applies.
    modelForTurn: (role, turn) => settings.modelFor(role, turn),
    runner: { async run() {} },
    onAction: composeOnAction(
      // Narrate each routing decision in plain language (DRY: the same message
      // the structured log uses). The machine-readable form is already written to
      // the structured agent-log by makeOnAction below, so the raw action JSON is
      // console noise on every line , append it only under LAKEBASE_SFTDD_TRACE.
      (action, i) => {
        const trace = sftddEnv("TRACE") ? `  ${JSON.stringify(action)}` : "";
        process.stderr.write(`[drive] ${String(i).padStart(3, "0")} ${describeAction(action, { featureId })}${trace}\n`);
      },
      // Code-emit the orchestrator's lifecycle (handoff / phase.start /
      // gate.surfaced / experiment.* / phase.end) through the ONE common logger,
      // so the structured trail is written every run with no LLM in the loop.
      // The resolvers stamp each per-turn phase.start with the model + effort it
      // ran with (right after `role`).
      makeOnAction({
        tddDir,
        featureId,
        modelForRole: (role) => settings.models[role],
        effortForTurn: (role, turn) => {
          const e = settings.effortFor(role, turn);
          return e === "default" ? "" : e;
        },
      }),
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

/**
 * The PAUSE gate's human wait: block the state machine at the handoff and ask
 * [Y/n], then RESUME on Y (n re-asks; the run never bails). Three input sources,
 * in order:
 *   1. LAKEBASE_SFTDD_AUTO_CONTINUE=1   , auto-confirm (CI / fully non-interactive).
 *   2. LAKEBASE_SFTDD_GATE_ANSWER_FILE  , poll that file for y/n (a parent process
 *      drives the gate, e.g. a controller answering on the human's behalf).
 *   3. an interactive stdin TTY       , prompt + read the human's line.
 * With none of those (piped, no control file), it auto-continues with a warning
 * rather than crashing or hanging. It never opens /dev/tty (absent in many
 * sandboxes, and its open error is async , the prior cause of a hard crash).
 */
function makeConfirmContinue(): (action: WorkflowAction) => Promise<void> {
  const auto = sftddEnv("AUTO_CONTINUE") === "1";
  const answerFile = sftddEnv("GATE_ANSWER_FILE")?.trim();
  const isYes = (a: string): boolean => a === "" || a === "y" || a === "yes";
  return (action) =>
    new Promise((resolve) => {
      const label = describeAction(action);
      const prompt = `\n[drive] PAUSED , continue past the ${label} handoff? [Y/n] `;
      if (auto) {
        process.stderr.write(`[drive] PAUSE gate (auto-continue): proceeding past ${label}\n`);
        return resolve();
      }
      // (2) Control channel: poll the answer file (written y/n by a controller).
      if (answerFile) {
        process.stderr.write(`${prompt}\n[drive] (awaiting answer in ${answerFile})\n`);
        const poll = setInterval(() => {
          let raw: string;
          try { raw = fs.readFileSync(answerFile, "utf8"); } catch { return; } // not written yet
          const a = raw.trim().toLowerCase();
          if (a === "") return; // present but blank , keep waiting
          try { fs.rmSync(answerFile, { force: true }); } catch { /* ignore */ }
          if (a === "y" || a === "yes") { clearInterval(poll); process.stderr.write(`[drive] resuming.\n`); resolve(); }
          else process.stderr.write(`[drive] holding , write Y to ${answerFile} when ready.\n`);
        }, 1000);
        return;
      }
      // (3) Interactive terminal.
      if (process.stdin.isTTY) {
        const ask = (): void => {
          const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: false });
          rl.question(prompt, (answer) => {
            rl.close();
            if (isYes(answer.trim().toLowerCase())) { process.stderr.write(`[drive] resuming.\n`); resolve(); }
            else { process.stderr.write(`[drive] holding , answer Y when ready.\n`); ask(); }
          });
        };
        return ask();
      }
      // No terminal + no control channel: never crash or hang , continue.
      process.stderr.write(
        `${prompt}\n[drive] no interactive terminal and no LAKEBASE_SFTDD_GATE_ANSWER_FILE , auto-continuing past ${label}.\n`,
      );
      resolve();
    });
}

/**
 * Wrap effects so that, when LAKEBASE_SFTDD_RECORD_BUILD_DIR is set, the driver
 * snapshots each Navigator/Driver turn AFTER its effect lands , the per-turn
 * build corpus the event-by-event replay plays back. A no-op when unset, so a
 * normal run is unaffected. Only build turns (invoke-role navigator|driver) are
 * recorded; design/deploy turns are not build output.
 */
function withBuildRecording(inner: DriveEffects, cfg: DriveEffectsConfig): DriveEffects {
  const recordBuildDir = sftddEnv("RECORD_BUILD_DIR")?.trim();
  if (!recordBuildDir) return inner;
  let turn = 0;
  return {
    readState: () => inner.readState(),
    onAction: inner.onAction ? (a, i) => inner.onAction!(a, i) : undefined,
    async perform(action) {
      await inner.perform(action);
      if (action.kind === "invoke-role" && (action.role === "navigator" || action.role === "driver")) {
        turn += 1;
        const dir = recordBuildTurn({
          recordBuildDir,
          projectDir: cfg.projectDir,
          tddDir: cfg.tddDir,
          featureId: cfg.featureId,
          story: action.story,
          turn,
          role: action.role,
          ac: "ac" in action ? action.ac : undefined,
          mode: action.buildMode,
        });
        process.stderr.write(
          `[record] turn ${turn}: ${action.role}${action.buildMode ? ` (${action.buildMode})` : ""}` +
            `${"ac" in action && action.ac ? ` ${action.ac}` : ""} -> ${dir}\n`,
        );
      }
    },
  };
}

/**
 * Wrap effects so that, when LAKEBASE_SFTDD_RECORD_DIR is set, the driver records
 * EVERY state-machine turn AFTER its effect lands , the universal per-turn
 * timeline (design, gates, build, deploy, accept, promote), not just the build
 * lane. Each turn writes turns/<NNNN>-<label>/ (manifest + the .tdd/code delta it
 * produced) + refreshes the cumulative recorded-artifacts mirror that
 * replayDesignTurn consumes. Composes with withBuildRecording (which populates
 * recorded-build for replayBuildTurn), so one recordDir holds the whole
 * record/replay corpus. A no-op when unset, so a normal run is unaffected.
 */
function withTurnRecording(inner: DriveEffects, cfg: DriveEffectsConfig): DriveEffects {
  const recordDir = sftddEnv("RECORD_DIR")?.trim();
  if (!recordDir) return inner;
  // Seed the delta baseline with the current (post-scaffold/intake) state ONCE,
  // so the first recorded turn reports only what it produced, not the pre-existing
  // scaffold. A no-op once a baseline exists (later drive processes in the run).
  seedRecorderBaseline({ recordDir, projectDir: cfg.projectDir, tddDir: cfg.tddDir });
  return {
    readState: () => inner.readState(),
    onAction: inner.onAction ? (a, i) => inner.onAction!(a, i) : undefined,
    onHandback: inner.onHandback ? (h, d) => inner.onHandback!(h, d) : undefined,
    async perform(action) {
      await inner.perform(action);
      if (action.kind === "done") return; // terminal no-op, produces nothing
      const rec = recordTurn({ recordDir, projectDir: cfg.projectDir, tddDir: cfg.tddDir, action, step: 0 });
      process.stderr.write(
        `[record] turn ${rec.ordinal} (${rec.dir}): ${rec.produced.length} produced` +
          `${rec.deleted.length ? `, ${rec.deleted.length} deleted` : ""}\n`,
      );
    },
  };
}

/** Compose a phase bound's stopWhen with the interactive gate stop: in
 *  interactive mode the driver also halts at each HITL gate for the human. */
function gatedStopWhen(
  base: RunDriverOptions["stopWhen"],
  interactive: boolean,
): RunDriverOptions["stopWhen"] {
  if (!interactive) return base;
  // Interactive: also stop where the HUMAN provides an input artifact (the PO's
  // feature-requests at author-requests), so the human supplies them and re-runs
  // , the same transition the Human Proxy performs headless.
  return (a) => (base?.(a) ?? false) || isHitlGateAction(a) || isHumanInputAction(a);
}

/** The HITL gate a bounded run halted at (interactive mode), or undefined. */
function pendingGateOf(r: RunDriverResult): WorkflowAction | undefined {
  return r.stoppedAtBound && r.stoppedAt && isHitlGateAction(r.stoppedAt) ? r.stoppedAt : undefined;
}

function reportGate(gate: WorkflowAction): void {
  // Reuse the shared action narration (DRY) instead of dumping raw JSON; the
  // full action is available under LAKEBASE_SFTDD_TRACE for debugging.
  const trace = sftddEnv("TRACE") ? `  ${JSON.stringify(gate)}` : "";
  process.stderr.write(
    `[drive] GATE awaiting human approval: ${describeAction(gate)}.${trace} ` +
      `Approve + record the approver, then re-run to continue.\n`,
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
  const tddDir = args.tddDir ?? resolveTddDir(projectDir);
  // The claim CLI lives in dist/scripts/lakebase/, a sibling-of-parent of this
  // file's dist dir, so it resolves regardless of PATH (the smoke runs via npx).
  const claimJs = path.join(__dirname, "..", "lakebase", "scm-claim-feature.cli.js");
  // gates + sizing come from sftdd-config.json (the --gates / --no-sizing flags
  // wrote through to it before resolution). The file is the single source.
  const settings = resolveSftddSettings({ projectDir });
  const interactive = settings.project.gates === "interactive";
  const skipSizing = !settings.plan.sizing;

  const effects: SprintEffects = {
    async drivePlanning() {
      const cfg = buildCfg(args, "");
      cfg.runner = execRunner(cfg);
      snapshotRunConfig(cfg,"plan");
      const planning: DriveEffects = {
        // Sizing is ON by default; --no-sizing (or config plan.sizing:false) opts out.
        readState: async () => deriveSprintPlanningState(tddDir, sprint, { skipSizing }),
        async perform(action) {
          for (const cmd of commandsForAction(action, cfg)) await cfg.runner.run(cmd);
        },
        onAction: cfg.onAction,
      };
      const base = driverBoundOptions("plan");
      const r = await runDriver(withTurnRecording(planning, cfg), {
        ...base,
        stopWhen: gatedStopWhen(base.stopWhen, interactive),
      });
      return { pendingGate: pendingGateOf(r) };
    },
    async readBacklog() {
      return backlogFeatureIds(readSprintBacklog(tddDir, sprint));
    },
    async commitAndPushRequests() {
      // Commit the feature-requests planning authored + push the entry tier so
      // each feature branch (which forks from origin/<parent>) inherits them. The
      // add + commit are tolerant (a no-op when nothing changed, e.g. the requests
      // were pre-seeded + already committed); a PUSH failure is loud, since a
      // silent one resurfaces later as a cryptic Spec Author refusal on the fork.
      const root = path.basename(tddDir);
      for (const id of backlogFeatureIds(readSprintBacklog(tddDir, sprint))) {
        await spawnCmd("git", ["add", "--", `${root}/features/${id}/feature-request.md`], projectDir).catch(() => undefined);
      }
      await spawnCmd("git", ["commit", "-m", `plan: ${sprint} feature-requests`], projectDir).catch(() => undefined);
      await spawnCmd("git", ["push", "origin", "HEAD"], projectDir);
    },
    async claimFeature(featureId) {
      await spawnCmd("node", [claimJs, featureId, "--project-dir", projectDir, "--json"], projectDir);
    },
    async driveFeature(featureId) {
      const cfg = buildCfg(args, featureId);
      cfg.runner = execRunner(cfg);
      snapshotRunConfig(cfg,"full");
      const r = await runDriver(withTurnRecording(withBuildRecording(buildDriveEffects(cfg), cfg), cfg), {
        stopWhen: gatedStopWhen(undefined, interactive),
      });
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

/** P0.1: snapshot the resolved model + option matrix to .tdd/run-config.json (and
 *  the corpus root when recording) at the start of an ACTUAL run (not --dry-run),
 *  so a timing report is self-describing and two runs are A/B-comparable.
 *  Best-effort: writeRunConfig swallows its own IO errors. */
function snapshotRunConfig(cfg: DriveEffectsConfig, bound: string): void {
  writeRunConfig({
    projectDir: cfg.projectDir,
    tddDir: cfg.tddDir,
    bound,
    // gates from sftdd-config.json (the --gates flag wrote through to it), so the
    // snapshot records what the drive actually used, never a stale flag default.
    gates: resolveSftddSettings({ projectDir: cfg.projectDir }).project.gates,
    uiTrack: cfg.uiTrack,
    buildSessionScope: cfg.buildSessionScope,
    reviewEffort: cfg.reviewEffort,
    deployTarget: cfg.deployTarget,
    // loop + batchCap from the resolved settings (single source), so the snapshot
    // records what the drive actually used, never a stale env value.
    loopGranularity: cfg.loopGranularity,
    batchCap: cfg.batchCap,
    modelForRole: cfg.modelForRole ?? (() => "inherit"),
  });
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(help());
    return 0;
  }
  // Auto-migrate a legacy ".tdd" artifact dir to ".sftdd" before any mode runs,
  // so existing projects move to the current name on their next orchestrated run
  // (no-op once ".sftdd" exists). History follows via git mv when possible.
  if (!args.tddDir) {
    const projectDir = args.projectDir ?? process.cwd();
    const m = migrateLegacyArtifactDir(projectDir);
    if (m.migrated) {
      process.stderr.write(
        `lakebase-sftdd-drive: migrated legacy ${LEGACY_ARTIFACT_ROOT}/ to ${ARTIFACT_ROOT}/ (via ${m.via}).\n`,
      );
    }
  }
  // Write-through the drive's ad-hoc override flags into sftdd-config.json BEFORE
  // any settings resolution, so the file stays the single source of truth (the
  // flag is a WRITER, not a parallel reader; absent flags never mutate the file).
  applyProjectOverrides(args.projectDir ?? process.cwd(), {
    gates: args.gates as "interactive" | "proxy" | undefined,
    deployTarget: args.deployTarget,
    sizing: args.noSizing === true ? false : undefined,
  });

  // Tier-1: `--sprint <name>` with no `--feature` runs the whole-sprint orchestrator.
  if (args.sprint && !args.feature) {
    return runSprintMode(args);
  }
  if (!args.feature) {
    process.stderr.write(`lakebase-sftdd-drive: --feature is required.\n\n${help()}`);
    return 2;
  }

  // Resolve the Tier-2 phase bound (at most one). --plan-only is the sprint
  // planning bound; --only <phase> bounds a feature run to one phase.
  let bound: DriverBound | undefined;
  if (args.planOnly) bound = "plan";
  if (args.only) {
    if (!["design", "build", "deploy"].includes(args.only)) {
      process.stderr.write(`lakebase-sftdd-drive: --only must be design|build|deploy (got "${args.only}").\n`);
      return 2;
    }
    bound = args.only as DriverBound;
  }
  const boundOpts = bound ? driverBoundOptions(bound) : {};

  // --pause-before: a HITL gate (NOT a stop) just before a handoff (the Navigator
  // build kickoff, or the Release Engineer deploy). The driver blocks for a human
  // [Y/n] then RESUMES the same run. Backs run-to-navigator / run-to-release.
  let pauseMilestone: PauseMilestone | undefined;
  if (args.pauseBefore) {
    if (!["navigator", "release-engineer"].includes(args.pauseBefore)) {
      process.stderr.write(
        `lakebase-sftdd-drive: --pause-before must be navigator|release-engineer (got "${args.pauseBefore}").\n`,
      );
      return 2;
    }
    pauseMilestone = args.pauseBefore as PauseMilestone;
  }
  const pauseBefore = pauseMilestone ? pauseBeforeMilestone(pauseMilestone) : undefined;
  const confirmContinue = pauseMilestone ? makeConfirmContinue() : undefined;

  const cfg = buildCfg(args, args.feature);

  // A fresh --feature invocation must not inherit a PRIOR feature's terminal
  // TDD phase (the per-project .tdd/workflow-state.json carries "shipped"/"done"
  // from the last feature). Clear it so the feature being driven now re-derives
  // its phase from disk artifacts instead of exiting "done in 1".
  resetStaleTerminalPhase(cfg.tddDir);

  if (args.dryRun) {
    const plan = await planNextAction(cfg, boundOpts.transition);
    process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
    return 0;
  }

  cfg.runner = execRunner(cfg);
  snapshotRunConfig(cfg,bound ?? "full");
  // gates from sftdd-config.json (the --gates flag wrote through to it).
  const interactive = resolveSftddSettings({ projectDir: cfg.projectDir }).project.gates === "interactive";
  try {
    const result = await runDriver(withTurnRecording(withBuildRecording(buildDriveEffects(cfg), cfg), cfg), {
      maxSteps: args.maxSteps,
      transition: boundOpts.transition,
      stopWhen: gatedStopWhen(boundOpts.stopWhen, interactive),
      pauseBefore,
      confirmContinue,
    });
    const pendingGate = pendingGateOf(result);
    if (result.escalated) {
      // Surface + halt: a blocking problem was raised to the HIL. The escalation
      // is recorded under ${path.basename(cfg.tddDir)}/escalations/; exit non-zero so the run fails loud
      // (the increment is genuinely not done) and a human resolves it.
      const e = result.escalation;
      process.stderr.write(
        `[drive] RAISED TO HIL after ${result.iterations} actions , awaiting HIL decision.\n` +
          `        source: ${e?.source}\n        reason: ${e?.reason}\n` +
          `        recorded under ${path.basename(cfg.tddDir)}/escalations/ ; resolve it, then re-run to resume.\n`,
      );
      return 3;
    } else if (result.stoppedAtMax) {
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
    // A handoff EXPECTATION violation: a role returned nothing/null for the
    // artifact it owed (or the workflow tried to advance past an unmet handoff).
    // Record an escalation + emit escalation.raised (honor "escalate on any
    // error"), then abort non-zero so the run fails loud , a human resolves it.
    if (err instanceof ProtocolViolationError) {
      const h = err.handoff;
      try {
        writeEscalation(cfg.tddDir, {
          source: `protocol:${h.responder}`,
          reason: err.message,
          feature_id: cfg.featureId,
          ...(h.story ? { story_id: h.story } : {}),
        });
        emitAgentLogEvent(
          {
            role: "orchestrator",
            level: "error",
            event: "escalation.raised",
            feature_id: cfg.featureId,
            slots: { source: `protocol:${h.responder}`, reason: err.message, ...(h.story ? { story: h.story } : {}) },
          },
          { tddDir: cfg.tddDir },
        );
      } catch {
        /* logging/escalation is best-effort; the abort below is the real signal */
      }
      process.stderr.write(`[drive] ${err.message}\n        recorded under ${path.basename(cfg.tddDir)}/escalations/ ; fix the responder, then re-run.\n`);
      return 3;
    }
    // A wrong / unexpected caller (concurrent dispatch): a callback arrived from a
    // role we are not awaiting. Record + abort, same as a contract violation.
    if (err instanceof UnexpectedCallbackError) {
      try {
        writeEscalation(cfg.tddDir, {
          source: `protocol:unexpected-caller:${err.from}`,
          reason: err.message,
          feature_id: cfg.featureId,
          ...(err.scope.story ? { story_id: err.scope.story } : {}),
        });
        emitAgentLogEvent(
          {
            role: "orchestrator",
            level: "error",
            event: "escalation.raised",
            feature_id: cfg.featureId,
            slots: { source: `protocol:unexpected-caller:${err.from}`, reason: err.message, ...(err.scope.story ? { story: err.scope.story } : {}) },
          },
          { tddDir: cfg.tddDir },
        );
      } catch {
        /* best-effort */
      }
      process.stderr.write(`[drive] ${err.message}\n        recorded under ${path.basename(cfg.tddDir)}/escalations/ ; resolve it, then re-run.\n`);
      return 3;
    }
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
