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
//
// CONVENTION: a feature's directory is either exactly `<id>` (the driver/smoke
// convention, where the dir name IS the feature id) OR `<id>-<slug>` (the
// human-authored convention). findFeatureDir is the ONE rule that resolves
// either. The canonical CREATE path is the exact `<id>` (featureDir); every
// file builder targets the RESOLVED dir (featureResolved) so a reader and a
// writer of the same feature always land in the same place regardless of which
// naming the dir uses , the whole point of the single source of truth.
export const featureDir = (tdd: string, featureId: string): string => join(featuresDir(tdd), featureId);
/** The feature's on-disk dir (exact `<id>`, else unique `<id>-<slug>`), falling
 *  back to the exact create-path when it does not exist yet. Every feature-
 *  scoped file builder below resolves through this, so exact + slug dirs both
 *  resolve to one location for producers and consumers alike. */
export const featureResolved = (tdd: string, f: string): string => findFeatureDir(tdd, f) ?? featureDir(tdd, f);
export const featureSpecJson = (tdd: string, f: string): string => join(featureResolved(tdd, f), "feature-spec.json");
export const featureSpecMd = (tdd: string, f: string): string => join(featureResolved(tdd, f), "feature-spec.md");
export const featureRequestMd = (tdd: string, f: string): string => join(featureResolved(tdd, f), "feature-request.md");
export const architectureJson = (tdd: string, f: string): string => join(featureResolved(tdd, f), "architecture.json");
export const architectureMd = (tdd: string, f: string): string => join(featureResolved(tdd, f), "architecture.md");
export const featureTestListJson = (tdd: string, f: string): string => join(featureResolved(tdd, f), "test-list.json");
export const featureTestListMd = (tdd: string, f: string): string => join(featureResolved(tdd, f), "test-list.md");
export const pipelineJson = (tdd: string, f: string): string => join(featureResolved(tdd, f), "pipeline.json");
export const featureGatesJson = (tdd: string, f: string): string => join(featureResolved(tdd, f), "gates.json");
export const featureNfrsMd = (tdd: string, f: string): string => join(featureResolved(tdd, f), "nfrs.md");
export const featureDeployEvidenceJson = (tdd: string, f: string): string =>
  join(featureResolved(tdd, f), "deploy-evidence.json");

// ── Story scope ───────────────────────────────────────────────────
//
// Story dirs follow the SAME exact-`<id>` / `<id>-<slug>` duality as feature
// dirs, resolved by the one findStoryDir rule. The canonical create path is the
// exact `<id>` (storyDir); every story file builder targets the RESOLVED dir
// (storyResolved) so the driver's exact-id probe + a slug-named human dir land
// in one place.
export const storiesDir = (tdd: string, f: string): string => join(featureResolved(tdd, f), "stories");
export const storyDir = (tdd: string, f: string, s: string): string => join(storiesDir(tdd, f), s);
/** Resolve a story's on-disk dir by id: exact `<id>`, else a unique `<id>-<slug>`;
 *  undefined when absent or ambiguous. The ONE story-dir resolution rule. */
export function findStoryDir(tdd: string, f: string, s: string): string | undefined {
  const root = storiesDir(tdd, f);
  if (!fs.existsSync(root)) return undefined;
  const exact = join(root, s);
  if (fs.existsSync(exact)) return exact;
  const matches = fs.readdirSync(root).filter((d) => d === s || d.startsWith(`${s}-`));
  return matches.length === 1 ? join(root, matches[0]) : undefined;
}
/** The story's on-disk dir, falling back to the exact create-path when absent. */
export const storyResolved = (tdd: string, f: string, s: string): string =>
  findStoryDir(tdd, f, s) ?? storyDir(tdd, f, s);
export const storyJson = (tdd: string, f: string, s: string): string => join(storyResolved(tdd, f, s), "story.json");
export const acsDir = (tdd: string, f: string, s: string): string => join(storyResolved(tdd, f, s), "acs");
export const acJson = (tdd: string, f: string, s: string, ac: string): string => join(acsDir(tdd, f, s), `${ac}.json`);
/** The story-scoped test list (master scoped to one story's ACs). The canonical
 *  per-story location BOTH the writer (writeStoryTestList) and the driver's
 *  testListReady probe use, so they cannot drift. Named distinctly from the
 *  feature master (featureTestListJson) + the per-AC views (test-list-per-ac). */
export const storyTestListJson = (tdd: string, f: string, s: string): string =>
  join(storyResolved(tdd, f, s), "test-list-per-story.json");
export const storyPlanJson = (tdd: string, f: string, s: string): string => join(storyResolved(tdd, f, s), "plan.json");
export const storyDeployEvidenceJson = (tdd: string, f: string, s: string): string =>
  join(storyResolved(tdd, f, s), "deploy-evidence.json");

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

