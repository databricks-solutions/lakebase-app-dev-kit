#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// scripts/tdd/test-list.ts
var import_fs = require("fs");
var import_path = require("path");

// scripts/tdd/tdd-paths.ts
var fs = __toESM(require("fs"), 1);
var import_node_path = require("path");
var featuresDir = (tdd) => (0, import_node_path.join)(tdd, "features");
var featureDir = (tdd, featureId) => (0, import_node_path.join)(featuresDir(tdd), featureId);
var featureResolved = (tdd, f) => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
var featureTestListJson = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "test-list.json");
var storiesDir = (tdd, f) => (0, import_node_path.join)(featureResolved(tdd, f), "stories");
var storyDir = (tdd, f, s) => (0, import_node_path.join)(storiesDir(tdd, f), s);
function findStoryDir(tdd, f, s) {
  const root = storiesDir(tdd, f);
  if (!fs.existsSync(root)) return void 0;
  const exact = (0, import_node_path.join)(root, s);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === s || d.startsWith(`${s}-`));
  return matches.length === 1 ? (0, import_node_path.join)(root, matches[0]) : void 0;
}
var storyResolved = (tdd, f, s) => findStoryDir(tdd, f, s) ?? storyDir(tdd, f, s);
var storyTestListJson = (tdd, f, s) => (0, import_node_path.join)(storyResolved(tdd, f, s), "test-list-per-story.json");
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return void 0;
  const exact = (0, import_node_path.join)(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? (0, import_node_path.join)(root, matches[0]) : void 0;
}
function requireFeatureDir(tdd, featureId) {
  const dir = findFeatureDir(tdd, featureId);
  if (!dir) throw new Error(`feature ${featureId} not found (or ambiguous) under ${featuresDir(tdd)}`);
  return dir;
}

// scripts/tdd/test-list.ts
function readMasterTestList(tddDir, featureId) {
  requireFeatureDir(tddDir, featureId);
  const file = featureTestListJson(tddDir, featureId);
  if (!(0, import_fs.existsSync)(file)) {
    throw new Error(`master test-list.json not found for ${featureId} at ${file}`);
  }
  const parsed = JSON.parse((0, import_fs.readFileSync)(file, "utf8"));
  return { ...parsed, items: Array.isArray(parsed.items) ? parsed.items : [] };
}
function viewsForAllAcs(list) {
  const out = {};
  for (const item of list.items) {
    if (!out[item.ac_id]) out[item.ac_id] = { ac_id: item.ac_id, items: [] };
    out[item.ac_id].items.push(item);
  }
  return out;
}
function writePerAcViews(tddDir, featureId, list) {
  const featureDir2 = requireFeatureDir(tddDir, featureId);
  const views = viewsForAllAcs(list);
  const written = [];
  for (const [acId, view] of Object.entries(views)) {
    const storyDir2 = locateStoryDirForAc(featureDir2, acId);
    if (!storyDir2) continue;
    const outFile = (0, import_path.join)(storyDir2, "test-list-per-ac.json");
    let existing = [];
    if ((0, import_fs.existsSync)(outFile)) {
      existing = JSON.parse((0, import_fs.readFileSync)(outFile, "utf8"));
    }
    const merged = mergeViews(existing, view);
    (0, import_fs.mkdirSync)((0, import_path.dirname)(outFile), { recursive: true });
    (0, import_fs.writeFileSync)(outFile, JSON.stringify(merged, null, 2) + "\n");
    written.push(outFile);
  }
  return written;
}
function mergeViews(existing, next) {
  const remaining = existing.filter((v) => v.ac_id !== next.ac_id);
  remaining.push(next);
  return remaining;
}
function acIdsInStoryDir(storyDir2) {
  const acsDir = (0, import_path.join)(storyDir2, "acs");
  if (!(0, import_fs.existsSync)(acsDir)) return [];
  return (0, import_fs.readdirSync)(acsDir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -".json".length)).sort();
}
function scopeToStory(list, storyId, acIds) {
  const want = new Set(acIds);
  return {
    feature_id: list.feature_id,
    story_id: storyId,
    ...list.ordered_for ? { ordered_for: list.ordered_for } : {},
    items: list.items.filter((it) => want.has(it.ac_id))
  };
}
function writeStoryTestList(tddDir, featureId, storyId) {
  const storyDir2 = findStoryDir(tddDir, featureId, storyId);
  if (!storyDir2) return null;
  let master;
  try {
    master = readMasterTestList(tddDir, featureId);
  } catch {
    return null;
  }
  const scoped = scopeToStory(master, storyId, acIdsInStoryDir(storyDir2));
  const file = storyTestListJson(tddDir, featureId, storyId);
  (0, import_fs.mkdirSync)((0, import_path.dirname)(file), { recursive: true });
  (0, import_fs.writeFileSync)(file, JSON.stringify(scoped, null, 2) + "\n");
  return file;
}
function locateStoryDirForAc(featureDir2, acId) {
  const storiesDir2 = (0, import_path.join)(featureDir2, "stories");
  if (!(0, import_fs.existsSync)(storiesDir2)) return null;
  for (const storyDirName of (0, import_fs.readdirSync)(storiesDir2)) {
    const storyDir2 = (0, import_path.join)(storiesDir2, storyDirName);
    if (!(0, import_fs.statSync)(storyDir2).isDirectory()) continue;
    const acsDir = (0, import_path.join)(storyDir2, "acs");
    if (!(0, import_fs.existsSync)(acsDir)) continue;
    const match = (0, import_fs.readdirSync)(acsDir).find((f) => f.startsWith(acId) && f.endsWith(".json"));
    if (match) return storyDir2;
  }
  return null;
}

// scripts/tdd/test-list.cli.ts
function main() {
  const [tddDir = ".tdd", featureId, storyId] = process.argv.slice(2);
  if (!featureId) {
    process.stderr.write("usage: test-list <tddDir> <featureId> [storyId]\n");
    return 1;
  }
  if (storyId) {
    const file = writeStoryTestList(tddDir, featureId, storyId);
    if (!file) {
      process.stderr.write(`story ${storyId} not found under ${featureId}
`);
      return 1;
    }
    process.stdout.write(`wrote ${file}
`);
    return 0;
  }
  const list = readMasterTestList(tddDir, featureId);
  const written = writePerAcViews(tddDir, featureId, list);
  for (const f of written) process.stdout.write(`wrote ${f}
`);
  return 0;
}
try {
  process.exit(main());
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}
`);
  process.exit(1);
}
//# sourceMappingURL=test-list.cli.cjs.map