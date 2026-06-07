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

// --- Full workflow transition (planning + design + build + deploy) ----------
//
// nextTransition composes the lane sub-machines into the whole feature
// lifecycle. The design lane (above) streams stories through their gates; the
// single build lane then takes each gate-approved story through its experiment
// build and acceptance; when every story is accepted the feature deploys. On a
// single sequential build lane the precedence is: finish/advance the active
// build, else dispatch a ready story, else advance the design lane, so a story
// flows design -> gate -> build -> accept before the next is designed.

/** What a story has produced in the build lane (its experiment build). */
export interface StoryBuild {
  /** The paired experiment branch was cut (FEIP-7566). */
  experimentCut: boolean;
  /** The Navigator wrote the (failing) tests for the story. */
  testsWritten: boolean;
  /** The Driver made the tests pass. */
  codeWritten: boolean;
  /** The built story was deployed for the PO's acceptance review. */
  awaitingAcceptance: boolean;
  /** The PO accepted: experiment merged into the feature branch, story done. */
  accepted: boolean;
}

/** A story's full design + gate + build status, as the driver sees it. */
export interface StoryView extends DriveStoryView {
  build: StoryBuild;
}

/** The driver's coarse phase: sprint planning, the per-feature streaming, the
 *  per-feature deploy, or done. (The fine-grained TDD phases live in the
 *  pipeline state the lane sub-machines read.) */
export type DrivePhase = "planning" | "feature" | "deploy" | "done";

export interface PlanningState {
  /** The Spec Author proposed the sprint's feature breakdown. */
  proposed: boolean;
  /** The Product Owner authored the sprint's feature-requests. */
  requestsAuthored: boolean;
  /** The sprint PLAN gate has been approved (human live, or Human Proxy
   *  headless). The HITL checkpoint between planning and execution; a re-plan
   *  the human "passes on" simply re-approves the standing backlog. */
  gateApproved?: boolean;
}

export interface DeployState {
  /** The Release Engineer deployed the feature to the target. */
  deployed: boolean;
  /** The PO signed the deploy (working-software) gate. */
  gateApproved: boolean;
}

export interface DriveState {
  phase: DrivePhase;
  planning?: PlanningState;
  breakdownDone: boolean;
  storyOrder: string[];
  stories: Record<string, StoryView>;
  /** The story the single build lane is on, or null when idle. */
  buildActive: string | null;
  deploy?: DeployState;
}

export type WorkflowAction =
  | DriveAction
  | { kind: "invoke-role"; role: "spec-author"; mode: "propose" }
  | { kind: "invoke-role"; role: "product-owner"; mode: "author-requests" }
  | { kind: "approve-plan-gate" }
  | { kind: "planning-complete" }
  | { kind: "dispatch"; story: string }
  | { kind: "cut-experiment"; story: string }
  | { kind: "invoke-role"; role: "navigator" | "driver"; story: string }
  | { kind: "await-acceptance"; story: string }
  | { kind: "accept"; story: string }
  | { kind: "complete"; story: string }
  | { kind: "feature-complete" }
  | { kind: "deploy" }
  | { kind: "approve-deploy-gate" }
  | { kind: "done" };

/** The next build-lane action for the story the lane is on. */
function nextBuildAction(story: string, b: StoryBuild): WorkflowAction {
  if (!b.experimentCut) return { kind: "cut-experiment", story };
  if (!b.testsWritten) return { kind: "invoke-role", role: "navigator", story };
  if (!b.codeWritten) return { kind: "invoke-role", role: "driver", story };
  if (!b.awaitingAcceptance) return { kind: "await-acceptance", story };
  if (!b.accepted) return { kind: "accept", story };
  return { kind: "complete", story }; // built + accepted -> free the lane
}

/**
 * The single next action for the whole feature workflow. Pure.
 *
 * Precedence:
 *   planning:  propose -> author-requests -> planning-complete.
 *   feature:   advance the active build; else dispatch a ready (gate-approved,
 *              unbuilt) story into the idle lane; else advance the design lane;
 *              else (all accepted) feature-complete.
 *   deploy:    deploy -> approve-deploy-gate -> done.
 */
export function nextTransition(state: DriveState): WorkflowAction {
  if (state.phase === "planning") {
    const p = state.planning ?? { proposed: false, requestsAuthored: false };
    if (!p.proposed) return { kind: "invoke-role", role: "spec-author", mode: "propose" };
    if (!p.requestsAuthored) return { kind: "invoke-role", role: "product-owner", mode: "author-requests" };
    // The sprint plan gate is the HITL checkpoint between planning + execution.
    // It locks the backlog (human live / Human Proxy headless) before any
    // feature is driven; "pass on a re-plan" = re-approve the standing backlog.
    if (!p.gateApproved) return { kind: "approve-plan-gate" };
    return { kind: "planning-complete" };
  }

  if (state.phase === "deploy") {
    const d = state.deploy ?? { deployed: false, gateApproved: false };
    if (!d.deployed) return { kind: "deploy" };
    if (!d.gateApproved) return { kind: "approve-deploy-gate" };
    return { kind: "done" };
  }

  if (state.phase === "done") return { kind: "done" };

  // phase === "feature": stream design + build.
  // 1. Finish/advance the story the build lane is already on.
  if (state.buildActive) {
    return nextBuildAction(state.buildActive, state.stories[state.buildActive].build);
  }
  // 2. Lane idle: dispatch the first gate-approved, not-yet-accepted story.
  for (const story of state.storyOrder) {
    const v = state.stories[story];
    if (v?.gateApproved && !v.build.accepted) return { kind: "dispatch", story };
  }
  // 3. Otherwise advance the design lane (reusing the design sub-machine).
  const designView: DesignDriveState = {
    breakdownDone: state.breakdownDone,
    storyOrder: state.storyOrder,
    stories: Object.fromEntries(
      Object.entries(state.stories).map(([id, v]) => [
        id,
        { gateApproved: v.gateApproved, gateSurfaced: v.gateSurfaced, design: v.design },
      ]),
    ),
  };
  const design = nextDesignAction(designView);
  // 4. Design lane exhausted + nothing left to build => every story is accepted.
  if (design.kind === "design-complete") return { kind: "feature-complete" };
  return design;
}
