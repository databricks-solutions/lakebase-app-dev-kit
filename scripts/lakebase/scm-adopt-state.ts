// SCM workflow adoption (FEIP-7458 phase B+): seed .lakebase/workflow-state.json
// for projects that pre-date phase A.
//
// Inspects the current working-tree state (LAKEBASE_PROJECT_ID from .env,
// current git branch, Lakebase tier inventory) and constructs the most
// faithful workflow-state row we can reconstruct after-the-fact. The
// adopter cannot recover lost provenance (real claim time, PR URL, CI
// run history) without inputs the user provides, so the adopted state
// is conservative: long-running tier branch -> scaffold-complete, feature
// branch -> feature-claimed with claimed_at = now.
//
// Refuses to overwrite an existing .lakebase/workflow-state.json unless
// the caller passes force=true. There is no later-state adopter (pr-ready /
// ci-green / merged) in phase B+ because reconstructing the missing
// PR + CI invariants from gh would require a live API call; that lives
// behind a future `--reconcile` flag.

import {
  getBranchByName,
  listBranches,
  type LakebaseBranchInfo,
} from "./branch-utils.js";
import { getCurrentBranch } from "../git/inspect.js";
import {
  initWorkflowState,
  readWorkflowState,
  writeWorkflowState,
  type ScmWorkflowState,
  type TierTopology,
} from "./scm-workflow-state.js";

export class ScmAdoptError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "already-adopted"
      | "missing-instance"
      | "missing-current-branch"
      | "unrecognized-branch"
      | "lakebase-pair-missing",
  ) {
    super(message);
    this.name = "ScmAdoptError";
  }
}

export interface AdoptStateArgs {
  /** Project root (must contain .git/). */
  projectDir: string;
  /**
   * Lakebase project id. When omitted, callers should pre-resolve it
   * from .env (LAKEBASE_PROJECT_ID); the helper does not parse .env
   * itself to keep the dependency surface small.
   */
  instance: string;
  /**
   * Overwrite an existing workflow-state.json. Default: false (refuses
   * with `already-adopted`). The defensive default protects against
   * an adopter clobbering a state row that's mid-transition.
   */
  force?: boolean;
  /**
   * Clock injection for testability. Defaults to `new Date()`.
   */
  now?: () => Date;
}

export interface AdoptStateResult {
  /** Newly-written workflow-state row. */
  state: ScmWorkflowState;
  /** Diagnostic notes (e.g. "current branch is staging, treated as scaffold-complete"). */
  notes: string[];
}

/**
 * Decide the project's tier topology from its long-running tier branches.
 * Tier 1 = only the default branch (no `staging` / `dev`). Tier 2 = a
 * `staging` branch exists. Tier 3 = both `staging` and `dev` exist.
 * Detection is by branch name (the substrate convention); workspaces
 * that deviate from the convention will adopt as tier 1 and may pass
 * the correct value via a future --tier-topology flag.
 */
export function inferTierTopology(
  branches: LakebaseBranchInfo[],
): TierTopology {
  const names = new Set(
    branches.map((b) => b.name.split("/").pop() ?? ""),
  );
  if (names.has("dev") && names.has("staging")) return 3;
  if (names.has("staging")) return 2;
  return 1;
}

/**
 * Map an inferred tier topology to the parent-branch a feature would
 * have forked from. Mirrors the claim helper's resolveParentBranch.
 */
function parentForTier(
  topology: TierTopology,
  branches: LakebaseBranchInfo[],
): string {
  if (topology === 3) return "dev";
  if (topology === 2) return "staging";
  const def = branches.find((b) => b.isDefault === true);
  // Pull the leaf name (sanitized lakebase id) so the row matches what
  // the claim path would have recorded.
  return (def?.name.split("/").pop() ?? "main") as string;
}

const LONG_RUNNING_LEAFS = new Set(["staging", "dev"]);

/**
 * Convert a Lakebase branch info into the leaf name (`feature-x` from
 * `projects/p/branches/feature-x`). The branch-utils path-shaped name
 * field is the canonical reference; the leaf is what `.lakebase/`
 * stores.
 */
