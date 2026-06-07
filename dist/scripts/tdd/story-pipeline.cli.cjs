#!/usr/bin/env node
"use strict";

// scripts/tdd/story-pipeline.ts
var import_fs = require("fs");
var import_path = require("path");
var STORY_STATUSES = [
  "designing",
  "awaiting-gate",
  "ready",
  "building",
  "awaiting-acceptance",
  "done",
  "discarded"
];
function initPipeline(featureId) {
  return { version: 1, feature_id: featureId, stories: {}, build_queue: [], build_active: null };
}
function pipelinePath(tddDir, featureId) {
  return (0, import_path.join)(tddDir, "features", featureId, "pipeline.json");
}
function readPipeline(tddDir, featureId) {
  const p = pipelinePath(tddDir, featureId);
  if (!(0, import_fs.existsSync)(p)) return initPipeline(featureId);
  return JSON.parse((0, import_fs.readFileSync)(p, "utf8"));
}
function writePipeline(tddDir, pipeline) {
  const p = pipelinePath(tddDir, pipeline.feature_id);
  (0, import_fs.mkdirSync)((0, import_path.dirname)(p), { recursive: true });
  (0, import_fs.writeFileSync)(p, JSON.stringify(pipeline, null, 2) + "\n");
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
function storyHasAcceptanceCriteria(tddDir, featureId, storyId) {
  const acsDir = (0, import_path.join)(tddDir, "features", featureId, "stories", storyId, "acs");
  if (!(0, import_fs.existsSync)(acsDir)) return false;
  return (0, import_fs.readdirSync)(acsDir).some((f) => f.endsWith(".json"));
}
function findBatchedDraftStories(tddDir, featureId, pipeline, gatingStoryId) {
  const storiesDir = (0, import_path.join)(tddDir, "features", featureId, "stories");
  if (!(0, import_fs.existsSync)(storiesDir)) return [];
  const offenders = [];
  for (const storyId of (0, import_fs.readdirSync)(storiesDir)) {
    if (storyId === gatingStoryId) continue;
    if (!storyHasAcceptanceCriteria(tddDir, featureId, storyId)) continue;
    const status = pipeline.stories[storyId]?.status;
    if (status === void 0 || status === "designing") offenders.push(storyId);
  }
  return offenders.sort();
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
  markGateWithdrawn(story.gate, opts);
  const queued = pipeline.build_queue.indexOf(storyId);
  if (queued !== -1) pipeline.build_queue.splice(queued, 1);
  if (pipeline.build_active === storyId) pipeline.build_active = null;
  setStoryStatus(pipeline, storyId, "awaiting-gate");
  return pipeline;
}
function markGateWithdrawn(gate, opts) {
  gate.status = "withdrawn";
  gate.withdrawal_reason = opts.reason;
  gate.history.push({
    action: "withdrawn",
    at: opts.at,
    approver: opts.approver,
    reason: opts.reason
  });
}
function cutStoryExperiment(pipeline, storyId, args) {
  const story = pipeline.stories[storyId];
  if (!story) throw new Error(`cutStoryExperiment: story ${storyId} is not in the pipeline`);
  story.experiment = {
    slug: args.slug,
    branch: args.branch,
    parent: args.parent,
    ...args.lakebase_branch_uid !== void 0 ? { lakebase_branch_uid: args.lakebase_branch_uid } : {},
    ...args.parent_sha !== void 0 ? { parent_sha: args.parent_sha } : {},
    n: args.n ?? 1,
    status: "active",
    ...args.at !== void 0 ? { cut_at: args.at } : {}
  };
  return pipeline;
}
function awaitAcceptance(pipeline, storyId) {
  setStoryStatus(pipeline, storyId, "awaiting-acceptance");
  const story = pipeline.stories[storyId];
  if (!story.acceptance) story.acceptance = { decision: null, history: [] };
  return pipeline;
}
function recordAcceptance(story, decision, opts) {
  const acc = story.acceptance ?? { decision: null, history: [] };
  acc.decision = decision;
  acc.approver = opts.approver;
  acc.at = opts.at;
  if (opts.reason !== void 0) acc.reason = opts.reason;
  acc.history.push({
    decision,
    at: opts.at,
    approver: opts.approver,
    ...opts.reason !== void 0 ? { reason: opts.reason } : {}
  });
  story.acceptance = acc;
}
function freeLaneIfActive(pipeline, storyId) {
  if (pipeline.build_active === storyId) pipeline.build_active = null;
}
function acceptStory(pipeline, storyId, opts) {
  const story = pipeline.stories[storyId];
  if (!story) throw new Error(`acceptStory: story ${storyId} is not in the pipeline`);
  recordAcceptance(story, "accepted", opts);
  if (story.experiment) {
    story.experiment.status = "merged";
    story.experiment.closed_at = opts.at;
  }
  setStoryStatus(pipeline, storyId, "done");
  freeLaneIfActive(pipeline, storyId);
  return pipeline;
}
function discardStory(pipeline, storyId, opts) {
  const story = pipeline.stories[storyId];
  if (!story) throw new Error(`discardStory: story ${storyId} is not in the pipeline`);
  recordAcceptance(story, "discarded", opts);
  if (story.experiment) {
    story.experiment.status = "discarded";
    story.experiment.closed_at = opts.at;
  }
  if (story.gate) markGateWithdrawn(story.gate, opts);
  setStoryStatus(pipeline, storyId, "discarded");
  freeLaneIfActive(pipeline, storyId);
  return pipeline;
}
function reviseStory(pipeline, storyId, opts) {
  const story = pipeline.stories[storyId];
  if (!story) throw new Error(`reviseStory: story ${storyId} is not in the pipeline`);
  recordAcceptance(story, "revise", opts);
  if (story.experiment) {
    story.experiment.status = "discarded";
    story.experiment.closed_at = opts.at;
  }
  if (story.gate) story.gate = { status: "open", history: story.gate.history };
  setStoryStatus(pipeline, storyId, "designing");
  freeLaneIfActive(pipeline, storyId);
  return pipeline;
}

// scripts/tdd/story-pipeline.cli.ts
var import_path2 = require("path");
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
function usage(msg) {
  process.stderr.write(
    `${msg}
Usage: lakebase-tdd-pipeline <status|set|surface|approve-gate|withdraw-gate|enqueue|dispatch|complete|cut-experiment|await-acceptance|accept|discard|revise> --feature <F> [--tdd-dir <dir>]
  set additionally needs --story <S> --status <${STORY_STATUSES.join("|")}>
  surface needs --story <S>
  approve-gate needs --story <S> --approver <A> [--spec-hash <H>] [--at <ISO>]
  withdraw-gate needs --story <S> --approver <A> --reason <R> [--at <ISO>]
  enqueue needs --story <S>
  cut-experiment needs --story <S> --slug <X> --branch <B> --parent <FB> [--lakebase-uid <U>] [--parent-sha <SHA>] [--n <N>] [--at <ISO>]
  await-acceptance needs --story <S>
  accept needs --story <S> --approver <A> [--at <ISO>]
  discard / revise need --story <S> --approver <A> --reason <R> [--at <ISO>]
`
  );
  return 2;
}
function rejectBatchedDraft(tddDir, feature, pipeline, story) {
  const batched = findBatchedDraftStories(tddDir, feature, pipeline, story);
  if (batched.length === 0) return null;
  process.stderr.write(
    `per-story draft invariant violated: ACs already exist for ${batched.join(", ")}, but ${story} is the story being gated.
The design lane drafts ONE story's acceptance criteria at a time (draft -> surface -> approve), then moves to the next story. Drafting every story's ACs in one pass defeats the streaming pipeline.
Remove the out-of-turn ACs (keep only ${story}'s), invoke the Spec Author once per story, and retry.
`
  );
  return 3;
}
function main() {
  const args = parse(process.argv.slice(2));
  const tddDir = args.tddDir ?? (0, import_path2.join)(process.cwd(), ".tdd");
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
        const exp = v.experiment ? `  exp=${v.experiment.slug}(${v.experiment.status})` : "";
        const acc = v.acceptance?.decision ? `  acceptance=${v.acceptance.decision}` : "";
        process.stdout.write(`  ${s}	${v.status}${gate}${exp}${acc}
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
      const batched = rejectBatchedDraft(tddDir, feature, pipeline, args.story);
      if (batched !== null) return batched;
      surfaceForGate(pipeline, args.story);
      writePipeline(tddDir, pipeline);
      process.stdout.write(`surfaced ${args.story} for the per-story spec gate (awaiting-gate)
`);
      return 0;
    }
    case "approve-gate": {
      if (!args.story) return usage("approve-gate needs --story");
      if (!args.approver) return usage("approve-gate needs --approver");
      const batched = rejectBatchedDraft(tddDir, feature, pipeline, args.story);
      if (batched !== null) return batched;
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
        n: args.n !== void 0 ? Number(args.n) : void 0,
        at: args.at ?? (/* @__PURE__ */ new Date()).toISOString()
      });
      writePipeline(tddDir, pipeline);
      process.stdout.write(`cut experiment ${args.slug} for ${args.story} on ${args.branch} (parent ${args.parent})
`);
      return 0;
    }
    case "await-acceptance": {
      if (!args.story) return usage("await-acceptance needs --story");
      awaitAcceptance(pipeline, args.story);
      writePipeline(tddDir, pipeline);
      process.stdout.write(`${args.story} -> awaiting-acceptance (PO reviewing the running story)
`);
      return 0;
    }
    case "accept": {
      if (!args.story) return usage("accept needs --story");
      if (!args.approver) return usage("accept needs --approver");
      acceptStory(pipeline, args.story, { approver: args.approver, at: args.at ?? (/* @__PURE__ */ new Date()).toISOString() });
      writePipeline(tddDir, pipeline);
      process.stdout.write(`accepted ${args.story}; experiment merged, story done, lane freed
`);
      return 0;
    }
    case "discard": {
      if (!args.story) return usage("discard needs --story");
      if (!args.approver) return usage("discard needs --approver");
      if (!args.reason) return usage("discard needs --reason");
      discardStory(pipeline, args.story, { approver: args.approver, at: args.at ?? (/* @__PURE__ */ new Date()).toISOString(), reason: args.reason });
      writePipeline(tddDir, pipeline);
      process.stdout.write(`discarded ${args.story} (${args.reason}); experiment torn down, out of sprint, lane freed
`);
      return 0;
    }
    case "revise": {
      if (!args.story) return usage("revise needs --story");
      if (!args.approver) return usage("revise needs --approver");
      if (!args.reason) return usage("revise needs --reason");
      reviseStory(pipeline, args.story, { approver: args.approver, at: args.at ?? (/* @__PURE__ */ new Date()).toISOString(), reason: args.reason });
      writePipeline(tddDir, pipeline);
      process.stdout.write(`revising ${args.story} (${args.reason}); experiment torn down, back to designing, lane freed
`);
      return 0;
    }
    default:
      return usage(`unknown subcommand: ${args.cmd}`);
  }
}
process.exit(main());
//# sourceMappingURL=story-pipeline.cli.cjs.map