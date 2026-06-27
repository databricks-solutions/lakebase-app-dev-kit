// Derive the driver's DriveState from on-disk state (deterministic-driver
// phase 3a: the readState half).
//
// nextTransition (phase 1) + runDriver (phase 2) operate on a DriveState. This
// module builds that DriveState from what is actually persisted:
//   - pipeline.json (story-pipeline.ts): per-story status + spec gate +
//     experiment + acceptance. The source of truth for gate/build/accept state.
//   - the coarse driver phase + planning/deploy flags, which live in
//     workflow-state (passed in as ctx).
//   - per-story design/build artifacts (ACs, architecture annotations, test
//     list, RED tests, GREEN code) that are FILES, not pipeline fields. Those
//     come through the StoryArtifactProbe seam so this mapping stays pure and
//     hermetically testable; the real disk/cycle-scanning probe is 3b.

import type { StoryEntry, StoryPipeline } from "./story-pipeline.js";
import type {
  DriveState,
  DrivePhase,
  PlanningState,
  DeployState,
  PromoteState,
  StoryView,
  DriveEscalation,
} from "./orchestrator-drive.js";

/**
 * Per-story design + build facts that are recorded as on-disk artifacts rather
 * than in pipeline.json. The mapping only needs these to be accurate for a
 * story that has NOT yet passed its spec gate (the design lane) or is actively
 * building; a gate-approved, not-yet-building story ignores the design probes,
 * and a done story ignores the build probes.
 */
export interface StoryArtifactProbe {
  /** The Spec Author has drafted this story's ACs (stories/<S>/story.json). */
  hasAcs(story: string): boolean;
  /** The Architect annotated layers / NFR coverage on this story's ACs. */
  architectAnnotated(story: string): boolean;
  /** The Test Strategist produced this story's test list (test-list.json). */
  testListReady(story: string): boolean;
  /** The Navigator wrote the (failing) tests for the story's current cycle. */
  testsWritten(story: string): boolean;
  /** The Driver made those tests pass. */
  codeWritten(story: string): boolean;
  /** An AC whose tests are all green but not yet Navigator-REVIEWed, or null. */
  reviewPendingAc(story: string): string | null;
  /** An AC the REVIEW asked to refactor, not yet Driver-refactored, or null. */
  refactorPendingAc(story: string): string | null;
  /** Story-level (the "story" granularity, default): every test in the story is
   *  green but the story is not yet REVIEWed (drives the story-scoped Navigator
   *  REVIEW turn, instead of per-AC). */
  reviewPending(story: string): boolean;
  /** Story-level: the story was REVIEWed with a refactor pending (the verdict
   *  requested it, or an open build-refactor-routable smell), not yet refactored
   *  (drives the story-scoped Driver REFACTOR turn). */
  refactorPending(story: string): boolean;
  /** The open AC whose GREEN verify failed + has not yet been assessed, or null
   *  (drives the reactive Navigator assess turn). */
  assessGreenFailureAc(story: string): string | null;
  /** The open AC the Navigator assessed as a DRIVER-FIXABLE regression (recorded a
   *  fix directive), repair not yet consumed, or null (drives the Driver repair turn). */
  repairRegressionFixAc(story: string): string | null;
  /** The story's deploy verified (reachable + verify.passed on its experiment
   *  branch): the teeth on acceptance (features/<F>/stories/<S>/deploy-evidence.json). */
  storyDeployVerified(story: string): boolean;
  /** An unresolved blocking escalation (failed honest-GREEN run, blocking smell,
   *  deploy verify-fail), or null. When set the driver routes to raise-to-hil. */
  pendingEscalation(): DriveEscalation | null;
}

/** Coarse driver context that lives outside pipeline.json (in workflow-state). */
export interface DriveContext {
  phase: DrivePhase;
  planning?: PlanningState;
  deploy?: DeployState;
  /** The promote phase's progress (PR review + merge to parent), from the SCM
   *  workflow-state + the `promote` HITL gate. */
  promote?: PromoteState;
  /** The Spec Author has enumerated the feature's stories (breakdown done). */
  breakdownDone: boolean;
  /** Optional explicit story order; defaults to pipeline insertion order. */
  storyOrder?: string[];
  /** Build-loop granularity (sftdd-config.json, file -> env -> default). "story"
   *  (the default) gives the Navigator/Driver story-scoped turns: one RED turn
   *  writes the whole story's tests, one GREEN greens them, one REVIEW + one
   *  REFACTOR per story. "ac" (strict per-test TDD) and "hybrid-a" (per-layer
   *  batch, per-AC review) keep the per-AC review/refactor cadence. */
  loop?: "ac" | "hybrid-a" | "story";
}

const DESIGN_DONE_STATUSES = new Set([
  "ready",
  "building",
  "awaiting-acceptance",
  "done",
]);

/**
 * A contract / cleanup story REMOVES or renames an existing shape (drop a
 * column, remove an endpoint, rename a field). Its build turn is the heaviest ,
 * the change must land in the migration AND the ORM model AND every query AND
 * every view in lockstep (`software-design-principles` hard rule 9). Packed into
 * one story-level GREEN turn that is too much to land reliably (the F6/S3 build
 * ground for 20+ min without converging), so a contract story automatically
 * runs at the FINEST `ac` granularity , one small, verifiable increment per AC ,
 * regardless of the run default. Detected from the story id's verb (the Spec
 * Author names contract stories descriptively: `...-drop-old`, `...-remove-x`,
 * `...-rename-y`, `...-cleanup`). */
