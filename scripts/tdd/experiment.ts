import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { createFeatureBranch } from "../lakebase/convention-branches";
import { deleteBranch } from "../lakebase/branch-delete";
import type { BranchLookupOpts, LakebaseBranchInfo } from "../lakebase/branch-utils";

function branchIdOf(info: LakebaseBranchInfo): string {
  const leaf = info.name.split("/").pop();
  if (!leaf) throw new Error(`could not derive branch_id from ${info.name}`);
  return leaf;
}

// Tag flavors mirror the AC layer values from the spec format. The Driver's
// tag-to-runner map keys off these (FEIP-7094): [API] → vitest, [E2E] →
// Playwright, [Infra] → migration / schema-diff smoke. The substrate keeps
// the names lowercase here; the spec format capitalises them ("API" / "E2E"
// / "Infra") for display.
export type ExperimentTag = "api" | "e2e" | "infra";

/** Title-case form (matches the AC schema enum). */
export type AcLayer = "API" | "E2E" | "Infra";

export interface TagOutcome {
  passed: number;
  failed: number;
}

/**
 * Convert the AC schema's title-case `layer` to the lowercase tag the
 * substrate uses internally (outcomes.by_tag keys, smell detectors,
 * markGreen runner-contract guard). One-way: tags never get title-cased
 * back at substrate boundaries.
 */
export function acLayerToTag(layer: AcLayer): ExperimentTag {
  switch (layer) {
    case "API":
      return "api";
    case "E2E":
      return "e2e";
    case "Infra":
      return "infra";
  }
}

/**
 * Idempotently bump the per-tag run counter on an outcomes record, AND
 * mirror the change into the top-level `tests_passed` / `tests_failed`
 * totals so those stay accurate. Mutates the passed object and returns
 * it so callers can chain a writeOutcomes() call.
 *
 * The substrate doesn't enforce that `by_tag` summed across tags equals
 * the totals (untagged tests are valid, mid-cycle reports drift), but
 * every call through this helper keeps them aligned.
 */
export function recordTagRun(
  outcomes: ExperimentOutcomes,
  tag: ExperimentTag,
  passed: boolean
): ExperimentOutcomes {
  const byTag = (outcomes.by_tag ??= {});
  const slot = (byTag[tag] ??= { passed: 0, failed: 0 });
  if (passed) {
    slot.passed += 1;
    outcomes.tests_passed = (outcomes.tests_passed ?? 0) + 1;
  } else {
    slot.failed += 1;
    outcomes.tests_failed = (outcomes.tests_failed ?? 0) + 1;
  }
  return outcomes;
}

/** Total runs (pass + fail) recorded for a given tag in outcomes. */
export function tagRunCount(outcomes: ExperimentOutcomes, tag: ExperimentTag): number {
  const slot = outcomes.by_tag?.[tag];
  return slot ? slot.passed + slot.failed : 0;
}

export interface ExperimentCap {
  /** Stable reason code so renderers and the orchestrator can dispatch. */
  reason: "max_cycles" | "max_wall_clock_minutes";
  /** Cycle number the cap fired on (cycles past this one are not run). */
  at_cycle: number;
  /** Wall-clock minutes elapsed when the cap fired (informational). */
  at_minutes?: number;
  /** Cap threshold from the plan, copied here so the renderer needn't look it up. */
  cap_value: number;
}

export interface ExperimentOutcomes {
  tests_passed?: number;
  tests_failed?: number;
  schema_diff_summary?: string;
  code_diff_lines?: number;
  status: "running" | "succeeded" | "failed" | "abandoned";
  // Per-tag breakdown. Each tag is optional (a project may not exercise
  // every flavor). When present, `tests_passed` + `tests_failed` remain
  // authoritative totals; `by_tag` is a breakdown for downstream renderers
  // (comparison report, feature-status) and the per-tag smell detectors
  // (e.g. e2e-row-perma-red in FEIP-7094). Sum across tags is not enforced
  // to match the totals – mid-cycle reporting and untagged tests are valid.
  by_tag?: Partial<Record<ExperimentTag, TagOutcome>>;
  /**
   * Per-experiment cap-hit record. Set by `recordExperimentCap` when
   * the orchestrator's `checkPerExperimentCap` fires. The comparison
   * report renders "capped" alongside pass/fail; the orchestrator
   * surfaces a remediation menu (continue / extend cap / abandon) to
   * the PO. Absent when the experiment ran within its caps.
   */
  capped?: ExperimentCap;
}

