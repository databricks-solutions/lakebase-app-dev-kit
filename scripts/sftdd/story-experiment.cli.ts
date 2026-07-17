#!/usr/bin/env node
// the experiment-branch lifecycle CLI for a per-story experiment.
// Wires the real substrate (git merge, schema migrate, paired-branch teardown)
// into the tested orchestration (experiment-lifecycle.ts) and records the
// pipeline-state transition (story-pipeline.ts).
//
//   lakebase-sftdd-experiment cut      --feature F --story S --slug X --branch B --parent FB --instance I [--ttl T] [--reset-stale-branch] [--project-dir P] [--tdd-dir D]
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

import { cutExperiment } from "./experiment";
import { resolveSftddDir } from "./sftdd-paths.js";
import { discardExperimentBranch } from "./experiment-lifecycle";
import { realExperimentOps, mergeAndAcceptStory } from "./experiment-merge.js";
import {
  readPipeline,
  writePipeline,
  cutStoryExperiment,
  discardStory,
  reviseStory,
} from "./story-pipeline";
import { resetStoryBuildState } from "./cycle-record";
import { parseExperimentArgs, validateExperimentArgs } from "./experiment-args";
import { emitAgentLogEvent } from "./agent-log";

/** Best-effort experiment-lifecycle event to the central log. The discard/revise
 *  verbs have no deterministic driver action (they are HIL acceptance decisions
 *  applied via this CLI), so this is the substrate home for their events , the
 *  sibling of experiment.cut/accepted, which the orchestrator emits. */
function logExperimentEvent(sftddDir: string, event: "experiment.discarded" | "experiment.revised", story: string, reason: string): void {
  try {
    emitAgentLogEvent({ role: "orchestrator", level: "info", event, slots: { story, reason } }, { sftddDir });
  } catch {
    // swallow: logging never blocks the lifecycle transition
  }
}

function usage(msg: string): number {
  process.stderr.write(
    `${msg}\n` +
      `Usage: lakebase-sftdd-experiment <cut|merge|discard> --feature <F> --story <S> --slug <X> --instance <I> [--tdd-dir <D>]\n` +
      `  cut needs --branch <B> --parent <FB> [--ttl <T>] [--reset-stale-branch] [--project-dir <P>]\n` +
      `  merge needs --experiment-branch <B> --feature-branch <FB> --approver <A> [--at <ISO>] [--project-dir <P>]\n` +
      `  discard needs --approver <A> --reason <R> [--revise] [--at <ISO>]\n`,
  );
  return 2;
}

async function main(): Promise<number> {
  const args = parseExperimentArgs(process.argv.slice(2));
  const sftddDir = args.sftddDir ?? resolveSftddDir();
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
        sftddDir,
        projectDir,
        featureId: feature,
        storyId: story,
        experimentSlug: slug,
        branch: args.branch as string,
        parentBranch: args.parent as string,
        ttl: args.ttl,
        ...(args.resetStaleBranch ? { resetStaleBranch: true } : {}),
      });
      const p = readPipeline(sftddDir, feature);
      cutStoryExperiment(p, story, {
        slug,
        branch: rec.branch_id,
        parent: args.parent as string,
        at,
      });
      writePipeline(sftddDir, p);
      process.stdout.write(`cut experiment ${slug} on ${rec.branch_id} (parent ${args.parent})\n`);
      return 0;
    }
    case "merge": {
      // The full accept effect (merge + record), via the shared core so this
      // explicit-args recovery door and `lakebase-sftdd-pipeline accept` (the
      // resolved-args normal door) behave identically (FEIP-8013).
      await mergeAndAcceptStory(
        {
          sftddDir,
          projectDir,
          featureId: feature,
          storyId: story,
          experimentSlug: slug,
          featureBranch: args.featureBranch as string,
          experimentBranch: args.experimentBranch as string,
          instance,
          approver: args.approver as string,
          at,
        },
        realExperimentOps,
      );
      process.stdout.write(`merged ${slug} into ${args.featureBranch}; story ${story} accepted + done\n`);
      return 0;
    }
    case "discard": {
      await discardExperimentBranch(
        { sftddDir, projectDir, featureId: feature, storyId: story, experimentSlug: slug, instance },
        realExperimentOps,
      );
      const p = readPipeline(sftddDir, feature);
      const approver = args.approver as string;
      const reason = args.reason as string;
      if (args.revise) {
        reviseStory(p, story, { approver, at, reason });
        // reviseStory only flips the pipeline status to "designing"; the build
        // lane derives "pending" from the cycle records on disk, so without also
        // clearing them the revised story reads as allGreen and re-deploys its
        // stale build. Reset the build state so it genuinely re-drives.
        resetStoryBuildState(sftddDir, feature, story);
      } else {
        discardStory(p, story, { approver, at, reason });
      }
      writePipeline(sftddDir, p);
      logExperimentEvent(sftddDir, args.revise ? "experiment.revised" : "experiment.discarded", story, reason);
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
