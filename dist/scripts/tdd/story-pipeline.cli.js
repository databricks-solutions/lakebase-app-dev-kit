#!/usr/bin/env node

// scripts/tdd/story-pipeline.ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
var STORY_STATUSES = [
  "designing",
  "awaiting-gate",
  "ready",
  "building",
  "done"
];
function initPipeline(featureId) {
  return { version: 1, feature_id: featureId, stories: {}, build_queue: [], build_active: null };
}
function pipelinePath(tddDir, featureId) {
  return join(tddDir, "features", featureId, "pipeline.json");
}
function readPipeline(tddDir, featureId) {
  const p = pipelinePath(tddDir, featureId);
  if (!existsSync(p)) return initPipeline(featureId);
  return JSON.parse(readFileSync(p, "utf8"));
}
function writePipeline(tddDir, pipeline) {
  const p = pipelinePath(tddDir, pipeline.feature_id);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(pipeline, null, 2) + "\n");
}
function setStoryStatus(pipeline, storyId, status) {
  const existing = pipeline.stories[storyId];
  pipeline.stories[storyId] = { ...existing, status };
  return pipeline;
}
function enqueueReady(pipeline, storyId) {
  setStoryStatus(pipeline, storyId, "ready");
  if (!pipeline.build_queue.includes(storyId)) pipeline.build_queue.push(storyId);
  return pipeline;
}
function dispatchNext(pipeline) {
  if (pipeline.build_active !== null) return null;
  const next = pipeline.build_queue.shift();
  if (next === void 0) return null;
  pipeline.build_active = next;
  setStoryStatus(pipeline, next, "building");
  return next;
}
function completeActive(pipeline) {
  const done = pipeline.build_active;
  if (done === null) return null;
  setStoryStatus(pipeline, done, "done");
  pipeline.build_active = null;
  return done;
}
function surfaceForGate(pipeline, storyId) {
  setStoryStatus(pipeline, storyId, "awaiting-gate");
  const story = pipeline.stories[storyId];
  if (!story.gate) story.gate = { status: "open", history: [] };
  return pipeline;
}
function approveStoryGate(pipeline, storyId, opts) {
  const story = pipeline.stories[storyId];
  if (!story) throw new Error(`approveStoryGate: story ${storyId} is not in the pipeline`);
  const gate = story.gate ?? { status: "open", history: [] };
  gate.status = "approved";
  gate.approver = opts.approver;
  gate.approved_at = opts.at;
  if (opts.spec_hash !== void 0) gate.spec_hash = opts.spec_hash;
  gate.history.push({
    action: "approved",
    at: opts.at,
    approver: opts.approver,
    ...opts.spec_hash !== void 0 ? { spec_hash: opts.spec_hash } : {}
  });
  story.gate = gate;
  enqueueReady(pipeline, storyId);
  return pipeline;
}
function withdrawStoryGate(pipeline, storyId, opts) {
  const story = pipeline.stories[storyId];
  if (!story || !story.gate) {
    throw new Error(`withdrawStoryGate: story ${storyId} has no gate to withdraw`);
  }
  story.gate.status = "withdrawn";
  story.gate.withdrawal_reason = opts.reason;
  story.gate.history.push({
    action: "withdrawn",
    at: opts.at,
    approver: opts.approver,
    reason: opts.reason
  });
  const queued = pipeline.build_queue.indexOf(storyId);
  if (queued !== -1) pipeline.build_queue.splice(queued, 1);
  if (pipeline.build_active === storyId) pipeline.build_active = null;
  setStoryStatus(pipeline, storyId, "awaiting-gate");
  return pipeline;
}

