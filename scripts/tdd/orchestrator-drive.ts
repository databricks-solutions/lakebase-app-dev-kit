// Orchestrator-as-deterministic-driver, phase 1: the per-story DESIGN lane as a
// pure state machine.
//
// The orchestrator's routing is deterministic: given the recorded state, the
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
  /** UI track on (a design brief is part of intake): the UX Designer must
   *  produce the project style guide before any UI is architected or built. */
  uiTrack?: boolean;
  /** The project design guide (design-guide.json) exists, the UX Designer has
   *  already translated the design brief. Project-level, authored once. */
  designGuideReady?: boolean;
}

/** The single next design-lane action. A later phase maps each to an effect. */
export type DriveAction =
  | { kind: "invoke-role"; role: "spec-author"; mode: "breakdown" }
  // The UX Designer (UI track only) translates the design brief into the project
  // style guide. Feature/project-level + once, so no story scope.
  | { kind: "invoke-role"; role: "ux-designer" }
  | { kind: "invoke-role"; role: DesignRole; story: string }
  | { kind: "surface-gate"; story: string }
  | { kind: "approve-gate"; story: string }
  | { kind: "design-complete" };

/**
 * UI track: the project design guide (the UX Designer's output) is a hard
 * prerequisite for building any UI. True when the UI track is on, the feature is
 * broken down (the UX Designer needs the spec), and the guide is not on disk
 * yet. Used BOTH in the design lane and (hoisted) in nextTransition before the
 * build lane dispatches, so a pre-gated story still waits for the guide.
 */
export function uxDesignerPending(s: {
  uiTrack?: boolean;
  breakdownDone: boolean;
  designGuideReady?: boolean;
}): boolean {
  return !!s.uiTrack && s.breakdownDone && !s.designGuideReady;
}

/**
 * Compute the next design-lane action from the recorded state. Pure.
 *
 * Order of precedence:
 *   1. Break the feature down if not done.
 *   2. UI track: author the project design guide (UX Designer) once.
 *   3. Otherwise advance the FIRST story (in breakdown order) whose gate is not
 *      yet approved, through: ACs -> architecture -> tests -> surface -> approve.
 *   4. When every story's gate is approved, the design lane is complete.
 */
