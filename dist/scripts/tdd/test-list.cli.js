#!/usr/bin/env node

// scripts/tdd/test-list.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
function readMasterTestList(tddDir, featureId) {
  const dir = findFeatureDir(tddDir, featureId);
  const file = join(dir, "test-list.json");
  if (!existsSync(file)) {
    throw new Error(`master test-list.json not found for ${featureId} at ${file}`);
  }
  return JSON.parse(readFileSync(file, "utf8"));
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
    const outFile = join(storyDir, "test-list-per-ac.json");
    let existing = [];
    if (existsSync(outFile)) {
      existing = JSON.parse(readFileSync(outFile, "utf8"));
    }
    const merged = mergeViews(existing, view);
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, JSON.stringify(merged, null, 2) + "\n");
    written.push(outFile);
  }
  return written;
}
function mergeViews(existing, next) {
  const remaining = existing.filter((v) => v.ac_id !== next.ac_id);
  remaining.push(next);
  return remaining;
}
function acIdsInStoryDir(storyDir) {
  const acsDir = join(storyDir, "acs");
  if (!existsSync(acsDir)) return [];
  return readdirSync(acsDir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -".json".length)).sort();
}
function findStoryDir(featureDir, storyId) {
  const storiesDir = join(featureDir, "stories");
  if (!existsSync(storiesDir)) return null;
  const dirs = readdirSync(storiesDir).filter(
    (d) => statSync(join(storiesDir, d)).isDirectory()
  );
  const match = dirs.find((d) => d === storyId) ?? dirs.find((d) => d.startsWith(storyId));
  return match ? join(storiesDir, match) : null;
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
  const storyDir = findStoryDir(findFeatureDir(tddDir, featureId), storyId);
  if (!storyDir) return null;
  const scoped = scopeToStory(
    readMasterTestList(tddDir, featureId),
    storyId,
    acIdsInStoryDir(storyDir)
  );
  const file = join(storyDir, "test-list-per-story.json");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(scoped, null, 2) + "\n");
  return file;
}
function locateStoryDirForAc(featureDir, acId) {
  const storiesDir = join(featureDir, "stories");
  if (!existsSync(storiesDir)) return null;
  for (const storyDirName of readdirSync(storiesDir)) {
    const storyDir = join(storiesDir, storyDirName);
    if (!statSync(storyDir).isDirectory()) continue;
    const acsDir = join(storyDir, "acs");
    if (!existsSync(acsDir)) continue;
    const match = readdirSync(acsDir).find((f) => f.startsWith(acId) && f.endsWith(".json"));
    if (match) return storyDir;
  }
  return null;
}
function findFeatureDir(tddDir, featureId) {
  const featuresDir = join(tddDir, "features");
  if (!existsSync(featuresDir)) {
    throw new Error(`${featuresDir} does not exist`);
  }
  const candidates = readdirSync(featuresDir).filter((d) => d.startsWith(featureId));
  if (candidates.length === 0) {
    throw new Error(`feature ${featureId} not found under ${featuresDir}`);
  }
  return join(featuresDir, candidates[0]);
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