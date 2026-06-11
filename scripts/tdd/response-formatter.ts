// response-formatter: the AGENT-SIDE deterministic precheck.
//
// A role runs this on its OWN output BEFORE it returns, so it catches its own
// nonconformance locally (it "knows where it got it wrong from its side")
// instead of handing back null/garbage and forcing an orchestrator retry. It is
// the type-checker for a role's artifact: given the role + scope, it validates
// the artifact the role just wrote against that role's contract and reports the
// SPECIFIC violations. The CLI (response-formatter.cli) THROWS (non-zero) on any
// violation, so a role that runs it cannot silently return a malformed result.
//
// This is the upstream complement to the orchestrator-side expectation queue
// (orchestrator-expect.ts): the queue is the SAFETY NET that hands back + retries
// + aborts when a bad result still escapes; response-formatter is the PRIMARY
// defense that stops most bad results at the source. The two share the same
// contracts, e.g. the test-strategist owes a non-empty per-story test list whose
// every item maps to one of the story's ACs (the S2 live-stall bug).

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { storyAcIds, readAcLayer, storyTestListJson, acsDir } from "./tdd-paths.js";
import { checkArtifactConformance, canonicalArtifactName } from "./artifact-conformance.js";

export interface FormatViolation {
  /** The artifact (relative-ish path / name) that failed. */
  artifact: string;
  /** What is wrong, specifically + actionably. */
  problem: string;
}

export interface FormatResult {
  role: string;
  story?: string;
  ok: boolean;
  violations: FormatViolation[];
}

export interface FormatArgs {
  role: string;
  tddDir: string;
  featureId: string;
  /** Required for the per-story roles (spec-author / architect-reviewer / test-strategist). */
  story?: string;
}

/** Roles whose output this precheck knows how to type-check. Others are a no-op
 *  PASS (nothing to deterministically validate yet), extend as contracts grow. */
export const FORMATTED_ROLES = new Set([
  "spec-author",
  "architect-reviewer",
  "test-strategist",
]);

function needStory(role: string, story: string | undefined, violations: FormatViolation[]): story is string {
  if (!story) {
    violations.push({ artifact: role, problem: `--story is required to validate ${role} output` });
    return false;
  }
  return true;
}

/** spec-author (per story): >=1 AC, and every acs/<AC>.json conforms to ac.schema
 *  (AC<n> id pattern, required fields). The malformed-AC / slug-id source. */
function checkSpecAuthor(args: FormatArgs, v: FormatViolation[]): void {
  const { tddDir, featureId, story } = args;
  if (!needStory("spec-author", story, v)) return;
  const dir = acsDir(tddDir, featureId, story);
  const ids = storyAcIds(tddDir, featureId, story);
  if (ids.length === 0) {
    v.push({ artifact: `stories/${story}/acs`, problem: "no acceptance criteria written (expected >=1 AC<n>.json)" });
    return;
  }
  if (!existsSync(dir)) return;
  // Collect normalized `then` clauses to backstop the AC-independence contract:
  // two ACs in a story with an identical `then` are a literal overlap (the
  // semantic case, one AC's `then` implied by another's, is the test-strategist's
  // ac-overlap judgment, this only catches the exact-duplicate defect).
  const thenById = new Map<string, string>();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    let content: string;
    try {
      content = readFileSync(`${dir}/${f}`, "utf8");
    } catch {
      continue;
    }
    const r = checkArtifactConformance(canonicalArtifactName(`${dir}/${f}`), content);
    if (!r.ok) v.push({ artifact: `stories/${story}/acs/${f}`, problem: r.violations.join("; ") });
    try {
      const ac = JSON.parse(content) as { id?: string; then?: string };
      if (typeof ac.id === "string" && typeof ac.then === "string") {
        const norm = ac.then.trim().replace(/\s+/g, " ").toLowerCase();
        if (norm) thenById.set(ac.id, norm);
      }
    } catch {
      /* conformance above already flags unparseable JSON */
    }
  }
  // Flag exact-duplicate `then` clauses: each pair is a non-independent AC.
  const byThen = new Map<string, string[]>();
  for (const [id, norm] of thenById) (byThen.get(norm) ?? byThen.set(norm, []).get(norm)!).push(id);
  for (const ids of byThen.values()) {
    if (ids.length > 1) {
      v.push({
        artifact: `stories/${story}/acs`,
        problem: `ACs ${ids.sort().join(", ")} share an identical \`then\`, each AC must be an independent observable behavior. Merge them or differentiate (ac-overlap).`,
      });
    }
  }
}

