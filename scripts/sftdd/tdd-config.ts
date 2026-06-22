// Unified TDD run config: ONE declarative source of truth for the per-role +
// per-turn model/effort matrix and the build/plan/project behavior knobs, so the
// settings that used to be scattered across `.lakebase/agent-config.json` (models
// only), hardcoded `buildCfg` defaults, and a dozen `LAKEBASE_TDD_*` env vars live
// in one editable file: `.lakebase/tdd-config.json`.
//
// Resolution order for EVERY setting: tdd-config.json -> LAKEBASE_TDD_* env
// override -> code default. (Env stays as the one-off experiment override on top
// of the file; the file is the durable choice.) The resolved result is what the
// driver runs with AND what run-config.json snapshots, so a run is reproducible +
// A/B-comparable.
//
// Model-side knobs are exactly what `claude -p` (v2.1.x) exposes per invocation:
// model, effort (low|medium|high|xhigh|max|default), fallbackModel
// (--fallback-model), maxBudgetUsd (--max-budget-usd). Temperature / token caps /
// max-turns are NOT CLI-exposed, so they are intentionally absent.

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { AgentRole } from "./agent-log.js";
import {
  ALL_AGENT_ROLES,
  RECOMMENDED_MODELS,
  readAgentConfig,
  type SpawnableAgentRole,
} from "./agent-models.js";

/** Project-relative path of the unified config. */
export const TDD_CONFIG_REL = join(".lakebase", "tdd-config.json");

/** The turns whose effort can differ within a multi-turn build role. Single-turn
 *  roles ignore the turn and use their scalar effort. */
export type BuildTurn = "red" | "green" | "review" | "refactor";

/** `--effort` levels `claude -p` accepts, plus "default" (omit the flag). */
export type EffortLevel = "default" | "low" | "medium" | "high" | "xhigh" | "max";

/** Per-role settings as written on disk. `effort` is either one level for the
 *  whole role, or a per-turn map (only navigator/driver have multiple turns). */
export interface RoleSettingsFile {
  model?: string;
  fallbackModel?: string;
  maxBudgetUsd?: number;
  effort?: EffortLevel | Partial<Record<BuildTurn, EffortLevel>>;
}

export interface TddConfigFile {
  version: 1;
  roles?: Partial<Record<SpawnableAgentRole, RoleSettingsFile>>;
  build?: {
    loopGranularity?: "story" | "ac" | "hybrid-a";
    batchCap?: number;
    sessionScope?: "story" | "cycle";
  };
  plan?: { sizing?: boolean };
  project?: { uiTrack?: boolean; gates?: "interactive" | "proxy"; deployTarget?: string };
}

/** The fully-resolved settings the driver runs with (file -> env -> default). */
export interface ResolvedSettings {
  models: Record<string, string>;
  fallbackModels: Record<string, string | undefined>;
  budgets: Record<string, number | undefined>;
  /** Resolve a role's effort for a turn ("default" => omit --effort). */
  effortFor(role: string, turn?: BuildTurn): EffortLevel;
  build: { loopGranularity: "story" | "ac" | "hybrid-a"; batchCap?: number; sessionScope: "story" | "cycle" };
  plan: { sizing: boolean };
  project: { uiTrack: boolean; gates: "interactive" | "proxy"; deployTarget: string };
}

/** Read `.lakebase/tdd-config.json`, or undefined when absent / unparseable. */
export function loadTddConfig(projectDir: string): TddConfigFile | undefined {
  const f = join(projectDir, TDD_CONFIG_REL);
  if (!existsSync(f)) return undefined;
  try {
    return JSON.parse(readFileSync(f, "utf8")) as TddConfigFile;
  } catch {
    return undefined;
  }
}

/** Code default effort: the navigator REVIEW turn runs fast (low), everything
 *  else uses the model default. This preserves the P6 behavior when no config /
 *  env says otherwise. */
function defaultEffort(role: string, turn?: BuildTurn): EffortLevel {
  if (role === "navigator" && turn === "review") return "low";
  return "default";
}

interface ResolveInputs {
  projectDir: string;
  /** Env source (defaults to process.env); injectable for tests. */
  env?: Record<string, string | undefined>;
}

