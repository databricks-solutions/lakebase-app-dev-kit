// SCM workflow phase C: scan + recover orphan git branches.
//
// An "orphan" is a local git branch that:
//   1. Is not a long-running tier branch (default / staging / dev).
//   2. Is named feature/<slug> (the kit convention) OR is otherwise a
//      candidate for retroactive claim.
//   3. Has NO matching Lakebase branch (when the leaf is sanitized).
//
// Before phase C, the post-checkout hook silently created Lakebase
// branches for orphan git branches as a fallback. Phase C retires the
// fallback; this helper is the explicit migration path. The detect-
// only mode (default) lists orphans for inspection; pass claim=true to
// retroactively pair each one through the substrate primitive (which
// records workflow-state appropriately, with caveats around an already-
// in-flight feature row noted in the return shape).

import {
  listBranches,
  type LakebaseBranchInfo,
} from "./branch-utils.js";
import { createFeaturePairedBranch } from "./convention-branches.js";
import { listLocalBranches } from "../git/branches.js";
import {
  inferTierTopology,
} from "./scm-adopt-state.js";
import {
  readWorkflowState,
  writeWorkflowState,
  type ScmWorkflowState,
  type TierTopology,
} from "./scm-workflow-state.js";
import { sanitizeBranchName } from "../util/sanitize-branch-name.js";

export class ScmRecoverError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "missing-instance"
      | "claim-conflict"
      | "substrate-failure",
  ) {
    super(message);
    this.name = "ScmRecoverError";
  }
}

export interface RecoverOrphansArgs {
  projectDir: string;
  /**
   * Lakebase project id. Required because the helper compares git +
   * Lakebase branch inventories. Resolve from .env at the CLI layer.
   */
  instance: string;
  /**
   * When true, retroactively pair every orphan via createFeaturePairedBranch.
   * Default: false (detect-only). The default avoids surprises: a user
   * can run this to inspect the orphan list, then decide whether to
   * claim, branch-by-branch, or fix .lakebase/workflow-state.json
   * manually.
   */
  claim?: boolean;
  /**
   * Limit claim work to a specific branch name. Useful when one orphan
   * is known + the rest are intentional (e.g. release-engineering
   * branches the maintainer wants to keep orphan).
   */
  onlyBranch?: string;
  /**
   * Clock injection for testability.
   */
  now?: () => Date;
}

export interface OrphanCandidate {
  /** Local git branch name (e.g. "feature/initial-domain"). */
  gitBranch: string;
  /** Sanitized Lakebase branch id (e.g. "feature-initial-domain"). */
  sanitized: string;
  /** True iff this is HEAD's current branch. Claiming HEAD is allowed but flagged. */
  isCurrent: boolean;
  /** Reason a branch was classified an orphan. */
  reason: string;
}

export interface ClaimedOrphan {
  candidate: OrphanCandidate;
  /** Lakebase UID assigned by the substrate. */
  lakebaseBranchUid: string;
  /** True iff the workflow-state.json row was updated to feature-claimed. */
  stateUpdated: boolean;
  /** Diagnostic warnings from the substrate. */
  warnings: string[];
}

export interface RecoverOrphansResult {
  /** Inferred tier topology (mirrors adopt). */
  tierTopology: TierTopology;
  /** All orphan candidates detected. */
  orphans: OrphanCandidate[];
  /**
   * Branches in the working tree that we intentionally skipped (tier
   * branches, default branch). Included so the CLI can render a
   * "considered but not orphaned" line for transparency.
   */
  skipped: Array<{ gitBranch: string; reason: string }>;
  /** Orphans that were retroactively claimed (only populated when claim=true). */
  claimed: ClaimedOrphan[];
  /** Whether the workflow-state row was updated (only when a SINGLE claim was made). */
  stateUpdatedFor?: string;
}

// "main" / "master" are git's default-branch names; "staging" / "dev"
// are the kit's tier-branch leaves. None of them are orphans: each is
// a long-running tier (the Lakebase side may pair them with
// "production" / "staging" / "dev", but the git side keeps the
// conventional name). Without "main" here, every fresh project shows
// its default branch as an orphan, which is wrong.
const TIER_LEAFS = new Set(["staging", "dev", "main", "master"]);

