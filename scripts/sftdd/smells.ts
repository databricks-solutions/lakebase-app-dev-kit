import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { listCycles } from "./run-cycle";
import type { CycleScope, CycleArtifact } from "./run-cycle";

export type SmellName =
  | "test-list-drift"
  | "cycle-stall"
  | "api-coherence-drift"
  | "fragility-ratio"
  | "test-cost-spiral"
  | "cross-experiment-divergence"
  | "dead-requirement-signal"
  | "test-deletion-attempt"
  | "boundary-violation"
  | "import-time-build-coupling"
  | "scaffold-defect"
  | "ac-overlap"
  | "layering-violation"
  | "ux-adherence"
  | "e2e-inline-regex-flag"
  | "e2e-row-perma-red"
  | "contract-incompleteness"
  | "superseded-tests"
  // Pre-build reflection gate: the Navigator (reflect mode) found a design-time
  // defect in a story's spec or test-list before the build lane. Spec-level +
  // blocking, so it routes to the owning author (bounded one revise) then HITL,
  // reusing the revise-route machinery.
  | "reflect-spec-defect"
  | "reflect-testlist-defect";

export interface SmellDefinition {
  name: SmellName;
  description: string;
  proposed_remediation: string;
  /** revise-routing taxonomy. `spec` smells are a design-time
   *  decomposition defect the PO can send back to an owning author and resume
   *  (revise-routing); `build`/undefined smells hard-halt to the HIL (genuine
   *  build thrashing, a missing scaffold, etc.), with no automatic author route. */
  level?: "spec" | "build";
  /** For a `spec`-level smell: the design-lane author whose remediation it is
   *  (the verdict routes here on `revise`). */
  owning_role?: "spec-author" | "test-strategist";
  /** For a `spec`-level smell: the gate to re-open + re-run (Gate 1 spec vs
   *  Gate 3 test_list). The story re-enters the design lane at that author. */
  gate_to_rerun?: "spec" | "test_list";
}

