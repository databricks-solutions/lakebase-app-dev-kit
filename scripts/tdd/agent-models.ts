// FEIP-7510 per-role model selection. Each TDD-workflow role agent carries a
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
 * Strongly-recommended default model per role. Mirrors each role def's
 * frontmatter `model:` in skills/lakebase-tdd-workflows/agents/<role>.md.
 * scrum-master is the main session (not spawned), so it inherits.
 */
export const RECOMMENDED_MODELS: Record<AgentRole, string> = {
  "spec-author": "opus",
  "architect-reviewer": "opus",
  "test-strategist": "sonnet",
  "ux-designer": "sonnet",
  "scrum-master": "inherit",
  navigator: "sonnet",
  driver: "sonnet",
  "product-owner": "opus",
  "release-engineer": "sonnet",
};

export const ALL_AGENT_ROLES = Object.keys(RECOMMENDED_MODELS) as AgentRole[];

export interface AgentModelEntry {
  /** The role's strongly-recommended model (from its definition). */
  recommended: string;
  /** The HIL's per-project override, if any. */
  override?: string;
}

export interface AgentConfig {
  version: 1;
  roles: Record<AgentRole, AgentModelEntry>;
}

/** Project-relative path of the per-role model config. */
export const AGENT_CONFIG_REL = join(".lakebase", "agent-config.json");

/**
 * Build the default agent-config: every role seeded with its recommended
 * model, plus any HIL overrides the caller supplied at setup. A `null`
 * override (or one equal to the recommended) is treated as "no override".
 */
export function buildAgentConfig(
  overrides?: Partial<Record<AgentRole, string | null | undefined>>,
): AgentConfig {
  const roles = {} as Record<AgentRole, AgentModelEntry>;
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
 * Resolve the model the orchestrator should spawn `role` with:
 * project override -> project recommended -> built-in recommended -> "inherit".
 */
export function resolveModelForRole(role: AgentRole, projectDir: string): string {
  const entry = readAgentConfig(projectDir)?.roles?.[role];
  return entry?.override ?? entry?.recommended ?? RECOMMENDED_MODELS[role] ?? "inherit";
}
