// Human Proxy for automated smoke tests.
//
// The TDD workflow's gates (spec / plan / test_list / promote) are
// state-recorded in `.tdd/features/<F>/gates.json` and refuse to advance
// without a human approver. For end-to-end automated smoke runs we
// need a stand-in human that says "yes" to every open gate, with the
// right per-gate artifact inputs hashed into the gate record.
//
// This is the Human Proxy. It is NOT for production use, only for smoke
// harnesses and similar headless test contexts. The default approver
// identity is "human-proxy" so a real audit trail can grep it out
// of selection-log.md / gates.json history.
//
// Per-gate artifact convention (mirrors ADR-0004):
//   spec       -> feature-spec.json + feature-spec.md (both required, the Spec
//                 Author's structured draft spec)
//   plan       -> plan.json (required)
//   test_list  -> test-list.json and/or test-list.md (at least one required)
//   promote    -> a caller-supplied promote_ref string (required)
//
// INTEGRITY RULE (the 002 gate-integrity finding): a gate is
// only approved when its REAL artifact exists on disk. Previously a missing
// artifact was hashed as a placeholder "MOCK_APPROVED" so the gate could
// "close" anyway. That let the Human Proxy pre-approve plan / test_list / promote
// before those artifacts were ever produced (all four gates default to
// "open"), binding nonexistent artifacts to a fabricated hash and nullifying
// the gate. The mock now SKIPS a gate whose artifacts are absent (recorded in
// `skipped[]` with a reason) instead of fabricating one. A real human approver
// can only sign off on what exists; the Human Proxy must mirror that.
//
// CONFORMANCE RULE (Layer 2): existence is necessary but not
// sufficient. Every resolved artifact is checked against its declared format
// via checkArtifactConformance (JSON against its schema; narrative MD against
// its role-documented required sections). A non-conformant artifact is treated
// like a missing one: the gate is SKIPPED with the violations as the reason,
// never approved. A real approver would not sign off a malformed spec; nor
// does the Human Proxy.
//
// Note (flagged, not enforced here): gate ORDERING (spec -> plan -> test_list
// -> promote) is intentionally NOT imposed by this mock, because the N=1
// /design path produces no plan.json, so a rigid chain would stall. Sequencing
// belongs in the orchestrator once the phase<->gate<->mode mapping is settled.

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { approveGate } from "./approve-gate.js";
import { readGates, GATE_NAMES, type GateName, type GatesState } from "./gates.js";
import {
  checkArtifactConformance,
  canonicalArtifactName,
  checkStoryIndependence,
  checkAcIndependence,
  checkLayeringDeclared,
  checkNfrCoverage,
  checkFitnessCoverage,
  checkServiceBackedDeclaration,
} from "./artifact-conformance.js";
import { emitAgentLogEvent } from "./agent-log.js";
import {
  featureResolved,
  featureRequestMd,
  featureTestListJson,
  storyTestListJson,
  acsDir,
  handbackFile,
  storyAcIds,
  architectureJson,
  nfrsMd,
  featureNfrsMd,
} from "./tdd-paths.js";
import { readConventions, assertArchitectureConforms } from "./architecture-conventions.js";
import { readPipeline, writePipeline, reviseStory } from "./story-pipeline.js";
import { markSmellResolved } from "./smells.js";

/**
 * Emit the HITL reviewer's decision to the centralized agent log. The mock
 * approver stands in for the human reviewer, so its validate-then-approve (or
 * refuse) is itself a logged HITL interaction (role: product-owner, approver
 * identity in `data`). Best-effort: logging must never break gate approval.
 */
function logHitlDecision(
  tddDir: string,
  featureId: string,
  approver: string,
  decision:
    | { kind: "approved"; gate: GateName; artifacts: string[] }
    | { kind: "refused"; gate: GateName; reason: string },
): void {
  try {
    if (decision.kind === "approved") {
      emitAgentLogEvent(
        {
          role: "product-owner",
          level: "info",
          event: "gate.approved",
          feature_id: featureId,
          slots: { gate: decision.gate, artifacts: decision.artifacts, approver, validated: true },
        },
        { tddDir },
      );
    } else {
      emitAgentLogEvent(
        {
          role: "product-owner",
          level: "warn",
          event: "gate.rejected",
          feature_id: featureId,
          slots: { gate: decision.gate, reason: decision.reason, approver, validated: false },
        },
        { tddDir },
      );
    }
  } catch {
    // Logging is observability, not a gate. Never let it break approval.
  }
}

