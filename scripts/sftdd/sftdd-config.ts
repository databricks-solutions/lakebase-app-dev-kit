// Project settings live in one file: `.lakebase/sftdd-config.json` (per-role model/
// effort matrix + build/plan/project knobs). Every project setting resolves
// sftdd-config.json -> code default, with no env or flag override at read time.
// Writers: create-project (create-time) and the drive's write-through override
// flags. The resolved result is what the driver runs with and what run-config.json
// snapshots. Run-mode knobs (record/replay/headless/debug) are not project settings;
// they stay explicit env inputs, read via sftddEnv.
//
// Model knobs mirror what `claude -p` exposes: model, effort
// (low|medium|high|xhigh|max|default), fallbackModel, maxBudgetUsd.

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { AgentRole } from "./agent-log.js";
import {
  ALL_AGENT_ROLES,
  RECOMMENDED_MODELS,
  readAgentConfig,
  type SpawnableAgentRole,
} from "./agent-models.js";

/** Project-relative path of the unified config (canonical name post-SFTDD rename). */
export const SFTDD_CONFIG_REL = join(".lakebase", "sftdd-config.json");
/** Legacy pre-rename name, still READ (dual-read) so existing scaffolded projects
 *  keep working until they migrate. New writes use SFTDD_CONFIG_REL. */
export const LEGACY_TDD_CONFIG_REL = join(".lakebase", "tdd-config.json");
/** @deprecated use SFTDD_CONFIG_REL. Kept as an alias for callers not yet updated. */
export const TDD_CONFIG_REL = SFTDD_CONFIG_REL;

/** The turns whose effort can differ within a multi-turn build role. Single-turn
 *  roles ignore the turn and use their scalar effort. */
export type BuildTurn = "red" | "green" | "review" | "refactor";

/** `--effort` levels `claude -p` accepts, plus "default" (omit the flag). */
export type EffortLevel = "default" | "low" | "medium" | "high" | "xhigh" | "max";

/** Per-role settings as written on disk. `model` and `effort` are each either one
 *  value for the whole role, or a per-turn map (only navigator/driver have multiple
 *  turns). A per-turn `model` map is how the Driver's mechanical GREEN/REFACTOR runs
 *  on a cheaper/faster model than its RED (test authoring), the model-tiering lever. */
export interface RoleSettingsFile {
  model?: string | Partial<Record<BuildTurn, string>>;
  fallbackModel?: string;
  maxBudgetUsd?: number;
  effort?: EffortLevel | Partial<Record<BuildTurn, EffortLevel>>;
}

