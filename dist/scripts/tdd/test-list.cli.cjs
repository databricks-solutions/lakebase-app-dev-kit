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
function writeMasterTestList(tddDir, list) {
  requireFeatureDir(tddDir, list.feature_id);
  const file = featureTestListJson(tddDir, list.feature_id);
  (0, import_fs.writeFileSync)(file, JSON.stringify(list, null, 2) + "\n");
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
  const dir = (0, import_path.join)(storyDir2, "acs");
  if (!(0, import_fs.existsSync)(dir)) return [];
  const out = [];
  for (const f of (0, import_fs.readdirSync)(dir)) {
    if (!f.endsWith(".json")) continue;
    const base = f.slice(0, -".json".length);
    try {
      const obj = JSON.parse((0, import_fs.readFileSync)((0, import_path.join)(dir, f), "utf8"));
      if (obj && typeof obj.id === "string" && obj.id === base) out.push(base);
    } catch {
    }
  }
  return out.sort();
}
function scopeToStory(list, storyId, acIds) {
  const want = new Set(acIds);
  const scoped = list.items.filter((it) => want.has(it.ac_id));
  const firstSeen = /* @__PURE__ */ new Map();
  scoped.forEach((it, i) => {
    if (!firstSeen.has(it.ac_id)) firstSeen.set(it.ac_id, i);
  });
  const grouped = scoped.map((it, i) => ({ it, i })).sort((a, b) => firstSeen.get(a.it.ac_id) - firstSeen.get(b.it.ac_id) || a.i - b.i).map((x) => x.it);
  return {
    feature_id: list.feature_id,
    story_id: storyId,
    ...list.ordered_for ? { ordered_for: list.ordered_for } : {},
    items: grouped
  };
}
function nextTestNumber(items) {
  let max = 0;
  for (const it of items) {
    const m = /^T(\d+)$/.exec(it.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return Math.max(max, items.length) + 1;
}
function writeStoryTestList(tddDir, featureId, storyId) {
  const storyDir2 = findStoryDir(tddDir, featureId, storyId);
  if (!storyDir2) return null;
  const storyAcIds = acIdsInStoryDir(storyDir2);
  let master = null;
  try {
    master = readMasterTestList(tddDir, featureId);
  } catch {
    master = null;
  }
  const authored = readStoryTestList(tddDir, featureId, storyId);
  if (authored?.items?.length) {
    const baseList = master ?? {
      feature_id: featureId,
      ...authored.ordered_for ? { ordered_for: authored.ordered_for } : {},
      items: []
    };
    const key = (it) => `${it.ac_id}\0${it.description}`;
    const have = new Set(baseList.items.map(key));
    const usedIds = new Set(baseList.items.map((i) => i.id));
    const fresh = authored.items.filter((it) => storyAcIds.includes(it.ac_id) && !have.has(key(it)));
    if (fresh.length > 0 || master === null) {
      let n = nextTestNumber(baseList.items);
      const renumbered = fresh.map((it) => {
        if (!usedIds.has(it.id)) {
          usedIds.add(it.id);
          return it;
        }
        let nid = `T${n++}`;
        while (usedIds.has(nid)) nid = `T${n++}`;
        usedIds.add(nid);
        return { ...it, id: nid };
      });
      master = { ...baseList, items: [...baseList.items, ...renumbered] };
      writeMasterTestList(tddDir, master);
    }
  }
  if (!master) return null;
  const scoped = scopeToStory(master, storyId, storyAcIds);
  const file = storyTestListJson(tddDir, featureId, storyId);
  (0, import_fs.mkdirSync)((0, import_path.dirname)(file), { recursive: true });
  (0, import_fs.writeFileSync)(file, JSON.stringify(scoped, null, 2) + "\n");
  return file;
}
function readStoryTestList(tddDir, featureId, storyId) {
  const file = storyTestListJson(tddDir, featureId, storyId);
  if (!(0, import_fs.existsSync)(file)) return null;
  return JSON.parse((0, import_fs.readFileSync)(file, "utf8"));
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