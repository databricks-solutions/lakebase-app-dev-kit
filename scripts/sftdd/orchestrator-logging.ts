// Orchestrator-as-code logging (deterministic-driver observability).
//
// The deterministic driver emits its lifecycle log itself, as CODE, so the
// run's structured trail (handoff / phase.start / gate.surfaced / experiment.cut
// / phase.end) is guaranteed on every run and never depends on an LLM role
// remembering to emit (the prior failure: a haiku role hand-wrote malformed JSON
// with a bare "timestamp" + a local clock instead of calling the logger).
//
// There is ONE logging function, emitAgentLogEvent (agent-log.ts), with role as
// a parameter. This module is a PURE action->event(s) mapper plus a thin hook
// that feeds those events through that one function. Roles emit their own
// in-flight judgment events (reasoning / smell.flagged / gate decisions) through
// the SAME function via the lakebase-sftdd-log CLI, appending to the shared
// .tdd/agent-log.jsonl; the orchestrator owns the skeleton, the roles add detail.

import type { WorkflowAction } from "./orchestrator-drive.js";
import { emitAgentLogEvent, type AgentLogEventInput, type AgentLogIoOpts } from "./agent-log.js";
import { renderEventMessage } from "./agent-log-events.js";

export interface OrchestratorLogContext {
  featureId?: string;
  /** Resolve the model a role's turn runs with (tdd-config). When given, the
   *  per-turn `phase.start` event carries `model` (right after `role`). */
  modelForRole?(role: string): string | undefined;
  /** Resolve the --effort a role+turn runs with ("" / "default" => omit). When
   *  given, the per-turn `phase.start` event carries `effort`. */
  effortForTurn?(role: string, turn?: "red" | "green" | "review" | "refactor"): string | undefined;
}

/** The build turns whose effort can differ; design/deploy phases have no turn. */
const BUILD_TURNS = new Set(["red", "green", "review", "refactor"]);

/** model + effort fields for a role's per-turn event (omitted when unresolved /
 *  "default"), so each turn's log line shows what it ran with, right after role. */
function turnSettings(
  ctx: OrchestratorLogContext,
  role: string,
  phase: string,
): { model?: string; effort?: string } {
  const turn = BUILD_TURNS.has(phase) ? (phase as "red" | "green" | "review" | "refactor") : undefined;
  const model = ctx.modelForRole?.(role);
  const effort = ctx.effortForTurn?.(role, turn);
  return {
    ...(model ? { model } : {}),
    ...(effort && effort !== "default" ? { effort } : {}),
  };
}

/** The story an action targets, if any (most build/design-lane actions carry one). */
function storyOf(action: WorkflowAction): string | undefined {
  return "story" in action ? (action as { story?: string }).story : undefined;
}

/**
 * Map one workflow action to the canonical log event(s) the orchestrator emits
 * BEFORE performing it. Pure: depends only on the action + context. role,
 * level, event, and message are always set, so what is emitted is correct by
 * construction.
 */
