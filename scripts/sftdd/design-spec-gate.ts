import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { readMasterTestList, scopeToStory, acsForStory } from "./test-list";
import { storyPlanJson } from "./sftdd-paths.js";
import type { TestList, TestListItem } from "./test-list";
import { readAcLayer } from "./run-cycle";
import type { AcLayer } from "./experiment";
import { collectSpikeInputs, type SpikeInput } from "./spike-carryforward";

export interface ExperimentStrategy {
  /** Human-readable strategy label, e.g. "postgres-arrays" or "json-blob". */
  name: string;
  /** One-sentence summary of the design choice this strategy makes. */
  rationale: string;
}

export interface PerExperimentCap {
  /**
   * Maximum number of cycles a single experiment may run before the
   * orchestrator caps it. Independent of the race-level wall-clock
   * budget; one runaway experiment burns its own cycles, not the
   * shared phase budget. Undefined or non-positive = no cap.
   */
  max_cycles?: number;
  /**
   * Maximum wall-clock budget for a single experiment, in minutes.
   * Distinct from the race-level wall-clock budget. Undefined or
   * non-positive = no cap.
   */
  max_wall_clock_minutes?: number;
}

export interface BudgetProposal {
  /** Maximum concurrent experiment branches. */
  concurrent_branches: number;
  /** Wall-clock budget in minutes for the whole phase. */
  wall_clock_minutes: number;
  /** Number of Navigator+Driver agent pairs available. */
  agent_pairs: number;
  /**
   * Per-experiment caps. When set, the orchestrator stops a single
   * experiment's cycles when its cap is hit and surfaces "experiment
   * X capped" to the PO without starving its siblings. Optional;
   * absent means no per-experiment cap is enforced (legacy behavior).
   */
  per_experiment?: PerExperimentCap;
}

export interface ExperimentPlan {
  feature_id: string;
  /** The story this plan is for: experiments are story-scoped. */
  story_id: string;
  N: number;
  mode: "N=1" | "N>=2";
  strategies: ExperimentStrategy[];
  budget: BudgetProposal;
  rationale: string;
  /**
   * Spike notes that reference this feature, surfaced from
   * `.sftdd/spikes/<slug>/notes.md` by `collectSpikeInputs`. The gate
   * analyzer populates this automatically when matching spikes exist;
   * the orchestrator presents them to the PO at Gate 4 and the PO
   * decides which to keep via `attachSpikeInputs`.
   */
  spike_inputs?: SpikeInput[];
}

export interface OpinionGap {
  /** Which test item or AC surfaced the gap. */
  ref: string;
  /** Brief description of the design choice that's underspecified. */
  description: string;
}

/**
 * A blocking condition that must be cleared before the orchestrator
 * may advance the feature into phase 4 (Implementation). Distinct from
 * opinion_gaps: those guide the experiment-plan shape; blockers are
 * hard-stops the PO must remediate before any experiment is cut.
 */
export interface TransitionBlocker {
  /**
   * Stable id for orchestrator dispatch + remediation routing.
   * - "e2e-without-playwright": test list references one or more
   *   E2E-tagged ACs but `playwright.config.ts` is missing from the
   *   project root. Fix: run `installPlaywright()` or retag the ACs.
   */
  kind: "e2e-without-playwright";
  detail: string;
  /** AC ids that triggered this blocker. Empty when not AC-scoped. */
  ac_ids?: string[];
}

export interface GateAnalysis {
  feature_id: string;
  story_id: string;
  opinion_gaps: OpinionGap[];
  proposed_plan: ExperimentPlan;
  /** Hard-stops the PO must clear. Empty array means "safe to advance." */
  transition_blockers: TransitionBlocker[];
}

const KEYWORDS_FOR_GAPS = ["could", "either", "or", "alternatively", "consider", "decide", "evaluate", "tbd"];

export interface AnalyzeForGateOptions {
  /**
   * Project root that holds `playwright.config.ts` etc. Defaults to the
   * directory above sftddDir, which matches the canonical convention
   * (`<projectRoot>/.sftdd/`). Pass explicitly when sftddDir lives outside
   * the project root (BDD harness, non-standard layouts).
   */
  projectDir?: string;
}

