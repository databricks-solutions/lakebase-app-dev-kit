// SCM workflow state: gate surface for the lakebase-scm-workflows state machine.
//
// Lives at `.lakebase/workflow-state.json` in a paired project. Every SCM
// state transition (feature claim, PR prep, CI green, merge) is recorded
// here. Phase A (this file) is ADVISORY: helpers exist, the inspect CLI
// reads, but no gate refuses to advance. Phase B introduces the
// transition-driving CLIs; phase C flips gates to blocking.
//
// Single-feature-per-project-root, v1. Multi-feature would require
// either multi-worktree or a per-feature sub-state file; the current
// design treats the working tree as the unit of work (one git HEAD =
// one Lakebase pair = one workflow row).

import * as fs from "node:fs";
import * as path from "node:path";

/** All SCM states, in canonical progression order. */
export const SCM_STATES = [
  "scaffold-complete",
  "feature-claimed",
  "pr-ready",
  "ci-green",
  "merged",
] as const;

export type ScmState = (typeof SCM_STATES)[number];

const STATE_INDEX: Record<ScmState, number> = SCM_STATES.reduce(
  (acc, s, i) => ({ ...acc, [s]: i }),
  {} as Record<ScmState, number>,
);

export type TierTopology = 1 | 2 | 3;

export interface ScmWorkflowState {
  $schema?: string;
  version: 1;
  state: ScmState;
  tier_topology: TierTopology;
  project_id: string;
  feature_id?: string;
  branch?: string;
  parent_branch?: string;
  lakebase_branch_uid?: string;
  claimed_at?: string;
  pr_url?: string;
  pushed_at?: string;
  ci_run_url?: string;
  ci_green_at?: string;
  merged_at?: string;
}

/** Project-root-relative path to the gate-surface file. */
export const STATE_FILE_REL = ".lakebase/workflow-state.json";

/** Resolve the absolute path to the state file for a given project root. */
export function stateFilePath(projectDir: string): string {
  return path.join(projectDir, STATE_FILE_REL);
}

/**
 * Read the workflow-state file. Returns null if the file does not exist
 * (scaffold has not been run yet, or the project pre-dates the state
 * machine). Throws on parse / validation errors so callers can surface
 * them instead of silently treating a broken file as "no state."
 */
export function readWorkflowState(projectDir: string): ScmWorkflowState | null {
  const p = stateFilePath(projectDir);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `Failed to parse ${STATE_FILE_REL}: ${(e as Error).message}`,
    );
  }
  const result = validateWorkflowState(parsed);
  if (!result.ok) {
    const summary = result.errors
      .map((e) => `  - ${e.path}: ${e.message}`)
      .join("\n");
    throw new Error(
      `Invalid ${STATE_FILE_REL}:\n${summary}\n\nFix the file or delete it to re-init.`,
    );
  }
  return result.value;
}

/**
 * Write the workflow-state file atomically (tmp + rename). Creates the
 * `.lakebase/` directory if missing. Validates before writing so a
 * caller cannot persist a state that would fail to read back.
 */
