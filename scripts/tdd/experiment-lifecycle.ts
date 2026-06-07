// FEIP-7566 phase 2: the branch-ops side of a per-story experiment's lifecycle.
//
// A story is built on an experiment branch (an ephemeral paired Lakebase branch
// forked from the feature branch HEAD). On PO accept the experiment is MERGED
// into the feature branch; on discard/revise it is torn down with no trace. The
// merge is a real git-merge PLUS running the merged story's migration scripts
// against the feature branch's Lakebase branch DB, so the feature's database is
// brought up to the merged story's schema.
//
// This module is the ORCHESTRATION: the order of operations + their failure
// semantics. The side-effectful operations (git merge, migration run, branch
// teardown) are injected via ExperimentBranchOps so the sequencing is
// hermetically testable; the CLI wires the real implementations (git/branch-tag
// mergeBranch, lakebase/schema-migrate applySchemaMigrations, experiment
// deleteExperiment). The pipeline-state transitions (acceptStory / discardStory)
// live in story-pipeline.ts and are recorded by the orchestrator alongside these
// branch ops.

export interface GitMergeArgs {
  /** The experiment branch to merge from. */
  from: string;
  /** The feature branch to merge into. */
  into: string;
  projectDir: string;
}

export interface RunMigrationsArgs {
  /** Lakebase instance id. */
  instance: string;
  /** The feature branch whose Lakebase branch DB the migrations run against. */
  branch: string;
  projectDir: string;
}

export interface TeardownArgs {
  tddDir: string;
  featureId: string;
  storyId: string;
  experimentSlug: string;
  /** Lakebase instance id (the teardown deletes the experiment's paired branch). */
  instance: string;
}

/**
 * The injected side-effectful operations. Defaults wire the real substrate in
 * the CLI; tests pass fakes to assert the orchestration order + failure
 * handling without touching git or Lakebase.
 */
export interface ExperimentBranchOps {
  /** Local git-merge of the experiment branch into the feature branch. */
  gitMerge(args: GitMergeArgs): Promise<void>;
  /** Run the merged story's migrations against the feature branch's Lakebase branch DB. */
  runMigrations(args: RunMigrationsArgs): Promise<void>;
  /** Tear down the experiment's git + Lakebase branch (no trace). */
  teardown(args: TeardownArgs): Promise<void>;
}

export interface MergeExperimentArgs {
  tddDir: string;
  featureId: string;
  storyId: string;
  experimentSlug: string;
  /** The feature branch (git + Lakebase) the experiment merges into. */
  featureBranch: string;
  /** The experiment branch (git) being merged. */
  experimentBranch: string;
  /** Lakebase instance id. */
  instance: string;
  projectDir: string;
}

export interface MergeExperimentResult {
  merged: true;
  feature_branch: string;
  experiment_slug: string;
}

/**
 * PO-accept mechanics: git-merge the experiment into the feature branch, run the
 * story's migrations against the feature branch's Lakebase DB, THEN tear down
 * the experiment branch. Ordered + fail-closed: if the merge throws the
 * migrations + teardown are skipped (the experiment is preserved for retry); if
 * the migrations throw the teardown is skipped (preserved for diagnosis). The
 * experiment branch is only torn down once its code + schema are safely on the
 * feature branch.
 */
export async function mergeExperimentIntoFeature(
  args: MergeExperimentArgs,
  ops: ExperimentBranchOps,
): Promise<MergeExperimentResult> {
  await ops.gitMerge({ from: args.experimentBranch, into: args.featureBranch, projectDir: args.projectDir });
  await ops.runMigrations({ instance: args.instance, branch: args.featureBranch, projectDir: args.projectDir });
  await ops.teardown({
    tddDir: args.tddDir,
    featureId: args.featureId,
    storyId: args.storyId,
    experimentSlug: args.experimentSlug,
    instance: args.instance,
  });
  return { merged: true, feature_branch: args.featureBranch, experiment_slug: args.experimentSlug };
}

export interface DiscardExperimentArgs {
  tddDir: string;
  featureId: string;
  storyId: string;
  experimentSlug: string;
  instance: string;
}

/**
 * PO-discard (or revise) mechanics: tear down the experiment branch with no
 * merge and no migration run, so its code + schema vanish without touching the
 * feature branch.
 */
export async function discardExperimentBranch(
  args: DiscardExperimentArgs,
  ops: ExperimentBranchOps,
): Promise<void> {
  await ops.teardown({
    tddDir: args.tddDir,
    featureId: args.featureId,
    storyId: args.storyId,
    experimentSlug: args.experimentSlug,
    instance: args.instance,
  });
}
