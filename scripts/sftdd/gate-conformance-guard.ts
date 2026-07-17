// Gate conformance guard: the deterministic gate CONDITION for the SFTDD state
// machine. Whether a gate's artifacts are complete + conformant (schema, per-AC
// shape, story/AC independence, architecture conventions, service_backed, layers,
// NFR/fitness/persistence coverage) is a property of the WORKFLOW STATE, not of
// who approves, so it lives here and is enforced on the gate-advance path. Both
// the per-story design gate (pipeline approve-gate) and the Human Proxy's
// feature-gate drain consult it, so a real human cannot advance a non-conformant
// gate any more than the headless proxy can.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { GateName } from "./gates.js";
import {
  checkArtifactConformance,
  canonicalArtifactName,
  checkStoryIndependence,
  checkAcIndependence,
  checkLayeringDeclared,
  checkNfrCoverage,
  checkFitnessCoverage,
  checkPersistenceCoverage,
  checkInvariantCoverageDistinct,
  checkServiceBackedDeclaration,
} from "./artifact-conformance.js";
import { acsForStory } from "./test-list.js";
import { featureResolved, architectureJson, nfrsMd, featureNfrsMd } from "./sftdd-paths.js";
import { readConventions, assertArchitectureConforms } from "./architecture-conventions.js";

export function featureDir(sftddDir: string, featureId: string): string {
  return featureResolved(sftddDir, featureId);
}

/**
 * Aggregate conformance check over a set of resolved inputs. Returns a reason
 * string listing every violation when any artifact fails its declared format,
 * or null when all conform. Layer 2 of the gate: existence (Layer 1) is
 * checked by the callers below; this enforces "does what exists conform?".
 */
function conformanceReason(inputs: Record<string, string>): string | null {
  const problems: string[] = [];
  for (const [name, content] of Object.entries(inputs)) {
    const result = checkArtifactConformance(name, content);
    if (!result.ok) problems.push(...result.violations);
  }
  return problems.length === 0 ? null : `format conformance failed: ${problems.join("; ")}`;
}

/**
 * Every per-AC file under the feature's stories must conform to ac.schema (which
 * enforces the AC<n>-<slug> id pattern + the given/when/then shape). The spec
 * gate previously validated only feature-spec.{json,md}, so a Spec Author that
 * named ACs as bare slugs (create-form-displays) or dropped malformed junk into
 * acs/ passed the gate, then broke the Test Strategist (ac_id pattern) or stalled
 * the design lane. This makes acs/ conformance a hard spec-gate condition: every
 * acs/<X>.json (canonicalized to ac.json) is validated. Returns a reason listing
 * violations, or null when all ACs conform (or none exist yet).
 */
/** The AC-conformance problems for ONE story (parse + schema + intra-story
 *  independence), scoped to `stories/<story>/acs/`. The single per-story scan both
 *  the feature-wide gate and the per-story spec-gate approval read, so a truncated
 *  or non-conformant AC is caught identically wherever it is checked. */
function storyAcProblems(fdir: string, story: string): string[] {
  const acsDir = join(fdir, "stories", story, "acs");
  if (!existsSync(acsDir)) return [];
  const problems: string[] = [];
  const acs: Array<{ name: string; content: string }> = [];
  for (const f of readdirSync(acsDir)) {
    if (!f.endsWith(".json")) continue;
    const p = join(acsDir, f);
    let content: string;
    try {
      content = readFileSync(p, "utf8");
    } catch {
      continue;
    }
    acs.push({ name: f.replace(/\.json$/, ""), content });
    // checkArtifactConformance JSON.parses first, so a truncated/invalid AC file
    // (missing closing brace) fails here with "not valid JSON" , the exact defect
    // that previously slipped past the spec + reflect gates to deploy (Finding 29).
    const r = checkArtifactConformance(canonicalArtifactName(p), content);
    if (!r.ok) problems.push(`${story}/acs/${f}: ${r.violations.join("; ")}`);
  }
  // AC independence within this story: a later AC must not be a subset of an
  // earlier one (records independence.distinct_from_prior; blocks the
  // AC3-subset-of-AC2 overlap that otherwise stalls the build).
  const indep = checkAcIndependence(acs);
  if (!indep.ok) problems.push(...indep.violations.map((v) => `${story}/acs: ${v}`));
  return problems;
}

