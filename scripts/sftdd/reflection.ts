// Pre-build reflection gate (speed lever #3): the Navigator, in a "reflect"
// mode, critiques a story's spec slice + test-list BEFORE the build lane and
// writes a per-story verdict. This module owns the verdict artifact + the
// DETERMINISTIC post-turn gate that translates a failed verdict into the
// spec-level blocking smell the existing revise-route/escalation machinery
// already handles (route to the owning author, bounded one revise, then HITL).
//
// Splitting "the LLM writes a verdict" from "the code flags the smell" keeps the
// routing deterministic: the critic only has to record WHAT it found + WHO owns
// it; the orchestrator, not the model, decides the smell + escalation.
//
// Per-story + per-feature isolation: the verdict lives at
// features/<F>/stories/<S>/reflect-verdict.json and the smell carries story_id,
// so concurrent stories/features never share reflect state.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { reflectVerdictJson } from "./sftdd-paths.js";
import { writeSmellsLog, type SmellHit, type SmellName } from "./smells.js";

/** Who owns the fix for a reflection finding, and thus which smell/gate it
 *  routes to: the Spec Author (spec gate) or the Test Strategist (test_list). */
export type ReflectOwner = "spec-author" | "test-strategist";

export interface ReflectFinding {
  /** Which author must fix it (drives the smell + the revise-route). */
  owner: ReflectOwner;
  /** The specific defect (a contradiction, coverage gap, layer conflict, ...). */
  detail: string;
}

export interface ReflectVerdict {
  version: 1;
  /** True iff the spec slice + test-list are internally consistent + buildable. */
  passed: boolean;
  /** The defects found (empty when passed). */
  findings: ReflectFinding[];
}

/** The smell a given owner's finding routes to (see smells.ts SMELL_CATALOG). */
const SMELL_FOR_OWNER: Record<ReflectOwner, SmellName> = {
  "spec-author": "reflect-spec-defect",
  "test-strategist": "reflect-testlist-defect",
};

/** Write a story's reflect verdict (the Navigator reflect turn's output). */
export function writeReflectVerdict(
  tddDir: string,
  feature: string,
  story: string,
  verdict: ReflectVerdict,
): void {
  const p = reflectVerdictJson(tddDir, feature, story);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(verdict, null, 2) + "\n");
}

/** Read a story's reflect verdict, or undefined when none has been written. */
export function readReflectVerdict(
  tddDir: string,
  feature: string,
  story: string,
): ReflectVerdict | undefined {
  const p = reflectVerdictJson(tddDir, feature, story);
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as ReflectVerdict;
  } catch {
    return undefined;
  }
}

/** The design-lane predicate: has this story's reflection PASSED? A missing or
 *  failed verdict is not passed (the design lane runs / re-runs the critic; a
 *  failed verdict drives the smell + escalation elsewhere). */
export function reflectionPassed(tddDir: string, feature: string, story: string): boolean {
  return readReflectVerdict(tddDir, feature, story)?.passed === true;
}

/** Did the reflect turn produce a readable verdict at all (pass OR fail)? The
 *  reflect turn's deliverable is the verdict file; a passed:false verdict is a
 *  VALID deliverable (it drives the smell + revise-route). This distinguishes
 *  "the critic ran and produced a verdict" from "no verdict on disk", so the
 *  driver can guard a reflect turn that produced nothing (escalate) instead of
 *  silently re-invoking it into a stall. */
export function reflectionVerdictWritten(tddDir: string, feature: string, story: string): boolean {
  return readReflectVerdict(tddDir, feature, story) !== undefined;
}

/**
 * The DETERMINISTIC reflection gate: read the story's verdict and, when it did
 * NOT pass, flag the spec-level blocking smell(s) for the owning author(s),
 * scoped to the story, so the existing revise-route/escalation machinery routes
 * + bounds + escalates. A passed (or absent) verdict flags nothing. Returns the
 * smell hits written (empty when passed). Idempotency + the one-revise bound are
 * the smell log's job (priorReviseCount), so re-running after a revise re-flags
 * and the cap then escalates to HITL.
 */
export function recordReflectionGate(tddDir: string, feature: string, story: string): SmellHit[] {
  const verdict = readReflectVerdict(tddDir, feature, story);
  if (!verdict || verdict.passed) return [];
  // One smell per DISTINCT owner among the findings (a story can have both a
  // spec defect and a test-list defect; each routes to its own author).
  const owners = new Set<ReflectOwner>(verdict.findings.map((f) => f.owner));
  // Defensive: a failed verdict with no attributed owner still must block, not
  // silently pass. Attribute an unowned failure to the spec author (the spec is
  // the upstream source of most design defects).
  if (owners.size === 0) owners.add("spec-author");
  const hits: SmellHit[] = [...owners].map((owner) => {
    const detail = verdict.findings
      .filter((f) => f.owner === owner)
      .map((f) => f.detail)
      .join("; ");
    return {
      smell: SMELL_FOR_OWNER[owner],
      cycle_ids: [],
      detail: `reflection gate: ${detail || "unattributed design defect"}`,
      story_id: story,
    };
  });
  writeSmellsLog(tddDir, hits);
  return hits;
}