export interface SftddConfigFile {
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

/** The fully-resolved settings the driver runs with (file -> code default). */
export interface ResolvedSettings {
  /** A role's BASE model (the scalar it runs with when no per-turn override
   *  applies). Callers that know the turn should prefer `modelFor`. */
  models: Record<string, string>;
  fallbackModels: Record<string, string | undefined>;
  budgets: Record<string, number | undefined>;
  /** Resolve the model to spawn a role's turn with: a per-turn `model` map entry
   *  (e.g. driver GREEN on haiku) when present, else the role's base model. This is
   *  the model-tiering lever, mechanical turns run cheaper than authoring turns. */
  modelFor(role: string, turn?: BuildTurn): string;
  /** Resolve a role's effort for a turn ("default" => omit --effort). */
  effortFor(role: string, turn?: BuildTurn): EffortLevel;
  build: { loopGranularity: "story" | "ac" | "hybrid-a"; batchCap?: number; sessionScope: "story" | "cycle" };
  plan: { sizing: boolean };
  project: { uiTrack: boolean; gates: "interactive" | "proxy"; deployTarget: string };
}

/** Read `.lakebase/sftdd-config.json` (canonical), falling back to the legacy
 *  `.lakebase/tdd-config.json` for projects scaffolded before the rename.
 *  Undefined when neither exists / both unparseable. */
export function loadSftddConfig(projectDir: string): SftddConfigFile | undefined {
  for (const rel of [SFTDD_CONFIG_REL, LEGACY_TDD_CONFIG_REL]) {
    const f = join(projectDir, rel);
    if (!existsSync(f)) continue;
    try {
      return JSON.parse(readFileSync(f, "utf8")) as SftddConfigFile;
    } catch {
      return undefined;
    }
  }
  return undefined;
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
}

/**
 * Resolve the run settings: file -> code default, per setting. The file is the
 * SINGLE source of truth for project settings; there is no env override. Legacy
 * `.lakebase/agent-config.json` (models only) is honored as a fallback BELOW the
 * new file but ABOVE the built-in recommended, so existing projects keep their
 * model choices until they adopt sftdd-config.json.
 */
export function resolveSftddSettings(inputs: ResolveInputs): ResolvedSettings {
  const file = loadSftddConfig(inputs.projectDir);
  const legacy = readAgentConfig(inputs.projectDir); // models only

  const models: Record<string, string> = {};
  const fallbackModels: Record<string, string | undefined> = {};
  const budgets: Record<string, number | undefined> = {};
  for (const role of ALL_AGENT_ROLES) {
    const rc = file?.roles?.[role];
    const legacyEntry = legacy?.roles?.[role];
    // A per-turn `model` map has no single scalar; the base falls through to
    // legacy -> recommended -> inherit. Only a string `model` sets the base.
    const scalarModel = typeof rc?.model === "string" ? rc.model : undefined;
    models[role] =
      scalarModel ?? legacyEntry?.override ?? legacyEntry?.recommended ?? RECOMMENDED_MODELS[role] ?? "inherit";
    fallbackModels[role] = rc?.fallbackModel;
    budgets[role] = typeof rc?.maxBudgetUsd === "number" ? rc.maxBudgetUsd : undefined;
  }

  const modelFor = (role: string, turn?: BuildTurn): string => {
    const m = file?.roles?.[role as SpawnableAgentRole]?.model;
    // A per-turn map wins for the turn it names (driver GREEN/REFACTOR on haiku);
    // a scalar (or an absent turn in the map) falls to the role's base model.
    if (m && typeof m !== "string" && turn && m[turn]) return m[turn] as string;
    return models[role] ?? "inherit";
  };

  const effortFor = (role: string, turn?: BuildTurn): EffortLevel => {
    // The file is the single source: a scalar applies to all turns; a map is per-turn.
    const rc = file?.roles?.[role as SpawnableAgentRole];
    const e = rc?.effort;
    if (typeof e === "string") return e;
    if (e && turn && e[turn]) return e[turn] as EffortLevel;
    return defaultEffort(role, turn);
  };

  const build = {
    loopGranularity: (file?.build?.loopGranularity ?? "story") as "story" | "ac" | "hybrid-a",
    batchCap: file?.build?.batchCap,
    sessionScope: (file?.build?.sessionScope ?? "story") as "story" | "cycle",
  };

  const project = {
    uiTrack: file?.project?.uiTrack ?? false,
    gates: (file?.project?.gates ?? "proxy") as "interactive" | "proxy",
    deployTarget: file?.project?.deployTarget ?? "local",
  };

  const plan = { sizing: file?.plan?.sizing ?? true };

  return { models, modelFor, fallbackModels, budgets, effortFor, build, plan, project };
}

/** A default config seeded from the recommended models (for scaffold / `--init`),
 *  with the navigator REVIEW effort pinned low (the P6 default made explicit). */
export function defaultSftddConfig(): SftddConfigFile {
  const roles = {} as Record<SpawnableAgentRole, RoleSettingsFile>;
  for (const role of ALL_AGENT_ROLES) {
    roles[role] =
      role === "navigator"
        ? { model: RECOMMENDED_MODELS[role], effort: { review: "low" } }
        : role === "driver"
          ? // Model tiering: RED (test authoring) + GREEN (implementation) keep the
            // recommended model; only the mechanical REFACTOR turn drops to a fast
            // model. GREEN was on haiku, but the recorded worst GREEN turn thrashed
            // 93 tool round-trips (haiku's trial-and-error), so wall-clock, not token
            // cost, dominated. Sonnet finishes GREEN in far fewer round-trips, faster
            // even at a higher per-token price. Overridable per project by editing
            // sftdd-config.json (a project can flatten to a scalar `model`).
            { model: { red: RECOMMENDED_MODELS[role], green: RECOMMENDED_MODELS[role], refactor: "haiku" } }
          : { model: RECOMMENDED_MODELS[role] };
  }
  return {
    version: 1,
    roles,
    build: { loopGranularity: "story", batchCap: 3, sessionScope: "story" },
    plan: { sizing: true },
    project: { uiTrack: false, gates: "proxy", deployTarget: "local" },
  };
}

/** Write a sftdd-config.json (scaffold/init). Does not overwrite unless force. */
export function writeSftddConfig(projectDir: string, config: SftddConfigFile, opts?: { force?: boolean }): boolean {
  const f = join(projectDir, TDD_CONFIG_REL);
  if (existsSync(f) && !opts?.force) return false;
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(config, null, 2) + "\n");
  return true;
}

/**
 * Write-through for the drive's ad-hoc override flags (`--gates`,
 * `--deploy-target`, `--no-sizing`). These are WRITERS, not parallel readers: a
 * flag persists its value into sftdd-config.json so the file stays the single
 * source of truth (resolveSftddSettings then reads it like any other setting).
 * No-op when no override is given, so a plain run never mutates the file. Loads
 * the existing config (or the default when none) so unrelated fields are kept.
 */
export function applyProjectOverrides(
  projectDir: string,
  over: { gates?: "interactive" | "proxy"; deployTarget?: string; sizing?: boolean },
): void {
  if (over.gates === undefined && over.deployTarget === undefined && over.sizing === undefined) return;
  const cfg = loadSftddConfig(projectDir) ?? defaultSftddConfig();
  cfg.project = cfg.project ?? {};
  if (over.gates !== undefined) cfg.project.gates = over.gates;
  if (over.deployTarget !== undefined) cfg.project.deployTarget = over.deployTarget;
  cfg.plan = cfg.plan ?? {};
  if (over.sizing !== undefined) cfg.plan.sizing = over.sizing;
  writeSftddConfig(projectDir, cfg, { force: true });
}