export const SMELL_CATALOG: SmellDefinition[] = [
  {
    name: "test-list-drift",
    description: "Test list grew by >25% since cycle start without HITL approval.",
    proposed_remediation: "PO refinement on spec.",
    // A drifted/non-orderable test list is a test-strategist decomposition
    // defect: route the remediation back to Gate 3 on `revise`.
    level: "spec",
    owning_role: "test-strategist",
    gate_to_rerun: "test_list",
  },
  {
    name: "superseded-tests",
    description:
      "A new AC intentionally supersedes behavior encoded in PRIOR tests (often from earlier features); the Navigator flagged them in a superseded-tests allowlist. NOT a contradiction to block (that is test-list-drift), the latest AC wins and the accumulated tests must follow it.",
    proposed_remediation:
      "Driver permissively refactors ONLY the flagged tests (and the code) to the new AC, then the honest-GREEN verify re-runs. Bounded to one attempt; an unflagged regression escalates.",
    level: "build",
  },
  {
    name: "cycle-stall",
    description: "N cycles in a row with no GREEN.",
    proposed_remediation: "Re-examine test ordering or spec ambiguity.",
  },
  {
    name: "api-coherence-drift",
    description: "Same concept named differently across two consecutive PASS reviews.",
    proposed_remediation: "Rename refactor before next test.",
  },
  {
    name: "fragility-ratio",
    description: "One behavior change failed >3 tests.",
    proposed_remediation: "Refactor + flag tests-mirror-implementation anti-pattern.",
  },
  {
    name: "test-cost-spiral",
    description: "Each subsequent test takes >2x the lines of the prior one.",
    proposed_remediation: "Reconsider boundary; outer-loop tests probably needed.",
  },
  {
    name: "cross-experiment-divergence",
    description: "Two parallel experiments are solving different problems.",
    proposed_remediation: "Was an opinion gap hidden? Re-run design-spec gate.",
  },
  {
    name: "dead-requirement-signal",
    description: "An AC has had no scenarios written in N cycles while others mature.",
    proposed_remediation: "Deprecate or clarify via PO refinement.",
  },
  {
    name: "test-deletion-attempt",
    description: "Driver or human attempts to remove or weaken an existing test.",
    proposed_remediation: "Hard block. Tests are immutable until the test list itself is renegotiated.",
  },
  {
    name: "boundary-violation",
    description: "Test references a private method or internal helper.",
    proposed_remediation: "Refactor to public boundary or move to inner-loop list.",
  },
  {
    name: "import-time-build-coupling",
    description:
      "The app entry module requires an optional build artifact (e.g. client/dist) at " +
      "module load time, an unconditional StaticFiles mount / asset read at import scope. " +
      "It greens where the artifact happens to exist and crashes at import everywhere it " +
      "does not (backend-only test runs, CI before the client build, fresh clones). Caught " +
      "deterministically by the `lakebase-sftdd-imports-clean` gate; the Navigator may also " +
      "flag it in REVIEW.",
    proposed_remediation:
      "Guard the coupling: mount the compiled client ONLY when its directory exists, and " +
      "serve a clear 503 from the SPA route when index.html is absent, so the module imports " +
      "without the artifact. See the dev/prod-parity rule in software-design-principles.",
  },
  {
    name: "scaffold-defect",
    description:
      "A test cannot run because the project scaffold is missing a piece the kit owns " +
      "(e.g. tests/e2e/conftest.py + the live_server fixture for an E2E AC, or an absent " +
      "runner). The role flags it instead of fabricating the missing scaffold itself. " +
      "Blocking: a fabricated fixture diverges from the shipped one + reintroduces the " +
      "CI-parity bugs the kit template prevents.",
    proposed_remediation:
      "Halt + surface to the HIL. Fix the scaffold (re-run the kit's wiring, e.g. " +
      "--enable-e2e for the project's language), never hand-author the missing piece in the build.",
  },
  {
    name: "ac-overlap",
    description:
      "Two acceptance criteria in a story are not independent: satisfying one's `then` " +
      "inherently satisfies (or contradicts) another, so the dependent AC's test can never " +
      "go RED without deleting shipped code. A spec/test-list decomposition defect. Blocking, " +
      "and flagged at the design gate (Gate 3) so it halts BEFORE a build cycle is wasted, " +
      "rather than surfacing mid-build as a cycle-stall.",
    proposed_remediation:
      "Surface to the PO at the gate. Merge the overlapping ACs, differentiate their observable " +
      "behavior, or (PO decision) accept the dependent AC as already-satisfied. Do not order both " +
      "as separate cycles.",
    // An AC overlap is a spec-author decomposition defect: route back to Gate 1.
    level: "spec",
    owning_role: "spec-author",
    gate_to_rerun: "spec",
  },
  {
    name: "reflect-spec-defect",
    description:
      "The pre-build reflection critic (Navigator, reflect mode) found a defect in the story's " +
      "SPEC before the build lane: an internal contradiction between ACs, a spec-vs-architecture " +
      "layer conflict, or an untestable/vacuous AC (no observable outcome). Caught on the cheap " +
      "design artifacts so it is fixed BEFORE any RED/GREEN/REVIEW cycle runs, the reflection " +
      "gate is a speed play (a spec fix is far cheaper than re-running build cycles).",
    proposed_remediation:
      "Route back to the Spec Author (Gate 1): resolve the contradiction, make the AC observable, " +
      "or realign the AC with the architecture. Bounded to one automatic revise per story; if the " +
      "critic still finds the defect after the re-spec, it escalates to the human.",
    // A spec defect the critic surfaces is a spec-author fix: route back to Gate 1.
    level: "spec",
    owning_role: "spec-author",
    gate_to_rerun: "spec",
  },
  {
    name: "reflect-testlist-defect",
    description:
      "The pre-build reflection critic (Navigator, reflect mode) found a defect in the story's " +
      "TEST-LIST before the build lane: a test that contradicts its AC, an AC with no covering " +
      "test (coverage gap), an NFR with no fitness test, or a test that asserts at a layer the " +
      "architecture forbids. Caught on the cheap artifacts so it is fixed BEFORE the build lane.",
    proposed_remediation:
      "Route back to the Test Strategist (Gate 3): align the test with its AC, add the missing " +
      "coverage, or move the assertion to the correct layer. Bounded to one automatic revise per " +
      "story; if the critic still finds the defect after the re-scope, it escalates to the human.",
    // A test-list defect the critic surfaces is a test-strategist fix: route back to Gate 3.
    level: "spec",
    owning_role: "test-strategist",
    gate_to_rerun: "test_list",
  },
  {
    name: "layering-violation",
    description:
      "The boundary/routes layer touches persistence directly (calls the DB " +
      "session: .query/.add/.commit/.delete on a route handler) or business logic " +
      "lives in the boundary/templates, instead of delegating to a service + " +
      "repository. A fat controller violates the layered-architecture contract the " +
      "architect declared in architecture.json `layers`. Distinct from " +
      "`boundary-violation` (which is a TEST reaching a private method). Caught " +
      "deterministically by `lakebase-sftdd-layering-clean`; the Navigator may also " +
      "flag it in REVIEW.",
    proposed_remediation:
      "Extract a service (business logic) + a repository (the ONLY layer that touches " +
      "the ORM/session); the route handler validates input + delegates. Defended by the " +
      "layering fitness test (tests/architecture/test_layering.py).",
  },
  {
    name: "ux-adherence",
    description:
      "The rendered UI defines the design tokens on :root yet does not USE them at the " +
      "element level: hardcoded hex colors / raw px where a var(--token) belongs, an " +
      "ia.md data-testid seam that was never rendered, or an action surface (form/submit) " +
      "with no feedback affordance (no silent failure / unacknowledged success). Token-level " +
      "adherence (assertDesignAdherence) cannot see this; the element-level checks in " +
      "design-adherence.ts do, and the UX Designer flags it in REVIEW. Distinct from " +
      "`layering-violation` (engineering layering): this is the experience-lens gate.",
    proposed_remediation:
      "Consume tokens via var(--token) (no hardcoded hex/px), render every ia.md screen with " +
      "its data-testid seams, and give every action a perceivable result. Refactor the UI to the " +
      "design guide; do not weaken the guide to match the drift.",
  },
  {
    name: "e2e-inline-regex-flag",
    description:
      "An E2E Playwright matcher (to_contain_text/to_have_text/to_have_url/get_by_text) is " +
      "built from a Python regex carrying INLINE FLAGS , re.compile(r\"(?i)summary\") and the " +
      "like. Playwright forwards the pattern's `.pattern` string verbatim to the browser's " +
      "JavaScript regex engine, which does NOT support inline-flag syntax `(?i)`/`(?s)`/`(?m)`, " +
      "so the regex is invalid and the assertion can never match the running app. The test is " +
      "structurally un-greenable: the honest-GREEN verify rejects it and the build raises to HIL. " +
      "Caught deterministically + cheaply (no browser run) by the e2e-regex-clean static lint, " +
      "which enriches the GREEN-verify failure with the exact file:line + fix.",
    proposed_remediation:
      "Pass the flag as a kwarg, not inline: re.compile(\"summary\", re.IGNORECASE) emits the " +
      "valid JS regex /summary/i. Or, for a plain case-insensitive substring, use the bare string " +
      "form Playwright already matches loosely. See the E2E rule in the Navigator role.",
  },
  {
    name: "e2e-row-perma-red",
    description:
      "An E2E-tagged test row has failed or had zero recorded runs for N or more consecutive cycles.",
    proposed_remediation:
      "Surface to PO: either fix the runner wiring (BASE_URL, paired-branch endpoint, playwright.config), narrow the failing scenario, or retag the AC to a layer with a working runner.",
  },
  {
    name: "contract-incompleteness",
    description:
      "A migration DROPPED (or renamed) a column the running code still references , the ORM " +
      "model field, a query/repository, a serializer/DTO, or a template/view , so the app emits " +
      "SQL for a column the migrated database no longer has and crashes at runtime (\"column X " +
      "does not exist\") even though the migration itself succeeded. The contract half of " +
      "expand/contract (software-design-principles hard rule 9) was left incomplete: the schema " +
      "shrank but the code did not follow in the SAME change. Caught DETERMINISTICALLY by the " +
      "`lakebase-sftdd-contract-clean` gate (it parses the migration's net column drops and greps " +
      "the code tree for residual references), which enriches the GREEN-verify failure with the " +
      "exact file:line list , no model judgment needed to notice OR localize it.",
    proposed_remediation:
      "Driver REPAIR: remove or replace EVERY residual reference (model field, queries, " +
      "serializers/DTOs, templates/views) in the same change so the code matches the migrated " +
      "schema. Never edit the migration or a test to hide it. The green-failure fixDirective " +
      "carries the precise file:line list, so this self-heals without a Navigator assess.",
  },
];

