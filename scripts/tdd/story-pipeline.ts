// FEIP-7565: per-story pipeline state for the streaming design->build workflow.
// The design lane moves each story designing -> awaiting-gate -> ready; the single
// build lane consumes the FIFO build_queue (build_active) -> done. Persisted as
// .tdd/features/<F>/pipeline.json. Exactly one story builds at a time; the
// Scrum-Master owns these transitions.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";

export const STORY_STATUSES = [
  "designing",
  "awaiting-gate",
  "ready",
  "building",
  "awaiting-acceptance",
  "done",
  "discarded",
] as const;
export type StoryStatus = (typeof STORY_STATUSES)[number];

// Per-story spec gate (FEIP-7565 phase 2b). Mirrors the per-feature gates.ts
// conventions (status enum + approver/approved_at + decision history) but is
// scoped to one story and lives INSIDE pipeline.json, deliberately isolated
// from the per-feature gates.json so its heavily-tested suite is untouched.
// This gate formalizes the awaiting-gate -> ready transition: only an approved
// story may be enqueued for the single build lane.
export const STORY_GATE_STATUSES = ["open", "approved", "withdrawn"] as const;
export type StoryGateStatus = (typeof STORY_GATE_STATUSES)[number];

export type StoryGateAction = "approved" | "withdrawn";

export interface StoryGateHistoryEntry {
  action: StoryGateAction;
  at: string;
  approver: string;
  /** Hash of the story's spec artifact at approval, anchoring the decision. */
  spec_hash?: string;
  reason?: string;
}

export interface StoryGateRecord {
  status: StoryGateStatus;
  approver?: string;
  approved_at?: string;
  spec_hash?: string;
  withdrawal_reason?: string;
  history: StoryGateHistoryEntry[];
}

// Per-story experiment (FEIP-7566): build isolation. The story is built on an
// ephemeral paired Lakebase branch forked from feature HEAD; on accept it is
// MERGED into the feature branch (code + migrations), on discard/revise it is
// torn down. N=1 (default) = one experiment = the story's build; N>=2 races
// competing strategies (a promote/synthesize winner merges). Branch ops live in
// the experiment-lifecycle CLI; this is just the recorded pipeline state.
export const STORY_EXPERIMENT_STATUSES = ["active", "merged", "discarded"] as const;
export type StoryExperimentStatus = (typeof STORY_EXPERIMENT_STATUSES)[number];

export interface StoryExperiment {
  slug: string;
  branch: string;
  lakebase_branch_uid?: string;
  /** The feature branch this experiment forked from. */
  parent: string;
  /** Feature-branch HEAD sha at cut time. */
  parent_sha?: string;
  /** 1 (default) or the count of competing experiments in an N>=2 race. */
  n: number;
  status: StoryExperimentStatus;
  cut_at?: string;
  closed_at?: string;
}

// PO acceptance of a built story (FEIP-7566), distinct from the pre-build spec
// gate. A three-way decision recorded after the PO reviews the running story.
export const STORY_ACCEPTANCE_DECISIONS = ["accepted", "discarded", "revise"] as const;
export type StoryAcceptanceDecision = (typeof STORY_ACCEPTANCE_DECISIONS)[number];

export interface StoryAcceptanceHistoryEntry {
  decision: StoryAcceptanceDecision;
  at: string;
  approver: string;
  reason?: string;
}

export interface StoryAcceptance {
  /** null while the PO is still reviewing (awaiting-acceptance). */
  decision: StoryAcceptanceDecision | null;
  approver?: string;
  at?: string;
  reason?: string;
  history: StoryAcceptanceHistoryEntry[];
}

export interface StoryEntry {
  status: StoryStatus;
  /** The per-story spec gate; present once the story has been surfaced for review. */
  gate?: StoryGateRecord;
  /** The experiment branch the story is built on (FEIP-7566). */
  experiment?: StoryExperiment;
  /** The PO's post-build accept/discard/revise decision (FEIP-7566). */
  acceptance?: StoryAcceptance;
}

