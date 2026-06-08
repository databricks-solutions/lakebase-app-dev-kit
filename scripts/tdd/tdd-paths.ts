// Single source of truth for `.tdd/` artifact layout + format accessors.
//
// WHY THIS EXISTS: the knowledge of where each artifact lives and what shape it
// has was copy-pasted across ~20 files (findFeatureDir alone had 6 divergent
// copies). Producers and consumers then drifted onto different paths/fields and
// the deterministic driver stalled. Everything that touches a `.tdd/` artifact
// imports from HERE, so a producer and its consumer cannot reference different
// locations. Pure path builders + a few explicit read/write accessors; no other
// side effects.

import * as fs from "node:fs";
import { join } from "node:path";

// ── Top-level dirs ────────────────────────────────────────────────
export const featuresDir = (tdd: string): string => join(tdd, "features");
export const planningDir = (tdd: string): string => join(tdd, "planning");
export const sprintsDir = (tdd: string): string => join(tdd, "sprints");
export const cyclesRootDir = (tdd: string): string => join(tdd, "cycles");
export const experimentsRootDir = (tdd: string): string => join(tdd, "experiments");

// ── Project-level artifacts ───────────────────────────────────────
export const workflowStateJson = (tdd: string): string => join(tdd, "workflow-state.json");
export const productOverviewMd = (tdd: string): string => join(tdd, "product-overview.md");
export const nfrsMd = (tdd: string): string => join(tdd, "nfrs.md");
export const designBriefMd = (tdd: string): string => join(tdd, "design", "design-brief.md");
/** The Spec Author's sprint proposal. ONE canonical location (project-level,
 *  sequential across sprints) , the path the spec-author actually writes. */
export const featureProposalsMd = (tdd: string): string => join(planningDir(tdd), "feature-proposals.md");

// ── Feature scope ─────────────────────────────────────────────────
export const featureDir = (tdd: string, featureId: string): string => join(featuresDir(tdd), featureId);
export const featureSpecJson = (tdd: string, f: string): string => join(featureDir(tdd, f), "feature-spec.json");
export const featureSpecMd = (tdd: string, f: string): string => join(featureDir(tdd, f), "feature-spec.md");
export const featureRequestMd = (tdd: string, f: string): string => join(featureDir(tdd, f), "feature-request.md");
export const architectureJson = (tdd: string, f: string): string => join(featureDir(tdd, f), "architecture.json");
export const architectureMd = (tdd: string, f: string): string => join(featureDir(tdd, f), "architecture.md");
export const featureTestListJson = (tdd: string, f: string): string => join(featureDir(tdd, f), "test-list.json");
export const featureTestListMd = (tdd: string, f: string): string => join(featureDir(tdd, f), "test-list.md");
export const pipelineJson = (tdd: string, f: string): string => join(featureDir(tdd, f), "pipeline.json");
export const featureGatesJson = (tdd: string, f: string): string => join(featureDir(tdd, f), "gates.json");
export const featureNfrsMd = (tdd: string, f: string): string => join(featureDir(tdd, f), "nfrs.md");
export const featureDeployEvidenceJson = (tdd: string, f: string): string =>
  join(featureDir(tdd, f), "deploy-evidence.json");

// ── Story scope ───────────────────────────────────────────────────
export const storiesDir = (tdd: string, f: string): string => join(featureDir(tdd, f), "stories");
export const storyDir = (tdd: string, f: string, s: string): string => join(storiesDir(tdd, f), s);
export const storyJson = (tdd: string, f: string, s: string): string => join(storyDir(tdd, f, s), "story.json");
export const acsDir = (tdd: string, f: string, s: string): string => join(storyDir(tdd, f, s), "acs");
export const acJson = (tdd: string, f: string, s: string, ac: string): string => join(acsDir(tdd, f, s), `${ac}.json`);
/** The Test Strategist's ordered list for ONE story. The canonical per-story
 *  location both the writer and the driver's testListReady probe use. */
export const storyTestListJson = (tdd: string, f: string, s: string): string =>
  join(storyDir(tdd, f, s), "test-list.json");
export const storyPlanJson = (tdd: string, f: string, s: string): string => join(storyDir(tdd, f, s), "plan.json");
export const storyDeployEvidenceJson = (tdd: string, f: string, s: string): string =>
  join(storyDir(tdd, f, s), "deploy-evidence.json");

// ── Cycle scope ───────────────────────────────────────────────────
export const cycleDir = (tdd: string, f: string, s: string, ac: string): string =>
  join(cyclesRootDir(tdd), f, s, ac);
export const cycleFile = (tdd: string, f: string, s: string, ac: string, n: number): string =>
  join(cycleDir(tdd, f, s, ac), `cycle-${String(n).padStart(3, "0")}.json`);