// ── Planning estimates (the team's feature-level t-shirt sizing) ──────
//
// At /plan, the candidate features the Spec Author proposed are sized by the
// Architect (the enterprise-architect hat) so the Product Owner can commit
// against sprint capacity. Estimates are FEATURE-level t-shirt sizes here
// (stories don't exist until breakdown, inside the feature phase). The Architect
// writes ONE estimates.json under planning/; sync-backlog reads the sizes from
// it to enrich the PO's committed backlog. One writer, one reader.
export type TshirtSize = "XS" | "S" | "M" | "L" | "XL";
const TSHIRT_SIZES = new Set<string>(["XS", "S", "M", "L", "XL"]);
export const isTshirtSize = (x: unknown): x is TshirtSize => typeof x === "string" && TSHIRT_SIZES.has(x);

export interface FeatureEstimate {
  feature_id: string;
  size: TshirtSize;
  rationale?: string;
}

/** The Architect's feature-level t-shirt sizing for a sprint's candidates. */
export const planningEstimatesJson = (tdd: string): string => join(planningDir(tdd), "estimates.json");

/** Read the planning estimates (feature-level t-shirt sizes). Empty when none. */
export function readEstimates(tdd: string): FeatureEstimate[] {
  const file = planningEstimatesJson(tdd);
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as { estimates?: unknown };
    if (!Array.isArray(data.estimates)) return [];
    return data.estimates.flatMap((e) => {
      const id = (e as { feature_id?: unknown })?.feature_id;
      const size = (e as { size?: unknown })?.size;
      if (typeof id !== "string" || !id || !isTshirtSize(size)) return [];
      const rationale = (e as { rationale?: unknown })?.rationale;
      return [{ feature_id: id, size, ...(typeof rationale === "string" ? { rationale } : {}) }];
    });
  } catch {
    return [];
  }
}

/** Write the planning estimates artifact (creates the planning dir). */
export function writeEstimates(tdd: string, estimates: FeatureEstimate[]): void {
  fs.mkdirSync(planningDir(tdd), { recursive: true });
  fs.writeFileSync(planningEstimatesJson(tdd), JSON.stringify({ estimates }, null, 2) + "\n", "utf8");
}

/** True once the Architect has sized at least one candidate feature. */
export const hasEstimates = (tdd: string): boolean => readEstimates(tdd).length > 0;

// ── Sprint backlog (the PO's committed sprint membership) ─────────────
//
// The backlog is the Product Owner's call: the features committed to THIS
// sprint, each carrying the t-shirt size the Architect estimated. Written by
// the deterministic sync-backlog step (the ONE writer) by projecting the
// features the PO authored a feature-request.md for + their estimated size.
export interface BacklogFeature {
  id: string;
  /** The Architect's t-shirt size (absent if the feature was never estimated). */
  size?: TshirtSize;
}
export interface SprintBacklog {
  sprint: string;
  /** Committed features, in execution order, each with its estimated size. */
  features: BacklogFeature[];
}

/** The feature ids of a backlog, in order (the common projection callers need). */
export const backlogFeatureIds = (b: SprintBacklog): string[] => b.features.map((f) => f.id);

/** Read the sprint backlog. Empty when none written yet. Tolerates the legacy
 *  bare-string-id form (`features: ["F1", ...]`) so old artifacts still read. */
export function readBacklog(tdd: string, sprint: string): SprintBacklog {
  const file = backlogJson(tdd, sprint);
  if (!fs.existsSync(file)) return { sprint, features: [] };
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as { features?: unknown };
    const features: BacklogFeature[] = Array.isArray(data.features)
      ? data.features.flatMap((x) => {
          if (typeof x === "string" && x.length > 0) return [{ id: x }];
          const id = (x as { id?: unknown })?.id;
          if (typeof id !== "string" || !id) return [];
          const size = (x as { size?: unknown })?.size;
          return [{ id, ...(isTshirtSize(size) ? { size } : {}) }];
        })
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

/**
 * Project the committed backlog from disk: every feature that has a
 * feature-request.md (the PO's commitment), in directory order, enriched with
 * the Architect's t-shirt size from estimates.json. This is the deterministic
 * sync-backlog body , the single bridge from "PO authored a request" to the
 * backlog the driver reads, so producer (PO) and consumer (driver) never drift.
 */
export function syncBacklog(tdd: string, sprint: string): SprintBacklog {
  const sizeOf = new Map(readEstimates(tdd).map((e) => [e.feature_id, e.size] as const));
  const root = featuresDir(tdd);
  const committed = fs.existsSync(root)
    ? fs
        .readdirSync(root)
        .filter((d) => {
          try {
            return fs.statSync(join(root, d)).isDirectory() && fs.existsSync(join(root, d, "feature-request.md"));
          } catch {
            return false;
          }
        })
        .sort()
    : [];
  const features: BacklogFeature[] = committed.map((id) => {
    const size = sizeOf.get(id);
    return { id, ...(size ? { size } : {}) };
  });
  const backlog: SprintBacklog = { sprint, features };
  writeBacklog(tdd, backlog);
  return backlog;
}