// scripts/tdd/story-pipeline.cli.ts
import { join as join2 } from "path";
function parse(argv) {
  const out = {};
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
function usage(msg) {
  process.stderr.write(
    `${msg}
Usage: lakebase-tdd-pipeline <status|set|surface|approve-gate|withdraw-gate|enqueue|dispatch|complete> --feature <F> [--tdd-dir <dir>]
  set additionally needs --story <S> --status <${STORY_STATUSES.join("|")}>
  surface needs --story <S>
  approve-gate needs --story <S> --approver <A> [--spec-hash <H>] [--at <ISO>]
  withdraw-gate needs --story <S> --approver <A> --reason <R> [--at <ISO>]
  enqueue needs --story <S>
`
  );
  return 2;
}
function main() {
  const args = parse(process.argv.slice(2));
  const tddDir = args.tddDir ?? join2(process.cwd(), ".tdd");
  if (!args.cmd) return usage("missing subcommand");
  if (!args.feature && args.cmd !== "help") return usage("missing --feature");
  const feature = args.feature;
  if (args.cmd === "status") {
    const p = readPipeline(tddDir, feature);
    if (args.json) {
      process.stdout.write(JSON.stringify(p, null, 2) + "\n");
    } else {
      process.stdout.write(`feature ${p.feature_id}  active=${p.build_active ?? "(idle)"}  queue=[${p.build_queue.join(", ")}]
`);
      for (const [s, v] of Object.entries(p.stories)) {
        const gate = v.gate ? `  gate=${v.gate.status}` : "";
        process.stdout.write(`  ${s}	${v.status}${gate}
`);
      }
    }
    return 0;
  }
  const pipeline = readPipeline(tddDir, feature);
  switch (args.cmd) {
    case "set": {
      if (!args.story) return usage("set needs --story");
      if (!args.status || !STORY_STATUSES.includes(args.status)) {
        return usage(`set needs a valid --status (${STORY_STATUSES.join("|")})`);
      }
      setStoryStatus(pipeline, args.story, args.status);
      writePipeline(tddDir, pipeline);
      process.stdout.write(`${args.story} -> ${args.status}
`);
      return 0;
    }
    case "surface": {
      if (!args.story) return usage("surface needs --story");
      surfaceForGate(pipeline, args.story);
      writePipeline(tddDir, pipeline);
      process.stdout.write(`surfaced ${args.story} for the per-story spec gate (awaiting-gate)
`);
      return 0;
    }
    case "approve-gate": {
      if (!args.story) return usage("approve-gate needs --story");
      if (!args.approver) return usage("approve-gate needs --approver");
      const at = args.at ?? (/* @__PURE__ */ new Date()).toISOString();
      approveStoryGate(pipeline, args.story, { approver: args.approver, at, spec_hash: args.specHash });
      writePipeline(tddDir, pipeline);
      process.stdout.write(
        `approved gate for ${args.story} (by ${args.approver}); ready + queued (queue: ${pipeline.build_queue.join(", ")})
`
      );
      return 0;
    }
    case "withdraw-gate": {
      if (!args.story) return usage("withdraw-gate needs --story");
      if (!args.approver) return usage("withdraw-gate needs --approver");
      if (!args.reason) return usage("withdraw-gate needs --reason");
      const at = args.at ?? (/* @__PURE__ */ new Date()).toISOString();
      withdrawStoryGate(pipeline, args.story, { approver: args.approver, at, reason: args.reason });
      writePipeline(tddDir, pipeline);
      process.stdout.write(`withdrew gate for ${args.story} (${args.reason}); back to awaiting-gate
`);
      return 0;
    }
    case "enqueue": {
      if (!args.story) return usage("enqueue needs --story");
      enqueueReady(pipeline, args.story);
      writePipeline(tddDir, pipeline);
      process.stdout.write(`enqueued ${args.story} (queue: ${pipeline.build_queue.join(", ")})
`);
      return 0;
    }
    case "dispatch": {
      const dispatched = dispatchNext(pipeline);
      writePipeline(tddDir, pipeline);
      process.stdout.write(
        dispatched ? `dispatched ${dispatched} to the build lane
` : `no dispatch: ${pipeline.build_active ? `lane busy on ${pipeline.build_active}` : "queue empty"}
`
      );
      return 0;
    }
    case "complete": {
      const completed = completeActive(pipeline);
      writePipeline(tddDir, pipeline);
      process.stdout.write(completed ? `completed ${completed}; lane idle
` : `no active story to complete
`);
      return 0;
    }
    default:
      return usage(`unknown subcommand: ${args.cmd}`);
  }
}
process.exit(main());
//# sourceMappingURL=story-pipeline.cli.js.map