export function orchestratorLogEvents(
  action: WorkflowAction,
  ctx: OrchestratorLogContext = {},
): AgentLogEventInput[] {
  const feature_id = ctx.featureId;
  const story = storyOf(action);
  const base = { role: "orchestrator" as const, level: "info" as const, feature_id };

  // Every emit names an event from the CLOSED vocabulary (agent-log-events.ts)
  // and supplies that event's required SLOTS. The logger renders the message from
  // the template + slots and THROWS on an off-vocabulary event or a missing slot,
  // so the orchestrator trail conforms by construction. The event NAME carries
  // the phase; slots carry the specifics (story / ac / gate / ...).
  const withStory = story ? { story } : {};

  switch (action.kind) {
    case "invoke-role": {
      const role = action.role;
      const mode = "mode" in action ? action.mode : undefined;
      const buildMode = "buildMode" in action ? action.buildMode : undefined;
      const ac = "ac" in action ? action.ac : undefined;
      // `phase` slot = the concrete activity token (NOT prose): the planning mode,
      // the buildMode (review/refactor), or the cycle half (red/green), else design.
      const phase = mode ?? buildMode ?? (role === "navigator" ? "red" : role === "driver" ? "green" : "design");
      const detail = { ...withStory, ...(mode ? { mode } : {}), ...(buildMode ? { buildMode } : {}), ...(ac ? { ac } : {}) };
      return [
        { ...base, event: "handoff", slots: { to_role: role, phase, ...detail } },
        { role, level: "info", feature_id, ...turnSettings(ctx, role, phase), event: "phase.start", slots: { phase, ...detail } },
      ];
    }
    case "surface-gate":
      return [{ ...base, event: "gate.surfaced", slots: { gate: "spec", subject: `story ${story}`, ...withStory } }];
    case "await-acceptance":
      // The Release Engineer takes over here to run the deterministic deploy +
      // verify; the deploy CLI emits the deploy.* events with the real outcome.
      // The orchestrator records the RE dispatch + the acceptance gate.
      return [
        { ...base, event: "handoff", slots: { to_role: "release-engineer", phase: "deploy", ...withStory } },
        { role: "release-engineer", level: "info", feature_id, event: "phase.start", slots: { phase: "deploy", ...withStory } },
        { ...base, event: "gate.surfaced", slots: { gate: "acceptance", subject: `story ${story}`, ...withStory } },
      ];
    case "approve-gate":
      return [{ ...base, event: "gate.approved", slots: { gate: "spec", ...withStory } }];
    case "approve-plan-gate":
      return [{ ...base, event: "gate.approved", slots: { gate: "plan" } }];
    case "approve-deploy-gate":
      return [{ ...base, event: "gate.approved", slots: { gate: "deploy" } }];
    case "approve-promote-gate":
      // The HITL PR acceptance (the `promote` gate), before the merge.
      return [{ ...base, event: "gate.approved", slots: { gate: "promote" } }];
    case "deploy-complete":
      // Entering the promote phase: the Release Engineer takes the accepted
      // feature through PR review + merge up to the parent tier. (prepare-pr /
      // wait-ci / merge fall through to the default reasoning marker, which keeps
      // each a distinct, timestamped span for the timing report.)
      return [{ role: "release-engineer", level: "info", feature_id, event: "phase.start", slots: { phase: "promote" } }];
    case "accept":
      return [{ ...base, event: "experiment.accepted", slots: { ...withStory } }];
    case "cut-experiment":
      return [{ ...base, event: "experiment.cut", slots: { ...withStory } }];
    case "dispatch":
      // Opening the per-story build lane is a PHASE ENTRY, not an inter-agent
      // handoff: the build lane is the orchestrator's own pipeline, not a
      // spawnable agent. (The first real handoff is the navigator dispatch that
      // follows, via invoke-role.) Emitting a `handoff to build-lane` would be
      // the orchestrator handing off to itself; model it as phase.start instead.
      return [{ ...base, event: "phase.start", slots: { phase: "build", ...withStory } }];
    case "deploy":
      return [{ role: "release-engineer", level: "info", feature_id, event: "phase.start", slots: { phase: "deploy" } }];
    case "complete":
      return [{ ...base, event: "phase.end", slots: { phase: "story", outcome: "complete", ...withStory } }];
    case "planning-complete":
      return [{ ...base, event: "phase.end", slots: { phase: "planning", outcome: "complete" } }];
    case "design-complete":
      return [{ ...base, event: "phase.end", slots: { phase: "design", outcome: "complete" } }];
    case "feature-complete":
      return [{ ...base, event: "phase.end", slots: { phase: "feature", outcome: "complete" } }];
    case "raise-to-hil":
      return [
        {
          ...base,
          level: "error",
          event: "escalation.raised",
          slots: { source: action.source, reason: action.reason, ...withStory },
        },
      ];
    case "done":
      return [{ ...base, event: "phase.end", slots: { phase: "workflow", outcome: "complete" } }];
    default: {
      // Total over the union: any future action still gets an in-vocabulary event.
      const k = (action as { kind: string }).kind;
      return [{ ...base, event: "reasoning", slots: { note: `orchestrator: ${k}` } }];
    }
  }
}

/**
 * A one-line human-readable description of an action, for the driver's stdout
 * trace. Reuses orchestratorLogEvents' canonical message (DRY: one source of
 * narration for both the structured log + the console) so the smoke/console shows
 * "dispatch driver (story S1)" / "RAISED TO HIL (...)" instead of raw JSON.
 */
export function describeAction(action: WorkflowAction, ctx: OrchestratorLogContext = {}): string {
  const ev = orchestratorLogEvents(action, ctx)[0];
  if (!ev) return (action as { kind: string }).kind;
  // Render the same template the logger will, so the console trace matches the log.
  const renderCtx: Record<string, unknown> = {
    role: ev.role,
    ...(ev.feature_id !== undefined ? { feature_id: ev.feature_id } : {}),
    ...(ev.phase !== undefined ? { phase: ev.phase } : {}),
    ...(ev.slots ?? {}),
  };
  try {
    return renderEventMessage(ev.event, renderCtx);
  } catch {
    return ev.event;
  }
}