export interface DetectorInput {
  scope: CycleScope;
  cycles: CycleArtifact[];
  test_list_size_at_start?: number;
  test_list_size_now?: number;
  /**
   * Cycle counts for ACs in the same story (excluding the scope's own
   * AC). Caller responsibility to populate; detectDeadRequirementSignal
   * uses it to flag this scope's AC as dead when siblings have matured
   * past the configured threshold. Optional; the detector returns []
   * when absent.
   */
  sibling_ac_cycle_counts?: Record<string, number>;
}

export interface SmellHit {
  smell: SmellName;
  cycle_ids: string[];
  detail: string;
  /** Story the smell was flagged against: lets revise-routing know
   *  which story to send back to its owning author. Optional for back-compat. */
  story_id?: string;
  /** AC the smell concerns, when applicable (carried into the revise brief). */
  ac_id?: string;
}

/** The revise-routing taxonomy for a smell, or null if it is build-level
 *  (hard-halt, no automatic author route). */
export function specLevelSmell(
  name: string,
): { owning_role: "spec-author" | "test-strategist"; gate_to_rerun: "spec" | "test_list" } | null {
  const def = SMELL_CATALOG.find((s) => s.name === name);
  if (!def || def.level !== "spec" || !def.owning_role || !def.gate_to_rerun) return null;
  return { owning_role: def.owning_role, gate_to_rerun: def.gate_to_rerun };
}

