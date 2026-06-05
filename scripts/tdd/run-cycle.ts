import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { getConnection } from "../lakebase/get-connection";
import type { DsnResult } from "../lakebase/get-connection";
import {
  acLayerToTag,
  readOutcomes,
  recordTagRun,
  tagRunCount,
  writeOutcomes,
  type AcLayer,
  type ExperimentTag,
} from "./experiment";
import { emitAgentLogEvent, type AgentLogEventInput } from "./agent-log";

/**
 * Emit a cycle event to the centralized agent log from the SUBSTRATE, not
 * agent prose. The Navigator/Driver call beginCycle/markGreen/markRefactored
 * as the authoritative RED/GREEN/REFACTOR transitions, so emitting here makes
 * every cycle logged deterministically (the agent need not remember to). Same
 * pattern as the mock approver logging its gate decisions. Best-effort:
 * logging is observability, never a reason to fail a cycle.
 */
function logCycleEvent(tddDir: string, event: AgentLogEventInput): void {
  try {
    emitAgentLogEvent(event, { tddDir });
  } catch {
    // swallow: never let logging break a cycle transition
  }
}

export type CycleStage = "PLAN" | "RED" | "GREEN" | "REFACTOR";
export type CycleVerdict = "passed" | "failed" | "skipped";

export interface CycleArtifact {
  cycle_id: string;
  feature_id: string;
  story_id: string;
  ac_id: string;
  test_id: string;
  test_description: string;
  experiment_slug?: string;
  branch_id?: string;
  navigator_plan?: string;
  navigator_verdict?: CycleVerdict;
  driver_changes?: string;
  refactor_notes?: string;
  red_at?: string;
  green_at?: string;
  refactored_at?: string;
  smell_flags?: string[];
  /**
   * AC layer the Driver dispatched on (FEIP-7094). Stamped at beginCycle
   * time: caller may pass it explicitly, otherwise the substrate looks
   * up the AC file under stories and lifts AC.layer. When set,
   * markGreen enforces the runner contract: outcomes.json must record
   * at least one run for the matching tag before the cycle is allowed
   * to advance.
   */
  layer?: AcLayer;
}

/**
 * Walk every story under `<tddDir>/features/<featureId>/stories/` and
 * return the matching AC's `layer` value. Used by beginCycle to
 * auto-stamp the layer on the cycle artifact without forcing callers
 * to thread it through. Returns undefined when the AC file is absent
 * or the field is missing (a brownfield project that pre-dates the
 * layer enum).
 */
export function readAcLayer(tddDir: string, featureId: string, acId: string): AcLayer | undefined {
  const featureDir = join(tddDir, "features", featureId);
  const storiesDir = join(featureDir, "stories");
  if (!existsSync(storiesDir)) return undefined;
  for (const storyDirName of readdirSync(storiesDir)) {
    const storyDir = join(storiesDir, storyDirName);
    if (!statSync(storyDir).isDirectory()) continue;
    const acFile = join(storyDir, "acs", `${acId}.json`);
    if (!existsSync(acFile)) continue;
    try {
      const ac = JSON.parse(readFileSync(acFile, "utf8")) as { layer?: AcLayer };
      if (ac.layer === "API" || ac.layer === "E2E" || ac.layer === "Infra") {
        return ac.layer;
      }
    } catch {
      /* ignore malformed AC, treat as "no layer" */
    }
  }
  return undefined;
}

export interface CycleScope {
  tddDir: string;
  feature_id: string;
  story_id: string;
  ac_id: string;
  experiment_slug?: string;
  branch_id?: string;
}

function cyclesDir(scope: CycleScope): string {
  return join(scope.tddDir, "cycles", scope.feature_id, scope.story_id, scope.ac_id);
}

export function nextCycleId(scope: CycleScope): string {
  const dir = cyclesDir(scope);
  if (!existsSync(dir)) return "cycle-001";
  const ids = readdirSync(dir)
    .filter((f) => /^cycle-\d+\.json$/.test(f))
    .map((f) => parseInt(f.match(/cycle-(\d+)/)![1], 10))
    .sort((a, b) => a - b);
  const next = (ids.at(-1) ?? 0) + 1;
  return `cycle-${String(next).padStart(3, "0")}`;
}

