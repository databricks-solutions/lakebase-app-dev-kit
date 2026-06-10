#!/usr/bin/env node

// scripts/tdd/test-list.ts
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2, existsSync as existsSync2, mkdirSync as mkdirSync2, readdirSync as readdirSync2, statSync as statSync2 } from "fs";
import { join as join2, dirname } from "path";

// scripts/tdd/tdd-paths.ts
import * as fs from "fs";
import { join } from "path";
var featuresDir = (tdd) => join(tdd, "features");
var featureDir = (tdd, featureId) => join(featuresDir(tdd), featureId);
var featureResolved = (tdd, f) => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
var featureTestListJson = (tdd, f) => join(featureResolved(tdd, f), "test-list.json");
var storiesDir = (tdd, f) => join(featureResolved(tdd, f), "stories");
var storyDir = (tdd, f, s) => join(storiesDir(tdd, f), s);
function findStoryDir(tdd, f, s) {
  const root = storiesDir(tdd, f);
  if (!fs.existsSync(root)) return void 0;
  const exact = join(root, s);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === s || d.startsWith(`${s}-`));
  return matches.length === 1 ? join(root, matches[0]) : void 0;
}
var storyResolved = (tdd, f, s) => findStoryDir(tdd, f, s) ?? storyDir(tdd, f, s);
var storyTestListJson = (tdd, f, s) => join(storyResolved(tdd, f, s), "test-list-per-story.json");
function findFeatureDir(tdd, featureId) {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return void 0;
  const exact = join(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? join(root, matches[0]) : void 0;
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
  if (!existsSync2(file)) {
    throw new Error(`master test-list.json not found for ${featureId} at ${file}`);
  }
  const parsed = JSON.parse(readFileSync2(file, "utf8"));
  return { ...parsed, items: Array.isArray(parsed.items) ? parsed.items : [] };
}
function writeMasterTestList(tddDir, list) {
  requireFeatureDir(tddDir, list.feature_id);
  const file = featureTestListJson(tddDir, list.feature_id);
  writeFileSync2(file, JSON.stringify(list, null, 2) + "\n");
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
    const outFile = join2(storyDir2, "test-list-per-ac.json");
    let existing = [];
    if (existsSync2(outFile)) {
      existing = JSON.parse(readFileSync2(outFile, "utf8"));
    }
    const merged = mergeViews(existing, view);
    mkdirSync2(dirname(outFile), { recursive: true });
    writeFileSync2(outFile, JSON.stringify(merged, null, 2) + "\n");
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
  const dir = join2(storyDir2, "acs");
  if (!existsSync2(dir)) return [];
  const out = [];
  for (const f of readdirSync2(dir)) {
    if (!f.endsWith(".json")) continue;
    const base = f.slice(0, -".json".length);
    try {
      const obj = JSON.parse(readFileSync2(join2(dir, f), "utf8"));
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
    const haveIds = new Set(baseList.items.map((i) => i.id));
    const additions = authored.items.filter((it) => storyAcIds.includes(it.ac_id) && !haveIds.has(it.id));
    if (additions.length > 0 || master === null) {
      master = { ...baseList, items: [...baseList.items, ...additions] };
      writeMasterTestList(tddDir, master);
    }
  }
  if (!master) return null;
  const scoped = scopeToStory(master, storyId, storyAcIds);
  const file = storyTestListJson(tddDir, featureId, storyId);
  mkdirSync2(dirname(file), { recursive: true });
  writeFileSync2(file, JSON.stringify(scoped, null, 2) + "\n");
  return file;
}
function readStoryTestList(tddDir, featureId, storyId) {
  const file = storyTestListJson(tddDir, featureId, storyId);
  if (!existsSync2(file)) return null;
  return JSON.parse(readFileSync2(file, "utf8"));
}
function locateStoryDirForAc(featureDir2, acId) {
  const storiesDir2 = join2(featureDir2, "stories");
  if (!existsSync2(storiesDir2)) return null;
  for (const storyDirName of readdirSync2(storiesDir2)) {
    const storyDir2 = join2(storiesDir2, storyDirName);
    if (!statSync2(storyDir2).isDirectory()) continue;
    const acsDir = join2(storyDir2, "acs");
    if (!existsSync2(acsDir)) continue;
    const match = readdirSync2(acsDir).find((f) => f.startsWith(acId) && f.endsWith(".json"));
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
//# sourceMappingURL=test-list.cli.js.map