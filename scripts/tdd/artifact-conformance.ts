// Layer 2 (conformance): "did this artifact adhere to the format
// expected?"
//
// The three layers a gate enforces on an artifact:
//   Layer 1 existence  - the artifact exists on disk (human-proxy no longer
//                        fabricates a placeholder for a missing file).
//   Layer 2 conformance- THIS module: the artifact that exists matches the
//                        format its producing role is documented to emit.
//   Layer 3 signoff    - approveGate records the HITL approval + hash.
//
// The format each artifact must satisfy is DERIVED FROM the role contracts in
// skills/lakebase-tdd-workflows/agents/*.md and references/spec-format.md, not
// invented here:
//   - JSON artifacts (feature/story/ac/test-list/plan/workflow-state) have
//     JSON Schemas in scripts/tdd/schemas/ and are validated against them.
//   - architecture.md: the Architect Reviewer names its sections (Architectural
//     Concerns Mapping, Pattern proposals, Risks); extended with the two the
//     Architect Reviewer adjudicates at Gate 2 (Decisions, Sign-off).
//   - feature-spec.md: the Spec Author's draft-spec narrative (Summary, Stories,
//     Out of scope, Open questions that seed Gate 1).
//   - feature-request.md: the Feature Requester's original ask; the Spec Author's
//     INPUT (free-form narrative, H1 + non-empty body only). Never overwritten.
//   - test-list.md: a Beck-style ordered list rendered from test-list.json;
//     every item traces to a Spec Author-authored AC (an orphan item is a smell).
//   - product-overview.md: the Product Owner's project-level overview (replaces
//     the old spec.md); H1 + body only.
//
// Keying is by artifact FILENAME, not by gate: an artifact's format is
// intrinsic to the artifact, so this module never needs to know which gate is
// collecting it. Callers (human-proxy's resolver, the conformance CLI) map
// gate -> artifacts; this module maps artifact -> format.

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, basename, dirname } from "path";
import { getValidator, formatSchemaErrors } from "./schema-loader";
import { featuresDir as featuresDirOf } from "./tdd-paths.js";

export type ConformanceResult =
  | { ok: true }
  | { ok: false; violations: string[] };

interface RequiredSection {
  /** Human label used in the violation message. */
  label: string;
  /** Lowercase substring sought (case-insensitively) in a heading line. */
  match: string;
}

type FormatSpec =
  | { kind: "json-schema"; schema: string }
  | { kind: "md-narrative" }
  | { kind: "md-sections"; sections: RequiredSection[] }
  | { kind: "test-list-md" };

/**
 * Artifact filename -> the format its producing role is documented to emit.
 * Filenames not present here have no declared format and pass unconditionally
 * (e.g. promote_ref, scratch notes).
 */