export function writeCycleArtifact(scope: CycleScope, artifact: CycleArtifact): string {
  const dir = cyclesDir(scope);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${artifact.cycle_id}.json`);
  writeFileSync(file, JSON.stringify(artifact, null, 2) + "\n");
  return file;
}

export function readCycleArtifact(scope: CycleScope, cycleId: string): CycleArtifact | null {
  const file = join(cyclesDir(scope), `${cycleId}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

export function listCycles(scope: CycleScope): CycleArtifact[] {
  const dir = cyclesDir(scope);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
}

export interface OpenBranchDsnArgs {
  instance: string;
  branch_id: string;
}

/**
 * Open a DSN against the experiment's Lakebase branch so the test runner
 * (Vitest / Jest / Pytest / Flyway / etc.) can connect to a real per-branch DB.
 * Returned DSN strings are scoped to the experiment branch – not staging, not prod.
 */
export async function openBranchDsn(args: OpenBranchDsnArgs): Promise<DsnResult> {
  return getConnection({
    instance: args.instance,
    branch: args.branch_id,
    output: "dsn",
  });
}

export interface BeginCycleArgs extends CycleScope {
  test_id: string;
  test_description: string;
  navigator_plan?: string;
  /**
   * AC layer for this cycle (FEIP-7094). Explicit value wins; otherwise
   * the substrate derives it from the AC file under the story dir. When
   * resolved, the cycle artifact carries it and markGreen enforces the
   * runner contract (at least one recorded run for the matching tag).
   */
  layer?: AcLayer;
}

export function beginCycle(args: BeginCycleArgs): CycleArtifact {
  const cycle_id = nextCycleId(args);
  const layer = args.layer ?? readAcLayer(args.tddDir, args.feature_id, args.ac_id);
  const artifact: CycleArtifact = {
    cycle_id,
    feature_id: args.feature_id,
    story_id: args.story_id,
    ac_id: args.ac_id,
    test_id: args.test_id,
    test_description: args.test_description,
    experiment_slug: args.experiment_slug,
    branch_id: args.branch_id,
    navigator_plan: args.navigator_plan,
    red_at: new Date().toISOString(),
    layer,
  };
  writeCycleArtifact(args, artifact);
  logCycleEvent(args.tddDir, {
    role: "navigator",
    level: "info",
    event: "cycle.red",
    message: `${args.test_id} RED: ${args.test_description}`,
    feature_id: args.feature_id,
    cycle_id,
    data: { test_id: args.test_id, ac_id: args.ac_id, layer },
  });
  return artifact;
}

export interface RecordRunnerOutcomeArgs {
  scope: CycleScope;
  cycleId: string;
  /** Experiment slug whose outcomes.json receives the per-tag bump. */
  experimentSlug: string;
  /** True iff the runner reported a pass. */
  passed: boolean;
  /**
   * Layer the runner ran for. Defaults to the cycle artifact's stamped
   * layer; pass this explicitly if the cycle is layer-less (legacy)
   * but you still want to record the run.
   */
  layer?: AcLayer;
}

export interface RecordRunnerOutcomeResult {
  cycle: CycleArtifact;
  tag: ExperimentTag;
  /** Total runs recorded for this tag after the increment (pass + fail). */
  runsForTag: number;
}

/**
 * Record a runner outcome for the current cycle (FEIP-7094 Phase 3).
 * Drivers call this after invoking the runner mapped to the current
 * cycle's layer (the tagToRunner table in SKILL.md), passing
 * `passed: true` on green and `passed: false` on red-with-real-failure
 * (not on red-by-design from the Navigator's failing test).
 *
 * Throws if no layer can be resolved for the cycle: the Driver must
 * supply one explicitly or the AC must declare its layer.
 */
export function recordRunnerOutcome(args: RecordRunnerOutcomeArgs): RecordRunnerOutcomeResult {
  const cycle = readCycleArtifact(args.scope, args.cycleId);
  if (!cycle) throw new Error(`cycle ${args.cycleId} not found`);
  const layer = args.layer ?? cycle.layer;
  if (!layer) {
    throw new Error(
      `cycle ${args.cycleId} has no layer and recordRunnerOutcome was called without one. ` +
        "Either stamp AC.layer or pass {layer} explicitly."
    );
  }
  const tag = acLayerToTag(layer);
  const outcomes =
    readOutcomes(args.scope.tddDir, args.scope.feature_id, args.experimentSlug) ?? {
      status: "running",
    };
  recordTagRun(outcomes, tag, args.passed);
  writeOutcomes(args.scope.tddDir, args.scope.feature_id, args.experimentSlug, outcomes);
  // Stamp the layer back onto the cycle when it was inferred from the
  // argument so subsequent reads see it.
  if (!cycle.layer && args.layer) {
    cycle.layer = args.layer;
    writeCycleArtifact(args.scope, cycle);
  }
  return { cycle, tag, runsForTag: tagRunCount(outcomes, tag) };
}

export function markGreen(
  scope: CycleScope,
  cycleId: string,
  driverChanges?: string
): CycleArtifact {
  const a = readCycleArtifact(scope, cycleId);
  if (!a) throw new Error(`cycle ${cycleId} not found`);

  // FEIP-7094 Phase 3 runner contract: when the cycle is tagged with a
  // layer, the Driver MUST have invoked a runner (recordRunnerOutcome)
  // before calling markGreen. Zero runs for the matching tag almost
  // always means the runner-dispatch map was wrong (npm test invoked
  // for an [E2E] row, [Infra] row with no runner wired, etc.).
  if (a.layer && a.experiment_slug) {
    const outcomes = readOutcomes(scope.tddDir, scope.feature_id, a.experiment_slug);
    const tag = acLayerToTag(a.layer);
    const runs = outcomes ? tagRunCount(outcomes, tag) : 0;
    if (runs === 0) {
      throw new Error(
        `markGreen refused: cycle ${cycleId} is tagged [${a.layer}] but outcomes.json ` +
          `records zero runs for "${tag}" on experiment "${a.experiment_slug}". The ` +
          "Driver must call recordRunnerOutcome before markGreen so the substrate can " +
          "verify the right runner fired (see SKILL.md tagToRunner table)."
      );
    }
  }

  a.green_at = new Date().toISOString();
  a.driver_changes = driverChanges;
  a.navigator_verdict = "passed";
  writeCycleArtifact(scope, a);
  logCycleEvent(scope.tddDir, {
    role: "driver",
    level: "info",
    event: "cycle.green",
    message: `${a.test_id} GREEN${driverChanges ? ": " + driverChanges : ""}`,
    feature_id: scope.feature_id,
    cycle_id: cycleId,
    data: { test_id: a.test_id },
  });
  return a;
}

export function markRefactored(scope: CycleScope, cycleId: string, refactorNotes?: string): CycleArtifact {
  const a = readCycleArtifact(scope, cycleId);
  if (!a) throw new Error(`cycle ${cycleId} not found`);
  a.refactored_at = new Date().toISOString();
  a.refactor_notes = refactorNotes;
  writeCycleArtifact(scope, a);
  logCycleEvent(scope.tddDir, {
    role: "driver",
    level: "info",
    event: "cycle.refactored",
    message: `${a.test_id} REFACTOR${refactorNotes ? ": " + refactorNotes : ""}`,
    feature_id: scope.feature_id,
    cycle_id: cycleId,
    data: { test_id: a.test_id },
  });
  return a;
}

export function flagSmells(scope: CycleScope, cycleId: string, smells: string[]): CycleArtifact {
  const a = readCycleArtifact(scope, cycleId);
  if (!a) throw new Error(`cycle ${cycleId} not found`);
  a.smell_flags = [...new Set([...(a.smell_flags ?? []), ...smells])];
  writeCycleArtifact(scope, a);
  return a;
}