function leafName(b: LakebaseBranchInfo): string {
  return b.name.split("/").pop() ?? b.name;
}

export async function adoptScmState(
  args: AdoptStateArgs,
): Promise<AdoptStateResult> {
  if (!args.instance) {
    throw new ScmAdoptError(
      "Lakebase project id required (pass --instance or set LAKEBASE_PROJECT_ID in .env).",
      "missing-instance",
    );
  }

  const existing = readWorkflowState(args.projectDir);
  if (existing && !args.force) {
    throw new ScmAdoptError(
      `Workflow state already present at .lakebase/workflow-state.json (state: ${existing.state}). Pass --force to overwrite.`,
      "already-adopted",
    );
  }

  const notes: string[] = [];
  const currentBranch = await getCurrentBranch({ cwd: args.projectDir });
  if (!currentBranch) {
    throw new ScmAdoptError(
      "Could not resolve current git branch (detached HEAD?).",
      "missing-current-branch",
    );
  }

  const branches = await listBranches({ instance: args.instance });
  const topology = inferTierTopology(branches);
  notes.push(`Inferred tier_topology=${topology} from Lakebase branches.`);

  // Decide which state to seed based on the current git branch.
  //
  //   - default / staging / dev   -> scaffold-complete (no feature in flight)
  //   - feature/<slug>            -> feature-claimed (best-effort claim row)
  //   - anything else (hotfix/x?) -> refuse; the caller has to use --force
  //                                  with an explicit branch contract or
  //                                  rename the branch first
  const defaultBranch = branches.find((b) => b.isDefault === true);
  const defaultLeaf = defaultBranch ? leafName(defaultBranch) : null;
  const isLongRunningTier =
    LONG_RUNNING_LEAFS.has(currentBranch) ||
    (defaultLeaf !== null && currentBranch === defaultLeaf);

  const base = initWorkflowState({
    projectId: args.instance,
    tierTopology: topology,
  });

  if (isLongRunningTier) {
    notes.push(
      `Current git branch "${currentBranch}" is a long-running tier (default / staging / dev). Adopted state: scaffold-complete.`,
    );
    writeWorkflowState(args.projectDir, base);
    return { state: base, notes };
  }

  if (!currentBranch.startsWith("feature/")) {
    throw new ScmAdoptError(
      `Current git branch "${currentBranch}" is not a long-running tier or a feature/<slug> branch. The adopter cannot guess the workflow state; switch to the tier you want to seed from, or rename the working branch.`,
      "unrecognized-branch",
    );
  }

  // Resolve the Lakebase pair so we can record its UID. The substrate
  // sanitizer maps git branch "feature/initial-domain" to Lakebase id
  // "feature-initial-domain"; getBranchByName accepts the sanitized id.
  const sanitizedLeaf = currentBranch.replace(/\//g, "-");
  let pair: LakebaseBranchInfo | undefined;
  try {
    pair = await getBranchByName(sanitizedLeaf, { instance: args.instance });
  } catch {
    pair = undefined;
  }
  if (!pair) {
    throw new ScmAdoptError(
      `Git branch "${currentBranch}" has no matching Lakebase branch "${sanitizedLeaf}". The orphan must be paired (claim) or deleted before adoption.`,
      "lakebase-pair-missing",
    );
  }

  const now = (args.now ?? (() => new Date()))();
  const featureSlug = currentBranch.slice("feature/".length);
  const adopted: ScmWorkflowState = {
    ...base,
    state: "feature-claimed",
    feature_id: featureSlug,
    branch: currentBranch,
    parent_branch: parentForTier(topology, branches),
    lakebase_branch_uid: pair.uid,
    claimed_at: now.toISOString(),
  };
  writeWorkflowState(args.projectDir, adopted);
  notes.push(
    `Current branch "${currentBranch}" recognized as feature-claimed. Real claim time is unknown; recorded ${adopted.claimed_at} as adoption time.`,
  );
  return { state: adopted, notes };
}