export function isContractStory(storyId: string): boolean {
  return /(^|[-_])(drop|remove|delete|rename|deprecate|cleanup|retire)([-_]|$)|dropp|remov|delet|renam|deprecat/i.test(
    storyId,
  );
}

/** The granularity a story actually builds at: a contract/cleanup story drops to
 *  `ac` (finest); everything else uses the run default. Already-fine defaults
 *  (`ac`) stay `ac`. */
export function effectiveLoopForStory(
  runLoop: "ac" | "hybrid-a" | "story",
  storyId: string,
): "ac" | "hybrid-a" | "story" {
  return isContractStory(storyId) ? "ac" : runLoop;
}

function storyView(
  id: string,
  e: StoryEntry,
  probe: StoryArtifactProbe,
  loop: "ac" | "hybrid-a" | "story",
): StoryView {
  const gateApproved = e.gate?.status === "approved";
  const accepted = e.acceptance?.decision === "accepted" || e.status === "done";
  return {
    gateApproved,
    // The gate record exists once the story has been surfaced for review;
    // awaiting-gate is the pre-record surfaced state.
    gateSurfaced: e.gate != null || e.status === "awaiting-gate",
    design: {
      hasAcs: probe.hasAcs(id),
      architectAnnotated: probe.architectAnnotated(id),
      testListReady: probe.testListReady(id),
    },
    build: {
      // An experiment that was discarded is no longer cut (a fresh one is cut
      // on revise); merged/active both count as cut.
      experimentCut: e.experiment != null && e.experiment.status !== "discarded",
      testsWritten: probe.testsWritten(id),
      codeWritten: probe.codeWritten(id),
      loop,
      reviewAc: probe.reviewPendingAc(id),
      refactorAc: probe.refactorPendingAc(id),
      reviewStoryPending: probe.reviewPending(id),
      refactorStoryPending: probe.refactorPending(id),
      assessGreenAc: probe.assessGreenFailureAc(id),
      repairRegressionAc: probe.repairRegressionFixAc(id),
      awaitingAcceptance: e.status === "awaiting-acceptance",
      deployVerified: probe.storyDeployVerified(id),
      accepted,
    },
  };
}

/**
 * Build a DriveState from the persisted pipeline + coarse context + the
 * artifact probe. Pure: no I/O. Insertion order of pipeline.stories is the
 * default story order (the order the Spec Author enumerated them), overridable
 * via ctx.storyOrder.
 */
export function deriveDriveState(
  pipeline: StoryPipeline,
  probe: StoryArtifactProbe,
  ctx: DriveContext,
): DriveState {
  const loop = ctx.loop ?? "story";
  const stories: Record<string, StoryView> = {};
  for (const [id, entry] of Object.entries(pipeline.stories)) {
    // Per-story granularity: a contract/cleanup story (drop column / remove
    // endpoint / rename) auto-drops to the finest `ac` loop, since its lockstep
    // DB+code change is too heavy for one story-level GREEN turn.
    stories[id] = storyView(id, entry, probe, effectiveLoopForStory(loop, id));
  }
  const storyOrder = ctx.storyOrder ?? Object.keys(pipeline.stories);
  // The breakdown is done once stories are tracked in the pipeline (the signal
  // the design lane actually advances on), regardless of feature-spec.json.
  // This is what stops the driver re-issuing `breakdown` after the pipeline is
  // seeded (the sync-breakdown step).
  const breakdownDone = ctx.breakdownDone || storyOrder.length > 0;
  return {
    phase: ctx.phase,
    planning: ctx.planning,
    deploy: ctx.deploy,
    promote: ctx.promote,
    breakdownDone,
    storyOrder,
    stories,
    buildActive: pipeline.build_active,
    escalation: probe.pendingEscalation(),
  };
}

/**
 * Map the persisted TDD workflow phase (workflow-state.json `phase`) to the
 * driver's coarse phase. The fine-grained TDD phases (discovery / design /
 * implementation / review) all belong to the per-feature streaming the lane
 * sub-machines drive, so they collapse to "feature"; planning and deploy are
 * their own driver phases; shipped is terminal.
 */
export function driverPhaseForTdd(tddPhase: string): DrivePhase {
  switch (tddPhase) {
    case "planning":
      return "planning";
    case "deploy":
      return "deploy";
    case "promote":
      return "promote";
    case "shipped":
    case "done":
      return "done";
    default:
      // discovery | design | implementation | review | anything else
      return "feature";
  }
}

/** Sanity helper: assert ctx.storyOrder (if given) covers exactly the pipeline's
 *  stories, so the design lane never references a story the snapshot lacks. */
export function assertStoryOrderCoversPipeline(
  pipeline: StoryPipeline,
  storyOrder: string[],
): void {
  const inPipeline = new Set(Object.keys(pipeline.stories));
  const inOrder = new Set(storyOrder);
  const missing = [...inPipeline].filter((s) => !inOrder.has(s));
  const extra = [...inOrder].filter((s) => !inPipeline.has(s));
  if (missing.length || extra.length) {
    throw new Error(
      `storyOrder mismatch with pipeline: missing [${missing.join(", ")}], extra [${extra.join(", ")}]`,
    );
  }
}
