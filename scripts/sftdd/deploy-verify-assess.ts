// Deploy-verify self-heal (FEIP-7916). A feature-verify failure whose failing
// tests PASS when re-run in ISOLATION is shared-state contamination (a test that
// does not own its DB state, e.g. an absolute whole-table aggregate assertion),
// not broken software. Rather than the terminal deploy-verify HIL, the deploy
// classifies the failure and, when it is contamination, records a one-shot
// marker the orchestrator routes to a Navigator ASSESS -> Driver scope turn
// (reusing the build-lane green-failure assess machinery), then re-verifies.
//
// This module is the PURE core (no substrate, no process spawn): parse the
// failing node-ids, classify via an INJECTED isolation re-run, and persist +
// bound the marker. The deploy path wires the real isolation re-run
// (withEphemeralVerifyBranch); the orchestrator probe reads the marker.

import * as fs from "node:fs";
import * as path from "node:path";
import { findFeatureDir } from "./sftdd-paths.js";

/**
 * Parse pytest "FAILED <nodeid>" / "ERROR <nodeid>" lines from the combined
 * verify output. The node-id is the `path::test` form pytest prints in its
 * short summary, which can be fed straight back to `pytest <nodeid> ...` for
 * the isolation re-run. Deduped + order-preserving.
 */
export function parseFailedNodeIds(output: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const line of output.split("\n")) {
    const m = line.match(/^(?:FAILED|ERROR)\s+(\S+::[^\s]+)/);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      ids.push(m[1]);
    }
  }
  return ids;
}

export interface DeployVerifyAssessMarker {
  version: 1;
  story_id: string;
  /** The pytest node-ids that failed in the full suite but the classifier found
   *  pass in isolation , the contamination-fragile tests to scope. */
  failing_node_ids: string[];
  /** True once the Navigator has assessed this failure (flagged the tests to
   *  scope or declared a genuine regression). Set by the assess-finalize step. */
  assessed: boolean;
  /** Assess+scope attempts spent. One-shot: at 1, the marker stops being
   *  assess-eligible and a repeat deploy-verify failure takes the terminal HIL. */
  attempts: number;
}

/** The marker lives at story scope, next to the story's deploy-evidence.json. */
function markerPath(sftddDir: string, featureId: string, storyId: string): string | undefined {
  const fdir = findFeatureDir(sftddDir, featureId);
  if (!fdir) return undefined;
  return path.join(fdir, "stories", storyId, "deploy-verify-assess.json");
}

export function readDeployVerifyAssessMarker(
  sftddDir: string,
  featureId: string,
  storyId: string,
): DeployVerifyAssessMarker | undefined {
  const file = markerPath(sftddDir, featureId, storyId);
  if (!file || !fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as DeployVerifyAssessMarker;
  } catch {
    return undefined;
  }
}

/** Record a fresh contamination marker (assessed:false, attempts:0). Idempotent
 *  on re-detection of the same failure: it refreshes the failing node-ids but
 *  preserves the spent `attempts` so the one-shot bound is not reset by a repeat
 *  deploy of the same story. */
export function writeDeployVerifyAssessMarker(
  sftddDir: string,
  featureId: string,
  storyId: string,
  failingNodeIds: string[],
): string | undefined {
  const file = markerPath(sftddDir, featureId, storyId);
  if (!file) return undefined;
  const prior = readDeployVerifyAssessMarker(sftddDir, featureId, storyId);
  const marker: DeployVerifyAssessMarker = {
    version: 1,
    story_id: storyId,
    failing_node_ids: failingNodeIds,
    assessed: false,
    attempts: prior?.attempts ?? 0,
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(marker, null, 2) + "\n", "utf8");
  return file;
}

/** Mark the failure assessed (the Navigator turn ran) and count the attempt, so
 *  the next probe finds it no longer assess-eligible until the re-verify clears
 *  or re-detects it. */
export function markDeployVerifyAssessed(
  sftddDir: string,
  featureId: string,
  storyId: string,
): void {
  const file = markerPath(sftddDir, featureId, storyId);
  const m = readDeployVerifyAssessMarker(sftddDir, featureId, storyId);
  if (!file || !m) return;
  m.assessed = true;
  m.attempts += 1;
  fs.writeFileSync(file, JSON.stringify(m, null, 2) + "\n", "utf8");
}

/** Clear the marker (the re-verify passed , the scope worked). */
export function clearDeployVerifyAssessMarker(
  sftddDir: string,
  featureId: string,
  storyId: string,
): void {
  const file = markerPath(sftddDir, featureId, storyId);
  if (file && fs.existsSync(file)) fs.rmSync(file);
}

/** One-shot bound: a contamination marker is assess-eligible while it exists,
 *  is not yet assessed, and is under the single-attempt cap. */
export function deployVerifyNeedsAssess(
  sftddDir: string,
  featureId: string,
  storyId: string,
): boolean {
  const m = readDeployVerifyAssessMarker(sftddDir, featureId, storyId);
  return !!m && !m.assessed && m.attempts < 1;
}

/**
 * Classify a feature-verify failure. Re-run the failing node-ids in ISOLATION
 * (a fresh clean DB, injected by the deploy path). If they ALL pass alone, the
 * failure was shared-state contamination (self-healable via a scope turn); if
 * any still fails alone, it is genuine broken software (the terminal HIL). With
 * no parseable node-ids there is nothing to isolate, so it is treated as genuine.
 */
export async function classifyDeployVerifyFailure(
  failingNodeIds: string[],
  runIsolated: (nodeIds: string[]) => Promise<boolean>,
): Promise<"contamination" | "genuine"> {
  if (failingNodeIds.length === 0) return "genuine";
  const passedAlone = await runIsolated(failingNodeIds);
  return passedAlone ? "contamination" : "genuine";
}
