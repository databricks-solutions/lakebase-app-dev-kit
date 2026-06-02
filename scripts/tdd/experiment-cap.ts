// Per-experiment cost/timeout cap. Race-level budget
// (concurrent_branches, wall_clock_minutes across all experiments)
// does not cover "one runaway experiment burns the budget while two
// healthy ones finish." This module is the single seam the
// orchestrator calls each cycle to ask "should I cap this one?" and
// record the decision back onto outcomes.json.
//
// Cap semantics:
//   - `max_cycles` cap fires when an experiment has accumulated
//     >= max_cycles cycles. The cycle that pushes the count to the
//     threshold is the at_cycle; further cycles are refused.
//   - `max_wall_clock_minutes` cap fires when an experiment's elapsed
//     wall-clock crosses the threshold. Elapsed is computed from the
//     timeline.json's first "cut" entry (when present) and the caller's
//     `now` (defaults to Date.now()).
//
// A capped experiment's outcome status is NOT auto-changed (the PO
// chooses continue / extend / abandon at the remediation prompt).
// The status flip happens explicitly via the existing
// writeOutcomes / promoteExperiment paths.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { readOutcomes, writeOutcomes, type ExperimentCap, type ExperimentOutcomes } from "./experiment";
import type { PerExperimentCap } from "./design-spec-gate";

export interface CheckPerExperimentCapArgs {
  tddDir: string;
  featureId: string;
  experimentSlug: string;
  /**
   * Per-experiment cap from the plan. Pass
   * `plan.budget.per_experiment` directly. Undefined or empty = no
   * cap; the helper returns `{ capped: false }`.
   */
  cap?: PerExperimentCap;
  /**
   * Cycle count for this experiment so far. Caller supplies this so
   * the helper stays a pure function over disk reads it can do
   * itself + the one piece of context it cannot.
   */
  cycleCount: number;
  /**
   * Override for the timestamp used to compute elapsed wall-clock.
   * Defaults to `Date.now()`. The BDD harness passes a fixed value.
   */
  now?: number;
}

export interface CheckPerExperimentCapResult {
  capped: boolean;
  /** Populated when `capped` is true. */
  hit?: ExperimentCap;
}

/**
 * Pure check: should this experiment be capped right now? Reads
 * timeline.json from disk to compute elapsed wall-clock when a
 * wall-clock cap is configured. Does NOT mutate outcomes.json;
 * `recordExperimentCap` is the writer.
 *
 * Cycle cap evaluates before wall-clock cap so a cycle-bound
 * experiment that is also slow returns the cycle reason
 * (deterministic for the BDD harness; both are informational
 * anyway).
 */
export function checkPerExperimentCap(args: CheckPerExperimentCapArgs): CheckPerExperimentCapResult {
  const cap = args.cap;
  if (!cap) return { capped: false };

  if (cap.max_cycles && cap.max_cycles > 0 && args.cycleCount >= cap.max_cycles) {
    return {
      capped: true,
      hit: {
        reason: "max_cycles",
        at_cycle: args.cycleCount,
        cap_value: cap.max_cycles,
      },
    };
  }

  if (cap.max_wall_clock_minutes && cap.max_wall_clock_minutes > 0) {
    const startedAtMs = readExperimentStartMs(args.tddDir, args.featureId, args.experimentSlug);
    if (startedAtMs !== undefined) {
      const now = args.now ?? Date.now();
      const elapsedMin = (now - startedAtMs) / 60_000;
      if (elapsedMin >= cap.max_wall_clock_minutes) {
        return {
          capped: true,
          hit: {
            reason: "max_wall_clock_minutes",
            at_cycle: args.cycleCount,
            at_minutes: Math.round(elapsedMin * 10) / 10,
            cap_value: cap.max_wall_clock_minutes,
          },
        };
      }
    }
  }

  return { capped: false };
}

export interface RecordExperimentCapArgs {
  tddDir: string;
  featureId: string;
  experimentSlug: string;
  hit: ExperimentCap;
}

/**
 * Persist a cap-hit onto outcomes.json. Idempotent: re-running with
 * the same `hit` is a no-op; passing a different `hit` overwrites the
 * existing record (the orchestrator's "extend cap" path eventually
 * clears it via `clearExperimentCap`).
 *
 * Throws if outcomes.json does not exist (cutExperiment has not run
 * yet, so there is nothing to cap).
 */
export function recordExperimentCap(args: RecordExperimentCapArgs): ExperimentOutcomes {
  const outcomes = readOutcomes(args.tddDir, args.featureId, args.experimentSlug);
  if (!outcomes) {
    throw new Error(
      `recordExperimentCap: outcomes.json not found for ${args.featureId}/${args.experimentSlug}`
    );
  }
  outcomes.capped = { ...args.hit };
  writeOutcomes(args.tddDir, args.featureId, args.experimentSlug, outcomes);
  return outcomes;
}

/**
 * Clear a previously-recorded cap (PO chose "extend cap" or
 * "continue"). No-op when no cap is currently recorded.
 */
export function clearExperimentCap(args: {
  tddDir: string;
  featureId: string;
  experimentSlug: string;
}): ExperimentOutcomes | null {
  const outcomes = readOutcomes(args.tddDir, args.featureId, args.experimentSlug);
  if (!outcomes) return null;
  if (!outcomes.capped) return outcomes;
  delete outcomes.capped;
  writeOutcomes(args.tddDir, args.featureId, args.experimentSlug, outcomes);
  return outcomes;
}

function readExperimentStartMs(
  tddDir: string,
  featureId: string,
  slug: string
): number | undefined {
  const file = join(tddDir, "experiments", featureId, slug, "timeline.json");
  if (!existsSync(file)) return undefined;
  try {
    const payload = JSON.parse(readFileSync(file, "utf8")) as {
      entries?: Array<{ ts?: string; kind?: string }>;
    };
    const cut = payload.entries?.find((e) => e.kind === "cut");
    if (!cut?.ts) return undefined;
    const ms = Date.parse(cut.ts);
    return Number.isFinite(ms) ? ms : undefined;
  } catch {
    return undefined;
  }
}