export const HUMAN_PROXY = "human-proxy";

/**
 * Stale the owning author's artifact for a story so the design lane RE-INVOKES
 * that author on a revise (FEIP-7626), the teeth that make revise non-hollow.
 * Always clears the story's test list (remove its items from the master
 * test-list.json + delete the per-story view) so testListReady reads false and
 * the test-strategist re-runs. A `spec`-gate revise also clears the story's ACs
 * (a re-decomposition) so hasAcs reads false and the spec-author re-drafts.
 */
function staleStoryArtifactsForRevise(
  tddDir: string,
  featureId: string,
  story: string,
  gate: "spec" | "test_list",
): void {
  const acIds = new Set(storyAcIds(tddDir, featureId, story));
  const master = featureTestListJson(tddDir, featureId);
  if (existsSync(master)) {
    try {
      const data = JSON.parse(readFileSync(master, "utf8")) as { items?: Array<{ ac_id?: string }> };
      if (Array.isArray(data.items)) {
        data.items = data.items.filter((it) => !it.ac_id || !acIds.has(it.ac_id));
        writeFileSync(master, JSON.stringify(data, null, 2) + "\n");
      }
    } catch {
      // Leave the master as-is on a parse error; deleting the per-story view
      // below still forces a re-run.
    }
  }
  const perStory = storyTestListJson(tddDir, featureId, story);
  if (existsSync(perStory)) rmSync(perStory, { force: true });

  if (gate === "spec") {
    const dir = acsDir(tddDir, featureId, story);
    if (existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        if (f.endsWith(".json") || f.endsWith(".md")) rmSync(join(dir, f), { force: true });
      }
    }
  }
}

export interface DecideEscalationArgs {
  featureId: string;
  /** The story to send back to its owning author + resume. */
  story: string;
  /** The blocking smell being resolved (e.g. ac-overlap, test-list-drift). */
  smell: string;
  /** The owning author the verdict routes to. */
  routedTo: "spec-author" | "test-strategist";
  /** The gate to re-open + re-run (Gate 1 spec vs Gate 3 test_list). */
  gate: "spec" | "test_list";
  /** The verdict (the smell's detail): the spec/test author's brief on resume. */
  reason: string;
  approver?: string;
  tddDir?: string;
}

export interface DecideEscalationResult {
  decided: "revise";
  story: string;
  routedTo: string;
  /** True iff an open matching smell was found + marked resolved. */
  resolvedSmell: boolean;
}

/**
 * FEIP-7626 self-heal: the Human Proxy makes the PO's `revise` decision on a
 * SPEC-level blocking escalation and drives the circle-back in one step, the
 * headless stand-in for a human choosing accept|revise. It (1) records the
 * decision as the PO's gate event (auditable as a self-heal, not an invisible
 * auto-edit), (2) resets the story to `designing` via reviseStory (discard the
 * experiment, reopen the gate, free the lane), and (3) resolves the smell as
 * `revised`, which spends the one-revise-per-(smell,story) budget so a second
 * escape of the SAME smell on the SAME story hard-halts instead of looping. The
 * standing design lane then re-runs Gate 1->2->3 at the owning author and the
 * build resumes. The driver only emits this AFTER the pure transition already
 * decided the escalation was routable (budget not yet spent), so it always
 * spends from 0 -> 1.
 */