export async function recoverOrphans(
  args: RecoverOrphansArgs,
): Promise<RecoverOrphansResult> {
  if (!args.instance) {
    throw new ScmRecoverError(
      "Lakebase project id required (--instance / LAKEBASE_PROJECT_ID).",
      "missing-instance",
    );
  }

  const lakebaseBranches = await listBranches({ instance: args.instance });
  const tierTopology = inferTierTopology(lakebaseBranches);
  const lakebaseLeafs = new Set(
    lakebaseBranches.map((b) => leafName(b)),
  );
  const defaultLeaf = leafName(
    lakebaseBranches.find((b) => b.isDefault === true),
  );

  const gitBranches = await listLocalBranches({ cwd: args.projectDir });

  const orphans: OrphanCandidate[] = [];
  const skipped: RecoverOrphansResult["skipped"] = [];
  for (const gb of gitBranches) {
    if (gb.isRemote) continue;
    const name = gb.name;
    if (TIER_LEAFS.has(name)) {
      skipped.push({ gitBranch: name, reason: "tier branch" });
      continue;
    }
    if (defaultLeaf && name === defaultLeaf) {
      skipped.push({ gitBranch: name, reason: "default branch" });
      continue;
    }
    const sanitized = sanitizeBranchName(name);
    if (lakebaseLeafs.has(sanitized)) {
      skipped.push({
        gitBranch: name,
        reason: `paired Lakebase branch "${sanitized}" exists`,
      });
      continue;
    }
    // Anything else is an orphan candidate. We do NOT enforce a
    // feature/<slug> prefix here: phase C's recover bin is the escape
    // hatch for any non-tier git branch without a Lakebase pair, and
    // the user may have hand-rolled branch names that pre-date the kit.
    orphans.push({
      gitBranch: name,
      sanitized,
      isCurrent: gb.isCurrent === true,
      reason: name.startsWith("feature/")
        ? "feature/<slug> branch with no Lakebase pair"
        : `non-tier git branch "${name}" with no Lakebase pair`,
    });
  }

  const result: RecoverOrphansResult = {
    tierTopology,
    orphans,
    skipped,
    claimed: [],
  };

  if (!args.claim || orphans.length === 0) {
    return result;
  }

  // The claim path can only safely update workflow-state.json for ONE
  // orphan: the workflow row is single-feature in v1. If multiple
  // orphans exist, we claim each Lakebase pair but leave the state
  // row alone (or set it to whichever orphan matches the current HEAD,
  // if any). This is conservative and visible: the result objects say
  // exactly which orphan got the state-row update.
  const parentBranch = parentForTopology(tierTopology, defaultLeaf);
  const currentState = readWorkflowState(args.projectDir);
  const candidates = args.onlyBranch
    ? orphans.filter((o) => o.gitBranch === args.onlyBranch)
    : orphans;
  if (args.onlyBranch && candidates.length === 0) {
    throw new ScmRecoverError(
      `No orphan found for --only-branch ${args.onlyBranch}.`,
      "claim-conflict",
    );
  }

  const headOrphan = candidates.find((o) => o.isCurrent);
  const stateTargetOrphan = headOrphan ?? candidates[0];

  for (const orphan of candidates) {
    try {
      const paired = await createFeaturePairedBranch({
        instance: args.instance,
        branch: orphan.gitBranch,
        parentBranch,
        cwd: args.projectDir,
        // The git branch already exists on disk; the substrate primitive
        // is idempotent on the git side (it'll checkout the existing
        // branch rather than fail) but if the project is not on this
        // branch, we want a no-op git side. Leaving the default true is
        // OK: if the git branch already matches, the checkout is a
        // no-op; if the branch isn't HEAD, the substrate switches to it
        // which is what the user implicitly asked for by including the
        // branch.
      });
      let stateUpdated = false;
      if (orphan === stateTargetOrphan) {
        const next: ScmWorkflowState = {
          ...(currentState ?? {
            $schema: "./scm-workflow-state.schema.json",
            version: 1 as const,
            state: "scaffold-complete" as const,
            tier_topology: tierTopology,
            project_id: args.instance,
          }),
          state: "feature-claimed",
          feature_id: orphan.gitBranch.replace(/^feature\//, ""),
          branch: paired.gitBranch,
          parent_branch: parentBranch,
          lakebase_branch_uid: paired.branch.uid,
          claimed_at: (args.now ?? (() => new Date()))().toISOString(),
          pr_url: undefined,
          pushed_at: undefined,
          ci_run_url: undefined,
          ci_green_at: undefined,
          merged_at: undefined,
        };
        writeWorkflowState(args.projectDir, next);
        stateUpdated = true;
        result.stateUpdatedFor = orphan.gitBranch;
      }
      result.claimed.push({
        candidate: orphan,
        lakebaseBranchUid: paired.branch.uid,
        stateUpdated,
        warnings: paired.warnings,
      });
    } catch (err) {
      throw new ScmRecoverError(
        `Substrate claim failed for ${orphan.gitBranch}: ${err instanceof Error ? err.message : String(err)}`,
        "substrate-failure",
      );
    }
  }
  return result;
}

function leafName(b: LakebaseBranchInfo | undefined): string {
  if (!b) return "";
  return b.name.split("/").pop() ?? b.name;
}

function parentForTopology(t: TierTopology, defaultLeaf: string): string {
  if (t === 3) return "dev";
  if (t === 2) return "staging";
  return defaultLeaf || "main";
}
