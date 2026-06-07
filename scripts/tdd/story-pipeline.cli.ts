#!/usr/bin/env node
// FEIP-7565: the Scrum-Master's interface to the per-story build queue +
// per-story status (.tdd/features/<F>/pipeline.json). The design lane sets
// status as it streams; on a per-story gate approval the orchestrator enqueues
// the story; the single build lane dispatches the head and completes it.
//
// Usage (all take --feature <F> [--tdd-dir <dir>]; default tdd-dir = $PWD/.tdd):
//   lakebase-tdd-pipeline status   --feature F [--json]
//   lakebase-tdd-pipeline set       --feature F --story S --status <designing|awaiting-gate|ready|building|done>
//   lakebase-tdd-pipeline enqueue   --feature F --story S      (gate-approved -> ready, queued)
//   lakebase-tdd-pipeline dispatch  --feature F                (pull FIFO head into the single lane if idle)
//   lakebase-tdd-pipeline complete  --feature F                (active story done, free the lane)
//
// Exit: 0 ok; 2 bad args.

import {
  readPipeline,
  writePipeline,
  setStoryStatus,
  enqueueReady,
  dispatchNext,
  completeActive,
  STORY_STATUSES,
  type StoryStatus,
} from "./story-pipeline";
import { join } from "path";

interface Args {
  cmd?: string;
  feature?: string;
  story?: string;
  status?: string;
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
    else if (a === "--tdd-dir") out.tddDir = argv[++i];
    else if (a === "--json") out.json = true;
  }
  return out;
}

function usage(msg: string): number {
  process.stderr.write(
    `${msg}\n` +
      `Usage: lakebase-tdd-pipeline <status|set|enqueue|dispatch|complete> --feature <F> [--tdd-dir <dir>]\n` +
      `  set additionally needs --story <S> --status <${STORY_STATUSES.join("|")}>\n` +
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
      for (const [s, v] of Object.entries(p.stories)) process.stdout.write(`  ${s}\t${v.status}\n`);
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