export const ARTIFACT_FORMATS: Record<string, FormatSpec> = {
  "feature-spec.json": { kind: "json-schema", schema: "feature.schema.json" },
  "story.json": { kind: "json-schema", schema: "story.schema.json" },
  "ac.json": { kind: "json-schema", schema: "ac.schema.json" },
  "test-list.json": { kind: "json-schema", schema: "test-list.schema.json" },
  "plan.json": { kind: "json-schema", schema: "plan.schema.json" },
  "architecture.json": { kind: "json-schema", schema: "architecture.schema.json" },
  "workflow-state.json": { kind: "json-schema", schema: "workflow-state.schema.json" },
  // Release Engineer's deploy-gate evidence (reachability + feature-verify).
  "deploy-evidence.json": { kind: "json-schema", schema: "deploy-evidence.schema.json" },
  // UX Designer (UI projects only): the machine-checkable design tokens.
  "design-guide.json": { kind: "json-schema", schema: "design-guide.schema.json" },

  // Architect Reviewer's section 6 + Gate 2 adjudication surface.
  "architecture.md": {
    kind: "md-sections",
    sections: [
      { label: "Architectural Concerns Mapping", match: "architectural concerns mapping" },
      { label: "Pattern proposals", match: "pattern proposal" },
      { label: "Risks", match: "risk" },
      { label: "Gate decisions", match: "decision" },
      { label: "Sign-off", match: "sign-off" },
    ],
  },

  // Spec Author's draft-spec narrative.
  "feature-spec.md": {
    kind: "md-sections",
    sections: [
      { label: "Summary", match: "summary" },
      { label: "Stories", match: "stories" },
      { label: "Out of scope", match: "out of scope" },
      { label: "Open questions", match: "open question" },
    ],
  },

  // Feature Requester's original ask: the Spec Author's INPUT. Free-form
  // narrative; only H1 + non-empty body required. Never overwritten.
  "feature-request.md": { kind: "md-narrative" },

  // Spec Author's sprint backlog proposal: the artifact the sprint PLAN gate
  // locks. Free-form narrative; H1 + non-empty body required.
  "feature-proposals.md": { kind: "md-narrative" },

  // Product Owner's project-level overview (replaces the old spec.md).
  "product-overview.md": { kind: "md-narrative" },

  // HIL non-functional-requirements brief (the Architect's intake). The HIL
  // states required NFRs (each with a stable R<n> id), preferences, and
  // out-of-bounds items. The Architect must carry every Required item into
  // architecture.json via a matching brief_ref (see checkNfrCoverage). Project
  // -level (.tdd/nfrs.md) or per-feature (.tdd/features/<F>/nfrs.md).
  "nfrs.md": {
    kind: "md-sections",
    sections: [
      { label: "Required", match: "required" },
      { label: "Preferences", match: "preference" },
      { label: "Out of bounds", match: "out of bounds" },
    ],
  },

  // HIL design brief (UI projects): the human's reference sites + what to take
  // from each. The design analogue of product-overview.md, the source the UX
  // Designer teases the design out of. A brief with no references is
  // meaningless, so a
  // References section is the one hard requirement.
  "design-brief.md": {
    kind: "md-sections",
    sections: [{ label: "References", match: "reference" }],
  },

  // UX Designer narrative artifacts (UI projects only). design-guide.md
  // sections are grounded in a real shipped guide (partner-asset-tracker
  // STYLE_GUIDE.md); design-guide.json carries the machine-checkable tokens.
  "design-guide.md": {
    kind: "md-sections",
    sections: [
      { label: "Design Philosophy", match: "philosophy" },
      { label: "UI Framework", match: "framework" },
      { label: "Typography", match: "typography" },
      { label: "Color Palette", match: "color" },
      { label: "Spacing", match: "spacing" },
      { label: "Components", match: "components" },
      { label: "User Feedback Principles", match: "feedback" },
    ],
  },
  "ia.md": {
    kind: "md-sections",
    sections: [
      { label: "Screens", match: "screens" },
      { label: "Navigation", match: "navigation" },
      { label: "User flows", match: "flow" },
    ],
  },

  // Beck-style ordered list rendered from test-list.json.
  "test-list.md": { kind: "test-list-md" },
};

/** True when the artifact name has a declared format this module enforces. */
export function hasDeclaredFormat(name: string): boolean {
  return name in ARTIFACT_FORMATS;
}

/**
 * Check a single artifact's content against its declared format. Artifacts
 * with no declared format pass. Returns the full list of violations so a
 * caller can surface every problem at once rather than one-at-a-time.
 */
export function checkArtifactConformance(name: string, content: string): ConformanceResult {
  const spec = ARTIFACT_FORMATS[name];
  if (spec === undefined) return { ok: true };

  switch (spec.kind) {
    case "json-schema":
      return checkJsonSchema(name, content, spec.schema);
    case "md-narrative":
      return finalize(checkMdNarrative(name, content));
    case "md-sections":
      return finalize(checkMdSections(name, content, spec.sections));
    case "test-list-md":
      return finalize(checkTestListMd(content));
  }
}

function finalize(violations: string[]): ConformanceResult {
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

function checkJsonSchema(name: string, content: string, schemaFile: string): ConformanceResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    return { ok: false, violations: [`${name} is not valid JSON: ${cause}`] };
  }
  const validate = getValidator(schemaFile);
  if (validate(parsed)) return { ok: true };
  return { ok: false, violations: formatSchemaErrors(validate).map((e) => `${name} ${e}`) };
}

interface Heading {
  level: number;
  text: string;
}

const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/;

function parseHeadings(content: string): Heading[] {
  const out: Heading[] = [];
  for (const line of content.split("\n")) {
    const m = HEADING_RE.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2] });
  }
  return out;
}

function hasH1(headings: Heading[]): boolean {
  return headings.some((h) => h.level === 1);
}

/** Non-heading, non-blank content exists below the title. */
function hasBody(content: string): boolean {
  return content.split("\n").some((line) => {
    const t = line.trim();
    return t.length > 0 && !HEADING_RE.test(line);
  });
}

