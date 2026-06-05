// SCM workflow phase B: claim a feature branch through the canonical path
// (FEIP-7458). The transition is `scaffold-complete | merged -> feature-claimed`.
//
// This module is the workflow-aware wrapper around the substrate primitive
// `createFeaturePairedBranch`. The phase B contract is:
//
//   1. Read .lakebase/workflow-state.json. Require state to be one of
//      {scaffold-complete, merged}. Other states refuse because they
//      would silently abandon an in-flight feature.
//   2. Resolve the Lakebase parent from tier_topology:
//        tier 1 -> project default branch (lakebase-side "main" or
//                 whatever the workspace called it at scaffold)
//        tier 2 -> "staging"
//        tier 3 -> "dev"
//   3. Sanitize the feature-id to a branch name (`feature/<slug>`).
//   4. Call createFeaturePairedBranch: Lakebase branch (30-day TTL) +
//      git branch + .env sync. Atomic via the substrate primitive.
//   5. Persist the new state to .lakebase/workflow-state.json with the
//      paired branch's UID and claim timestamp.
//
// The helper is pure-ish (filesystem + substrate side-effects, but the
// only "decision" surface is the precondition gate); the CLI in
// scm-claim-feature.cli.ts is a thin argv-to-options wrapper.

import * as fs from "node:fs";
import * as path from "node:path";
import { createFeaturePairedBranch } from "./convention-branches.js";
import type { CreatePairedBranchResult } from "./paired-branch.js";
import { sanitizeBranchName } from "../util/sanitize-branch-name.js";
import { getDefaultBranchId } from "./lakebase-project.js";
import {
  readWorkflowState,
  writeWorkflowState,
  type ScmWorkflowState,
} from "./scm-workflow-state.js";

export class ScmClaimError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "no-state-file"
      | "bad-precondition"
      | "missing-instance"
      | "invalid-feature-id"
      | "already-claimed-other",
  ) {
    super(message);
    this.name = "ScmClaimError";
  }
}

export interface ClaimFeatureBranchArgs {
  /** Project root (must contain .lakebase/workflow-state.json + .git/). */
  projectDir: string;
  /**
   * Raw feature identifier as the human typed it (e.g. "initial-domain"
   * or "F1-initial-domain"). Sanitized for the Lakebase + git branch.
   * The branch name is always `feature/<sanitized>`.
   */
  featureId: string;
  /**
   * Lakebase project id (instance). When omitted, the helper reads
   * project_id from the workflow-state file, which mirrors
   * LAKEBASE_PROJECT_ID from .env.
   */
  instance?: string;
  /**
   * Override the resolved parent branch. The default chain is
   * tier_topology -> {default | staging | dev}. Useful for hotfix
   * paths that need to fork from production even on a 2-tier project.
   */
  parentBranchOverride?: string;
  /**
   * When true, return a no-op success if the workflow is already in
   * feature-claimed for THE SAME feature-id (matched by sanitized
   * branch). Defaults to true; pass false to make repeat claims fail
   * loud. Distinct from `bad-precondition` because nothing is wrong;
   * the caller just re-ran the bin.
   */
  idempotent?: boolean;
  /** Optional clock injection for testability. Defaults to `new Date()`. */
  now?: () => Date;
}

export interface ClaimFeatureBranchResult {
  /** The new workflow-state record after the claim. */
  state: ScmWorkflowState;
  /** Substrate's paired-branch result (lakebase branch, git branch, env sync). */
  paired: CreatePairedBranchResult;
  /** True iff the call short-circuited because the feature was already claimed. */
  alreadyClaimed: boolean;
}

const STATES_ALLOWING_CLAIM: ScmWorkflowState["state"][] = [
  "scaffold-complete",
  "merged",
];

/**
 * Resolve the Lakebase parent branch name for a feature claim based on
 * the project's tier topology. Tier 1 has no named long-running tiers,
 * so the project's Lakebase default branch (whatever the workspace
 * called it at scaffold) is the parent.
 */
export async function resolveParentBranch(
  tierTopology: 1 | 2 | 3,
  instance: string,
): Promise<string> {
  switch (tierTopology) {
    case 1: {
      const def = await getDefaultBranchId({ projectId: instance });
      if (!def) {
        throw new ScmClaimError(
          `Tier-1 project ${instance} has no default Lakebase branch. Has it been scaffolded?`,
          "missing-instance",
        );
      }
      return def;
    }
    case 2:
      return "staging";
    case 3:
      return "dev";
  }
}

/**
 * Validate a feature-id is non-empty and sanitizes to a non-empty
 * branch suffix. Rejects raw input that would collapse to "" after
 * sanitization (e.g. "---") so the resulting `feature/` branch is
 * never just the prefix.
 */
export function sanitizeFeatureSlug(featureId: string): string {
  const trimmed = featureId.trim();
  if (trimmed.length === 0) {
    throw new ScmClaimError("feature-id is empty", "invalid-feature-id");
  }
  const sanitized = sanitizeBranchName(trimmed);
  // The substrate's sanitizer pads to 3 chars with "-x" and converts
  // non-alphanumeric to hyphens. An input like "---" therefore yields
  // "---", which is technically a Lakebase-legal id but is meaningless
  // as a feature identifier. Require at least one alphanumeric so the
  // resulting branch carries some signal from what the human typed.
  if (!/[a-z0-9]/.test(sanitized)) {
    throw new ScmClaimError(
      `feature-id ${JSON.stringify(featureId)} contains no letters/digits; choose an identifier with at least one alphanumeric.`,
      "invalid-feature-id",
    );
  }
  return sanitized;
}

