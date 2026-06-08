import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import {
  requireFeatureDir as findFeatureDir,
  findStoryDir as findStoryDirOf,
  featureTestListJson,
  featureTestListMd,
  storyTestListJson,
  acJson,
} from "./tdd-paths.js";

export interface TestListItem {
  id: string;
  description: string;
  ac_id: string;
  status: "pending" | "red" | "green" | "refactored" | "skipped";
  scenario_file?: string;
  notes?: string;
}

export interface TestList {
  feature_id: string;
  ordered_for?: "design-momentum" | "risk-first" | "happy-path-first";
  items: TestListItem[];
}

export function readMasterTestList(tddDir: string, featureId: string): TestList {
  findFeatureDir(tddDir, featureId); // assert the feature exists (throws if not)
  const file = featureTestListJson(tddDir, featureId);
  if (!existsSync(file)) {
    throw new Error(`master test-list.json not found for ${featureId} at ${file}`);
  }
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<TestList>;
  // Normalize `items` to an array at the single read point so every consumer
  // (scopeToStory / viewByAc / renderTestListMarkdown) is safe. A Test Strategist
  // that wrote a non-conformant master (e.g. a top-level `tests` key instead of
  // `items`, which haiku has done) must NOT crash the driver with an opaque
  // "Cannot read properties of undefined (reading 'filter')": it yields an empty
  // list, so testListReady stays false and the lane re-issues the role (surfaced
  // as a clean stall), and the test_list conformance gate flags the bad shape.
  return { ...parsed, items: Array.isArray(parsed.items) ? parsed.items : [] } as TestList;
}

export function writeMasterTestList(tddDir: string, list: TestList): void {
  findFeatureDir(tddDir, list.feature_id); // assert the feature exists (throws if not)
  const file = featureTestListJson(tddDir, list.feature_id);
  writeFileSync(file, JSON.stringify(list, null, 2) + "\n");
}

/**
 * Render test-list.md from the JSON so the human-readable Beck list cannot
 * drift from the structured source. Output satisfies the test-list.md
 * conformance contract: H1 + "Ordered for:" rationale + an AC reference on
 * every active item + a Deferred / skipped section. Skipped items are listed
 * under Deferred (not as checklist rows) so they are not mistaken for orphans.
 */