function checkMdNarrative(name: string, content: string): string[] {
  const violations: string[] = [];
  const headings = parseHeadings(content);
  if (!hasH1(headings)) violations.push(`${name} has no H1 title`);
  if (!hasBody(content)) violations.push(`${name} has an empty body (title only)`);
  return violations;
}

function checkMdSections(name: string, content: string, sections: RequiredSection[]): string[] {
  const violations: string[] = [];
  const headings = parseHeadings(content);
  if (!hasH1(headings)) violations.push(`${name} has no H1 title`);
  const headingText = headings.map((h) => h.text.toLowerCase());
  for (const section of sections) {
    if (!headingText.some((t) => t.includes(section.match))) {
      violations.push(`${name} missing required section: ${section.label}`);
    }
  }
  return violations;
}

// A rendered Beck list item, e.g. "- [ ] T1: rejects an empty title  (AC1.4)".
const TEST_ITEM_RE = /^\s*[-*]\s*\[[ xX]?\]\s*T\d/;
const AC_REF_RE = /\bAC\s*\d/i;

function checkTestListMd(content: string): string[] {
  const violations: string[] = [];
  const headings = parseHeadings(content);
  if (!hasH1(headings)) violations.push("test-list.md has no H1 title");
  if (!/ordered for\s*:/i.test(content)) {
    violations.push('test-list.md missing "Ordered for:" ordering rationale');
  }
  if (!headings.some((h) => h.text.toLowerCase().includes("deferred"))) {
    violations.push("test-list.md missing required section: Deferred / skipped");
  }
  for (const line of content.split("\n")) {
    if (TEST_ITEM_RE.test(line) && !AC_REF_RE.test(line)) {
      violations.push(`test-list.md has a test item with no AC reference (orphan): ${line.trim()}`);
    }
  }
  return violations;
}

// ─── NFR coverage (cross-artifact: nfrs.md Required ids vs architecture.json) ───

/** One list item under nfrs.md's `## Required` section. */
export interface RequiredNfr {
  /** The R<n> id, or null when the item has no parseable id. */
  id: string | null;
  /** The requirement text (id stripped). */
  text: string;
}

const REQUIRED_NFR_ITEM_RE = /^\s*[-*]\s+\*{0,2}(R\d+)\*{0,2}\s*[:.)\-]?\s*(.*)$/;
const PLAIN_LIST_ITEM_RE = /^\s*[-*]\s+(.*\S)\s*$/;

/**
 * Extract the list items under nfrs.md's `## Required` section. Each Required
 * NFR should carry a stable `R<n>` id so the Architect can reference it from
 * architecture.json via brief_ref. Items without an id are returned with
 * id=null so the coverage check can flag them (untrackable).
 */
export function parseRequiredNfrs(nfrsMd: string): RequiredNfr[] {
  const lines = nfrsMd.split("\n");
  const out: RequiredNfr[] = [];
  let inRequired = false;
  for (const line of lines) {
    const h = HEADING_RE.exec(line);
    if (h) {
      // Enter on a heading whose text is exactly/starts-with "required";
      // any subsequent heading ends the section.
      inRequired = h[2].trim().toLowerCase().startsWith("required");
      continue;
    }
    if (!inRequired) continue;
    const withId = REQUIRED_NFR_ITEM_RE.exec(line);
    if (withId) {
      out.push({ id: withId[1], text: withId[2].trim() });
      continue;
    }
    const plain = PLAIN_LIST_ITEM_RE.exec(line);
    if (plain) out.push({ id: null, text: plain[1].trim() });
  }
  return out;
}

/**
 * Cross-artifact coverage check: every Required NFR in nfrs.md must be carried
 * into architecture.json via a matching `brief_ref` on one of its nfrs[]. A
 * Required item with no id (untrackable) or with no matching brief_ref is a
 * violation, so a non-covered HIL requirement HARD-BLOCKS the architecture gate
 * (the Human Proxy will not approve it). architecture.json that is absent or
 * invalid JSON is itself reported (the architect produced nothing to cover with).
 */