export function writeWorkflowState(
  projectDir: string,
  state: ScmWorkflowState,
): void {
  const result = validateWorkflowState(state);
  if (!result.ok) {
    const summary = result.errors
      .map((e) => `  - ${e.path}: ${e.message}`)
      .join("\n");
    throw new Error(`Refusing to write invalid SCM state:\n${summary}`);
  }
  const dir = path.join(projectDir, ".lakebase");
  fs.mkdirSync(dir, { recursive: true });
  const target = stateFilePath(projectDir);
  const tmp = `${target}.tmp`;
  const ordered = orderForOutput(result.value);
  fs.writeFileSync(tmp, `${JSON.stringify(ordered, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, target);
}

export interface InitWorkflowStateArgs {
  projectId: string;
  tierTopology: TierTopology;
}

/**
 * Construct (but do not write) a fresh scaffold-complete state record.
 * Callers that own the scaffold flow are responsible for invoking
 * `writeWorkflowState` after `createProject` succeeds.
 */
export function initWorkflowState(
  args: InitWorkflowStateArgs,
): ScmWorkflowState {
  return {
    $schema: "./scm-workflow-state.schema.json",
    version: 1,
    state: "scaffold-complete",
    tier_topology: args.tierTopology,
    project_id: args.projectId,
  };
}

export interface ValidationError {
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; value: ScmWorkflowState }
  | { ok: false; errors: ValidationError[] };

/**
 * Hand-rolled validator. Mirrors `scm-workflow-state.schema.json` so
 * that file can be used for editor tooling (VSCode JSON schema
 * integration, `lakebase-scm-state` CLI documentation) while the
 * runtime check has zero dependencies.
 */
export function validateWorkflowState(value: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      ok: false,
      errors: [{ path: "$", message: "must be an object" }],
    };
  }
  const v = value as Record<string, unknown>;

  if (v.version !== 1) {
    errors.push({ path: "version", message: `must be 1, got ${String(v.version)}` });
  }
  if (typeof v.state !== "string" || !SCM_STATES.includes(v.state as ScmState)) {
    errors.push({
      path: "state",
      message: `must be one of ${SCM_STATES.join(" | ")}`,
    });
  }
  if (v.tier_topology !== 1 && v.tier_topology !== 2 && v.tier_topology !== 3) {
    errors.push({
      path: "tier_topology",
      message: "must be 1, 2, or 3",
    });
  }
  if (typeof v.project_id !== "string" || v.project_id.length === 0) {
    errors.push({
      path: "project_id",
      message: "must be a non-empty string",
    });
  }

  const stringFields: Array<keyof ScmWorkflowState> = [
    "feature_id",
    "branch",
    "parent_branch",
    "lakebase_branch_uid",
    "claimed_at",
    "pr_url",
    "pushed_at",
    "ci_run_url",
    "ci_green_at",
    "merged_at",
    "$schema",
  ];
  for (const key of stringFields) {
    if (v[key] === undefined) continue;
    if (typeof v[key] !== "string" || (v[key] as string).length === 0) {
      errors.push({
        path: key,
        message: "must be a non-empty string when present",
      });
    }
  }

  const requiredForState: Record<ScmState, Array<keyof ScmWorkflowState>> = {
    "scaffold-complete": [],
    "feature-claimed": [
      "feature_id",
      "branch",
      "parent_branch",
      "lakebase_branch_uid",
      "claimed_at",
    ],
    "pr-ready": [
      "feature_id",
      "branch",
      "parent_branch",
      "lakebase_branch_uid",
      "claimed_at",
      "pr_url",
      "pushed_at",
    ],
    "ci-green": [
      "feature_id",
      "branch",
      "parent_branch",
      "lakebase_branch_uid",
      "claimed_at",
      "pr_url",
      "pushed_at",
      "ci_run_url",
      "ci_green_at",
    ],
    merged: [
      "feature_id",
      "branch",
      "parent_branch",
      "lakebase_branch_uid",
      "claimed_at",
      "pr_url",
      "pushed_at",
      "ci_run_url",
      "ci_green_at",
      "merged_at",
    ],
  };
  if (typeof v.state === "string" && SCM_STATES.includes(v.state as ScmState)) {
    for (const key of requiredForState[v.state as ScmState]) {
      if (v[key] === undefined) {
        errors.push({
          path: key,
          message: `required when state is "${v.state}"`,
        });
      }
    }
  }

  const allowedKeys = new Set<string>([
    "$schema",
    "version",
    "state",
    "tier_topology",
    "project_id",
    "feature_id",
    "branch",
    "parent_branch",
    "lakebase_branch_uid",
    "claimed_at",
    "pr_url",
    "pushed_at",
    "ci_run_url",
    "ci_green_at",
    "merged_at",
  ]);
  for (const key of Object.keys(v)) {
    if (!allowedKeys.has(key)) {
      errors.push({ path: key, message: "unknown property" });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: v as unknown as ScmWorkflowState };
}

export interface GateInvariant {
  key: string;
  present: boolean;
  value?: string;
}

export interface GateStatus {
  /** State this gate represents. */
  name: ScmState;
  /** True if the workflow has already entered or passed this state. */
  passed: boolean;
  /** True if this state is the current one. */
  current: boolean;
  /** Invariants this state demands plus their current presence. */
  invariants: GateInvariant[];
}

/**
 * Compute, for each SCM state, whether it has been reached and which
 * invariants the schema demands are populated. The inspect CLI uses
 * this to render the gate ladder.
 */
export function describeGates(state: ScmWorkflowState): GateStatus[] {
  const currentIdx = STATE_INDEX[state.state];
  return SCM_STATES.map((name) => {
    const idx = STATE_INDEX[name];
    return {
      name,
      passed: idx <= currentIdx,
      current: name === state.state,
      invariants: invariantsForState(state, name),
    };
  });
}

function invariantsForState(
  state: ScmWorkflowState,
  forState: ScmState,
): GateInvariant[] {
  const inv: GateInvariant[] = [];
  const addIf = (
    cond: boolean,
    key: keyof ScmWorkflowState,
  ): void => {
    if (!cond) return;
    const raw = state[key];
    inv.push({
      key: String(key),
      present: raw !== undefined,
      value: typeof raw === "string" ? raw : undefined,
    });
  };
  if (forState === "scaffold-complete") {
    addIf(true, "project_id");
    addIf(true, "tier_topology");
  }
  if (forState === "feature-claimed") {
    addIf(true, "feature_id");
    addIf(true, "branch");
    addIf(true, "parent_branch");
    addIf(true, "lakebase_branch_uid");
    addIf(true, "claimed_at");
  }
  if (forState === "pr-ready") {
    addIf(true, "pr_url");
    addIf(true, "pushed_at");
  }
  if (forState === "ci-green") {
    addIf(true, "ci_run_url");
    addIf(true, "ci_green_at");
  }
  if (forState === "merged") {
    addIf(true, "merged_at");
  }
  return inv;
}

/**
 * Return a copy of `state` with keys in a stable, human-readable order
 * for output. The validator is order-insensitive; ordering matters only
 * for the on-disk file so diffs stay readable.
 */
function orderForOutput(state: ScmWorkflowState): ScmWorkflowState {
  const keyOrder: Array<keyof ScmWorkflowState> = [
    "$schema",
    "version",
    "state",
    "tier_topology",
    "project_id",
    "feature_id",
    "branch",
    "parent_branch",
    "lakebase_branch_uid",
    "claimed_at",
    "pr_url",
    "pushed_at",
    "ci_run_url",
    "ci_green_at",
    "merged_at",
  ];
  const out: Partial<ScmWorkflowState> = {};
  for (const k of keyOrder) {
    if (state[k] !== undefined) {
      (out as Record<string, unknown>)[k] = state[k];
    }
  }
  return out as ScmWorkflowState;
}