export function renderTestListMarkdown(list: TestList): string {
  const orderedFor = list.ordered_for ?? "design-momentum";
  const active = list.items.filter((it) => it.status !== "skipped");
  const deferred = list.items.filter((it) => it.status === "skipped");

  const checkbox = (status: TestListItem["status"]): string =>
    status === "green" || status === "refactored" ? "x" : " ";

  const lines: string[] = [
    `# Test list: ${list.feature_id}`,
    `Ordered for: ${orderedFor}`,
    "",
  ];
  for (const item of active) {
    lines.push(`- [${checkbox(item.status)}] ${item.id}: ${item.description}  (${item.ac_id})`);
  }
  lines.push("", "## Deferred / skipped");
  if (deferred.length === 0) {
    lines.push("- (none)");
  } else {
    for (const item of deferred) {
      const why = item.notes ? `: ${item.notes}` : "";
      lines.push(`- ${item.id}: ${item.description} (${item.ac_id})${why}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

/** Render + write test-list.md next to test-list.json. Returns the path. */
export function writeTestListMarkdown(tddDir: string, featureId: string): string {
  const list = readMasterTestList(tddDir, featureId);
  const file = featureTestListMd(tddDir, featureId);
  writeFileSync(file, renderTestListMarkdown(list));
  return file;
}

export interface PerAcView {
  ac_id: string;
  items: TestListItem[];
}

export function viewByAc(list: TestList, acId: string): PerAcView {
  return {
    ac_id: acId,
    items: list.items.filter((it) => it.ac_id === acId),
  };
}

export function viewsForAllAcs(list: TestList): Record<string, PerAcView> {
  const out: Record<string, PerAcView> = {};
  for (const item of list.items) {
    if (!out[item.ac_id]) out[item.ac_id] = { ac_id: item.ac_id, items: [] };
    out[item.ac_id].items.push(item);
  }
  return out;
}

export function writePerAcViews(tddDir: string, featureId: string, list: TestList): string[] {
  const featureDir = findFeatureDir(tddDir, featureId);
  const views = viewsForAllAcs(list);
  const written: string[] = [];
  for (const [acId, view] of Object.entries(views)) {
    const storyDir = locateStoryDirForAc(featureDir, acId);
    if (!storyDir) continue;
    const outFile = join(storyDir, "test-list-per-ac.json");
    let existing: PerAcView[] = [];
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

function mergeViews(existing: PerAcView[], next: PerAcView): PerAcView[] {
  const remaining = existing.filter((v) => v.ac_id !== next.ac_id);
  remaining.push(next);
  return remaining;
}

// --- Per-story scoping (FEIP-7565 phase 2c) -------------------------------
//
// The master test-list.json is feature-level; its items each carry an ac_id.
// The streaming build lane builds one story at a time, so it needs the subset
// of the list scoped to the story being built: every item whose AC belongs to
// that story, in the master's order (so the Test Strategist's chosen ordering
// carries through). Written as stories/<story>/test-list-per-story.json, the
// build lane's per-story input. AC->story membership comes from the story's
// acs/ dir, the same layout run-cycle + writePerAcViews already use.

export interface StoryTestList {
  feature_id: string;
  story_id: string;
  ordered_for?: TestList["ordered_for"];
  items: TestListItem[];
}

/** AC ids declared under a story dir's acs/ (filenames minus .json), sorted. */
function acIdsInStoryDir(storyDir: string): string[] {
  const acsDir = join(storyDir, "acs");
  if (!existsSync(acsDir)) return [];
  return readdirSync(acsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
}

/** AC ids declared for a story, read from stories/<story>/acs/*.json. */
export function acsForStory(tddDir: string, featureId: string, storyId: string): string[] {
  const storyDir = findStoryDirOf(tddDir, featureId, storyId);
  return storyDir ? acIdsInStoryDir(storyDir) : [];
}

/**
 * Scope a master test list to the given AC ids, preserving the master's order.
 * Pure: no filesystem access.
 */
export function scopeToStory(list: TestList, storyId: string, acIds: string[]): StoryTestList {
  const want = new Set(acIds);
  return {
    feature_id: list.feature_id,
    story_id: storyId,
    ...(list.ordered_for ? { ordered_for: list.ordered_for } : {}),
    items: list.items.filter((it) => want.has(it.ac_id)),
  };
}

/**
 * Read the master test list, scope it to one story's ACs, and write the
 * canonical per-story list (storyTestListJson, the build lane's per-story input
 * AND the driver's testListReady probe target , one path, defined once). Returns
 * the written path, or null when the story cannot be resolved or the master is
 * not yet written (so a missing master surfaces as a stall, not a crash).
 */
export function writeStoryTestList(
  tddDir: string,
  featureId: string,
  storyId: string,
): string | null {
  const storyDir = findStoryDirOf(tddDir, featureId, storyId);
  if (!storyDir) return null;
  let master: TestList;
  try {
    master = readMasterTestList(tddDir, featureId);
  } catch {
    return null; // master not authored yet; nothing to scope
  }
  const scoped = scopeToStory(master, storyId, acIdsInStoryDir(storyDir));
  const file = storyTestListJson(tddDir, featureId, storyId);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(scoped, null, 2) + "\n");
  return file;
}

export interface TestItemGreenResult {
  /** The test_id was found in the master list + marked green. */
  found: boolean;
  /** The AC the test belongs to. */
  acId?: string;
  /** True iff EVERY test for that AC is now green/refactored (AC -> passing). */
  acPassing: boolean;
}

/**
 * Propagate a GREEN cycle up the artifact hierarchy the downstream consumers
 * read: mark the test-list item green (master + the re-derived per-story list)
 * and, when every test for its AC is green, flip the AC's status to `passing`.
 *
 * This is the deterministic record the orchestration writes when it greens a
 * cycle. Without it the cycle artifact says green but the test-list items stay
 * `pending` + the AC stays `draft`, so the Release Engineer (reading those)
 * judges the build incomplete and refuses to deploy , the await-acceptance
 * stall. Cycle bookkeeping is an orchestration concern; so is propagating it.
 */
export function markTestItemGreen(
  tddDir: string,
  featureId: string,
  storyId: string,
  testId: string,
): TestItemGreenResult {
  let master: TestList;
  try {
    master = readMasterTestList(tddDir, featureId);
  } catch {
    return { found: false, acPassing: false };
  }
  const item = master.items.find((i) => i.id === testId);
  if (!item) return { found: false, acPassing: false };
  item.status = "green";
  writeMasterTestList(tddDir, master);
  try {
    writeTestListMarkdown(tddDir, featureId);
  } catch {
    /* md render is observability, never fatal */
  }
  // Re-derive the per-story list from master so its items carry the green too.
  writeStoryTestList(tddDir, featureId, storyId);

  const acId = item.ac_id;
  const acItems = master.items.filter((i) => i.ac_id === acId);
  const acPassing = acItems.length > 0 && acItems.every((i) => i.status === "green" || i.status === "refactored");
  if (acPassing) {
    try {
      const f = acJson(tddDir, featureId, storyId, acId);
      if (existsSync(f)) {
        const ac = JSON.parse(readFileSync(f, "utf8")) as Record<string, unknown>;
        ac.status = "passing"; // ac.schema.json enum: draft|approved|in-progress|passing|deprecated
        writeFileSync(f, JSON.stringify(ac, null, 2) + "\n");
      }
    } catch {
      /* best-effort: a malformed/absent AC file must not break greening */
    }
  }
  return { found: true, acId, acPassing };
}

/** Read the canonical per-story list (storyTestListJson), or null when absent. */
export function readStoryTestList(
  tddDir: string,
  featureId: string,
  storyId: string,
): StoryTestList | null {
  const file = storyTestListJson(tddDir, featureId, storyId);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

function locateStoryDirForAc(featureDir: string, acId: string): string | null {
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
