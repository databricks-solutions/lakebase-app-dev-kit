// FEIP-7566: surface stale spikes and experiments as such (the PO asked that
// scm-doctor name them distinctly). Hermetic: classifies from the .tdd records
// alone, no live Lakebase calls.
//
// - Stale EXPERIMENT: a per-story experiment whose pipeline status is `active`
//   while the story itself is terminal (`done` or `discarded`). That means the
//   lane finished the story but the experiment branch was never merged or torn
//   down, so a paired Lakebase branch is likely lingering (a crashed
//   merge/discard). A healthy experiment ends `merged` or `discarded`.
// - Stale SPIKE: any spike with a recorded paired branch. Spikes are throwaway
//   by definition (only their learning carries forward), so a lingering paired
//   branch is a cost leak to flag.

import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { readPipeline } from "./story-pipeline";
import { listSpikes } from "./spike";
import { featuresDir as featuresDirOf } from "./tdd-paths.js";

export interface StaleBranchFinding {
  kind: "experiment" | "spike";
  slug: string;
  feature_id?: string;
  story_id?: string;
  /** The paired branch id, when known from the record. */
  branch?: string;
  reason: string;
}

/** Feature ids that have a pipeline.json (each dir under .tdd/features/). */
function listPipelineFeatures(tddDir: string): string[] {
  const featuresDir = featuresDirOf(tddDir);
  if (!existsSync(featuresDir)) return [];
  return readdirSync(featuresDir)
    .filter((d) => statSync(join(featuresDir, d)).isDirectory())
    .filter((d) => existsSync(join(featuresDir, d, "pipeline.json")))
    .sort();
}

/**
 * Classify stale spikes + experiments from the .tdd records. Returns labeled
 * findings (kind: "experiment" | "spike"); the caller (scm-doctor) surfaces
 * them as advisory warnings naming each kind.
 */
export function findStaleBranches(tddDir: string): StaleBranchFinding[] {
  const findings: StaleBranchFinding[] = [];

  for (const featureId of listPipelineFeatures(tddDir)) {
    const pipeline = readPipeline(tddDir, featureId);
    for (const [storyId, story] of Object.entries(pipeline.stories)) {
      const exp = story.experiment;
      if (!exp) continue;
      const storyTerminal = story.status === "done" || story.status === "discarded";
      if (exp.status === "active" && storyTerminal) {
        findings.push({
          kind: "experiment",
          slug: exp.slug,
          feature_id: pipeline.feature_id,
          story_id: storyId,
          branch: exp.branch,
          reason: `story is ${story.status} but its experiment branch is still active (merge/discard teardown likely failed); a paired Lakebase branch may be lingering`,
        });
      }
    }
  }

  for (const spike of listSpikes(tddDir)) {
    findings.push({
      kind: "spike",
      slug: spike.spike_slug,
      branch: spike.branch_id,
      reason: "spike has a paired branch; spikes are throwaway (only their learning carries forward), tear it down to reclaim the branch",
    });
  }

  return findings;
}