/**
 * The re-authoring brief handed to a story's owning author when a SPEC-level
 * smell is auto-revised (revise-route). The brief is SMELL-AWARE because the two
 * kinds of spec defect demand opposite instructions:
 *
 *   - a reflection COVERAGE defect (reflect-testlist-defect / reflect-spec-defect)
 *     means something REQUIRED is missing (an NFR/AC with no covering test, a
 *     contradiction to resolve). The author MUST add the named coverage; giving
 *     them the redundancy "raise an open question rather than fabricate one"
 *     escape hatch invites them to omit it AGAIN, which is exactly how a coverage
 *     revise "heals nothing" and burns the one-revise budget straight to HIL.
 *   - a redundancy/overlap revise (the PO's generic case) means something is
 *     DUPLICATED; the author must NOT re-emit the overlap and SHOULD raise an open
 *     question rather than fabricate not-already-delivered behavior.
 *
 * Keyed on the smell so the deterministic revise (and any real-human decision
 * path) share ONE brief, instead of the string living in the smoke-only Human
 * Proxy.
 */
export function composeReviseBrief(input: { smell: string; gate: string; reason: string }): string {
  const artifact = input.gate === "spec" ? "acceptance criteria" : "ordered test list";
  const isCoverageDefect =
    input.smell === "reflect-testlist-defect" || input.smell === "reflect-spec-defect";
  if (isCoverageDefect) {
    return (
      `REVISE (reflection gate): ${input.reason}\n\n` +
      `Re-author this story's ${artifact} to ADD the specific coverage named above. This coverage is ` +
      `REQUIRED: add the missing test(s)/criterion that assert the exact behavior described , do NOT ` +
      `omit it, weaken it, or defer it to an open question. If the stated behavior genuinely cannot be ` +
      `tested as written, name the concrete blocker; do not punt.`
    );
  }
  return (
    `REVISE (Product Owner): ${input.reason}\n\n` +
    `Re-author this story's ${artifact} to address the above. Do NOT re-emit the same overlap/redundancy; ` +
    `if no honest, not-already-delivered behavior remains, say so as an open question rather than fabricating one.`
  );
}