export interface StoryPipeline {
  version: 1;
  feature_id: string;
  stories: Record<string, StoryEntry>;
  /** FIFO of gate-approved (ready) story ids waiting for the single build lane. */
  build_queue: string[];
  /** The story the single build lane is on, or null when idle. At most one. */
  build_active: string | null;
}

export interface StoryGateApproval {
  approver: string;
  /** ISO timestamp; passed in (not stamped here) so callers/tests stay deterministic. */
  at: string;
  spec_hash?: string;
}

export interface StoryGateWithdrawal {
  approver: string;
  at: string;
  reason: string;
}

export function initPipeline(featureId: string): StoryPipeline {
  return { version: 1, feature_id: featureId, stories: {}, build_queue: [], build_active: null };
}

function pipelinePath(tddDir: string, featureId: string): string {
  return join(tddDir, "features", featureId, "pipeline.json");
}

/** Read .tdd/features/<F>/pipeline.json, or an empty pipeline when absent. */
export function readPipeline(tddDir: string, featureId: string): StoryPipeline {
  const p = pipelinePath(tddDir, featureId);
  if (!existsSync(p)) return initPipeline(featureId);
  return JSON.parse(readFileSync(p, "utf8")) as StoryPipeline;
}

export function writePipeline(tddDir: string, pipeline: StoryPipeline): void {
  const p = pipelinePath(tddDir, pipeline.feature_id);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(pipeline, null, 2) + "\n");
}

/**
 * Set a story's status (creating its entry if new), preserving any existing
 * gate record. This is the single place a story's status is written, every
 * other transition routes through here so the per-story gate is never clobbered.
 * Mutates + returns the pipeline.
 */
export function setStoryStatus(
  pipeline: StoryPipeline,
  storyId: string,
  status: StoryStatus,
): StoryPipeline {
  const existing = pipeline.stories[storyId];
  pipeline.stories[storyId] = { ...existing, status };
  return pipeline;
}

/**
 * Gate-approved: mark the story `ready` and append it to the FIFO build queue.
 * Idempotent, re-enqueuing an already-queued story does not duplicate it.
 */
export function enqueueReady(pipeline: StoryPipeline, storyId: string): StoryPipeline {
  setStoryStatus(pipeline, storyId, "ready");
  if (!pipeline.build_queue.includes(storyId)) pipeline.build_queue.push(storyId);
  return pipeline;
}

/**
 * Dispatch the head of the queue to the single build lane, if the lane is idle.
 * Returns the dispatched story id, or null when the lane is busy (build_active is
 * set) or the queue is empty. Single-lane invariant: never dispatches a second
 * story while one is building.
 */
export function dispatchNext(pipeline: StoryPipeline): string | null {
  if (pipeline.build_active !== null) return null;
  const next = pipeline.build_queue.shift();
  if (next === undefined) return null;
  pipeline.build_active = next;
  setStoryStatus(pipeline, next, "building");
  return next;
}

/**
 * The active story finished building: mark it `done` and free the lane.
 * Returns the completed story id, or null when nothing was building.
 */
export function completeActive(pipeline: StoryPipeline): string | null {
  const done = pipeline.build_active;
  if (done === null) return null;
  setStoryStatus(pipeline, done, "done");
  pipeline.build_active = null;
  return done;
}

// --- Per-story spec gate (FEIP-7565 phase 2b) -----------------------------

/** The story's gate, or a default-open record when the story is ungated. */
export function getStoryGate(pipeline: StoryPipeline, storyId: string): StoryGateRecord {
  return pipeline.stories[storyId]?.gate ?? { status: "open", history: [] };
}

/**
 * Surface a designed story for the per-story spec gate: move it to
 * `awaiting-gate` and open its gate (idempotent, an existing gate is left as-is).
 * The design lane calls this when a story's spec/arch/test design is complete.
 */
export function surfaceForGate(pipeline: StoryPipeline, storyId: string): StoryPipeline {
  setStoryStatus(pipeline, storyId, "awaiting-gate");
  const story = pipeline.stories[storyId];
  if (!story.gate) story.gate = { status: "open", history: [] };
  return pipeline;
}

/**
 * Approve a story's spec gate (HITL, or Human Proxy headless). Records the
 * approval on the gate, then authorizes the ready transition by enqueuing the
 * story for the single build lane. Throws when the story is unknown.
 */