export function decideEscalationAsHumanProxy(args: DecideEscalationArgs): DecideEscalationResult {
  const tddDir = args.tddDir ?? "./.tdd";
  const approver = args.approver ?? HUMAN_PROXY;
  const at = new Date().toISOString();

  // 1. Record the PO's revise decision (the human's choice, made by the proxy).
  try {
    emitAgentLogEvent(
      {
        role: "product-owner",
        level: "info",
        event: "gate.modified",
        feature_id: args.featureId,
        slots: {
          gate: args.gate,
          decision: "revise",
          routed_to: args.routedTo,
          smell: args.smell,
          story: args.story,
          verdict: args.reason,
          approver,
        },
      },
      { tddDir },
    );
  } catch {
    // Logging is observability, never block the heal.
  }

  // 2. Reset the story to designing (discard experiment + reopen gate + free lane).
  const pipeline = readPipeline(tddDir, args.featureId);
  reviseStory(pipeline, args.story, { approver, at, reason: args.reason });
  writePipeline(tddDir, pipeline);

  // 2b. Force the owning author to actually RE-AUTHOR (not just re-gate the same
  // artifacts): stale its artifact so the design lane re-invokes it, and deliver
  // the verdict as that author's hand-back brief. Without this the design lane
  // sees the artifact still on disk + jumps straight to re-approving the
  // IDENTICAL spec, so the same smell re-fires and the revise heals nothing.
  staleStoryArtifactsForRevise(tddDir, args.featureId, args.story, args.gate);
  try {
    const hb = handbackFile(tddDir, args.featureId, args.routedTo, args.story);
    mkdirSync(dirname(hb), { recursive: true });
    const artifact = args.gate === "spec" ? "acceptance criteria" : "ordered test list";
    writeFileSync(
      hb,
      `REVISE (Product Owner): ${args.reason}\n\nRe-author this story's ${artifact} to address the above. ` +
        `Do NOT re-emit the same overlap/redundancy; if no honest, not-already-delivered behavior remains, ` +
        `say so as an open question rather than fabricating one.`,
    );
  } catch {
    // The brief is best-effort observability; never block the heal.
  }

  // 3. Resolve the smell as `revised` (spends the budget; a re-fire is a hard halt).
  const resolvedSmell = markSmellResolved(tddDir, args.smell, {
    story_id: args.story,
    kind: "revised",
    note: `revised by ${approver}: routed to ${args.routedTo} (${args.gate} gate)`,
  });

  return { decided: "revise", story: args.story, routedTo: args.routedTo, resolvedSmell };
}

export interface HumanProxyArgs {
  featureId: string;
  tddDir?: string;
  /** Override the approver identity. Defaults to "human-proxy". */
  approver?: string;
  /** Limit to a single gate; default approves every open gate whose artifacts exist. */
  onlyGate?: GateName;
  /** For the promote gate, the ref to hash. When absent, the promote gate is skipped. */
  promoteRef?: string;
}

export interface HumanProxyResult {
  approved: GateName[];
  skipped: Array<{ gate: GateName; reason: string }>;
  finalState: GatesState;
}

