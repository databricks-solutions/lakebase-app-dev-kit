import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { readMasterTestList } from "./test-list";
import type { TestList, TestListItem } from "./test-list";
import { readAcLayer } from "./run-cycle";
import type { AcLayer } from "./experiment";

export interface ExperimentStrategy {
  /** Human-readable strategy label, e.g. "postgres-arrays" or "json-blob". */
  name: string;
  /** One-sentence summary of the design choice this strategy makes. */
  rationale: string;
}

export interface BudgetProposal {
  /** Maximum concurrent experiment branches. */
  concurrent_branches: number;
  /** Wall-clock budget in minutes for the whole phase. */
  wall_clock_minutes: number;
  /** Number of Navigator+Driver agent pairs available. */
  agent_pairs: number;
}

export interface ExperimentPlan {
  feature_id: string;
  N: number;
  mode: "N=1" | "N>=2";
  strategies: ExperimentStrategy[];
  budget: BudgetProposal;
  rationale: string;
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
  opinion_gaps: OpinionGap[];
  proposed_plan: ExperimentPlan;
  /** Hard-stops the PO must clear. Empty array means "safe to advance." */
  transition_blockers: TransitionBlocker[];
}

const KEYWORDS_FOR_GAPS = ["could", "either", "or", "alternatively", "consider", "decide", "evaluate", "tbd"];

export interface AnalyzeForGateOptions {
  /**
   * Project root that holds `playwright.config.ts` etc. Defaults to the
   * directory above tddDir, which matches the canonical convention
   * (`<projectRoot>/.tdd/`). Pass explicitly when tddDir lives outside
   * the project root (BDD harness, non-standard layouts).
   */
  projectDir?: string;
}

export function analyzeForGate(
  tddDir: string,
  featureId: string,
  opts?: AnalyzeForGateOptions
): GateAnalysis {
  const list = readMasterTestList(tddDir, featureId);
  const gaps = detectOpinionGaps(list);
  const projectDir = opts?.projectDir ?? dirname(tddDir);
  const transition_blockers = checkE2eGate({ tddDir, featureId, list, projectDir });
  const mode: "N=1" | "N>=2" = gaps.length >= 2 ? "N>=2" : "N=1";
  const proposed: ExperimentPlan = {
    feature_id: featureId,
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
    },
    rationale:
      mode === "N=1"
        ? "Fewer than 2 opinion gaps detected – refine iteratively on a single branch."
        : `${gaps.length} opinion gaps detected – race up to 3 parallel strategies, then HITL chooses promote vs synthesize.`,
  };
  return { feature_id: featureId, opinion_gaps: gaps, proposed_plan: proposed, transition_blockers };
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
  tddDir: string;
  featureId: string;
  list: TestList;
  projectDir: string;
}): TransitionBlocker[] {
  const e2eAcIds = new Set<string>();
  for (const item of args.list.items) {
    const layer = readAcLayer(args.tddDir, args.featureId, item.ac_id) as AcLayer | undefined;
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

export function recordPlan(tddDir: string, plan: ExperimentPlan, deciderEmail?: string): void {
  mkdirSync(tddDir, { recursive: true });
  const logPath = join(tddDir, "selection-log.md");
  const ts = new Date().toISOString();
  const lines = [
    "",
    `## ${ts} – Experiment plan for ${plan.feature_id}`,
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

export function readPlan(tddDir: string, featureId: string): ExperimentPlan | null {
  const planPath = join(tddDir, "features", `${featureId}`, "plan.json");
  if (!existsSync(planPath)) return null;
  return JSON.parse(readFileSync(planPath, "utf8"));
}

export function writePlan(tddDir: string, plan: ExperimentPlan): void {
  // Plan persists as features/<F>/plan.json for downstream readers (orchestrator).
  const dir = join(tddDir, "features", plan.feature_id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "plan.json"), JSON.stringify(plan, null, 2) + "\n");
}

// Re-export TestListItem so consumers don't need to import test-list separately for the type.
export type { TestListItem };
