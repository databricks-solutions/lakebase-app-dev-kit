#!/usr/bin/env node
// FEIP-7565: the Scrum-Master's interface to the per-story build queue +
// per-story status (.tdd/features/<F>/pipeline.json). The design lane sets
// status as it streams; on a per-story gate approval the orchestrator enqueues
// the story; the single build lane dispatches the head and completes it.
//
// Usage (all take --feature <F> [--tdd-dir <dir>]; default tdd-dir = $PWD/.tdd):
//   lakebase-tdd-pipeline status        --feature F [--json]
//   lakebase-tdd-pipeline set            --feature F --story S --status <designing|awaiting-gate|ready|building|done>
//   lakebase-tdd-pipeline surface        --feature F --story S                 (design done -> awaiting-gate, open the gate)
//   lakebase-tdd-pipeline approve-gate   --feature F --story S --approver A [--spec-hash H] [--at ISO]
//   lakebase-tdd-pipeline withdraw-gate  --feature F --story S --approver A --reason R [--at ISO]
//   lakebase-tdd-pipeline enqueue        --feature F --story S                 (low-level: mark ready + queue, no gate)
//   lakebase-tdd-pipeline dispatch       --feature F                          (pull FIFO head into the single lane if idle)
//   lakebase-tdd-pipeline complete       --feature F                          (active story done, free the lane)
//
// The formal per-story spec gate is surface -> approve-gate; approve-gate is
// what authorizes the ready transition (it enqueues). `enqueue` stays as the
// low-level re-queue primitive.
//
// Exit: 0 ok; 2 bad args.

import {
  readPipeline,
  writePipeline,
  setStoryStatus,
  enqueueReady,
  dispatchNext,
  completeActive,
  surfaceForGate,
  approveStoryGate,
  withdrawStoryGate,
  STORY_STATUSES,
  type StoryStatus,
} from "./story-pipeline";
import { join } from "path";

interface Args {
  cmd?: string;
  feature?: string;
  story?: string;
  status?: string;
  approver?: string;
  specHash?: string;
  reason?: string;
  at?: string;
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
    else if (a === "--tdd-dir") out.tddDir = argv[++i];
    else if (a === "--json") out.json = true;
  }
  return out;
}

function usage(msg: string): number {
  process.stderr.write(
    `${msg}\n` +
      `Usage: lakebase-tdd-pipeline <status|set|surface|approve-gate|withdraw-gate|enqueue|dispatch|complete> --feature <F> [--tdd-dir <dir>]\n` +
      `  set additionally needs --story <S> --status <${STORY_STATUSES.join("|")}>\n` +
      `  surface needs --story <S>\n` +
      `  approve-gate needs --story <S> --approver <A> [--spec-hash <H>] [--at <ISO>]\n` +
      `  withdraw-gate needs --story <S> --approver <A> --reason <R> [--at <ISO>]\n` +
      `  enqueue needs --story <S>\n`,
  );
  return 2;
}

function main(): number {
  const args = parse(process.argv.slice(2));
  const tddDir = args.tddDir ?? join(process.cwd(), ".tdd");
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
        process.stdout.write(`  ${s}\t${v.status}${gate}\n`);
      }
    }
    return 0;
  }

  const pipeline = readPipeline(tddDir, feature);

  switch (args.cmd) {
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
      surfaceForGate(pipeline, args.story);
      writePipeline(tddDir, pipeline);
      process.stdout.write(`surfaced ${args.story} for the per-story spec gate (awaiting-gate)\n`);
      return 0;
    }
    case "approve-gate": {
      if (!args.story) return usage("approve-gate needs --story");
      if (!args.approver) return usage("approve-gate needs --approver");
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
    default:
      return usage(`unknown subcommand: ${args.cmd}`);
  }
}

process.exit(main());