/**
 * Build-quality smells whose remediation is the ordinary REVIEW -> refactor ->
 * Driver loop: the Navigator's REVIEW verdict names the concrete, behavior-
 * preserving refactor (extract a service, move a module into its declared
 * package, guard an import-time coupling), and the Driver's refactor turn applies
 * it. Unlike a `spec`-level smell (routed back to a design author + re-gate) or a
 * genuinely terminal build smell (cycle-stall, scaffold-defect, test-list-drift),
 * these SELF-HEAL in-loop and must not hard-halt to the HIL while a refactor for
 * the owning AC is already pending , the driver could have taken care of it.
 * The post-refactor verify preserves behavior, refactorAc resolves the smell, and
 * the deploy/promote layering/adherence gate is the final deterministic backstop.
 */
const BUILD_REFACTOR_ROUTABLE = new Set<string>([
  "layering-violation",
  "ux-adherence",
  "import-time-build-coupling",
  // A new AC supersedes behavior encoded in PRIOR tests the Navigator flagged
  // (superseded-tests allowlist). The Driver's refactor turn permissively
  // refactors ONLY those flagged tests + the code, then the honest-GREEN verify
  // re-runs. Bounded to one attempt by supersession.refactored; an unflagged
  // regression never reaches here (it escalates), so the backstop stays intact.
  "superseded-tests",
]);

export function isBuildRefactorRoutableSmell(name: string): boolean {
  return BUILD_REFACTOR_ROUTABLE.has(name);
}

/**
 * True iff an OPEN (unresolved) build-refactor-routable smell is recorded for
 * this story (or feature-wide, for a legacy story-less entry). The deterministic
 * gate that raised it (layering-clean, ux-adherence, import-time-build-coupling)
 * IS the refactor signal, so a reviewed AC should be routed to the Driver's
 * REFACTOR even when the Navigator's verdict said refactor:false. The refactor
 * then resolves the smell (refactorAc) and the post-refactor verify preserves
 * behavior; if a residual violation remains it re-surfaces with no refactor
 * pending and escalates (the backstop stays intact).
 */
export function hasOpenBuildRefactorRoutableSmell(tddDir: string, story_id?: string): boolean {
  return readSmellsLog(tddDir).detected.some(
    (d) =>
      !d.resolution &&
      isBuildRefactorRoutableSmell(d.smell) &&
      (story_id === undefined || d.story_id === undefined || d.story_id === story_id),
  );
}

const CYCLE_STALL_THRESHOLD = 3;
const FRAGILITY_RATIO_FAILED_TESTS = 3;
const TEST_COST_SPIRAL_FACTOR = 2;
const DEAD_REQUIREMENT_SIBLING_THRESHOLD = 3;
const E2E_PERMA_RED_THRESHOLD = 3;