/**
 * Build the driver's `onAction` hook: code-emit each mapped event through the
 * one common logger. Wired into DriveEffects.onAction (fires before each
 * perform + before the terminal `done`), so the orchestrator trail is written
 * on every run with no LLM in the loop.
 */
export function makeOnAction(
  opts: AgentLogIoOpts & {
    featureId?: string;
    modelForRole?(role: string): string | undefined;
    effortForTurn?(role: string, turn?: "red" | "green" | "review" | "refactor"): string | undefined;
  },
): (action: WorkflowAction, iteration: number) => void {
  const { featureId, modelForRole, effortForTurn, ...io } = opts;
  return (action) => {
    for (const event of orchestratorLogEvents(action, { featureId, modelForRole, effortForTurn })) {
      // Best-effort: a logging failure must never abort the workflow.
      try {
        emitAgentLogEvent(event, io);
      } catch {
        /* swallow: observability is not load-bearing for the run */
      }
    }
  };
}

/** A concrete kit-CLI invocation (bin + argv), for programmatic enactment. */
export interface EnactCommand {
  bin: string;
  args: string[];
}

/** Context for resolving a gate's enact command: the feature/sprint it targets
 *  and (optionally) the approver to fill in for the `<you>` placeholder. */
export interface GateEnactContext {
  featureId?: string;
  sprint?: string;
  approver?: string;
}

/**
 * The EXACT substrate command that clears a given HITL gate stop (FEIP-8008),
 * as STRUCTURED bin + args. Each gate is recorded by a DIFFERENT substrate, so a
 * single generic command sent the human to the wrong door, e.g. the feature-level
 * `gates.json` spec gate for a PER-STORY spec stop, which recorded the wrong gate
 * and never advanced. Name the door that actually clears THIS stop:
 *   - plan gate      -> lakebase-sftdd-approve-gate --sprint
 *   - per-story spec -> lakebase-sftdd-approve-gate --feature --story
 *   - deploy/promote -> lakebase-sftdd-approve-gate --feature --gate <name>
 *   - PO acceptance  -> lakebase-sftdd-pipeline accept --feature --story
 * Returns null for a non-gate action. Pure (no I/O); the SINGLE gate->CLI mapping
 * shared by approveHint (the drive's stdout hint) and lakebase-sftdd-next (the
 * authoritative decision menu), so the two can never drift (FEIP-8017).
 */
export function gateEnactCommand(
  gate: WorkflowAction,
  ctx: GateEnactContext = {},
): EnactCommand | null {
  const you = ctx.approver ?? "<you>";
  const f = ctx.featureId ?? "<feature-id>";
  switch (gate.kind) {
    case "approve-plan-gate":
      return { bin: "lakebase-sftdd-approve-gate", args: ["--sprint", ctx.sprint ?? "<sprint>", "--approver", you] };
    case "approve-gate": // the per-story spec gate (pipeline.json), NOT feature gates.json
      return { bin: "lakebase-sftdd-approve-gate", args: ["--feature", f, "--story", gate.story, "--approver", you] };
    case "approve-deploy-gate":
      return { bin: "lakebase-sftdd-approve-gate", args: ["--feature", f, "--gate", "deploy", "--approver", you] };
    case "approve-promote-gate":
      return { bin: "lakebase-sftdd-approve-gate", args: ["--feature", f, "--gate", "promote", "--approver", you] };
    case "accept": // per-story PO acceptance (experiment merge), a pipeline action
      return { bin: "lakebase-sftdd-pipeline", args: ["accept", "--feature", f, "--story", gate.story, "--approver", you] };
    default:
      return null;
  }
}

/**
 * The EXACT human approval command for a HITL gate stop, as a one-line string for
 * the drive's stdout. A thin projection of `gateEnactCommand` (the one structured
 * mapping) so the console hint and the `next` decision menu never diverge.
 */
export function approveHint(
  gate: WorkflowAction,
  ctx: { featureId?: string; sprint?: string } = {},
): string {
  const cmd = gateEnactCommand(gate, ctx);
  if (cmd) return `${cmd.bin} ${cmd.args.join(" ")}`;
  // Non-gate fallthrough (never a gate in practice): the generic feature door.
  const f = ctx.featureId ?? "<feature-id>";
  return `lakebase-sftdd-approve-gate --feature ${f} --approver <you>`;
}
