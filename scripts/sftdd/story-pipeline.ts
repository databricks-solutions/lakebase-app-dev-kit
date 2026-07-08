// per-story pipeline state for the streaming design->build workflow.
// The design lane moves each story designing -> awaiting-gate -> ready; the single
// build lane consumes the FIFO build_queue (build_active) -> done. Persisted as
// .tdd/features/<F>/pipeline.json. Exactly one story builds at a time; the
// orchestrator owns these transitions.

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { pipelineJson, storiesDir as storiesDirOf, acsDir as acsDirOf } from "./sftdd-paths.js";

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

// Per-story spec gate (phase 2b). Mirrors the per-feature gates.ts
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

// Per-story experiment: build isolation. The story is built on an
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

// PO acceptance of a built story, distinct from the pre-build spec
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
  /** The experiment branch the story is built on. */
  experiment?: StoryExperiment;
  /** The PO's post-build accept/discard/revise decision. */
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

function pipelinePath(sftddDir: string, featureId: string): string {
  return pipelineJson(sftddDir, featureId);
}

/** Read .tdd/features/<F>/pipeline.json, or an empty pipeline when absent. */
export function readPipeline(sftddDir: string, featureId: string): StoryPipeline {
  const p = pipelinePath(sftddDir, featureId);
  if (!existsSync(p)) return initPipeline(featureId);
  return JSON.parse(readFileSync(p, "utf8")) as StoryPipeline;
}

export function writePipeline(sftddDir: string, pipeline: StoryPipeline): void {
  const p = pipelinePath(sftddDir, pipeline.feature_id);
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
 * Seed the pipeline from the on-disk breakdown: every `stories/<S>/` dir the
 * Spec Author's breakdown produced that the pipeline does not yet track is
 * added as `designing`. This is the breakdown -> pipeline bridge the
 * deterministic driver needs (the LLM orchestrator used to seed the pipeline
 * implicitly); without it the pipeline stays empty after breakdown and the
 * driver has no stories to stream. Idempotent: re-running adds nothing new.
 * Returns the newly-added ids + the full tracked set.
 */
export function syncBreakdownToPipeline(
  sftddDir: string,
  featureId: string,
): { added: string[]; total: string[] } {
  const storiesDir = storiesDirOf(sftddDir, featureId);
  const pipeline = readPipeline(sftddDir, featureId);
  const added: string[] = [];
  if (existsSync(storiesDir)) {
    for (const storyId of readdirSync(storiesDir).sort()) {
      let isDir = false;
      try {
        isDir = statSync(join(storiesDir, storyId)).isDirectory();
      } catch {
        isDir = false;
      }
      if (!isDir) continue;
      if (pipeline.stories[storyId] === undefined) {
        setStoryStatus(pipeline, storyId, "designing");
        added.push(storyId);
      }
    }
  }
  if (added.length > 0) writePipeline(sftddDir, pipeline);
  return { added, total: Object.keys(pipeline.stories) };
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

// --- Per-story draft guard -------------------------------
//
// The design lane streams ONE story's acceptance criteria at a time: draft S's
// ACs, surface S's gate, get it approved, THEN draft S+1. Nothing structural
// used to enforce that, so the Spec Author could batch every story's ACs in a
// single pass (observed repeatedly in live runs), which defeats the pipeline.
// findBatchedDraftStories is the forcing function the gate CLI calls before
// surfacing/approving a story: it returns every OTHER story that already has
// ACs on disk while still un-gated (status `designing`, or not in the pipeline
// at all). A non-empty result means the draft was batched; the CLI turns that
// into a hard error so the run can't proceed until the draft is one-story-scoped.

/** True when stories/<S>/acs/ holds at least one `*.json` AC artifact. */
function storyHasAcceptanceCriteria(sftddDir: string, featureId: string, storyId: string): boolean {
  const acsDir = acsDirOf(sftddDir, featureId, storyId);
  if (!existsSync(acsDir)) return false;
  return readdirSync(acsDir).some((f) => f.endsWith(".json"));
}

/**
 * Stories (other than `gatingStoryId`) that already have ACs on disk while
 * still un-gated, i.e. the Spec Author drafted more than the one story being
 * gated. A story legitimately has ACs once it is past `designing` (surfaced,
 * approved, building, ...); a story that has ACs while still `designing`, or
 * that has ACs without even being tracked in the pipeline, was drafted out of
 * turn. Scans the on-disk story dirs (not just pipeline.stories) so a batch
 * that never entered the pipeline is still caught. Returns the offending story
 * ids, sorted; empty when the draft is correctly scoped to one story.
 */
export function findBatchedDraftStories(
  sftddDir: string,
  featureId: string,
  pipeline: StoryPipeline,
  gatingStoryId: string,
): string[] {
  const storiesDir = storiesDirOf(sftddDir, featureId);
  if (!existsSync(storiesDir)) return [];
  const offenders: string[] = [];
  for (const storyId of readdirSync(storiesDir)) {
    if (storyId === gatingStoryId) continue;
    if (!storyHasAcceptanceCriteria(sftddDir, featureId, storyId)) continue;
    const status = pipeline.stories[storyId]?.status;
    // `designing` = not yet surfaced for its gate; undefined = not even tracked.
    // Either way ACs for it now means the draft ran ahead of the gate.
    if (status === undefined || status === "designing") offenders.push(storyId);
  }
  return offenders.sort();
}

// --- Per-story spec gate (phase 2b) -----------------------------

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

// --- Per-story experiment + PO acceptance ----------------------

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