export function detectAll(input: DetectorInput): SmellHit[] {
  const hits: SmellHit[] = [];
  hits.push(...detectCycleStall(input));
  hits.push(...detectFragilityRatio(input));
  hits.push(...detectTestCostSpiral(input));
  hits.push(...detectTestDeletionAttempt(input));
  hits.push(...detectBoundaryViolation(input));
  hits.push(...detectTestListDrift(input));
  hits.push(...detectApiCoherenceDrift(input));
  hits.push(...detectCrossExperimentDivergence(input));
  hits.push(...detectDeadRequirementSignal(input));
  hits.push(...detectE2eRowPermaRed(input));
  return hits;
}

export function detectCycleStall(input: DetectorInput): SmellHit[] {
  const { cycles } = input;
  if (cycles.length < CYCLE_STALL_THRESHOLD) return [];
  const recent = cycles.slice(-CYCLE_STALL_THRESHOLD);
  if (recent.every((c) => !c.green_at)) {
    return [
      {
        smell: "cycle-stall",
        cycle_ids: recent.map((c) => c.cycle_id),
        detail: `${CYCLE_STALL_THRESHOLD} consecutive cycles without GREEN`,
      },
    ];
  }
  return [];
}

export function detectFragilityRatio(input: DetectorInput): SmellHit[] {
  // Flag any cycle whose Navigator already marked the fragility-ratio smell.
  return input.cycles
    .filter((c) => (c.smell_flags ?? []).includes("fragility-ratio"))
    .map((c) => ({
      smell: "fragility-ratio" as const,
      cycle_ids: [c.cycle_id],
      detail: `Navigator-flagged: one behavior change failed >${FRAGILITY_RATIO_FAILED_TESTS} tests`,
    }));
}

export function detectTestCostSpiral(input: DetectorInput): SmellHit[] {
  const sized = input.cycles.filter((c) => c.driver_changes);
  if (sized.length < 2) return [];
  const hits: SmellHit[] = [];
  for (let i = 1; i < sized.length; i++) {
    const prev = sized[i - 1].driver_changes!.length;
    const curr = sized[i].driver_changes!.length;
    if (prev > 0 && curr > prev * TEST_COST_SPIRAL_FACTOR) {
      hits.push({
        smell: "test-cost-spiral",
        cycle_ids: [sized[i - 1].cycle_id, sized[i].cycle_id],
        detail: `driver_changes grew from ${prev} → ${curr} chars (>${TEST_COST_SPIRAL_FACTOR}x)`,
      });
    }
  }
  return hits;
}

export function detectTestDeletionAttempt(input: DetectorInput): SmellHit[] {
  return input.cycles
    .filter((c) => (c.smell_flags ?? []).includes("test-deletion-attempt"))
    .map((c) => ({
      smell: "test-deletion-attempt" as const,
      cycle_ids: [c.cycle_id],
      detail: "Navigator-flagged: Driver or human attempted to remove or weaken a test",
    }));
}

export function detectBoundaryViolation(input: DetectorInput): SmellHit[] {
  return input.cycles
    .filter((c) => (c.smell_flags ?? []).includes("boundary-violation"))
    .map((c) => ({
      smell: "boundary-violation" as const,
      cycle_ids: [c.cycle_id],
      detail: "Navigator-flagged: test references a private method or internal helper",
    }));
}

export function detectTestListDrift(input: DetectorInput): SmellHit[] {
  const { test_list_size_at_start, test_list_size_now, scope } = input;
  if (test_list_size_at_start === undefined || test_list_size_now === undefined) return [];
  if (test_list_size_at_start === 0) return [];
  const growth = (test_list_size_now - test_list_size_at_start) / test_list_size_at_start;
  if (growth > 0.25) {
    return [
      {
        smell: "test-list-drift",
        cycle_ids: [],
        detail: `Test list grew ${Math.round(growth * 100)}% since cycle start (>25%) in ${scope.feature_id}/${scope.story_id}/${scope.ac_id}`,
      },
    ];
  }
  return [];
}

/**
 * api-coherence-drift: pass-through Navigator flag. The signal is "same
 * concept named differently across two consecutive PASS reviews," which
 * requires NLP-y judgment of identifier intent. Navigator flags it on
 * the relevant cycle via smell_flags; detector surfaces.
 */