export function approveStoryGate(
  pipeline: StoryPipeline,
  storyId: string,
  opts: StoryGateApproval,
): StoryPipeline {
  const story = pipeline.stories[storyId];
  if (!story) throw new Error(`approveStoryGate: story ${storyId} is not in the pipeline`);
  const gate: StoryGateRecord = story.gate ?? { status: "open", history: [] };
  gate.status = "approved";
  gate.approver = opts.approver;
  gate.approved_at = opts.at;
  if (opts.spec_hash !== undefined) gate.spec_hash = opts.spec_hash;
  gate.history.push({
    action: "approved",
    at: opts.at,
    approver: opts.approver,
    ...(opts.spec_hash !== undefined ? { spec_hash: opts.spec_hash } : {}),
  });
  story.gate = gate;
  // The formal gate is what authorizes ready + queueing for build.
  enqueueReady(pipeline, storyId);
  return pipeline;
}

/**
 * Withdraw a story's previously-surfaced/approved gate (e.g. the HIL rescinds
 * after a problem is found). Pulls the story back out of the build flow: removed
 * from the ready queue if waiting, the lane freed if it was actively building,
 * and the story reset to `awaiting-gate`. Throws when the story has no gate.
 */
export function withdrawStoryGate(
  pipeline: StoryPipeline,
  storyId: string,
  opts: StoryGateWithdrawal,
): StoryPipeline {
  const story = pipeline.stories[storyId];
  if (!story || !story.gate) {
    throw new Error(`withdrawStoryGate: story ${storyId} has no gate to withdraw`);
  }
  markGateWithdrawn(story.gate, opts);
  const queued = pipeline.build_queue.indexOf(storyId);
  if (queued !== -1) pipeline.build_queue.splice(queued, 1);
  if (pipeline.build_active === storyId) pipeline.build_active = null;
  setStoryStatus(pipeline, storyId, "awaiting-gate");
  return pipeline;
}

/** Mark a spec gate withdrawn with the given decision metadata (shared by gate withdrawal + story discard). */
function markGateWithdrawn(
  gate: StoryGateRecord,
  opts: { approver: string; at: string; reason: string },
): void {
  gate.status = "withdrawn";
  gate.withdrawal_reason = opts.reason;
  gate.history.push({
    action: "withdrawn",
    at: opts.at,
    approver: opts.approver,
    reason: opts.reason,
  });
}

// --- Per-story experiment + PO acceptance (FEIP-7566) ----------------------

export interface CutExperimentArgs {
  slug: string;
  branch: string;
  /** The feature branch the experiment forks from. */
  parent: string;
  lakebase_branch_uid?: string;
  parent_sha?: string;
  /** 1 (default) or the count of competing experiments for an N>=2 race. */
  n?: number;
  at?: string;
}

/**
 * Record the experiment branch a dispatched story is being built on. Throws
 * when the story is unknown. (The actual branch fork is the experiment CLI's
 * job; this records the pipeline state.)
 */
export function cutStoryExperiment(
  pipeline: StoryPipeline,
  storyId: string,
  args: CutExperimentArgs,
): StoryPipeline {
  const story = pipeline.stories[storyId];
  if (!story) throw new Error(`cutStoryExperiment: story ${storyId} is not in the pipeline`);
  story.experiment = {
    slug: args.slug,
    branch: args.branch,
    parent: args.parent,
    ...(args.lakebase_branch_uid !== undefined ? { lakebase_branch_uid: args.lakebase_branch_uid } : {}),
    ...(args.parent_sha !== undefined ? { parent_sha: args.parent_sha } : {}),
    n: args.n ?? 1,
    status: "active",
    ...(args.at !== undefined ? { cut_at: args.at } : {}),
  };
  return pipeline;
}

/**
 * Build + deploy complete: move the active story to `awaiting-acceptance` for
 * PO review. The lane stays occupied (build_active unchanged) until the PO
 * decides, keeping the single build lane strictly serial.
 */