function featureDir(tddDir: string, featureId: string): string {
  return featureResolved(tddDir, featureId);
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
function acsConformanceReason(fdir: string): string | null {
  const stories = join(fdir, "stories");
  if (!existsSync(stories)) return null;
  const problems: string[] = [];
  for (const s of readdirSync(stories)) {
    const acsDir = join(stories, s, "acs");
    if (!existsSync(acsDir)) continue;
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
      const r = checkArtifactConformance(canonicalArtifactName(p), content);
      if (!r.ok) problems.push(`${s}/acs/${f}: ${r.violations.join("; ")}`);
    }
    // AC independence within this story: a later AC must not be a subset of an
    // earlier one (records independence.distinct_from_prior; blocks the
    // AC3-subset-of-AC2 overlap that otherwise stalls the build).
    const indep = checkAcIndependence(acs);
    if (!indep.ok) problems.push(...indep.violations.map((v) => `${s}/acs: ${v}`));
  }
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
function architectureConventionsReason(tddDir: string, featureId: string): string | null {
  const conventions = readConventions(tddDir);
  if (!conventions) return null; // first feature / nothing established yet
  const archFile = architectureJson(tddDir, featureId);
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
function readArchitecture(tddDir: string, featureId: string): string | undefined {
  const f = architectureJson(tddDir, featureId);
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
function layeringDeclaredReason(tddDir: string, featureId: string): string | null {
  const arch = readArchitecture(tddDir, featureId);
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
function nfrCoverageReason(tddDir: string, featureId: string): string | null {
  const arch = readArchitecture(tddDir, featureId);
  if (arch === undefined) return null;
  const featureNfrs = featureNfrsMd(tddDir, featureId);
  const projectNfrs = nfrsMd(tddDir);
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
function fitnessCoverageReason(tddDir: string, featureId: string, testListJson: string): string | null {
  const arch = readArchitecture(tddDir, featureId);
  if (arch === undefined) return null;
  const r = checkFitnessCoverage(testListJson, arch);
  return r.ok ? null : `fitness coverage failed: ${r.violations.join("; ")}`;
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
function serviceBackedReason(tddDir: string, featureId: string): string | null {
  const arch = readArchitecture(tddDir, featureId);
  if (arch === undefined) return null;
  // The architect's own evidence: every AC's declared layer + every nfrs[] text.
  const acLayers: string[] = [];
  const fdir = featureDir(tddDir, featureId);
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
function resolveArtifactInputs(
  gate: GateName,
  fdir: string,
  promoteRef: string | undefined,
  tddDir: string,
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
      const conventionsReason = architectureConventionsReason(tddDir, featureId);
      if (conventionsReason !== null) return { reason: conventionsReason };
      // Architecture conformance (Gate 2, surfaced through the per-story spec gate
      // since the design lane runs the architect before surfacing it). First the
      // service_backed determination itself: a feature that under-declares (not
      // service_backed while it shows persistence evidence) silently disables the
      // layering checks below, so cross-check it against the architect's own
      // evidence before trusting the flag. Then: a service_backed feature must
      // declare its layers, and every Required NFR must be covered by a brief_ref.
      const serviceBacked = serviceBackedReason(tddDir, featureId);
      if (serviceBacked !== null) return { reason: serviceBacked };
      const layeringReason = layeringDeclaredReason(tddDir, featureId);
      if (layeringReason !== null) return { reason: layeringReason };
      const nfrReason = nfrCoverageReason(tddDir, featureId);
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
        const fitnessReason = fitnessCoverageReason(tddDir, featureId, tlJson);
        if (fitnessReason !== null) return { reason: fitnessReason };
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

export function drainGatesAsHumanProxy(args: HumanProxyArgs): HumanProxyResult {
  const tddDir = args.tddDir ?? "./.tdd";
  const approver = args.approver ?? HUMAN_PROXY;
  const fdir = featureDir(tddDir, args.featureId);

  let state = readGates(args.featureId, { tddDir });
  const approved: GateName[] = [];
  const skipped: HumanProxyResult["skipped"] = [];

  const gates: GateName[] =
    args.onlyGate !== undefined ? [args.onlyGate] : [...GATE_NAMES];

  for (const gate of gates) {
    const record = state.gates[gate];
    if (record.status !== "open") {
      skipped.push({ gate, reason: `status=${record.status}` });
      continue;
    }
    const resolved = resolveArtifactInputs(gate, fdir, args.promoteRef, tddDir, args.featureId);
    if ("reason" in resolved) {
      skipped.push({ gate, reason: resolved.reason });
      // The HITL reviewer refused: the artifact was missing or did not carry
      // its expected elements. Record that interaction.
      logHitlDecision(tddDir, args.featureId, approver, {
        kind: "refused",
        gate,
        reason: resolved.reason,
      });
      continue;
    }
    const result = approveGate({
      featureId: args.featureId,
      gate,
      approver,
      hitlApproved: true,
      artifactInputs: resolved.inputs,
      tddDir,
    });
    approved.push(gate);
    state = result.state;
    // The HITL reviewer validated the expected elements + approved. Record it.
    logHitlDecision(tddDir, args.featureId, approver, {
      kind: "approved",
      gate,
      artifacts: Object.keys(resolved.inputs),
    });
  }

  return { approved, skipped, finalState: state };
}

// ─── stage-aware intake supply ──────────────────────────────────────────────
//
// The Human Proxy stands in for the human at every orchestrated touchpoint, not
// only gates. At an INTAKE step (the orchestrator needs an artifact the human
// would have authored, e.g. product-overview.md / nfrs.md / design-brief.md /
// feature-request.md), the proxy SUPPLIES the pre-recorded artifact: it
// validates the recorded content conforms to the artifact's declared format,
// places it at the target path, and logs the interaction. A missing or
// non-conformant recording is REFUSED (hard-block), the same as a human who
// cannot hand over an artifact that does not meet its format.

export interface SupplyArgs {
  /** Recorded source file the human authored ahead of time. */
  from: string;
  /** Target path the orchestrator wants the artifact at (under .tdd/). */
  to: string;
  /** Canonical artifact name for conformance keying. Defaults to basename(to). */
  artifact?: string;
  /** .tdd/ root, for logging. */
  tddDir?: string;
  /** Feature id, for logging (intake artifacts may be project- or feature-level). */
  featureId?: string;
  /** Proxy identity. Defaults to "human-proxy". */
  approver?: string;
}

export interface SupplyResult {
  ok: boolean;
  artifact: string;
  to: string;
  /** Present when ok === false. */
  reason?: string;
}

export function supplyArtifact(args: SupplyArgs): SupplyResult {
  const approver = args.approver ?? HUMAN_PROXY;
  const artifact = args.artifact ?? basename(args.to);
  const tddDir = args.tddDir ?? "./.tdd";

  const refuse = (reason: string): SupplyResult => {
    try {
      emitAgentLogEvent(
        {
          role: "product-owner",
          level: "warn",
          event: "intake.refused",
          feature_id: args.featureId,
          slots: { artifact, to: args.to, reason, approver, validated: false },
        },
        { tddDir },
      );
    } catch {
      /* logging is observability, never a gate */
    }
    return { ok: false, artifact, to: args.to, reason };
  };

  if (!existsSync(args.from)) {
    return refuse(`recorded source not found: ${args.from}`);
  }
  const content = readFileSync(args.from, "utf8");
  const conformance = checkArtifactConformance(artifact, content);
  if (!conformance.ok) {
    return refuse(`format conformance failed: ${conformance.violations.join("; ")}`);
  }

  mkdirSync(dirname(args.to), { recursive: true });
  writeFileSync(args.to, content);

  try {
    emitAgentLogEvent(
      {
        role: "product-owner",
        level: "info",
        event: "intake.supplied",
        feature_id: args.featureId,
        slots: { artifact, from: args.from, to: args.to, approver, validated: true },
      },
      { tddDir },
    );
  } catch {
    /* logging is observability, never a gate */
  }
  return { ok: true, artifact, to: args.to };
}

// ─── author-requests supply (the PO artifacts, given when the state machine asks) ─
//
// At the planning `author-requests` step the state machine needs the Product
// Owner's feature-request.md per committed feature. The machine is identical
// for a human and the proxy: interactive, the driver stops here and the HUMAN
// provides the requests (directly, or by working with the PO agent); headless,
// the Human Proxy provides the pre-recorded answers WHEN ASKED (not before) and
// logs each, then sync-backlog projects the backlog from what was supplied.
//
// The committed set + each request's recorded source are the orchestrator's
// call, passed in via LAKEBASE_TDD_SPRINT_REQUESTS as one `<feature_id>\t<source
// path>` per line (the recorded file is named independently of the feature id,
// e.g. v1-initial-domain.md -> F1-initial-domain). Unset => no-op (the live
// human provides them out-of-band); the driver still advances once they exist.

export interface SupplyRequestsArgs {
  tddDir?: string;
  approver?: string;
  /** Override the recorded pairs; defaults to $LAKEBASE_TDD_SPRINT_REQUESTS. */
  pairs?: Array<{ featureId: string; from: string }>;
}

export interface SupplyRequestsResult {
  supplied: string[];
  skipped: Array<{ featureId: string; reason: string }>;
}

/** Parse the `<feature_id>\t<source>` lines from $LAKEBASE_TDD_SPRINT_REQUESTS. */
function recordedRequestPairs(): Array<{ featureId: string; from: string }> {
  const raw = process.env.LAKEBASE_TDD_SPRINT_REQUESTS ?? "";
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const [featureId, ...rest] = line.split("\t");
      const from = rest.join("\t").trim();
      return featureId && from ? [{ featureId: featureId.trim(), from }] : [];
    });
}

/**
 * Supply the sprint's recorded feature-request.md files when the state machine
 * asks (the headless stand-in for the PO authoring them). Each is validate-then-
 * placed at features/<id>/feature-request.md via supplyArtifact, which logs the
 * interaction. Returns what was supplied + skipped.
 */
export function supplyRequests(args: SupplyRequestsArgs = {}): SupplyRequestsResult {
  const tddDir = args.tddDir ?? "./.tdd";
  const pairs = args.pairs ?? recordedRequestPairs();
  const supplied: string[] = [];
  const skipped: SupplyRequestsResult["skipped"] = [];
  for (const { featureId, from } of pairs) {
    const res = supplyArtifact({
      from,
      to: featureRequestMd(tddDir, featureId),
      artifact: "feature-request.md",
      tddDir,
      featureId,
      approver: args.approver,
    });
    if (res.ok) supplied.push(featureId);
    else skipped.push({ featureId, reason: res.reason ?? "unknown" });
  }
  return { supplied, skipped };
}