// ── Sprint scope ──────────────────────────────────────────────────
export const sprintDir = (tdd: string, sprint: string): string => join(sprintsDir(tdd), sprint);
export const sprintGatesJson = (tdd: string, sprint: string): string => join(sprintDir(tdd, sprint), "gates.json");
export const backlogJson = (tdd: string, sprint: string): string => join(sprintDir(tdd, sprint), "backlog.json");

// ── findFeatureDir: ONE definition, one behavior ──────────────────
/**
 * Resolve a feature's directory by id. Exact match preferred; falls back to a
 * unique prefix match (the kit's feature dirs are `<id>` or `<id>-<slug>`).
 * Returns undefined when absent or AMBIGUOUS (>1 prefix match) , callers decide
 * whether that is fatal. Replaces 6 divergent copies that variously threw,
 * picked-first, or returned undefined on the ambiguous case.
 */
export function findFeatureDir(tdd: string, featureId: string): string | undefined {
  const root = featuresDir(tdd);
  if (!fs.existsSync(root)) return undefined;
  const exact = join(root, featureId);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === featureId || d.startsWith(`${featureId}-`));
  return matches.length === 1 ? join(root, matches[0]) : undefined;
}

/** Like findFeatureDir, but throws when the feature is absent or ambiguous.
 *  For the call sites that previously had their own throwing copy. */
export function requireFeatureDir(tdd: string, featureId: string): string {
  const dir = findFeatureDir(tdd, featureId);
  if (!dir) throw new Error(`feature ${featureId} not found (or ambiguous) under ${featuresDir(tdd)}`);
  return dir;
}

// ── Format accessors (the shape knowledge, defined once) ──────────

export type AcLayer = "API" | "E2E" | "Infra";

/** The AC ids a story has, from disk truth: the union of story.json `acs` (id
 *  list or {id} objects) AND the acs/<AC>.json files actually present. The Spec
 *  Author writes acs/<AC>.json but does not always backfill story.json. */
export function storyAcIds(tdd: string, f: string, s: string): string[] {
  const ids = new Set<string>();
  const sj = storyJson(tdd, f, s);
  if (fs.existsSync(sj)) {
    try {
      const data = JSON.parse(fs.readFileSync(sj, "utf8")) as { acs?: unknown };
      if (Array.isArray(data.acs)) {
        for (const a of data.acs) {
          const id = typeof a === "string" ? a : (a as { id?: string })?.id;
          if (typeof id === "string" && id.length > 0) ids.add(id);
        }
      }
    } catch {
      /* fall through to on-disk acs/ files */
    }
  }
  const dir = acsDir(tdd, f, s);
  if (fs.existsSync(dir)) {
    try {
      for (const file of fs.readdirSync(dir)) {
        const m = /^(.+)\.json$/.exec(file);
        if (m) ids.add(m[1]);
      }
    } catch {
      /* ignore unreadable acs/ */
    }
  }
  return [...ids];
}

/** Read an AC's `layer` from its acs/<AC>.json across the feature's stories.
 *  Undefined when the AC file is absent/malformed or has no valid layer. */
export function readAcLayer(tdd: string, f: string, acId: string): AcLayer | undefined {
  const stories = storiesDir(tdd, f);
  if (!fs.existsSync(stories)) return undefined;
  for (const s of fs.readdirSync(stories)) {
    const file = acJson(tdd, f, s, acId);
    if (!fs.existsSync(file)) continue;
    try {
      const ac = JSON.parse(fs.readFileSync(file, "utf8")) as { layer?: AcLayer };
      if (ac.layer === "API" || ac.layer === "E2E" || ac.layer === "Infra") return ac.layer;
    } catch {
      /* treat malformed as no layer */
    }
  }
  return undefined;
}

/** Does this feature have its Feature Requester ask on disk? */
export const hasFeatureRequest = (tdd: string, f: string): boolean => fs.existsSync(featureRequestMd(tdd, f));

// ── Sprint backlog (the manifest of which features are in a sprint) ──
export interface SprintBacklog {
  sprint: string;
  /** Feature ids in the sprint, in execution order. */
  features: string[];
}

/** Read the sprint backlog. Empty when none written yet. */
export function readBacklog(tdd: string, sprint: string): SprintBacklog {
  const file = backlogJson(tdd, sprint);
  if (!fs.existsSync(file)) return { sprint, features: [] };
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as { features?: unknown };
    const features = Array.isArray(data.features)
      ? data.features.filter((x): x is string => typeof x === "string" && x.length > 0)
      : [];
    return { sprint, features };
  } catch {
    return { sprint, features: [] };
  }
}

/** Write the sprint backlog manifest (creates the sprint dir). */
export function writeBacklog(tdd: string, backlog: SprintBacklog): void {
  fs.mkdirSync(sprintDir(tdd, backlog.sprint), { recursive: true });
  fs.writeFileSync(backlogJson(tdd, backlog.sprint), JSON.stringify(backlog, null, 2) + "\n", "utf8");
}
