// per-role model selection. Each TDD-workflow role agent carries a
// strongly-recommended model in its definition's frontmatter
// (skills/lakebase-tdd-workflows/agents/<role>.md `model:`). The HIL overrides
// per project, asked at `lakebase-create-project` setup and persisted to
// .lakebase/agent-config.json. The orchestrator resolves the model to spawn
// each role with: project override -> recommended -> "inherit".
//
// RECOMMENDED_MODELS mirrors the role-def frontmatter; the agent-def conformance
// test asserts the two never drift (single source of truth, robust resolution:
// no runtime markdown parsing across src/dist).

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import type { AgentRole } from "./agent-log";

/**
 * The SPAWNABLE role agents: the log roles that are real subagents with a
 * <role>.md def + a model. "orchestrator" is a log role (the deterministic
 * driver emits orchestration events under it) but NOT a spawnable agent, the
 * driver is code, has no .md + no model, so it is excluded here.
 */
export type SpawnableAgentRole = Exclude<AgentRole, "orchestrator">;

/**
 * Strongly-recommended default model per spawnable role. Mirrors each role def's
 * frontmatter `model:` in skills/lakebase-tdd-workflows/agents/<role>.md.
 */
export const RECOMMENDED_MODELS: Record<SpawnableAgentRole, string> = {
  "spec-author": "opus",
  "architect-reviewer": "opus",
  "test-strategist": "sonnet",
  "ux-designer": "sonnet",
  navigator: "sonnet",
  driver: "sonnet",
  "product-owner": "opus",
  "release-engineer": "sonnet",
};

export const ALL_AGENT_ROLES = Object.keys(RECOMMENDED_MODELS) as SpawnableAgentRole[];

export interface AgentModelEntry {
  /** The role's strongly-recommended model (from its definition). */
  recommended: string;
  /** The HIL's per-project override, if any. */
  override?: string;
}

export interface AgentConfig {
  version: 1;
  roles: Record<SpawnableAgentRole, AgentModelEntry>;
}

/** Project-relative path of the per-role model config. */
export const AGENT_CONFIG_REL = join(".lakebase", "agent-config.json");

/**
 * Build the default agent-config: every role seeded with its recommended
 * model, plus any HIL overrides the caller supplied at setup. A `null`
 * override (or one equal to the recommended) is treated as "no override".
 */
export function buildAgentConfig(
  overrides?: Partial<Record<SpawnableAgentRole, string | null | undefined>>,
): AgentConfig {
  const roles = {} as Record<SpawnableAgentRole, AgentModelEntry>;
  for (const role of ALL_AGENT_ROLES) {
    const recommended = RECOMMENDED_MODELS[role];
    const ov = overrides?.[role];
    const entry: AgentModelEntry = { recommended };
    if (ov && ov !== recommended) entry.override = ov;
    roles[role] = entry;
  }
  return { version: 1, roles };
}

/** Read .lakebase/agent-config.json, or undefined when absent. */
export function readAgentConfig(projectDir: string): AgentConfig | undefined {
  const p = join(projectDir, AGENT_CONFIG_REL);
  if (!existsSync(p)) return undefined;
  return JSON.parse(readFileSync(p, "utf8")) as AgentConfig;
}

/** Write .lakebase/agent-config.json (creating .lakebase/ if needed). */
export function writeAgentConfig(projectDir: string, config: AgentConfig): void {
  const p = join(projectDir, AGENT_CONFIG_REL);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(config, null, 2) + "\n");
}

/**
 * Resolve the model the driver should spawn `role` with:
 * project override -> project recommended -> built-in recommended -> "inherit".
 * Accepts any AgentRole; a non-spawnable role (orchestrator) has no model and
 * resolves to "inherit".
 */
export function resolveModelForRole(role: AgentRole, projectDir: string): string {
  const spawnable = role as SpawnableAgentRole;
  const entry = readAgentConfig(projectDir)?.roles?.[spawnable];
  return entry?.override ?? entry?.recommended ?? RECOMMENDED_MODELS[spawnable] ?? "inherit";
}
