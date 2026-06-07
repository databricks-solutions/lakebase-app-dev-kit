#!/usr/bin/env node
// FEIP-7566: the experiment-branch lifecycle CLI for a per-story experiment.
// Wires the real substrate (git merge, schema migrate, paired-branch teardown)
// into the tested orchestration (experiment-lifecycle.ts) and records the
// pipeline-state transition (story-pipeline.ts).
//
//   lakebase-tdd-experiment cut      --feature F --story S --slug X --branch B --parent FB --instance I [--ttl T] [--project-dir P] [--tdd-dir D]
//   lakebase-tdd-experiment merge    --feature F --story S --slug X --experiment-branch B --feature-branch FB --instance I --approver A [--at ISO] [--project-dir P] [--tdd-dir D]
//   lakebase-tdd-experiment discard  --feature F --story S --slug X --instance I --approver A --reason R [--revise] [--at ISO] [--tdd-dir D]
//
// cut  : fork the paired Lakebase branch off the feature branch + record the
//        pipeline experiment ref (the build lane then builds on it).
// merge: PO accept. git-merge the experiment into the feature branch, run the
//        story's migrations against the feature branch's Lakebase DB, tear down
//        the experiment, and record acceptStory (experiment merged, story done,
//        lane freed). Fail-closed (see experiment-lifecycle.ts).
// discard: PO reject. tear down the experiment (no trace) and record
//        discardStory (out of sprint), or reviseStory with --revise (back to
//        designing).
//
// Exit: 0 ok; 2 bad args; 1 op failure.

import { cutExperiment, deleteExperiment } from "./experiment";
import {
  mergeExperimentIntoFeature,
  discardExperimentBranch,
  type ExperimentBranchOps,
} from "./experiment-lifecycle";
import {
  readPipeline,
  writePipeline,
  cutStoryExperiment,
  acceptStory,
  discardStory,
  reviseStory,
} from "./story-pipeline";
import { checkoutBranch } from "../git/mutation";
import { mergeBranch } from "../git/branch-tag";
import { applySchemaMigrations } from "../lakebase/schema-migrate";
import { join } from "path";

interface Args {
  cmd?: string;
  feature?: string;
  story?: string;
  slug?: string;
  branch?: string;
  experimentBranch?: string;
  featureBranch?: string;
  parent?: string;
  instance?: string;
  ttl?: string;
  approver?: string;
  reason?: string;
  at?: string;
  revise?: boolean;
  projectDir?: string;
  tddDir?: string;
}

function parse(argv: string[]): Args {
  const out: Args = { cmd: argv[0] };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--feature") out.feature = argv[++i];
    else if (a === "--story") out.story = argv[++i];
    else if (a === "--slug") out.slug = argv[++i];
    else if (a === "--branch") out.branch = argv[++i];
    else if (a === "--experiment-branch") out.experimentBranch = argv[++i];
    else if (a === "--feature-branch") out.featureBranch = argv[++i];
    else if (a === "--parent") out.parent = argv[++i];
    else if (a === "--instance") out.instance = argv[++i];
    else if (a === "--ttl") out.ttl = argv[++i];
    else if (a === "--approver") out.approver = argv[++i];
    else if (a === "--reason") out.reason = argv[++i];
    else if (a === "--at") out.at = argv[++i];
    else if (a === "--revise") out.revise = true;
    else if (a === "--project-dir") out.projectDir = argv[++i];
    else if (a === "--tdd-dir") out.tddDir = argv[++i];
  }
  return out;
}

function usage(msg: string): number {
  process.stderr.write(
    `${msg}\n` +
      `Usage: lakebase-tdd-experiment <cut|merge|discard> --feature <F> --story <S> --slug <X> --instance <I> [--tdd-dir <D>]\n` +
      `  cut needs --branch <B> --parent <FB> [--ttl <T>] [--project-dir <P>]\n` +
      `  merge needs --experiment-branch <B> --feature-branch <FB> --approver <A> [--at <ISO>] [--project-dir <P>]\n` +
      `  discard needs --approver <A> --reason <R> [--revise] [--at <ISO>]\n`,
  );
  return 2;
}

