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

import {
  nextTransition,
  nextDesignOnlyTransition,
  actionLane,
  type DriveState,
  type WorkflowAction,
} from "./orchestrator-drive.js";

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
  /** True if the loop stopped at maxSteps rather than reaching `done`. */
  stoppedAtMax?: boolean;
  /** True if the loop stopped at a phase bound (stopWhen) rather than `done`. */
  stoppedAtBound?: boolean;
}

export interface RunDriverOptions {
  /** Stop after this many actions (for incremental/live testing + safety). */
  maxSteps?: number;
  /**
   * Transition function (default nextTransition). The `/design` Tier-2 bound
   * passes nextDesignOnlyTransition so it designs every story without building.
   */
  transition?: (state: DriveState) => WorkflowAction;
  /**
   * Phase bound for the Tier-2 commands: when the NEXT action satisfies this,
   * the loop stops BEFORE performing it (a clean bounded completion, not a
   * stall). `done` is always handled first, so a bounded run that legitimately
   * reaches `done` completes normally. See actionLane for the lane taxonomy.
   */
  stopWhen?: (action: WorkflowAction) => boolean;
}

// Backstop against a runaway loop (an effect that advances but never converges).
// Far above any real feature: planning + ~6 steps/story + deploy stays well under.
const MAX_ITERATIONS = 10_000;

/** The Tier-2 phase the human bounded a driver run to (one of the slash commands). */
export type DriverBound = "plan" | "design" | "build" | "deploy";

/**
 * The transition + stopWhen for a Tier-2 bound. `plan` runs the planning
 * sub-machine; `design` runs the design lane to design-complete (all stories
 * designed, none built); `build` builds gate-approved stories then stops before
 * deploy; `deploy` runs only the deploy phase. A bound also GUARDS: a `build`
 * run whose design is not done, or a `deploy` run whose feature is not built,
 * stops immediately (its first action is out of lane) rather than doing the
 * upstream work.
 */
export function driverBoundOptions(bound: DriverBound): Pick<RunDriverOptions, "transition" | "stopWhen"> {
  switch (bound) {
    case "plan":
      return { stopWhen: (a) => actionLane(a) !== "planning" };
    case "design":
      return { transition: nextDesignOnlyTransition, stopWhen: (a) => a.kind === "design-complete" };
    case "build":
      return { stopWhen: (a) => actionLane(a) !== "build" };
    case "deploy":
      return { stopWhen: (a) => actionLane(a) !== "deploy" };
  }
}

/**
 * Drive a feature to completion: read state, compute the next action, perform
 * it, repeat until `done`. Throws DriverStalledError if an action repeats
 * without the state advancing (an effect that did not record its result), and a
 * plain Error if the iteration backstop is hit.
 */
export async function runDriver(
  effects: DriveEffects,
  options: RunDriverOptions = {},
): Promise<RunDriverResult> {
  let previousSignature: string | undefined;
  for (let i = 0; ; i++) {
    if (options.maxSteps !== undefined && i >= options.maxSteps) {
      return { iterations: i, stoppedAtMax: true };
    }
    if (i >= MAX_ITERATIONS) {
      throw new Error(`driver exceeded ${MAX_ITERATIONS} iterations without reaching "done".`);
    }
    const state = await effects.readState();
    const transition = options.transition ?? nextTransition;
    const action = transition(state);

    if (action.kind === "done") {
      effects.onAction?.(action, i);
      await effects.perform(action);
      return { iterations: i + 1 };
    }

    // A Tier-2 phase bound: stop cleanly before performing the out-of-scope
    // action (e.g. /design stops before the first build, /build before deploy).
    if (options.stopWhen?.(action)) {
      return { iterations: i, stoppedAtBound: true };
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