export function detectApiCoherenceDrift(input: DetectorInput): SmellHit[] {
  return input.cycles
    .filter((c) => (c.smell_flags ?? []).includes("api-coherence-drift"))
    .map((c) => ({
      smell: "api-coherence-drift" as const,
      cycle_ids: [c.cycle_id],
      detail: "Navigator-flagged: same concept named differently across consecutive PASS reviews",
    }));
}

/**
 * cross-experiment-divergence: pass-through Navigator/orchestrator flag.
 * The signal is "two parallel experiments are solving different
 * problems," which requires the synthesis-view that the orchestrator holds
 * across /experiments/N/. Detection lives there; this surfaces.
 */
export function detectCrossExperimentDivergence(input: DetectorInput): SmellHit[] {
  return input.cycles
    .filter((c) => (c.smell_flags ?? []).includes("cross-experiment-divergence"))
    .map((c) => ({
      smell: "cross-experiment-divergence" as const,
      cycle_ids: [c.cycle_id],
      detail: "Navigator-flagged: parallel experiments diverging on what they're testing",
    }));
}

/**
 * dead-requirement-signal: AC has 0 cycles while siblings in the same
 * story have matured past the threshold (default 3 cycles each). The
 * caller passes `sibling_ac_cycle_counts: { 'AC2': N, 'AC3': M, ... }`
 * (excluding the scope's own AC); detector compares the scope's
 * `cycles.length` against that map.
 *
 * Returns [] when sibling_ac_cycle_counts is missing or when this AC
 * isn't actually dead.
 */
export function detectDeadRequirementSignal(input: DetectorInput): SmellHit[] {
  const { scope, cycles, sibling_ac_cycle_counts } = input;
  if (!sibling_ac_cycle_counts) return [];
  if (cycles.length > 0) return [];
  const matureSiblings = Object.entries(sibling_ac_cycle_counts).filter(
    ([, n]) => n >= DEAD_REQUIREMENT_SIBLING_THRESHOLD
  );
  if (matureSiblings.length === 0) return [];
  return [
    {
      smell: "dead-requirement-signal",
      cycle_ids: [],
      detail: `${scope.feature_id}/${scope.story_id}/${scope.ac_id} has 0 cycles while ${matureSiblings.length} sibling AC(s) have matured past ${DEAD_REQUIREMENT_SIBLING_THRESHOLD}: ${matureSiblings.map(([k, v]) => `${k}=${v}`).join(", ")}`,
    },
  ];
}

/**
 * Fire when an E2E-tagged AC has accumulated `E2E_PERMA_RED_THRESHOLD`
 * or more consecutive cycles whose `green_at` is undefined. Since
 * markGreen refuses to advance a layer-tagged cycle without a recorded
 * runner outcome, "no green" captures both real failures and the
 * "runner didn't fire" case. One smell hit per offending ac_id; the
 * cycle_ids array carries the offending tail.
 *
 * Detector is scope-local (groups by ac_id within the input cycles),
 * so it operates on a single AC per scope. The orchestrator iterates
 * scopes to cover the whole feature.
 */
export function detectE2eRowPermaRed(input: DetectorInput): SmellHit[] {
  const e2eCycles = input.cycles.filter((c) => c.layer === "E2E");
  if (e2eCycles.length < E2E_PERMA_RED_THRESHOLD) return [];
  const byAc = new Map<string, CycleArtifact[]>();
  for (const c of e2eCycles) {
    const arr = byAc.get(c.ac_id) ?? [];
    arr.push(c);
    byAc.set(c.ac_id, arr);
  }
  const hits: SmellHit[] = [];
  for (const [acId, group] of byAc) {
    if (group.length < E2E_PERMA_RED_THRESHOLD) continue;
    const tail = group.slice(-E2E_PERMA_RED_THRESHOLD);
    if (tail.every((c) => !c.green_at)) {
      hits.push({
        smell: "e2e-row-perma-red",
        cycle_ids: tail.map((c) => c.cycle_id),
        detail:
          `${input.scope.feature_id}/${input.scope.story_id}/${acId}: ` +
          `${E2E_PERMA_RED_THRESHOLD} consecutive E2E cycles ended without GREEN. ` +
          "Check runner wiring (BASE_URL, paired-branch endpoint, playwright.config) " +
          "before tightening the scenario.",
      });
    }
  }
  return hits;
}

