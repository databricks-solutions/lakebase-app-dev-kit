#!/usr/bin/env node
// the orchestrator's interface to the per-story build queue +
// per-story status (.tdd/features/<F>/pipeline.json). The design lane sets
// status as it streams; on a per-story gate approval the orchestrator enqueues
// the story; the single build lane dispatches the head and completes it.
//
// Usage (all take --feature <F> [--tdd-dir <dir>]; default tdd-dir = $PWD/.sftdd, honors a legacy $PWD/.tdd):
//   lakebase-sftdd-pipeline status        --feature F [--json]
//   lakebase-sftdd-pipeline set            --feature F --story S --status <designing|awaiting-gate|ready|building|done>
//   lakebase-sftdd-pipeline surface        --feature F --story S                 (design done -> awaiting-gate, open the gate)
//   lakebase-sftdd-pipeline approve-gate   --feature F --story S --approver A [--spec-hash H] [--at ISO]
//   lakebase-sftdd-pipeline withdraw-gate  --feature F --story S --approver A --reason R [--at ISO]
//   lakebase-sftdd-pipeline enqueue        --feature F --story S                 (low-level: mark ready + queue, no gate)
//   lakebase-sftdd-pipeline dispatch       --feature F                          (pull FIFO head into the single lane if idle)
//   lakebase-sftdd-pipeline complete       --feature F                          (active story done, free the lane)
//   lakebase-sftdd-pipeline cut-experiment --feature F --story S --slug X --branch B --parent FB [--lakebase-uid U] [--parent-sha SHA] [--n N]
//   lakebase-sftdd-pipeline await-acceptance --feature F --story S              (built + deployed -> awaiting-acceptance)
//   lakebase-sftdd-pipeline accept         --feature F --story S --approver A    (PO accepts -> experiment merged, story done, lane freed)
//   lakebase-sftdd-pipeline discard        --feature F --story S --approver A --reason R   (PO discards -> torn down, out of sprint)
//   lakebase-sftdd-pipeline revise         --feature F --story S --approver A --reason R   (PO sends back -> designing)
//
// The formal per-story spec gate is surface -> approve-gate; approve-gate is
// what authorizes the ready transition (it enqueues). `enqueue` stays as the
// low-level re-queue primitive. The build lane records its experiment branch
// with cut-experiment, then await-acceptance -> accept/discard/revise (each
// frees the single lane). The actual branch fork/merge/teardown is the
// experiment-lifecycle CLI's job; these record pipeline state.
//
// surface + approve-gate enforce the per-story draft invariant: they hard-fail
// (exit 3) if any other un-gated story already has ACs on disk, i.e. the Spec
// Author batched the feature instead of streaming one story at a time.
//
// Exit: 0 ok; 2 bad args; 3 per-story draft invariant violated (batched ACs).

import {
  readPipeline,
  writePipeline,
  setStoryStatus,
  enqueueReady,
  dispatchNext,
  completeActive,
  syncBreakdownToPipeline,
  surfaceForGate,
  approveStoryGate,
  withdrawStoryGate,
  findBatchedDraftStories,
  cutStoryExperiment,
  awaitAcceptance,
  acceptStory,
  discardStory,
  reviseStory,
  STORY_STATUSES,
  type StoryStatus,
  type StoryPipeline,
} from "./story-pipeline";
import { join } from "path";
import { resolveTddDir } from "./sftdd-paths.js";

interface Args {
  cmd?: string;
  feature?: string;
  story?: string;
  status?: string;
  approver?: string;
  specHash?: string;
  reason?: string;
  at?: string;
  slug?: string;
  branch?: string;
  parent?: string;
  parentSha?: string;
  lakebaseUid?: string;
  n?: string;
  tddDir?: string;
  json?: boolean;
}

function parse(argv: string[]): Args {
  const out: Args = {};
  out.cmd = argv[0];
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--feature") out.feature = argv[++i];
    else if (a === "--story") out.story = argv[++i];
    else if (a === "--status") out.status = argv[++i];
    else if (a === "--approver") out.approver = argv[++i];
    else if (a === "--spec-hash") out.specHash = argv[++i];
    else if (a === "--reason") out.reason = argv[++i];
    else if (a === "--at") out.at = argv[++i];
    else if (a === "--slug") out.slug = argv[++i];
    else if (a === "--branch") out.branch = argv[++i];
    else if (a === "--parent") out.parent = argv[++i];
    else if (a === "--parent-sha") out.parentSha = argv[++i];
    else if (a === "--lakebase-uid") out.lakebaseUid = argv[++i];
    else if (a === "--n") out.n = argv[++i];
    else if (a === "--tdd-dir") out.tddDir = argv[++i];
    else if (a === "--json") out.json = true;
  }
  return out;
}