export function checkNfrCoverage(nfrsMd: string, architectureJson: string): ConformanceResult {
  const required = parseRequiredNfrs(nfrsMd);
  if (required.length === 0) return { ok: true }; // no Required NFRs to cover

  let parsed: { nfrs?: Array<{ brief_ref?: string }> };
  try {
    parsed = JSON.parse(architectureJson);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    return { ok: false, violations: [`architecture.json is not valid JSON: ${cause}`] };
  }
  const briefRefs = new Set(
    (parsed.nfrs ?? []).map((n) => n.brief_ref).filter((r): r is string => typeof r === "string" && r.length > 0),
  );

  const violations: string[] = [];
  for (const item of required) {
    if (item.id === null) {
      const preview = item.text.length > 50 ? `${item.text.slice(0, 50)}...` : item.text;
      violations.push(`nfrs.md Required item has no R<n> id (cannot be coverage-tracked): "${preview}"`);
      continue;
    }
    if (!briefRefs.has(item.id)) {
      violations.push(
        `Required NFR ${item.id} from nfrs.md is not covered by any architecture.json nfr (no matching brief_ref)`,
      );
    }
  }
  return finalize(violations);
}

/**
 * Layering declared (FEIP layered-build enforcement): a feature the architect
 * marked `service_backed: true` MUST declare a boundary + service + repository in
 * `architecture.json.layers` (layered architecture: boundary -> service ->
 * repository -> ORM). A service-backed feature with no/partial layers HARD-BLOCKS
 * Gate 2, so the build cannot produce a fat controller unchecked. A feature that
 * is not service_backed is exempt (the YAGNI guard). Absent/invalid architecture
 * is reported elsewhere.
 */
