// FEIP-7508 Layer 2 (conformance): "did this artifact adhere to the format
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

  // Product Owner's project-level overview (replaces the old spec.md).
  "product-overview.md": { kind: "md-narrative" },

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
  const featuresDir = join(tddDir, "features");
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
  // Project-level UX Designer artifacts (UI projects; absent otherwise).
  for (const name of ["design-brief.md", "design-guide.md", "design-guide.json", "ia.md"]) {
    pushIfExists(join(tddDir, "design", name));
  }
  // Feature-level artifacts.
  for (const name of ["feature-request.md", "feature-spec.json", "feature-spec.md", "architecture.md", "plan.json", "test-list.json", "test-list.md"]) {
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

  return { featureId, ok: entries.every((e) => e.ok), entries };
}