export interface CutExperimentArgs extends BranchLookupOpts {
  tddDir: string;
  featureId: string;
  experimentSlug: string;
  branch: string;
  parentBranch?: string;
  ttl?: string;
  notes?: string;
}

export interface ExperimentRecord {
  feature_id: string;
  experiment_slug: string;
  branch_id: string;
  created_at: string;
  dir: string;
}

export async function cutExperiment(args: CutExperimentArgs): Promise<ExperimentRecord> {
  const { tddDir, featureId, experimentSlug, branch, parentBranch, ttl, notes, ...lookup } = args;
  const branchInfo = await createFeatureBranch({ ...lookup, branch, parentBranch, ttl });
  const branchId = branchIdOf(branchInfo);

  const dir = join(tddDir, "experiments", featureId, experimentSlug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "branch.txt"), branchId);
  writeFileSync(
    join(dir, "notes.md"),
    notes ?? `# ${experimentSlug}\n\nExperiment cut from \`${parentBranch ?? "staging"}\`. Strategy + learning notes go here.\n`
  );
  const outcomes: ExperimentOutcomes = { status: "running" };
  writeFileSync(join(dir, "outcomes.json"), JSON.stringify(outcomes, null, 2) + "\n");
  writeFileSync(
    join(dir, "timeline.json"),
    JSON.stringify(
      { entries: [{ ts: new Date().toISOString(), kind: "cut", branch: branchId }] },
      null,
      2
    ) + "\n"
  );

  return {
    feature_id: featureId,
    experiment_slug: experimentSlug,
    branch_id: branchId,
    created_at: new Date().toISOString(),
    dir,
  };
}

export function listExperiments(tddDir: string, featureId: string): ExperimentRecord[] {
  const root = join(tddDir, "experiments", featureId);
  if (!existsSync(root)) return [];
  const out: ExperimentRecord[] = [];
  for (const slug of readdirSync(root)) {
    const dir = join(root, slug);
    if (!statSync(dir).isDirectory()) continue;
    const branchFile = join(dir, "branch.txt");
    if (!existsSync(branchFile)) continue;
    out.push({
      feature_id: featureId,
      experiment_slug: slug,
      branch_id: readFileSync(branchFile, "utf8").trim(),
      created_at: statSync(branchFile).birthtime.toISOString(),
      dir,
    });
  }
  return out;
}

export function readOutcomes(tddDir: string, featureId: string, slug: string): ExperimentOutcomes | null {
  const file = join(tddDir, "experiments", featureId, slug, "outcomes.json");
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

export function writeOutcomes(
  tddDir: string,
  featureId: string,
  slug: string,
  outcomes: ExperimentOutcomes
): void {
  const file = join(tddDir, "experiments", featureId, slug, "outcomes.json");
  writeFileSync(file, JSON.stringify(outcomes, null, 2) + "\n");
}

export interface DeleteExperimentArgs extends BranchLookupOpts {
  tddDir: string;
  featureId: string;
  experimentSlug: string;
  /** Delete the Lakebase branch as well. Default false; HITL-gated. */
  deleteBranchToo?: boolean;
}

export async function deleteExperiment(args: DeleteExperimentArgs): Promise<void> {
  const { tddDir, featureId, experimentSlug, deleteBranchToo, ...lookup } = args;
  const dir = join(tddDir, "experiments", featureId, experimentSlug);
  if (!existsSync(dir)) {
    throw new Error(`experiment ${featureId}/${experimentSlug} not found at ${dir}`);
  }
  if (deleteBranchToo) {
    const branchId = readFileSync(join(dir, "branch.txt"), "utf8").trim();
    await deleteBranch({ ...lookup, branch: branchId });
  }
  // The on-disk record is preserved by default so the experiment's notes + outcomes
  // remain available after the branch goes away.
}
