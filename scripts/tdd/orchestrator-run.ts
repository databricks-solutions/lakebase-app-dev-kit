// Orchestrator driver loop (deterministic-driver phase 2: effect seams).
//
// Phase 1 (orchestrator-drive.ts) is the pure brain: nextTransition(state) ->
// the single next WorkflowAction. This module is the body: a loop that reads
// state, asks the brain for the next action, and performs that action's side
// effect, until the action is `done`. The side effects live behind the
// DriveEffects interface so the loop is hermetically testable with an in-memory
// fake; the real effects (claude -p --agent, cut/merge experiment,
// createSchemaMigration, collapseMigrationHeads, deploy, structured log) are
// injected in phase 3.
//
// This is what makes the per-story pipeline actually STREAM: because one
// process holds both lanes, nextTransition dispatches story 1 to the build lane
// the moment its gate is approved, while the design lane keeps designing later
// stories. (Under the old split /design-then-/build `claude -p` invocations the
// streaming could not happen: two processes, no shared loop.)

import { nextTransition, type DriveState, type WorkflowAction } from "./orchestrator-drive.js";

export interface DriveEffects {
  /**
   * Read the current workflow state. Real impl: derive a DriveState from
   * pipeline.json + workflow-state on disk. Fake: return the in-memory model.
   */
  readState(): Promise<DriveState>;
  /**
   * Perform one action's side effect. MUST advance the state that readState
   * reflects, or the loop detects a stall. `done` is a terminal no-op.
   */
  perform(action: WorkflowAction): Promise<void>;
  /** Optional deterministic logging hook (code-emitted, fires before perform). */
  onAction?(action: WorkflowAction, iteration: number): void;
}

export class DriverStalledError extends Error {
  constructor(
    readonly action: WorkflowAction,
    readonly iteration: number,
  ) {
    super(
      `driver stalled at iteration ${iteration}: action ${JSON.stringify(action)} repeated ` +
        `without advancing state. The effect for this action did not change what readState() returns.`,
    );
    this.name = "DriverStalledError";
  }
}

export interface RunDriverResult {
  /** Number of actions performed (including the terminal `done`). */
  iterations: number;
}

// Backstop against a runaway loop (an effect that advances but never converges).
// Far above any real feature: planning + ~6 steps/story + deploy stays well under.
const MAX_ITERATIONS = 10_000;

/**
 * Drive a feature to completion: read state, compute the next action, perform
 * it, repeat until `done`. Throws DriverStalledError if an action repeats
 * without the state advancing (an effect that did not record its result), and a
 * plain Error if the iteration backstop is hit.
 */
export async function runDriver(effects: DriveEffects): Promise<RunDriverResult> {
  let previousSignature: string | undefined;
  for (let i = 0; ; i++) {
    if (i >= MAX_ITERATIONS) {
      throw new Error(`driver exceeded ${MAX_ITERATIONS} iterations without reaching "done".`);
    }
    const state = await effects.readState();
    const action = nextTransition(state);

    if (action.kind === "done") {
      effects.onAction?.(action, i);
      await effects.perform(action);
      return { iterations: i + 1 };
    }

    const signature = JSON.stringify(action);
    if (signature === previousSignature) {
      throw new DriverStalledError(action, i);
    }
    previousSignature = signature;

    effects.onAction?.(action, i);
    await effects.perform(action);
  }
}
