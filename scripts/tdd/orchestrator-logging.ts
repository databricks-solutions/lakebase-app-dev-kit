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
// the SAME function via the lakebase-tdd-log CLI, appending to the shared
// .tdd/agent-log.jsonl; the orchestrator owns the skeleton, the roles add detail.

import type { WorkflowAction } from "./orchestrator-drive.js";
import { emitAgentLogEvent, type AgentLogEventInput, type AgentLogIoOpts } from "./agent-log.js";

export interface OrchestratorLogContext {
  featureId?: string;
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

  switch (action.kind) {
    case "invoke-role": {
      const role = action.role;
      const detail = "mode" in action ? action.mode : story ? `story ${story}` : "";
      return [
        // The orchestrator's routing decision (who it dispatched + why).
        {
          ...base,
          event: "handoff",
          message: `dispatch ${role}${detail ? ` (${detail})` : ""}`,
          data: { ...(story ? { story } : {}), ...("mode" in action ? { mode: action.mode } : {}) },
        },
        // The invoked role's phase boundary, stamped with THAT role, so its
        // lifecycle is recorded even if the role's own model never logs.
        {
          role,
          level: "info",
          feature_id,
          event: "phase.start",
          message: `${role} starting${detail ? `: ${detail}` : ""}`,
          ...(story ? { data: { story } } : {}),
        },
      ];
    }
    case "surface-gate":
      return [{ ...base, event: "gate.surfaced", message: `surfacing spec gate for story ${story}`, data: { story } }];
    case "await-acceptance":
      return [{ ...base, event: "gate.surfaced", message: `awaiting acceptance for story ${story}`, data: { story } }];
    case "approve-gate":
      return [{ ...base, event: "gate.approved", message: `spec gate approved for story ${story}`, data: { story } }];
    case "approve-plan-gate":
      return [{ ...base, event: "gate.approved", message: `sprint plan gate approved` }];
    case "approve-deploy-gate":
      return [{ ...base, event: "gate.approved", message: `deploy gate approved` }];
    case "accept":
      return [{ ...base, event: "experiment.accepted", message: `story ${story} accepted (merge)`, data: { story } }];
    case "cut-experiment":
      return [{ ...base, event: "experiment.cut", message: `cut experiment for story ${story}`, data: { story } }];
    case "dispatch":
      return [{ ...base, event: "handoff", message: `dispatch story ${story} to the build lane`, data: { story } }];
    case "deploy":
      return [{ ...base, event: "deploy.start", message: `deploying the built increment to the target` }];
    case "complete":
      return [{ ...base, event: "phase.end", message: `story ${story} complete`, data: { story } }];
    case "planning-complete":
      return [{ ...base, event: "phase.end", message: `planning complete` }];
    case "design-complete":
      return [{ ...base, event: "phase.end", message: `design complete` }];
    case "feature-complete":
      return [{ ...base, event: "phase.end", message: `feature complete` }];
    case "done":
      return [{ ...base, event: "phase.end", message: `workflow complete` }];
    default: {
      // Total over the union: any future action still gets a code-emitted event.
      const k = (action as { kind: string }).kind;
      return [{ ...base, event: `action.${k}`, message: `orchestrator: ${k}` }];
    }
  }
}

/**
 * Build the driver's `onAction` hook: code-emit each mapped event through the
 * one common logger. Wired into DriveEffects.onAction (fires before each
 * perform + before the terminal `done`), so the orchestrator trail is written
 * on every run with no LLM in the loop.
 */
export function makeOnAction(
  opts: AgentLogIoOpts & { featureId?: string },
): (action: WorkflowAction, iteration: number) => void {
  const { featureId, ...io } = opts;
  return (action) => {
    for (const event of orchestratorLogEvents(action, { featureId })) {
      // Best-effort: a logging failure must never abort the workflow.
      try {
        emitAgentLogEvent(event, io);
      } catch {
        /* swallow: observability is not load-bearing for the run */
      }
    }
  };
}