export function nextDesignAction(state: DesignDriveState): DriveAction {
  if (!state.breakdownDone) {
    return { kind: "invoke-role", role: "spec-author", mode: "breakdown" };
  }

  // UI track: the UX Designer translates the design brief into the project style
  // guide ONCE (design-guide.{md,json} + ia.md), after breakdown and before any
  // story is architected or built, so the Architect's E2E layers and the
  // Navigator/Driver's UI build against it. Idempotent: skipped once the guide
  // exists (project-level, reused across features).
  if (uxDesignerPending(state)) {
    return { kind: "invoke-role", role: "ux-designer" };
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
  /** The paired experiment branch was cut. */
  experimentCut: boolean;
  /** The Navigator wrote the (failing) tests for the story. */
  testsWritten: boolean;
  /** The Driver made the tests pass. */
  codeWritten: boolean;
  /** An AC whose tests are all green but not yet REVIEWed by the Navigator
   *  (against architecture + design guide), or null. Drives the per-AC REVIEW. */
  reviewAc?: string | null;
  /** An AC the Navigator REVIEW asked to refactor, not yet refactored by the
   *  Driver, or null. Drives the per-AC REFACTOR. */
  refactorAc?: string | null;
  /** The built story was deployed for the PO's acceptance review. */
  awaitingAcceptance: boolean;
  /** The story's deploy verified (reachable + verify.passed on its experiment
   *  branch). The teeth on acceptance: a story cannot be accepted/merged unless
   *  its deploy proved working software. */
  deployVerified: boolean;
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
  /** The Spec Author proposed the sprint's candidate feature breakdown. */
  proposed: boolean;
  /** The Architect t-shirt-sized the candidates (planning/estimates.json), so
   *  the Product Owner can commit against sprint capacity. */
  estimated: boolean;
  /** Policy: skip the Architect's estimation (t-shirt sizing) step entirely
   *  (`--no-sizing`). When set, the machine routes proposed -> author-requests
   *  with no estimate action, and the backlog is projected without sizes. A
   *  config decision threaded from the CLI, NOT derived from disk. */
  skipSizing?: boolean;
  /** The Product Owner committed the sprint backlog (authored a feature-request
   *  per committed feature; sync-backlog projected backlog.json). */
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

/** A blocking problem an agent/step surfaced, derived from disk (escalation
 *  files + blocking smells). Structural copy of escalation.ts's Escalation so the
 *  pure state machine stays fs-free. While one is unresolved the driver routes to
 *  raise-to-hil before any other transition. */
export interface DriveEscalation {
  id: string;
  source: string;
  reason: string;
  story_id?: string;
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
  /** UI track on (set from cfg.uiTrack at readState): gates the UX Designer step. */
  uiTrack?: boolean;
  /** The project design guide exists (design-guide.json on disk). */
  designGuideReady?: boolean;
  /** An unresolved blocking escalation (failed-green run, blocking smell, verify
   *  fail). When set, nextTransition pre-empts everything with raise-to-hil. */
  escalation?: DriveEscalation | null;
}

export type WorkflowAction =
  | DriveAction
  | { kind: "invoke-role"; role: "spec-author"; mode: "propose" }
  | { kind: "invoke-role"; role: "architect-reviewer"; mode: "estimate" }
  | { kind: "invoke-role"; role: "product-owner"; mode: "author-requests" }
  | { kind: "approve-plan-gate" }
  | { kind: "planning-complete" }
  | { kind: "dispatch"; story: string }
  | { kind: "cut-experiment"; story: string }
  | { kind: "invoke-role"; role: "navigator" | "driver"; story: string; buildMode?: "review" | "refactor"; ac?: string }
  | { kind: "await-acceptance"; story: string }
  | { kind: "accept"; story: string }
  | { kind: "complete"; story: string }
  | { kind: "feature-complete" }
  | { kind: "deploy" }
  | { kind: "approve-deploy-gate" }
  | { kind: "raise-to-hil"; reason: string; source: string; story?: string }
  | { kind: "done" };

/** The next build-lane action for the story the lane is on. */
function nextBuildAction(story: string, b: StoryBuild): WorkflowAction {
  if (!b.experimentCut) return { kind: "cut-experiment", story };
  if (!b.testsWritten) return { kind: "invoke-role", role: "navigator", story };
  if (!b.codeWritten) return { kind: "invoke-role", role: "driver", story };
  // Per-AC handoff (driver-navigator-tdd): once an AC's tests are green, the
  // Navigator REVIEWs it (against architecture + design guide) and the Driver
  // REFACTORs on request, before the story is accepted.
  if (b.reviewAc) return { kind: "invoke-role", role: "navigator", story, buildMode: "review", ac: b.reviewAc };
  if (b.refactorAc) return { kind: "invoke-role", role: "driver", story, buildMode: "refactor", ac: b.refactorAc };
  if (!b.awaitingAcceptance) return { kind: "await-acceptance", story };
  // Teeth: a story cannot be accepted (merged) until its deploy verified
  // (reachable + verify.passed). Re-deploy until it does; a story that never
  // verifies surfaces as a stall, not a silent merge of broken software.
  if (!b.deployVerified) return { kind: "await-acceptance", story };
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
  // Escalation pre-empts everything (follow-up): any unresolved
  // blocking problem an agent surfaced (a failed honest-GREEN run, a blocking
  // bad-smell, a deploy verify-fail) routes to a single raise-to-hil halt rather
  // than advancing or re-issuing an action that never changes state (the
  // await-acceptance spin). The run stops cleanly for the HIL; it never
  // false-greens past the problem or silently stalls.
  if (state.escalation) {
    const e = state.escalation;
    return { kind: "raise-to-hil", reason: e.reason, source: e.source, ...(e.story_id ? { story: e.story_id } : {}) };
  }

  if (state.phase === "planning") {
    const p = state.planning ?? { proposed: false, estimated: false, requestsAuthored: false };
    if (!p.proposed) return { kind: "invoke-role", role: "spec-author", mode: "propose" };
    // The Architect t-shirt-sizes the candidates before the PO commits, so the
    // PO can pick a backlog that fits sprint capacity (the team's estimation).
    // `--no-sizing` (p.skipSizing) drops this step: proposed -> author-requests
    // with no estimate action, for a backlog small enough not to need sizing.
    if (!p.skipSizing && !p.estimated) return { kind: "invoke-role", role: "architect-reviewer", mode: "estimate" };
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
  // UI-track prerequisite: the project design guide must exist before ANY UI is
  // built. Run the UX Designer (once, after breakdown) BEFORE the build lane can
  // dispatch a story, so a story whose spec gate is already approved still waits
  // for the guide rather than building UI against a guide that does not exist.
  // Idempotent: skipped once design-guide.json is on disk.
  if (uxDesignerPending(state)) {
    return { kind: "invoke-role", role: "ux-designer" };
  }
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
  const design = nextDesignAction(toDesignView(state));
  // 4. Design lane exhausted + nothing left to build => every story is accepted.
  if (design.kind === "design-complete") return { kind: "feature-complete" };
  return design;
}

/** Project a full DriveState down to the design sub-machine's view. */
function toDesignView(state: DriveState): DesignDriveState {
  return {
    breakdownDone: state.breakdownDone,
    storyOrder: state.storyOrder,
    uiTrack: state.uiTrack,
    designGuideReady: state.designGuideReady,
    stories: Object.fromEntries(
      Object.entries(state.stories).map(([id, v]) => [
        id,
        { gateApproved: v.gateApproved, gateSurfaced: v.gateSurfaced, design: v.design },
      ]),
    ),
  };
}

/**
 * The next DESIGN-LANE-ONLY action: design every story through its spec gate,
 * never dispatch a build. Backs the `/design` Tier-2 bound (`--only design`),
 * which must design ALL stories without building any, unlike nextTransition
 * which streams build the moment a story's gate is approved. Reaches
 * `design-complete` when every story is gate-approved.
 */
export function nextDesignOnlyTransition(state: DriveState): WorkflowAction {
  return nextDesignAction(toDesignView(state));
}

/**
 * A handoff the human can PAUSE a driver run just before (a HITL gate, not a
 * bail-out): "navigator" = the first build handoff (the Navigator kickoff, before
 * any code is written), "release-engineer" = the deploy/verify (the Release
 * Engineer takes the built + reviewed story and ships it). The driver blocks at
 * the gate, prompts the human [Y/n], and RESUMES the same run on Y , it never
 * leaves the state machine. Backs run-to-navigator / run-to-release-engineer and
 * the `--pause-before` flag.
 */
export type PauseMilestone = "navigator" | "release-engineer";

/** A predicate matching the action JUST BEFORE the given handoff fires (the
 *  driver pauses for the human's Y/n the first time this matches). */
export function pauseBeforeMilestone(m: PauseMilestone): (action: WorkflowAction) => boolean {
  switch (m) {
    case "navigator":
      // The initial Navigator handoff writes the first failing test (tests not
      // yet written). The per-AC REVIEW/REFACTOR turns also invoke the navigator
      // but carry a buildMode, so exclude those , we pause at the build kickoff.
      return (a) => a.kind === "invoke-role" && a.role === "navigator" && a.buildMode === undefined;
    case "release-engineer":
      // The per-story deploy + verify (await-acceptance) and the feature-level
      // deploy both hand the working software to the Release Engineer.
      return (a) => a.kind === "await-acceptance" || a.kind === "deploy";
  }
}

/** The lane a WorkflowAction belongs to, for the driver's Tier-2 phase bounds.
 *  "coarse" is the feature->deploy boundary (feature-complete). */
export type ActionLane = "planning" | "design" | "build" | "deploy" | "coarse" | "done";

export function actionLane(action: WorkflowAction): ActionLane {
  switch (action.kind) {
    case "invoke-role": {
      if ("mode" in action) {
        // propose / author-requests are sprint planning; breakdown is design.
        return action.mode === "breakdown" ? "design" : "planning";
      }
      return action.role === "navigator" || action.role === "driver" ? "build" : "design";
    }
    case "approve-plan-gate":
    case "planning-complete":
      return "planning";
    case "surface-gate":
    case "approve-gate":
    case "design-complete":
      return "design";
    case "dispatch":
    case "cut-experiment":
    case "await-acceptance":
    case "accept":
    case "complete":
      return "build";
    case "feature-complete":
      return "coarse";
    case "deploy":
    case "approve-deploy-gate":
      return "deploy";
    case "raise-to-hil":
      // Terminal halt: surfaced to the HIL, the run stops here for a human.
      return "done";
    case "done":
      return "done";
  }
}

/**
 * The HITL gate-approval actions: the decisions a HUMAN owns (live), or the
 * Human Proxy stands in for (headless). In interactive gate mode the driver
 * STOPS before these so the session can surface the gate and the human answers;
 * in proxy mode the driver performs them (the Proxy approves). The spec gate
 * (approve-gate), the sprint plan gate (approve-plan-gate), the deploy gate
 * (approve-deploy-gate), and the per-story PO acceptance (accept).
 */
export function isHitlGateAction(action: WorkflowAction): boolean {
  return (
    action.kind === "approve-gate" ||
    action.kind === "approve-plan-gate" ||
    action.kind === "approve-deploy-gate" ||
    action.kind === "accept"
  );
}

/**
 * Steps where the HUMAN provides an input artifact (not an approval): the
 * Product Owner's feature-requests at `author-requests`. The state machine is
 * identical for a human and the headless proxy , in interactive mode the driver
 * STOPS here so the human provides the requests (directly, or by working with
 * the agents), then re-runs; in proxy mode the Human Proxy supplies the recorded
 * answers when asked. Same transition, only the provider differs.
 */
export function isHumanInputAction(action: WorkflowAction): boolean {
  return action.kind === "invoke-role" && "mode" in action && action.mode === "author-requests";
}