export function awaitAcceptance(pipeline: StoryPipeline, storyId: string): StoryPipeline {
  setStoryStatus(pipeline, storyId, "awaiting-acceptance");
  const story = pipeline.stories[storyId];
  if (!story.acceptance) story.acceptance = { decision: null, history: [] };
  return pipeline;
}

/** The story's PO acceptance record, or a default-pending record when absent. */
export function getStoryAcceptance(pipeline: StoryPipeline, storyId: string): StoryAcceptance {
  return pipeline.stories[storyId]?.acceptance ?? { decision: null, history: [] };
}

interface AcceptanceDecisionOpts {
  approver: string;
  at: string;
  reason?: string;
}

/** Record a PO acceptance decision on the story (shared by accept/discard/revise). */
function recordAcceptance(
  story: StoryEntry,
  decision: StoryAcceptanceDecision,
  opts: AcceptanceDecisionOpts,
): void {
  const acc: StoryAcceptance = story.acceptance ?? { decision: null, history: [] };
  acc.decision = decision;
  acc.approver = opts.approver;
  acc.at = opts.at;
  if (opts.reason !== undefined) acc.reason = opts.reason;
  acc.history.push({
    decision,
    at: opts.at,
    approver: opts.approver,
    ...(opts.reason !== undefined ? { reason: opts.reason } : {}),
  });
  story.acceptance = acc;
}

/** Free the single build lane if the given story is the active build. */
function freeLaneIfActive(pipeline: StoryPipeline, storyId: string): void {
  if (pipeline.build_active === storyId) pipeline.build_active = null;
}

/**
 * PO accepts the built story: record the decision, mark the experiment `merged`
 * (the experiment CLI does the actual git-merge + migrate), set the story
 * `done`, and free the lane. Throws when the story is unknown.
 */
export function acceptStory(
  pipeline: StoryPipeline,
  storyId: string,
  opts: { approver: string; at: string },
): StoryPipeline {
  const story = pipeline.stories[storyId];
  if (!story) throw new Error(`acceptStory: story ${storyId} is not in the pipeline`);
  recordAcceptance(story, "accepted", opts);
  if (story.experiment) {
    story.experiment.status = "merged";
    story.experiment.closed_at = opts.at;
  }
  setStoryStatus(pipeline, storyId, "done");
  freeLaneIfActive(pipeline, storyId);
  return pipeline;
}

/**
 * PO discards the built story: record the decision, mark the experiment
 * `discarded` (the CLI tears the branch down, code + schema vanish), withdraw
 * the spec gate (the story leaves the sprint), set the story `discarded`
 * (terminal), and free the lane. Throws when the story is unknown.
 */
export function discardStory(
  pipeline: StoryPipeline,
  storyId: string,
  opts: { approver: string; at: string; reason: string },
): StoryPipeline {
  const story = pipeline.stories[storyId];
  if (!story) throw new Error(`discardStory: story ${storyId} is not in the pipeline`);
  recordAcceptance(story, "discarded", opts);
  if (story.experiment) {
    story.experiment.status = "discarded";
    story.experiment.closed_at = opts.at;
  }
  if (story.gate) markGateWithdrawn(story.gate, opts);
  setStoryStatus(pipeline, storyId, "discarded");
  freeLaneIfActive(pipeline, storyId);
  return pipeline;
}

/**
 * PO sends the built story back for rework: record the decision, mark the
 * experiment `discarded` (torn down), reopen the spec gate, return the story to
 * `designing` (the design lane re-specs + re-cuts a fresh experiment), and free
 * the lane. Throws when the story is unknown.
 */
export function reviseStory(
  pipeline: StoryPipeline,
  storyId: string,
  opts: { approver: string; at: string; reason: string },
): StoryPipeline {
  const story = pipeline.stories[storyId];
  if (!story) throw new Error(`reviseStory: story ${storyId} is not in the pipeline`);
  recordAcceptance(story, "revise", opts);
  if (story.experiment) {
    story.experiment.status = "discarded";
    story.experiment.closed_at = opts.at;
  }
  if (story.gate) story.gate = { status: "open", history: story.gate.history };
  setStoryStatus(pipeline, storyId, "designing");
  freeLaneIfActive(pipeline, storyId);
  return pipeline;
}