/** Conformance reason for ONE story's ACs (Finding 29): every `acs/<X>.json` for
 *  the story must JSON-parse + conform to ac.schema. Returns a reason listing
 *  violations, or null when all conform (or none exist yet). Wired into the
 *  per-story spec-gate approval so a malformed AC is refused at approve time, not
 *  discovered at deploy gate-conformance. */
export function storyAcsConformanceReason(fdir: string, story: string): string | null {
  const problems = storyAcProblems(fdir, story);
  return problems.length === 0 ? null : `AC conformance failed: ${problems.join("; ")}`;
}

function acsConformanceReason(fdir: string): string | null {
  const stories = join(fdir, "stories");
  if (!existsSync(stories)) return null;
  const problems = readdirSync(stories).flatMap((s) => storyAcProblems(fdir, s));
  return problems.length === 0 ? null : `AC conformance failed: ${problems.join("; ")}`;
}

/**
 * Story-independence spec-gate condition: in a feature with >1 story, every story
 * after the first must record `independence.distinct_from_prior: true` + a
 * rationale on its story.json. Blocks the S2-subset-of-S1 overlap at the design
 * gate (it otherwise surfaces mid-build as a born-green behavior cycle-stall).
 * Returns a reason listing offenders, or null when all conform (or <2 stories).
 */
function storyIndependenceReason(fdir: string): string | null {
  const stories = join(fdir, "stories");
  if (!existsSync(stories)) return null;
  const storyJsons: Array<{ name: string; content: string }> = [];
  for (const s of readdirSync(stories)) {
    const p = join(stories, s, "story.json");
    if (!existsSync(p)) continue;
    try {
      storyJsons.push({ name: s, content: readFileSync(p, "utf8") });
    } catch {
      continue;
    }
  }
  const r = checkStoryIndependence(storyJsons);
  return r.ok ? null : `story independence failed: ${r.violations.join("; ")}`;
}

/**
 * Architecture-conventions spec-gate condition: once the project canon is
 * established (.tdd/architecture/conventions.json, set by the first service-
 * backed feature), every LATER feature's architecture.json must reuse the same
 * role -> module layout (and rendering framework). Returns a reason listing the
 * divergences, or null when it conforms / no conventions exist yet / the feature
 * has no architecture.json. Hard-blocks the spec gate so a divergent layout never
 * reaches build (where it would mismatch the inherited code + trip the layering
 * gate's module-placement check).
 */
function architectureConventionsReason(sftddDir: string, featureId: string): string | null {
  const conventions = readConventions(sftddDir);
  if (!conventions) return null; // first feature / nothing established yet
  const archFile = architectureJson(sftddDir, featureId);
  if (!existsSync(archFile)) return null; // architecture not produced yet
  let content: string;
  try {
    content = readFileSync(archFile, "utf8");
  } catch {
    return null;
  }
  const r = assertArchitectureConforms(conventions, content);
  return r.ok ? null : `architecture conventions failed: ${r.violations.join("; ")}`;
}