export interface SmellsLog {
  detected: Array<
    SmellHit & {
      detected_at: string;
      resolution?: string;
      /** How a resolved smell was resolved: `revised` = the PO sent
       *  it back to the owning author and the loop resumed; `accepted` = the PO
       *  accepted it as-is. Drives the one-revise-per-(smell,story) bound. */
      resolution_kind?: "revised" | "accepted";
    }
  >;
}

export function writeSmellsLog(tddDir: string, hits: SmellHit[]): SmellsLog {
  const file = join(tddDir, "smells.json");
  const existing: SmellsLog = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { detected: [] };
  const ts = new Date().toISOString();
  const newEntries = hits.map((h) => ({ ...h, detected_at: ts }));
  const merged: SmellsLog = { detected: [...existing.detected, ...newEntries] };
  writeFileSync(file, JSON.stringify(merged, null, 2) + "\n");
  return merged;
}

export function readSmellsLog(tddDir: string): SmellsLog {
  const file = join(tddDir, "smells.json");
  if (!existsSync(file)) return { detected: [] };
  return JSON.parse(readFileSync(file, "utf8"));
}

/** Does an entry concern this (smell, story)? story_id matches when both name it,
 *  or when the caller passes no story (feature-wide match). */
function smellMatches(
  entry: SmellHit & { detected_at: string },
  smell: string,
  story_id?: string,
): boolean {
  if (entry.smell !== smell) return false;
  if (story_id === undefined) return true;
  // A scoped lookup matches an entry with the same story, or a legacy entry that
  // carried no story (so a pre-scope smell still resolves).
  return entry.story_id === undefined || entry.story_id === story_id;
}

/**
 * Mark the first OPEN matching smell resolved. `kind` records how:
 * `revised` (sent back to the owning author + resumed) or `accepted` (as-is).
 * Returns true iff an open entry was found + resolved.
 */
export function markSmellResolved(
  tddDir: string,
  smell: string,
  opts: { story_id?: string; kind: "revised" | "accepted"; note?: string },
): boolean {
  const file = join(tddDir, "smells.json");
  if (!existsSync(file)) return false;
  const log: SmellsLog = JSON.parse(readFileSync(file, "utf8"));
  const entry = log.detected.find((d) => !d.resolution && smellMatches(d, smell, opts.story_id));
  if (!entry) return false;
  entry.resolution = opts.note ?? `${opts.kind} by PO`;
  entry.resolution_kind = opts.kind;
  writeFileSync(file, JSON.stringify(log, null, 2) + "\n");
  return true;
}

/** How many times this (smell, story) has already been revised: the
 *  count of resolved-as-`revised` entries. The one-revise-per-(smell,story) bound
 *  compares against this so a re-fired-then-revised smell can't loop forever. */
export function priorReviseCount(tddDir: string, smell: string, story_id?: string): number {
  return readSmellsLog(tddDir).detected.filter(
    (d) => d.resolution_kind === "revised" && smellMatches(d, smell, story_id),
  ).length;
}

export function runDetectorsForScope(
  tddDir: string,
  scope: CycleScope,
  testListSizeAtStart?: number,
  testListSizeNow?: number
): SmellHit[] {
  const cycles = listCycles(scope);
  return detectAll({
    scope,
    cycles,
    test_list_size_at_start: testListSizeAtStart,
    test_list_size_now: testListSizeNow,
  });
}