function usage(msg: string): number {
  process.stderr.write(
    `${msg}\n` +
      `Usage: lakebase-sftdd-pipeline <status|set|surface|approve-gate|withdraw-gate|enqueue|dispatch|complete|cut-experiment|await-acceptance|accept|discard|revise> --feature <F> [--tdd-dir <dir>]\n` +
      `  set additionally needs --story <S> --status <${STORY_STATUSES.join("|")}>\n` +
      `  surface needs --story <S>\n` +
      `  approve-gate needs --story <S> --approver <A> [--spec-hash <H>] [--at <ISO>]\n` +
      `  withdraw-gate needs --story <S> --approver <A> --reason <R> [--at <ISO>]\n` +
      `  enqueue needs --story <S>\n` +
      `  cut-experiment needs --story <S> --slug <X> --branch <B> --parent <FB> [--lakebase-uid <U>] [--parent-sha <SHA>] [--n <N>] [--at <ISO>]\n` +
      `  await-acceptance needs --story <S>\n` +
      `  accept needs --story <S> --approver <A> [--at <ISO>]\n` +
      `  discard / revise need --story <S> --approver <A> --reason <R> [--at <ISO>]\n`,
  );
  return 2;
}

/**
 * Hard-fail (exit 3) when the Spec Author batched acceptance criteria across
 * stories instead of drafting one at a time. The per-story spec gate (surface /
 * approve-gate) is the choke point: a story cannot be gated while sibling
 * un-gated stories already have ACs on disk. Returns 3 + prints actionable
 * guidance when batched; null when the draft is correctly one-story-scoped.
 */
function rejectBatchedDraft(
  tddDir: string,
  feature: string,
  pipeline: StoryPipeline,
  story: string,
): number | null {
  const batched = findBatchedDraftStories(tddDir, feature, pipeline, story);
  if (batched.length === 0) return null;
  process.stderr.write(
    `per-story draft invariant violated: ACs already exist for ${batched.join(", ")}, ` +
      `but ${story} is the story being gated.\n` +
      `The design lane drafts ONE story's acceptance criteria at a time ` +
      `(draft -> surface -> approve), then moves to the next story. Drafting every ` +
      `story's ACs in one pass defeats the streaming pipeline.\n` +
      `Remove the out-of-turn ACs (keep only ${story}'s), invoke the Spec Author ` +
      `once per story, and retry.\n`,
  );
  return 3;
}