export function checkLayeringDeclared(architectureJson: string): ConformanceResult {
  let parsed: { service_backed?: boolean; layers?: Array<{ role?: string }> };
  try {
    parsed = JSON.parse(architectureJson);
  } catch (err) {
    return { ok: false, violations: [`architecture.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }
  if (parsed.service_backed !== true) return { ok: true };
  const roles = new Set(
    (parsed.layers ?? []).map((l) => l.role).filter((r): r is string => typeof r === "string"),
  );
  const missing = ["boundary", "service", "repository"].filter((r) => !roles.has(r));
  if (missing.length) {
    return {
      ok: false,
      violations: [
        `service_backed feature must declare layers [${missing.join(", ")}] in architecture.json ` +
          `(layered architecture: boundary -> service -> repository -> ORM; the boundary never touches the DB session)`,
      ],
    };
  }
  return { ok: true };
}

/**
 * Fitness coverage (FEIP layered-build enforcement): a service-backed / layered
 * feature MUST have >=1 `kind:"fitness"` item in its test-list (the architectural
 * constraint gets a fitness test, per test-strategy.md), or Gate 3 HARD-BLOCKS.
 * Scoped to service_backed/layered features only (NFR coverage is already enforced
 * separately by checkNfrCoverage), so a trivial feature is exempt.
 */
export function checkFitnessCoverage(testListJson: string, architectureJson: string): ConformanceResult {
  let arch: { service_backed?: boolean; layers?: unknown[] };
  try {
    arch = JSON.parse(architectureJson);
  } catch {
    return { ok: true }; // invalid architecture reported elsewhere
  }
  const declaresConstraint = arch.service_backed === true || (Array.isArray(arch.layers) && arch.layers.length > 0);
  if (!declaresConstraint) return { ok: true };
  let tl: { items?: Array<{ kind?: string }> };
  try {
    tl = JSON.parse(testListJson);
  } catch (err) {
    return { ok: false, violations: [`test-list.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const hasFitness = (tl.items ?? []).some((i) => i.kind === "fitness");
  if (!hasFitness) {
    return {
      ok: false,
      violations: [
        `architecture is service-backed/layered but the test-list has no kind:"fitness" item ` +
          `(every architectural constraint needs a fitness test, e.g. the layering contract; see test-strategy.md)`,
      ],
    };
  }
  return { ok: true };
}

/**
 * Map a file path to the canonical artifact name the registry is keyed by.
 * Acceptance-criteria files are named <AC>.json/.md but share the "ac.json"
 * contract, so any *.json under an `acs/` directory normalizes to "ac.json".
 * Everything else uses its basename.
 */
export function canonicalArtifactName(path: string): string {
  const base = basename(path);
  if (basename(dirname(path)) === "acs" && base.endsWith(".json")) return "ac.json";
  return base;
}

export interface FeatureConformanceEntry {
  /** Path relative to tddDir, for display. */
  artifact: string;
  ok: boolean;
  violations: string[];
}

export interface FeatureConformanceReport {
  featureId: string;
  /** True when every checked artifact conforms. Missing artifacts are not failures. */
  ok: boolean;
  entries: FeatureConformanceEntry[];
}

/**
 * Scan a feature's on-disk artifacts and check each that EXISTS against its
 * declared format. Existence (Layer 1) is intentionally not enforced here: a
 * feature mid-design legitimately lacks plan.json / test-list.json. This
 * answers "do the artifacts that exist adhere to their format?". The standalone
 * counterpart to the gate-time check the human-proxy runs.
 */
export function scanFeatureConformance(tddDir: string, featureId: string): FeatureConformanceReport {
  const featuresDir = featuresDirOf(tddDir);
  const candidates = existsSync(featuresDir)
    ? readdirSync(featuresDir).filter((d) => d.startsWith(featureId))
    : [];
  if (candidates.length === 0) {
    throw new Error(`feature ${featureId} not found under ${featuresDir}`);
  }
  const featureDir = join(featuresDir, candidates[0]);

  const paths: string[] = [];
  const pushIfExists = (p: string): void => {
    if (existsSync(p)) paths.push(p);
  };

  // Top-level Product Owner project overview.
  pushIfExists(join(tddDir, "product-overview.md"));
  // HIL NFR brief: project-level + optional per-feature override.
  pushIfExists(join(tddDir, "nfrs.md"));
  // Project-level UX Designer artifacts (UI projects; absent otherwise).
  for (const name of ["design-brief.md", "design-guide.md", "design-guide.json", "ia.md"]) {
    pushIfExists(join(tddDir, "design", name));
  }
  // Feature-level artifacts.
  for (const name of ["feature-request.md", "feature-spec.json", "feature-spec.md", "nfrs.md", "architecture.md", "plan.json", "test-list.json", "test-list.md"]) {
    pushIfExists(join(featureDir, name));
  }
  // Stories + their acceptance criteria.
  const storiesDir = join(featureDir, "stories");
  if (existsSync(storiesDir)) {
    for (const storyName of readdirSync(storiesDir)) {
      const storyDir = join(storiesDir, storyName);
      if (!statSync(storyDir).isDirectory()) continue;
      pushIfExists(join(storyDir, "story.json"));
      const acsDir = join(storyDir, "acs");
      if (existsSync(acsDir)) {
        for (const acFile of readdirSync(acsDir).filter((f) => f.endsWith(".json"))) {
          paths.push(join(acsDir, acFile));
        }
      }
    }
  }

  const entries: FeatureConformanceEntry[] = paths.map((p) => {
    const content = readFileSync(p, "utf8");
    const result = checkArtifactConformance(canonicalArtifactName(p), content);
    return {
      artifact: p.startsWith(tddDir) ? p.slice(tddDir.length).replace(/^\//, "") : p,
      ok: result.ok,
      violations: result.ok ? [] : result.violations,
    };
  });

  // Cross-artifact NFR coverage: once architecture.json exists, every Required
  // NFR in the HIL's nfrs.md (project-level + optional per-feature) must be
  // covered by a brief_ref. Skipped until architecture.json is produced (a
  // feature mid-design legitimately lacks it). Per-feature nfrs.md extends the
  // project one, so both are checked against this feature's architecture.json.
  const archPath = join(featureDir, "architecture.json");
  if (existsSync(archPath)) {
    const archContent = readFileSync(archPath, "utf8");
    for (const nfrsPath of [join(tddDir, "nfrs.md"), join(featureDir, "nfrs.md")]) {
      if (!existsSync(nfrsPath)) continue;
      const cov = checkNfrCoverage(readFileSync(nfrsPath, "utf8"), archContent);
      const rel = nfrsPath.startsWith(tddDir) ? nfrsPath.slice(tddDir.length).replace(/^\//, "") : nfrsPath;
      entries.push({
        artifact: `${rel} -> architecture.json (NFR coverage)`,
        ok: cov.ok,
        violations: cov.ok ? [] : cov.violations,
      });
    }

    // Layered-build enforcement: a service_backed feature must declare its layers
    // (Gate 2), and its test-list must carry a fitness item (Gate 3). Both no-op
    // for a non-service-backed feature, so trivial features are exempt.
    const lay = checkLayeringDeclared(archContent);
    entries.push({
      artifact: "architecture.json (layering declared)",
      ok: lay.ok,
      violations: lay.ok ? [] : lay.violations,
    });
    const testListPath = join(featureDir, "test-list.json");
    if (existsSync(testListPath)) {
      const fit = checkFitnessCoverage(readFileSync(testListPath, "utf8"), archContent);
      entries.push({
        artifact: "test-list.json -> architecture.json (fitness coverage)",
        ok: fit.ok,
        violations: fit.ok ? [] : fit.violations,
      });
    }
  }

  return { featureId, ok: entries.every((e) => e.ok), entries };
}