/** architect-reviewer (per story): every AC has a valid layer annotation. */
function checkArchitect(args: FormatArgs, v: FormatViolation[]): void {
  const { tddDir, featureId, story } = args;
  if (!needStory("architect-reviewer", story, v)) return;
  const ids = storyAcIds(tddDir, featureId, story);
  if (ids.length === 0) {
    v.push({ artifact: `stories/${story}/acs`, problem: "no ACs to annotate (spec-author output missing)" });
    return;
  }
  for (const ac of ids) {
    if (readAcLayer(tddDir, featureId, ac) === undefined) {
      v.push({ artifact: `stories/${story}/acs/${ac}.json`, problem: "missing/invalid `layer` (expected API | E2E | Infra)" });
    }
  }
}

/** test-strategist (per story): the per-story test list exists, parses, has >=1
 *  item, and EVERY item's ac_id maps to one of the story's ACs. The S2 live
 *  stall was exactly this: items with ac_id:null / unmapped -> empty scope. */
function checkTestStrategist(args: FormatArgs, v: FormatViolation[]): void {
  const { tddDir, featureId, story } = args;
  if (!needStory("test-strategist", story, v)) return;
  const file = storyTestListJson(tddDir, featureId, story);
  if (!existsSync(file)) {
    v.push({ artifact: `stories/${story}/test-list-per-story.json`, problem: "per-story test list not written" });
    return;
  }
  let parsed: { items?: unknown };
  try {
    parsed = JSON.parse(readFileSync(file, "utf8")) as { items?: unknown };
  } catch (e) {
    v.push({ artifact: `stories/${story}/test-list-per-story.json`, problem: `invalid JSON: ${e instanceof Error ? e.message : String(e)}` });
    return;
  }
  const items = Array.isArray(parsed.items) ? (parsed.items as Array<{ id?: unknown; ac_id?: unknown }>) : [];
  if (items.length === 0) {
    v.push({ artifact: `stories/${story}/test-list-per-story.json`, problem: "empty `items` (expected >=1 test mapped to the story's ACs)" });
    return;
  }
  const acIds = new Set(storyAcIds(tddDir, featureId, story));
  items.forEach((item, i) => {
    const acId = item.ac_id;
    if (typeof acId !== "string" || acId.length === 0) {
      v.push({ artifact: `stories/${story}/test-list-per-story.json`, problem: `items[${i}] (${String(item.id)}) has null/empty ac_id` });
    } else if (acIds.size > 0 && !acIds.has(acId)) {
      v.push({
        artifact: `stories/${story}/test-list-per-story.json`,
        problem: `items[${i}] ac_id "${acId}" is not one of the story's ACs [${[...acIds].join(", ")}]`,
      });
    }
  });
}

const CHECKERS: Record<string, (a: FormatArgs, v: FormatViolation[]) => void> = {
  "spec-author": checkSpecAuthor,
  "architect-reviewer": checkArchitect,
  "test-strategist": checkTestStrategist,
};

/**
 * Type-check a role's just-produced output against its contract. Returns the
 * specific violations (empty => conformant). A role NOT in CHECKERS passes (no
 * deterministic contract yet). The CLI turns a non-ok result into a throw.
 */
export function formatRoleResponse(args: FormatArgs): FormatResult {
  const violations: FormatViolation[] = [];
  const checker = CHECKERS[args.role];
  if (checker) checker(args, violations);
  return { role: args.role, ...(args.story ? { story: args.story } : {}), ok: violations.length === 0, violations };
}