/** Read architecture.json content for the feature, or undefined when absent. */
function readArchitecture(sftddDir: string, featureId: string): string | undefined {
  const f = architectureJson(sftddDir, featureId);
  if (!existsSync(f)) return undefined;
  try {
    return readFileSync(f, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Layering-declaration spec-gate condition (closes the "checkLayeringDeclared
 * hard-blocks Gate 2" claim that was previously unwired): a service_backed
 * feature MUST declare layered `layers` (boundary -> service -> repository) in
 * architecture.json. A trivial (non-service-backed) feature is exempt (the YAGNI
 * guard). Null when it conforms / architecture not produced yet.
 */
function layeringDeclaredReason(sftddDir: string, featureId: string): string | null {
  const arch = readArchitecture(sftddDir, featureId);
  if (arch === undefined) return null;
  const r = checkLayeringDeclared(arch);
  return r.ok ? null : `layering declaration failed: ${r.violations.join("; ")}`;
}

/**
 * NFR-coverage spec-gate condition (closes the "checkNfrCoverage hard-blocks the
 * architecture gate" claim that was previously unwired): every `## Required`
 * R<n> item in the HIL's nfrs.md must be covered by an architecture.json nfr via
 * a matching brief_ref. Uses the feature-level nfrs.md override when present,
 * else the project nfrs.md. Null when covered / no nfrs.md / no architecture yet.
 */
function nfrCoverageReason(sftddDir: string, featureId: string): string | null {
  const arch = readArchitecture(sftddDir, featureId);
  if (arch === undefined) return null;
  const featureNfrs = featureNfrsMd(sftddDir, featureId);
  const projectNfrs = nfrsMd(sftddDir);
  const nfrsFile = existsSync(featureNfrs) ? featureNfrs : existsSync(projectNfrs) ? projectNfrs : undefined;
  if (nfrsFile === undefined) return null; // no NFR brief -> nothing Required to cover
  let nfrsContent: string;
  try {
    nfrsContent = readFileSync(nfrsFile, "utf8");
  } catch {
    return null;
  }
  const r = checkNfrCoverage(nfrsContent, arch);
  return r.ok ? null : `NFR coverage failed: ${r.violations.join("; ")}`;
}

/**
 * Fitness-coverage test_list-gate condition (closes the "checkFitnessCoverage
 * hard-blocks Gate 3" claim that was previously unwired): a service_backed/
 * layered feature's test-list must have >=1 kind:"fitness" item (the
 * architectural regression guard). A trivial feature is exempt. Null when
 * covered / no test-list or architecture yet.
 */
function fitnessCoverageReason(sftddDir: string, featureId: string, testListJson: string): string | null {
  const arch = readArchitecture(sftddDir, featureId);
  if (arch === undefined) return null;
  const r = checkFitnessCoverage(testListJson, arch);
  return r.ok ? null : `fitness coverage failed: ${r.violations.join("; ")}`;
}

/**
 * Persistence-coverage test_list-gate condition: a service_backed feature's
 * architecture must declare its persistence_invariants[] and the test-list must
 * cover each (an item referencing its invariant_id), so every DB-level guarantee
 * gets a real-branch test tied to the schema's own contract , not a blunt quota,
 * and not a re-test of the ORM. Trivial features are exempt. Null when covered /
 * no test-list or architecture yet.
 */
function persistenceCoverageReason(sftddDir: string, featureId: string, testListJson: string): string | null {
  const arch = readArchitecture(sftddDir, featureId);
  if (arch === undefined) return null;
  const r = checkPersistenceCoverage(testListJson, arch);
  return r.ok ? null : `persistence coverage failed: ${r.violations.join("; ")}`;
}

/**
 * Distinct-invariant-coverage test_list-gate condition (the cross-story
 * counterpart to persistenceCoverageReason): a declared persistence_invariant
 * belongs to exactly ONE story's fitness tests. A later story re-emitting a
 * fitness item for an invariant an earlier story already covers is a redundant
 * re-test that drifts (one copy asserts the field-named message, the other only
 * the raw rejection) and dead-locks the reflect gate; it is the persistence face
 * of the S2-subset-of-S1 story overlap. Maps each item's invariant_id to its
 * story via the acs/ dirs (the same ac->story membership scopeToStory uses), then
 * hard-blocks a duplicated invariant. Null when distinct / no test-list.
 */
function invariantCoverageDistinctReason(sftddDir: string, featureId: string, testListJson: string): string | null {
  let master: { items?: Array<{ ac_id?: string; invariant_id?: string }> };
  try {
    master = JSON.parse(testListJson);
  } catch {
    return null; // bad JSON reported by conformanceReason
  }
  const items = master.items ?? [];
  const storiesDir = join(featureDir(sftddDir, featureId), "stories");
  if (!existsSync(storiesDir)) return null;
  const perStory = readdirSync(storiesDir)
    .filter((s) => {
      try {
        return statSync(join(storiesDir, s)).isDirectory();
      } catch {
        return false;
      }
    })
    .map((story) => {
      const acIds = new Set(acsForStory(sftddDir, featureId, story));
      const invariantIds = items
        .filter((it) => typeof it.invariant_id === "string" && it.invariant_id.length > 0 && typeof it.ac_id === "string" && acIds.has(it.ac_id))
        .map((it) => it.invariant_id as string);
      return { story, invariantIds };
    });
  const r = checkInvariantCoverageDistinct(perStory);
  return r.ok ? null : `invariant coverage not distinct across stories: ${r.violations.join("; ")}`;
}

/**
 * Service-backed-declaration spec-gate condition (closes the under-declaration
 * escape hatch): the layering + fitness guards all key off `service_backed`, so an
 * architect that omits it / sets it false on a feature that demonstrably persists
 * data silently disables every layering check. This cross-checks the declaration
 * against the architect's OWN structured evidence , the feature's AC `layer`s and
 * the architecture.json `nfrs[]` text , and hard-blocks a not-service_backed
 * feature that shows persistence evidence. Null when consistent / no architecture.
 */
function serviceBackedReason(sftddDir: string, featureId: string): string | null {
  const arch = readArchitecture(sftddDir, featureId);
  if (arch === undefined) return null;
  // The architect's own evidence: every AC's declared layer + every nfrs[] text.
  const acLayers: string[] = [];
  const fdir = featureDir(sftddDir, featureId);
  const stories = join(fdir, "stories");
  if (existsSync(stories)) {
    for (const s of readdirSync(stories)) {
      const ad = join(stories, s, "acs");
      if (!existsSync(ad)) continue;
      for (const f of readdirSync(ad)) {
        if (!f.endsWith(".json")) continue;
        try {
          const layer = (JSON.parse(readFileSync(join(ad, f), "utf8")) as { layer?: string }).layer;
          if (typeof layer === "string") acLayers.push(layer);
        } catch {
          /* a malformed AC is caught by acsConformanceReason */
        }
      }
    }
  }
  const nfrsText: string[] = [];
  try {
    const nfrs = (JSON.parse(arch) as { nfrs?: Array<{ brief?: string; requirement?: string; notes?: string }> }).nfrs ?? [];
    for (const n of nfrs) nfrsText.push(n.brief ?? "", n.requirement ?? "", n.notes ?? "");
  } catch {
    /* invalid architecture.json is reported by the schema conformance check */
  }
  const r = checkServiceBackedDeclaration(arch, { acLayers, nfrsText });
  return r.ok ? null : `service_backed declaration failed: ${r.violations.join("; ")}`;
}

/**
 * Resolve the artifact inputs for a gate from files that ACTUALLY exist AND
 * conform to their declared format. Returns a `reason` (so the caller skips
 * rather than fabricates) when a required artifact is absent or any present
 * artifact is non-conformant. Never substitutes placeholder content.
 */
export function resolveArtifactInputs(
  gate: GateName,
  fdir: string,
  promoteRef: string | undefined,
  sftddDir: string,
  featureId: string,
): { inputs: Record<string, string> } | { reason: string } {
  const readIfPresent = (name: string): string | undefined => {
    const p = join(fdir, name);
    try {
      return existsSync(p) ? readFileSync(p, "utf8") : undefined;
    } catch {
      return undefined;
    }
  };

  const withConformance = (
    inputs: Record<string, string>,
  ): { inputs: Record<string, string> } | { reason: string } => {
    const reason = conformanceReason(inputs);
    return reason === null ? { inputs } : { reason };
  };

  switch (gate) {
    case "spec": {
      // The spec gate locks the Spec Author's structured draft spec:
      // feature-spec.json + feature-spec.md (both required). product-overview.md
      // (the Product Owner's project-level overview) is NOT part of the
      // per-feature spec gate and is deliberately not included here.
      const featureJson = readIfPresent("feature-spec.json");
      if (featureJson === undefined) {
        return { reason: "feature-spec.json not found (spec phase not complete)" };
      }
      const featureMd = readIfPresent("feature-spec.md");
      if (featureMd === undefined) {
        return { reason: "feature-spec.md not found (structured draft spec incomplete)" };
      }
      const inputs: Record<string, string> = {
        "feature-spec.json": featureJson,
        "feature-spec.md": featureMd,
      };
      const conf = withConformance(inputs);
      if ("reason" in conf) return conf;
      // Also enforce per-AC conformance (AC<n> id pattern + shape); the gate
      // previously skipped the acs/ files, letting slug ids + junk through.
      const acReason = acsConformanceReason(fdir);
      if (acReason !== null) return { reason: acReason };
      // And story independence: a later story must not be a subset of an earlier
      // one (records independence.distinct_from_prior; blocks the S2-subset-of-S1
      // overlap that otherwise stalls the build).
      const indepReason = storyIndependenceReason(fdir);
      if (indepReason !== null) return { reason: indepReason };
      // And architecture conventions: once the project canon is established (by an
      // earlier feature), this feature's architecture.json must REUSE the same
      // role -> module layout. Blocks F2 from remapping app/services -> app/logic
      // and diverging from the code it inherited (which would then trip the
      // layering gate's module-placement check at build time). The first feature
      // is exempt (no conventions yet); a non-service-backed feature is exempt.
      const conventionsReason = architectureConventionsReason(sftddDir, featureId);
      if (conventionsReason !== null) return { reason: conventionsReason };
      // Architecture conformance (Gate 2, surfaced through the per-story spec gate
      // since the design lane runs the architect before surfacing it). First the
      // service_backed determination itself: a feature that under-declares (not
      // service_backed while it shows persistence evidence) silently disables the
      // layering checks below, so cross-check it against the architect's own
      // evidence before trusting the flag. Then: a service_backed feature must
      // declare its layers, and every Required NFR must be covered by a brief_ref.
      const serviceBacked = serviceBackedReason(sftddDir, featureId);
      if (serviceBacked !== null) return { reason: serviceBacked };
      const layeringReason = layeringDeclaredReason(sftddDir, featureId);
      if (layeringReason !== null) return { reason: layeringReason };
      const nfrReason = nfrCoverageReason(sftddDir, featureId);
      return nfrReason === null ? conf : { reason: nfrReason };
    }
    case "plan": {
      const planJson = readIfPresent("plan.json");
      if (planJson === undefined) {
        return { reason: "plan.json not found (plan phase not produced)" };
      }
      return withConformance({ "plan.json": planJson });
    }
    case "test_list": {
      const tlJson = readIfPresent("test-list.json");
      const tlMd = readIfPresent("test-list.md");
      if (tlJson === undefined && tlMd === undefined) {
        return { reason: "test-list.json/md not found (test-strategist phase not complete)" };
      }
      const inputs: Record<string, string> = {};
      if (tlJson !== undefined) inputs["test-list.json"] = tlJson;
      if (tlMd !== undefined) inputs["test-list.md"] = tlMd;
      const conf = withConformance(inputs);
      if ("reason" in conf) return conf;
      // Fitness coverage (Gate 3): a service_backed/layered feature's test-list
      // must carry >=1 kind:"fitness" item (the architectural regression guard).
      // Claimed as a hard-block in test-list.schema.json but previously unwired.
      if (tlJson !== undefined) {
        const fitnessReason = fitnessCoverageReason(sftddDir, featureId, tlJson);
        if (fitnessReason !== null) return { reason: fitnessReason };
        // Persistence coverage (Gate 3): a service_backed feature must declare its
        // persistence_invariants[] and cover each with a real-branch test (an item
        // referencing its invariant_id), so DB guarantees are tested against the
        // schema's own contract, not only incidentally through API behavior tests.
        const persistenceReason = persistenceCoverageReason(sftddDir, featureId, tlJson);
        if (persistenceReason !== null) return { reason: persistenceReason };
        // Distinct invariant coverage (Gate 3): each declared invariant belongs
        // to exactly ONE story's fitness tests. A later story re-testing an
        // invariant an earlier story already covers is a redundant re-test that
        // drifts + dead-locks the reflect gate (the persistence face of story
        // overlap); drop it from the later story.
        const distinctReason = invariantCoverageDistinctReason(sftddDir, featureId, tlJson);
        if (distinctReason !== null) return { reason: distinctReason };
      }
      return conf;
    }
    case "promote": {
      if (promoteRef === undefined || promoteRef.length === 0) {
        return { reason: "no promote_ref supplied (nothing to promote)" };
      }
      // promote_ref has no declared format; conformance is a no-op for it.
      return withConformance({ promote_ref: promoteRef });
    }
    case "deploy": {
      // The deploy (working-software) gate locks the Release Engineer's
      // deploy-evidence.json. Teeth: refuse unless the increment was
      // actually reachable AND its feature-verify passed against the running
      // app, not merely that the evidence file exists + conforms.
      const evidence = readIfPresent("deploy-evidence.json");
      if (evidence === undefined) {
        return { reason: "deploy-evidence.json not found (feature not deployed + verified)" };
      }
      let parsed: { reachable?: unknown; verify?: { passed?: unknown } };
      try {
        parsed = JSON.parse(evidence) as typeof parsed;
      } catch {
        return { reason: "deploy-evidence.json is not valid JSON" };
      }
      if (parsed.reachable !== true) {
        return { reason: "deploy-evidence records reachable=false (app not reachable on the target)" };
      }
      if (parsed.verify?.passed !== true) {
        return { reason: "deploy-evidence records verify.passed=false (feature-verify did not pass against the running app)" };
      }
      return withConformance({ "deploy-evidence.json": evidence });
    }
  }
}