function main(): number {
  const args = parse(process.argv.slice(2));
  const tddDir = args.tddDir ?? resolveTddDir();
  if (!args.cmd) return usage("missing subcommand");
  if (!args.feature && args.cmd !== "help") return usage("missing --feature");
  const feature = args.feature as string;

  if (args.cmd === "status") {
    const p = readPipeline(tddDir, feature);
    if (args.json) {
      process.stdout.write(JSON.stringify(p, null, 2) + "\n");
    } else {
      process.stdout.write(`feature ${p.feature_id}  active=${p.build_active ?? "(idle)"}  queue=[${p.build_queue.join(", ")}]\n`);
      for (const [s, v] of Object.entries(p.stories)) {
        const gate = v.gate ? `  gate=${v.gate.status}` : "";
        const exp = v.experiment ? `  exp=${v.experiment.slug}(${v.experiment.status})` : "";
        const acc = v.acceptance?.decision ? `  acceptance=${v.acceptance.decision}` : "";
        process.stdout.write(`  ${s}\t${v.status}${gate}${exp}${acc}\n`);
      }
    }
    return 0;
  }

  const pipeline = readPipeline(tddDir, feature);

  switch (args.cmd) {
    case "sync-breakdown": {
      // Seed the pipeline from the on-disk breakdown (stories/<S>/ dirs). Used
      // by the driver right after spec-author breakdown so the streaming lanes
      // have stories to advance. Re-reads + writes the pipeline itself.
      const r = syncBreakdownToPipeline(tddDir, feature);
      process.stdout.write(
        `sync-breakdown: +${r.added.length} (${r.added.join(", ") || "none"}); ${r.total.length} tracked\n`,
      );
      return 0;
    }
    case "set": {
      if (!args.story) return usage("set needs --story");
      if (!args.status || !(STORY_STATUSES as readonly string[]).includes(args.status)) {
        return usage(`set needs a valid --status (${STORY_STATUSES.join("|")})`);
      }
      setStoryStatus(pipeline, args.story, args.status as StoryStatus);
      writePipeline(tddDir, pipeline);
      process.stdout.write(`${args.story} -> ${args.status}\n`);
      return 0;
    }
    case "surface": {
      if (!args.story) return usage("surface needs --story");
      const batched = rejectBatchedDraft(tddDir, feature, pipeline, args.story);
      if (batched !== null) return batched;
      surfaceForGate(pipeline, args.story);
      writePipeline(tddDir, pipeline);
      process.stdout.write(`surfaced ${args.story} for the per-story spec gate (awaiting-gate)\n`);
      return 0;
    }
    case "approve-gate": {
      if (!args.story) return usage("approve-gate needs --story");
      if (!args.approver) return usage("approve-gate needs --approver");
      const batched = rejectBatchedDraft(tddDir, feature, pipeline, args.story);
      if (batched !== null) return batched;
      const at = args.at ?? new Date().toISOString();
      approveStoryGate(pipeline, args.story, { approver: args.approver, at, spec_hash: args.specHash });
      writePipeline(tddDir, pipeline);
      process.stdout.write(
        `approved gate for ${args.story} (by ${args.approver}); ready + queued (queue: ${pipeline.build_queue.join(", ")})\n`,
      );
      return 0;
    }
    case "withdraw-gate": {
      if (!args.story) return usage("withdraw-gate needs --story");
      if (!args.approver) return usage("withdraw-gate needs --approver");
      if (!args.reason) return usage("withdraw-gate needs --reason");
      const at = args.at ?? new Date().toISOString();
      withdrawStoryGate(pipeline, args.story, { approver: args.approver, at, reason: args.reason });
      writePipeline(tddDir, pipeline);
      process.stdout.write(`withdrew gate for ${args.story} (${args.reason}); back to awaiting-gate\n`);
      return 0;
    }
    case "enqueue": {
      if (!args.story) return usage("enqueue needs --story");
      enqueueReady(pipeline, args.story);
      writePipeline(tddDir, pipeline);
      process.stdout.write(`enqueued ${args.story} (queue: ${pipeline.build_queue.join(", ")})\n`);
      return 0;
    }
    case "dispatch": {
      const dispatched = dispatchNext(pipeline);
      writePipeline(tddDir, pipeline);
      process.stdout.write(
        dispatched
          ? `dispatched ${dispatched} to the build lane\n`
          : `no dispatch: ${pipeline.build_active ? `lane busy on ${pipeline.build_active}` : "queue empty"}\n`,
      );
      return 0;
    }
    case "complete": {
      const completed = completeActive(pipeline);
      writePipeline(tddDir, pipeline);
      process.stdout.write(completed ? `completed ${completed}; lane idle\n` : `no active story to complete\n`);
      return 0;
    }
    case "cut-experiment": {
      if (!args.story) return usage("cut-experiment needs --story");
      if (!args.slug || !args.branch || !args.parent) {
        return usage("cut-experiment needs --slug, --branch, and --parent");
      }
      cutStoryExperiment(pipeline, args.story, {
        slug: args.slug,
        branch: args.branch,
        parent: args.parent,
        lakebase_branch_uid: args.lakebaseUid,
        parent_sha: args.parentSha,
        n: args.n !== undefined ? Number(args.n) : undefined,
        at: args.at ?? new Date().toISOString(),
      });
      writePipeline(tddDir, pipeline);
      process.stdout.write(`cut experiment ${args.slug} for ${args.story} on ${args.branch} (parent ${args.parent})\n`);
      return 0;
    }
    case "await-acceptance": {
      if (!args.story) return usage("await-acceptance needs --story");
      awaitAcceptance(pipeline, args.story);
      writePipeline(tddDir, pipeline);
      process.stdout.write(`${args.story} -> awaiting-acceptance (PO reviewing the running story)\n`);
      return 0;
    }
    case "accept": {
      if (!args.story) return usage("accept needs --story");
      if (!args.approver) return usage("accept needs --approver");
      acceptStory(pipeline, args.story, { approver: args.approver, at: args.at ?? new Date().toISOString() });
      writePipeline(tddDir, pipeline);
      process.stdout.write(`accepted ${args.story}; experiment merged, story done, lane freed\n`);
      return 0;
    }
    case "discard": {
      if (!args.story) return usage("discard needs --story");
      if (!args.approver) return usage("discard needs --approver");
      if (!args.reason) return usage("discard needs --reason");
      discardStory(pipeline, args.story, { approver: args.approver, at: args.at ?? new Date().toISOString(), reason: args.reason });
      writePipeline(tddDir, pipeline);
      process.stdout.write(`discarded ${args.story} (${args.reason}); experiment torn down, out of sprint, lane freed\n`);
      return 0;
    }
    case "revise": {
      if (!args.story) return usage("revise needs --story");
      if (!args.approver) return usage("revise needs --approver");
      if (!args.reason) return usage("revise needs --reason");
      reviseStory(pipeline, args.story, { approver: args.approver, at: args.at ?? new Date().toISOString(), reason: args.reason });
      writePipeline(tddDir, pipeline);
      process.stdout.write(`revising ${args.story} (${args.reason}); experiment torn down, back to designing, lane freed\n`);
      return 0;
    }
    default:
      return usage(`unknown subcommand: ${args.cmd}`);
  }
}

process.exit(main());
