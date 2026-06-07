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
  "done",
] as const;
export type StoryStatus = (typeof STORY_STATUSES)[number];

export interface StoryPipeline {
  version: 1;
  feature_id: string;
  stories: Record<string, { status: StoryStatus }>;
  /** FIFO of gate-approved (ready) story ids waiting for the single build lane. */
  build_queue: string[];
  /** The story the single build lane is on, or null when idle. At most one. */
  build_active: string | null;
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

/** Set a story's status (creating its entry if new). Mutates + returns the pipeline. */
export function setStoryStatus(
  pipeline: StoryPipeline,
  storyId: string,
  status: StoryStatus,
): StoryPipeline {
  pipeline.stories[storyId] = { status };
  return pipeline;
}

/**
 * Gate-approved: mark the story `ready` and append it to the FIFO build queue.
 * Idempotent, re-enqueuing an already-queued story does not duplicate it.
 */
export function enqueueReady(pipeline: StoryPipeline, storyId: string): StoryPipeline {
  pipeline.stories[storyId] = { status: "ready" };
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
  pipeline.stories[next] = { status: "building" };
  return next;
}

/**
 * The active story finished building: mark it `done` and free the lane.
 * Returns the completed story id, or null when nothing was building.
 */
export function completeActive(pipeline: StoryPipeline): string | null {
  const done = pipeline.build_active;
  if (done === null) return null;
  pipeline.stories[done] = { status: "done" };
  pipeline.build_active = null;
  return done;
}