export function analyzeForGate(
  sftddDir: string,
  featureId: string,
  storyId: string,
  opts?: AnalyzeForGateOptions
): GateAnalysis {
  // Experiments are story-scoped: analyze only this story's slice
  // of the master test list, so N (one experiment vs a race) is decided per
  // story, not per whole feature.
  const master = readMasterTestList(sftddDir, featureId);
  const list = scopeToStory(master, storyId, acsForStory(sftddDir, featureId, storyId));
  const gaps = detectOpinionGaps(list);
  const projectDir = opts?.projectDir ?? dirname(sftddDir);
  const transition_blockers = checkE2eGate({ sftddDir, featureId, list, projectDir });
  const mode: "N=1" | "N>=2" = gaps.length >= 2 ? "N>=2" : "N=1";
  const proposed: ExperimentPlan = {
    feature_id: featureId,
    story_id: storyId,
    N: mode === "N=1" ? 1 : Math.min(gaps.length, 3),
    mode,
    strategies:
      mode === "N=1"
        ? [{ name: "single-experiment", rationale: "Iterative refinement; no parallel race needed." }]
        : gaps.slice(0, 3).map((g, i) => ({
            name: `strategy-${i + 1}`,
            rationale: `Address opinion gap at ${g.ref}: ${g.description}`,
          })),
    budget: {
      concurrent_branches: mode === "N=1" ? 1 : Math.min(gaps.length, 3),
      wall_clock_minutes: 180,
      agent_pairs: mode === "N=1" ? 1 : 2,
      // Default per-experiment caps: 30 cycles + 60 min wall-clock.
      // Generous enough that healthy TDD work never trips them; tight
      // enough that a runaway agent loop doesn't starve siblings.
      // Project-level config overrides via the orchestrator before
      // writePlan is called.
      per_experiment: { max_cycles: 30, max_wall_clock_minutes: 60 },
    },
    rationale:
      mode === "N=1"
        ? "Fewer than 2 opinion gaps detected – refine iteratively on a single branch."
        : `${gaps.length} opinion gaps detected – race up to 3 parallel strategies, then HITL chooses promote vs synthesize.`,
  };
  const spike_inputs = collectSpikeInputs({ sftddDir, featureId });
  if (spike_inputs.length > 0) {
    proposed.spike_inputs = spike_inputs;
  }
  return { feature_id: featureId, story_id: storyId, opinion_gaps: gaps, proposed_plan: proposed, transition_blockers };
}

/**
 * Cross-check: when the test list references at least one E2E-tagged
 * AC but the project root has no `playwright.config.*`, the substrate
 * cannot transition to phase 4 because there is no runner for the
 * E2E rows. Returns one blocker listing every offending AC id; the
 * orchestrator surfaces the remediation menu (run `installPlaywright`
 * or retag the ACs) to the PO.
 */
export function checkE2eGate(args: {
  sftddDir: string;
  featureId: string;
  list: TestList;
  projectDir: string;
}): TransitionBlocker[] {
  const e2eAcIds = new Set<string>();
  for (const item of args.list.items) {
    const layer = readAcLayer(args.sftddDir, args.featureId, item.ac_id) as AcLayer | undefined;
    if (layer === "E2E") {
      e2eAcIds.add(item.ac_id);
    }
  }
  if (e2eAcIds.size === 0) return [];
  const configCandidates = [
    "playwright.config.ts",
    "playwright.config.js",
    "playwright.config.mjs",
  ];
  const hasConfig = configCandidates.some((rel) => existsSync(join(args.projectDir, rel)));
  if (hasConfig) return [];
  const acList = [...e2eAcIds].sort();
  return [
    {
      kind: "e2e-without-playwright",
      detail:
        `Test list references E2E-tagged AC(s) ${acList.map((id) => `[${id}]`).join(", ")} but ` +
        `no playwright.config.{ts,js,mjs} was found at ${args.projectDir}. ` +
        "Run installPlaywright() to scaffold the runner, or retag the ACs to a layer with a wired runner.",
      ac_ids: acList,
    },
  ];
}

function detectOpinionGaps(list: TestList): OpinionGap[] {
  const gaps: OpinionGap[] = [];
  for (const item of list.items) {
    const desc = item.description.toLowerCase();
    if (KEYWORDS_FOR_GAPS.some((kw) => desc.includes(kw))) {
      gaps.push({ ref: item.id, description: item.description });
    }
  }
  return gaps;
}

export function recordPlan(sftddDir: string, plan: ExperimentPlan, deciderEmail?: string): void {
  mkdirSync(sftddDir, { recursive: true });
  const logPath = join(sftddDir, "selection-log.md");
  const ts = new Date().toISOString();
  const lines = [
    "",
    `## ${ts} – Experiment plan for ${plan.feature_id}/${plan.story_id}`,
    `- **Mode:** ${plan.mode} (N=${plan.N})`,
    `- **Budget:** ${plan.budget.concurrent_branches} concurrent, ${plan.budget.wall_clock_minutes} min wall-clock, ${plan.budget.agent_pairs} agent pair(s)`,
    `- **Strategies:**`,
    ...plan.strategies.map((s) => `  - **${s.name}**: ${s.rationale}`),
    `- **Rationale:** ${plan.rationale}`,
    deciderEmail ? `- **Approved by:** ${deciderEmail}` : `- **Approved by:** pending HITL Gate 4`,
    "",
  ];
  appendFileSync(logPath, lines.join("\n"));
}

export function readPlan(sftddDir: string, featureId: string, storyId: string): ExperimentPlan | null {
  const planPath = storyPlanJson(sftddDir, featureId, storyId);
  if (!existsSync(planPath)) return null;
  return JSON.parse(readFileSync(planPath, "utf8"));
}

export function writePlan(sftddDir: string, plan: ExperimentPlan): void {
  // Plan persists per story as features/<F>/stories/<story>/plan.json
  // for downstream readers (orchestrator). Conformance keys plan.json by
  // basename, so the per-story location still validates against plan.schema.json.
  const planPath = storyPlanJson(sftddDir, plan.feature_id, plan.story_id);
  mkdirSync(dirname(planPath), { recursive: true });
  writeFileSync(planPath, JSON.stringify(plan, null, 2) + "\n");
}

// Re-export TestListItem so consumers don't need to import test-list separately for the type.
export type { TestListItem };
