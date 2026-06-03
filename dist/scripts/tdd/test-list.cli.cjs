#!/usr/bin/env node
"use strict";

// scripts/tdd/test-list.ts
var import_fs = require("fs");
var import_path = require("path");
function readMasterTestList(tddDir, featureId) {
  const dir = findFeatureDir(tddDir, featureId);
  const file = (0, import_path.join)(dir, "test-list.json");
  if (!(0, import_fs.existsSync)(file)) {
    throw new Error(`master test-list.json not found for ${featureId} at ${file}`);
  }
  return JSON.parse((0, import_fs.readFileSync)(file, "utf8"));
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
  const featureDir = findFeatureDir(tddDir, featureId);
  const views = viewsForAllAcs(list);
  const written = [];
  for (const [acId, view] of Object.entries(views)) {
    const storyDir = locateStoryDirForAc(featureDir, acId);
    if (!storyDir) continue;
    const outFile = (0, import_path.join)(storyDir, "test-list-per-ac.json");
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
function locateStoryDirForAc(featureDir, acId) {
  const storiesDir = (0, import_path.join)(featureDir, "stories");
  if (!(0, import_fs.existsSync)(storiesDir)) return null;
  for (const storyDirName of (0, import_fs.readdirSync)(storiesDir)) {
    const storyDir = (0, import_path.join)(storiesDir, storyDirName);
    if (!(0, import_fs.statSync)(storyDir).isDirectory()) continue;
    const acsDir = (0, import_path.join)(storyDir, "acs");
    if (!(0, import_fs.existsSync)(acsDir)) continue;
    const match = (0, import_fs.readdirSync)(acsDir).find((f) => f.startsWith(acId) && f.endsWith(".json"));
    if (match) return storyDir;
  }
  return null;
}
function findFeatureDir(tddDir, featureId) {
  const featuresDir = (0, import_path.join)(tddDir, "features");
  if (!(0, import_fs.existsSync)(featuresDir)) {
    throw new Error(`${featuresDir} does not exist`);
  }
  const candidates = (0, import_fs.readdirSync)(featuresDir).filter((d) => d.startsWith(featureId));
  if (candidates.length === 0) {
    throw new Error(`feature ${featureId} not found under ${featuresDir}`);
  }
  return (0, import_path.join)(featuresDir, candidates[0]);
}

// scripts/tdd/test-list.cli.ts
function main() {
  const [tddDir = ".tdd", featureId] = process.argv.slice(2);
  if (!featureId) {
    process.stderr.write("usage: test-list <tddDir> <featureId>\n");
    return 1;
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