/**
 * The CANONICAL feature branch name for a slug. A paired branch's git name
 * must equal its slash-less Lakebase branch id, so the canonical name is the
 * SANITIZED form ("feature-<slug>"), not a raw "feature/<slug>". Running the
 * input through `sanitizeBranchName` (the same function the substrate uses to
 * mint the Lakebase branch) makes this the single source of truth: callers,
 * the idempotency check, and assertions all reconstruct the identical name.
 */
export function featureBranchName(slug: string): string {
  return sanitizeBranchName(`feature/${slug}`);
}

/**
 * Phase B entry point. See module header for the contract.
 */
export async function claimFeatureBranch(
  args: ClaimFeatureBranchArgs,
): Promise<ClaimFeatureBranchResult> {
  // ─── 1. Read + check precondition ───────────────────────────────
  const current = readWorkflowState(args.projectDir);
  if (!current) {
    throw new ScmClaimError(
      `No SCM workflow state found at ${path.join(args.projectDir, ".lakebase/workflow-state.json")}. Run lakebase-create-project to scaffold, or re-seed via the substrate.`,
      "no-state-file",
    );
  }

  const slug = sanitizeFeatureSlug(args.featureId);
  const branch = featureBranchName(slug);
  const idempotent = args.idempotent !== false;

  if (current.state === "feature-claimed") {
    // Same-feature re-claim is an idempotent no-op. Both sides are the
    // canonical (sanitized) branch name now, so equality holds for a genuine
    // re-entry regardless of the case or slash/hyphen form the caller typed.
    if (idempotent && current.branch === branch) {
      return {
        state: current,
        paired: alreadyClaimedSentinel(current),
        alreadyClaimed: true,
      };
    }
    throw new ScmClaimError(
      `Cannot claim ${branch}: workflow is already at feature-claimed for "${current.feature_id ?? current.branch}". Finish it, or abandon it with lakebase-scm-abandon-feature.`,
      "already-claimed-other",
    );
  }

  if (!STATES_ALLOWING_CLAIM.includes(current.state)) {
    throw new ScmClaimError(
      `Cannot claim feature branch from state "${current.state}". Allowed predecessor states: ${STATES_ALLOWING_CLAIM.join(", ")}.`,
      "bad-precondition",
    );
  }

  // ─── 2. Resolve instance + parent branch ────────────────────────
  const instance = args.instance ?? current.project_id;
  if (!instance) {
    throw new ScmClaimError(
      `LAKEBASE_PROJECT_ID is missing. Pass --instance or set it in .env.`,
      "missing-instance",
    );
  }
  const parentBranch =
    args.parentBranchOverride ??
    (await resolveParentBranch(current.tier_topology, instance));

  // ─── 3. Cut the paired branch via the substrate primitive ───────
  const paired = await createFeaturePairedBranch({
    instance,
    branch,
    parentBranch,
    cwd: args.projectDir,
  });

  // ─── 4. Persist next state ──────────────────────────────────────
  const now = (args.now ?? (() => new Date()))();
  const next: ScmWorkflowState = {
    ...current,
    state: "feature-claimed",
    // Record the canonical feature id (case preserved, e.g. "F1-initial-domain")
    // so it matches the .tdd/features/<F> dir + downstream expectations. The
    // lowercased branch slug lives on `branch`, derived separately.
    feature_id: args.featureId.trim(),
    branch: paired.gitBranch,
    parent_branch: parentBranch,
    lakebase_branch_uid: paired.branch.uid,
    claimed_at: now.toISOString(),
    // Reset any later-state fields a previous merged cycle may have
    // left around. Keeping them would mark the new claim as past
    // pr-ready / ci-green which is not the case.
    pr_url: undefined,
    pushed_at: undefined,
    ci_run_url: undefined,
    ci_green_at: undefined,
    merged_at: undefined,
  };
  writeWorkflowState(args.projectDir, next);

  return { state: next, paired, alreadyClaimed: false };
}

/**
 * Construct a minimal CreatePairedBranchResult shaped sentinel for the
 * idempotent "already-claimed" return path. The substrate primitive is
 * not invoked, but callers still want a non-undefined `paired` field
 * with the recorded branch metadata for logging.
 */
function alreadyClaimedSentinel(
  state: ScmWorkflowState,
): CreatePairedBranchResult {
  return {
    branch: {
      // Reconstructed from the persisted state. Fields the CLI prints
      // (uid, name) are accurate; runtime-only fields (state) are
      // intentionally absent so a caller that diffs against a fresh
      // create cannot mistake this for a live branch.
      uid: state.lakebase_branch_uid as ReturnType<typeof String> &
        CreatePairedBranchResult["branch"]["uid"],
      // Use the on-disk branch name so this looks legitimate to any
      // logger that just stringifies the result.
      name: (state.branch ?? "") as CreatePairedBranchResult["branch"]["name"],
      // Best-effort: leave optional fields blank; they're omitted from
      // the type's required surface so a stripped sentinel still
      // satisfies the structural contract.
    } as CreatePairedBranchResult["branch"],
    gitBranch: state.branch ?? "",
    gitBranchCreated: false,
    envSynced: false,
    warnings: [],
  };
}

/** Cheap existence check used by the CLI before doing argv work. */
export function workflowStateFileExists(projectDir: string): boolean {
  return fs.existsSync(
    path.join(projectDir, ".lakebase/workflow-state.json"),
  );
}