/**
 * Resolve the run settings: file -> env -> code default, per setting. Legacy
 * `.lakebase/agent-config.json` (models only) is honored as a fallback BELOW the
 * new file but ABOVE the built-in recommended, so existing projects keep their
 * model choices until they adopt tdd-config.json.
 */
export function resolveTddSettings(inputs: ResolveInputs): ResolvedSettings {
  const env = inputs.env ?? process.env;
  const file = loadTddConfig(inputs.projectDir);
  const legacy = readAgentConfig(inputs.projectDir); // models only

  const models: Record<string, string> = {};
  const fallbackModels: Record<string, string | undefined> = {};
  const budgets: Record<string, number | undefined> = {};
  for (const role of ALL_AGENT_ROLES) {
    const rc = file?.roles?.[role];
    const legacyEntry = legacy?.roles?.[role];
    models[role] =
      rc?.model ?? legacyEntry?.override ?? legacyEntry?.recommended ?? RECOMMENDED_MODELS[role] ?? "inherit";
    fallbackModels[role] = rc?.fallbackModel;
    budgets[role] = typeof rc?.maxBudgetUsd === "number" ? rc.maxBudgetUsd : undefined;
  }

  const effortFor = (role: string, turn?: BuildTurn): EffortLevel => {
    // Env override wins (the one-off experiment knob on top of the file). Today
    // only LAKEBASE_TDD_REVIEW_EFFORT exists, for the navigator REVIEW turn.
    if (role === "navigator" && turn === "review") {
      const ev = env.LAKEBASE_TDD_REVIEW_EFFORT;
      if (ev === "default") return "default";
      if (ev) return ev as EffortLevel;
    }
    // Then the file: a scalar applies to all turns; a map is per-turn.
    const rc = file?.roles?.[role as SpawnableAgentRole];
    const e = rc?.effort;
    if (typeof e === "string") return e;
    if (e && turn && e[turn]) return e[turn] as EffortLevel;
    return defaultEffort(role, turn);
  };

  const batchCapRaw = env.LAKEBASE_TDD_BATCH_CAP;
  const envBatchCap = batchCapRaw && Number.isFinite(Number(batchCapRaw)) ? Math.floor(Number(batchCapRaw)) : undefined;
  const build = {
    loopGranularity: ((): "story" | "ac" | "hybrid-a" => {
      const e = env.LAKEBASE_TDD_LOOP;
      if (e === "story" || e === "ac" || e === "hybrid-a") return e;
      return file?.build?.loopGranularity ?? "story";
    })(),
    batchCap: envBatchCap ?? file?.build?.batchCap,
    sessionScope: (env.LAKEBASE_TDD_BUILD_SESSION === "cycle"
      ? "cycle"
      : file?.build?.sessionScope ?? "story") as "story" | "cycle",
  };

  const project = {
    uiTrack: env.LAKEBASE_TDD_UI === "1" ? true : env.LAKEBASE_TDD_UI === "0" ? false : file?.project?.uiTrack ?? false,
    gates: (file?.project?.gates ?? "proxy") as "interactive" | "proxy",
    deployTarget: file?.project?.deployTarget ?? "local",
  };

  const plan = { sizing: file?.plan?.sizing ?? true };

  return { models, fallbackModels, budgets, effortFor, build, plan, project };
}

/** A default config seeded from the recommended models (for scaffold / `--init`),
 *  with the navigator REVIEW effort pinned low (the P6 default made explicit). */
export function defaultTddConfig(): TddConfigFile {
  const roles = {} as Record<SpawnableAgentRole, RoleSettingsFile>;
  for (const role of ALL_AGENT_ROLES) {
    roles[role] =
      role === "navigator"
        ? { model: RECOMMENDED_MODELS[role], effort: { review: "low" } }
        : { model: RECOMMENDED_MODELS[role] };
  }
  return {
    version: 1,
    roles,
    build: { loopGranularity: "story", batchCap: 3, sessionScope: "story" },
    plan: { sizing: true },
    project: { gates: "proxy", deployTarget: "local" },
  };
}

/** Write a tdd-config.json (scaffold/init). Does not overwrite unless force. */
export function writeTddConfig(projectDir: string, config: TddConfigFile, opts?: { force?: boolean }): boolean {
  const f = join(projectDir, TDD_CONFIG_REL);
  if (existsSync(f) && !opts?.force) return false;
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(config, null, 2) + "\n");
  return true;
}
