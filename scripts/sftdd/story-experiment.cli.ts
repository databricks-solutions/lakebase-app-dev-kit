#!/usr/bin/env node
// the experiment-branch lifecycle CLI for a per-story experiment.
// Wires the real substrate (git merge, schema migrate, paired-branch teardown)
// into the tested orchestration (experiment-lifecycle.ts) and records the
// pipeline-state transition (story-pipeline.ts).
//
//   lakebase-sftdd-experiment cut      --feature F --story S --slug X --branch B --parent FB --instance I [--ttl T] [--project-dir P] [--tdd-dir D]
//   lakebase-sftdd-experiment merge    --feature F --story S --slug X --experiment-branch B --feature-branch FB --instance I --approver A [--at ISO] [--project-dir P] [--tdd-dir D]
//   lakebase-sftdd-experiment discard  --feature F --story S --slug X --instance I --approver A --reason R [--revise] [--at ISO] [--tdd-dir D]
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
import { resolveTddDir } from "./sftdd-paths.js";
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
import { mergePaired } from "../lakebase/paired-branch";
import { applySchemaMigrations } from "../lakebase/schema-migrate";
import { parseExperimentArgs, validateExperimentArgs } from "./experiment-args";
import { emitAgentLogEvent } from "./agent-log";
import { join } from "path";

/** Best-effort experiment-lifecycle event to the central log. The discard/revise
 *  verbs have no deterministic driver action (they are HIL acceptance decisions
 *  applied via this CLI), so this is the substrate home for their events , the
 *  sibling of experiment.cut/accepted, which the orchestrator emits. */
function logExperimentEvent(tddDir: string, event: "experiment.discarded" | "experiment.revised", story: string, reason: string): void {
  try {
    emitAgentLogEvent({ role: "orchestrator", level: "info", event, slots: { story, reason } }, { tddDir });
  } catch {
    // swallow: logging never blocks the lifecycle transition
  }
}

function usage(msg: string): number {
  process.stderr.write(
    `${msg}\n` +
      `Usage: lakebase-sftdd-experiment <cut|merge|discard> --feature <F> --story <S> --slug <X> --instance <I> [--tdd-dir <D>]\n` +
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
    // PAIRED merge via the substrate: checkout `into`, re-sync .env to its
    // Lakebase branch, then git-merge `from`. No raw git in the orchestration.
    await mergePaired({ cwd: projectDir, from, into });
  },
  runMigrations: async ({ instance, branch, projectDir }) => {
    await applySchemaMigrations({ instance, branch, projectDir });
  },
  teardown: async ({ tddDir, projectDir, featureId, storyId, experimentSlug, instance }) => {
    await deleteExperiment({ instance, tddDir, projectDir, featureId, storyId, experimentSlug, deleteBranchToo: true });
  },
};

async function main(): Promise<number> {
  const args = parseExperimentArgs(process.argv.slice(2));
  const tddDir = args.tddDir ?? resolveTddDir();
  const projectDir = args.projectDir ?? process.cwd();
  const invalid = validateExperimentArgs(args);
  if (invalid) return usage(invalid);
  const at = args.at ?? new Date().toISOString();
  // validateExperimentArgs above guaranteed the required fields are present;
  // these locals carry that guarantee to the type system (one validation source).
  const feature = args.feature as string;
  const story = args.story as string;
  const slug = args.slug as string;
  const instance = args.instance as string;

  switch (args.cmd) {
    case "cut": {
      const rec = await cutExperiment({
        instance,
        tddDir,
        projectDir,
        featureId: feature,
        storyId: story,
        experimentSlug: slug,
        branch: args.branch as string,
        parentBranch: args.parent as string,
        ttl: args.ttl,
      });
      const p = readPipeline(tddDir, feature);
      cutStoryExperiment(p, story, {
        slug,
        branch: rec.branch_id,
        parent: args.parent as string,
        at,
      });
      writePipeline(tddDir, p);
      process.stdout.write(`cut experiment ${slug} on ${rec.branch_id} (parent ${args.parent})\n`);
      return 0;
    }
    case "merge": {
      await mergeExperimentIntoFeature(
        {
          tddDir,
          featureId: feature,
          storyId: story,
          experimentSlug: slug,
          featureBranch: args.featureBranch as string,
          experimentBranch: args.experimentBranch as string,
          instance,
          projectDir,
        },
        realOps,
      );
      const p = readPipeline(tddDir, feature);
      acceptStory(p, story, { approver: args.approver as string, at });
      writePipeline(tddDir, p);
      process.stdout.write(`merged ${slug} into ${args.featureBranch}; story ${story} accepted + done\n`);
      return 0;
    }
    case "discard": {
      await discardExperimentBranch(
        { tddDir, projectDir, featureId: feature, storyId: story, experimentSlug: slug, instance },
        realOps,
      );
      const p = readPipeline(tddDir, feature);
      const approver = args.approver as string;
      const reason = args.reason as string;
      if (args.revise) {
        reviseStory(p, story, { approver, at, reason });
      } else {
        discardStory(p, story, { approver, at, reason });
      }
      writePipeline(tddDir, p);
      logExperimentEvent(tddDir, args.revise ? "experiment.revised" : "experiment.discarded", story, reason);
      process.stdout.write(
        `${args.revise ? "revised" : "discarded"} ${slug}; experiment torn down; story ${story} ${args.revise ? "-> designing" : "out of sprint"}\n`,
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
