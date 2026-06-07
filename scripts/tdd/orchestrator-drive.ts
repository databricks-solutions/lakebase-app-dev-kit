// Orchestrator-as-deterministic-driver, phase 1: the per-story DESIGN lane as a
// pure state machine.
//
// The scrum-master's routing is deterministic: given the recorded state, the
// next action is a pure function of priors. nextDesignAction computes the single
// next DESIGN-lane action from a snapshot of the breakdown + each story's design
// progress + its gate. No I/O, no model: the effectful driver (a later phase)
// reads the state off disk, calls this to decide, performs the action, and
// records it (the phase/handoff log emitted as code, not prose-instructed model
// behavior, so observability can never be silently dropped).
//
// The streaming invariant the LLM kept violating (batching every story's ACs at
// once) is structural here: the function always advances the FIRST not-yet-gated
// story in breakdown order, so exactly one story is ever in design at a time and
// the spec-author is invoked per story. See
// docs/refactor/orchestrator-deterministic-driver.md.

/** The design-lane roles, in the order a story flows through them. */
export type DesignRole = "spec-author" | "architect-reviewer" | "test-strategist";

/** What a story has produced so far in the design lane (derived from disk). */
export interface StoryDesign {
  /** The Spec Author has drafted this story's acceptance criteria. */
  hasAcs: boolean;
  /** The Architect Reviewer has annotated layers / NFR coverage on the ACs. */
  architectAnnotated: boolean;
  /** The Test Strategist has produced this story's ordered test list. */
  testListReady: boolean;
}

/** A story's design + gate status, as the driver sees it. */
export interface DriveStoryView {
  /** The per-story spec gate has been approved (story is done designing). */
  gateApproved: boolean;
  /** The gate has been surfaced for review (awaiting approval) but not approved. */
  gateSurfaced: boolean;
  design: StoryDesign;
}

export interface DesignDriveState {
  /** The Spec Author has enumerated the feature's stories (stubs written). */
  breakdownDone: boolean;
  /** Story ids in breakdown order; the lane advances them in this order. */
  storyOrder: string[];
  stories: Record<string, DriveStoryView>;
}

/** The single next design-lane action. A later phase maps each to an effect. */
export type DriveAction =
  | { kind: "invoke-role"; role: "spec-author"; mode: "breakdown" }
  | { kind: "invoke-role"; role: DesignRole; story: string }
  | { kind: "surface-gate"; story: string }
  | { kind: "approve-gate"; story: string }
  | { kind: "design-complete" };

/**
 * Compute the next design-lane action from the recorded state. Pure.
 *
 * Order of precedence:
 *   1. Break the feature down if not done.
 *   2. Otherwise advance the FIRST story (in breakdown order) whose gate is not
 *      yet approved, through: ACs -> architecture -> tests -> surface -> approve.
 *   3. When every story's gate is approved, the design lane is complete.
 */
export function nextDesignAction(state: DesignDriveState): DriveAction {
  if (!state.breakdownDone) {
    return { kind: "invoke-role", role: "spec-author", mode: "breakdown" };
  }

  for (const story of state.storyOrder) {
    const v = state.stories[story];
    // A story absent from the snapshot is treated as fresh (nothing designed).
    if (v?.gateApproved) continue; // done designing; move on
    const design = v?.design ?? { hasAcs: false, architectAnnotated: false, testListReady: false };

    if (!design.hasAcs) return { kind: "invoke-role", role: "spec-author", story };
    if (!design.architectAnnotated) return { kind: "invoke-role", role: "architect-reviewer", story };
    if (!design.testListReady) return { kind: "invoke-role", role: "test-strategist", story };
    if (!v?.gateSurfaced) return { kind: "surface-gate", story };
    return { kind: "approve-gate", story };
  }

  return { kind: "design-complete" };
}