// Real substrate wiring. The order + fail-closed logic is in
// experiment-lifecycle.ts; these are the side-effectful leaves.
const realOps: ExperimentBranchOps = {
  gitMerge: async ({ from, into, projectDir }) => {
    await checkoutBranch({ cwd: projectDir, branch: into });
    await mergeBranch({ cwd: projectDir, branch: from });
  },
  runMigrations: async ({ instance, branch, projectDir }) => {
    await applySchemaMigrations({ instance, branch, projectDir });
  },
  teardown: async ({ tddDir, featureId, storyId, experimentSlug, instance }) => {
    await deleteExperiment({ instance, tddDir, featureId, storyId, experimentSlug, deleteBranchToo: true });
  },
};

async function main(): Promise<number> {
  const args = parse(process.argv.slice(2));
  const tddDir = args.tddDir ?? join(process.cwd(), ".tdd");
  const projectDir = args.projectDir ?? process.cwd();
  if (!args.cmd) return usage("missing subcommand");
  if (!args.feature || !args.story || !args.slug) return usage("missing --feature / --story / --slug");
  if (!args.instance) return usage("missing --instance");
  const at = args.at ?? new Date().toISOString();

  switch (args.cmd) {
    case "cut": {
      if (!args.branch || !args.parent) return usage("cut needs --branch and --parent");
      const rec = await cutExperiment({
        instance: args.instance,
        tddDir,
        featureId: args.feature,
        storyId: args.story,
        experimentSlug: args.slug,
        branch: args.branch,
        parentBranch: args.parent,
        ttl: args.ttl,
      });
      const p = readPipeline(tddDir, args.feature);
      cutStoryExperiment(p, args.story, {
        slug: args.slug,
        branch: rec.branch_id,
        parent: args.parent,
        at,
      });
      writePipeline(tddDir, p);
      process.stdout.write(`cut experiment ${args.slug} on ${rec.branch_id} (parent ${args.parent})\n`);
      return 0;
    }
    case "merge": {
      if (!args.experimentBranch || !args.featureBranch) return usage("merge needs --experiment-branch and --feature-branch");
      if (!args.approver) return usage("merge needs --approver");
      await mergeExperimentIntoFeature(
        {
          tddDir,
          featureId: args.feature,
          storyId: args.story,
          experimentSlug: args.slug,
          featureBranch: args.featureBranch,
          experimentBranch: args.experimentBranch,
          instance: args.instance,
          projectDir,
        },
        realOps,
      );
      const p = readPipeline(tddDir, args.feature);
      acceptStory(p, args.story, { approver: args.approver, at });
      writePipeline(tddDir, p);
      process.stdout.write(`merged ${args.slug} into ${args.featureBranch}; story ${args.story} accepted + done\n`);
      return 0;
    }
    case "discard": {
      if (!args.approver) return usage("discard needs --approver");
      if (!args.reason) return usage("discard needs --reason");
      await discardExperimentBranch(
        { tddDir, featureId: args.feature, storyId: args.story, experimentSlug: args.slug, instance: args.instance },
        realOps,
      );
      const p = readPipeline(tddDir, args.feature);
      if (args.revise) {
        reviseStory(p, args.story, { approver: args.approver, at, reason: args.reason });
      } else {
        discardStory(p, args.story, { approver: args.approver, at, reason: args.reason });
      }
      writePipeline(tddDir, p);
      process.stdout.write(
        `${args.revise ? "revised" : "discarded"} ${args.slug}; experiment torn down; story ${args.story} ${args.revise ? "-> designing" : "out of sprint"}\n`,
      );
      return 0;
    }
    default:
      return usage(`unknown subcommand: ${args.cmd}`);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
