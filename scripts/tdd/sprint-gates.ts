// Sprint-scoped HITL gate state (FEIP-7461).
//
// The sprint PLAN gate is the only sprint-level gate: it locks the sprint
// backlog (the Spec Author's feature-proposals.md) before the per-feature work
// begins, the HITL checkpoint between planning and execution. It mirrors the
// per-feature gate model (the GateRecord shape + artifact hashing + conformance
// teeth from gates.ts / the deploy gate), but at sprint scope:
//   .tdd/sprints/<sprint>/gates.json
//
// Kept as a thin sprint-scoped variant (its own read/write/approve) rather than
// generalizing readGates/writeGates to a feature|sprint scope: smallest change,
// same teeth pattern, no blast radius on the per-feature gate substrate.

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { GateRecord } from "./gates.js";
import { hashArtifact } from "./gate-hash.js";
import { checkArtifactConformance } from "./artifact-conformance.js";

export const SPRINT_GATES_SCHEMA_VERSION = 1;

/** The sprint backlog artifact the plan gate locks (the Spec Author's proposal). */
export const PLAN_GATE_ARTIFACT = "feature-proposals.md";

export interface SprintGatesState {
  sprint: string;
  schema_version: number;
  gates: { plan: GateRecord };
}

export interface SprintGatesIoOpts {
  /** Path to the .tdd/ root. Default: "./.tdd". */
  tddDir?: string;
}

export function defaultSprintGatesState(sprint: string): SprintGatesState {
  return {
    sprint,
    schema_version: SPRINT_GATES_SCHEMA_VERSION,
    gates: { plan: { status: "open", history: [] } },
  };
}

export function sprintDir(tddDir: string, sprint: string): string {
  return join(tddDir, "sprints", sprint);
}

/**
 * Where the Spec Author's sprint proposal (feature-proposals.md) lives. Disk is
 * the truth: prefer the sprint-scoped path (the design intent), but fall back to
 * the role's documented `.tdd/planning/feature-proposals.md` when that is where
 * it actually wrote (relying on the sprint-scoped path alone left planning
 * unable to see a proposal that existed, stalling the driver on `propose`).
 */
export function sprintProposalPath(tddDir: string, sprint: string): string {
  const scoped = join(sprintDir(tddDir, sprint), PLAN_GATE_ARTIFACT);
  if (existsSync(scoped)) return scoped;
  const planning = join(tddDir, "planning", PLAN_GATE_ARTIFACT);
  return existsSync(planning) ? planning : scoped;
}

function sprintGatesFile(tddDir: string, sprint: string): string {
  return join(sprintDir(tddDir, sprint), "gates.json");
}

/**
 * Read a sprint's gate state. Returns the default (plan gate open) when no
 * gates.json exists yet. Does not create the file; read is non-mutating.
 */
export function readSprintGates(sprint: string, opts: SprintGatesIoOpts = {}): SprintGatesState {
  const tddDir = opts.tddDir ?? "./.tdd";
  const file = sprintGatesFile(tddDir, sprint);
  if (!existsSync(file)) return defaultSprintGatesState(sprint);
  let parsed: { gates?: { plan?: GateRecord }; schema_version?: number };
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`sprint gates.json at ${file} is not valid JSON: ${cause}`);
  }
  const plan = parsed.gates?.plan ?? { status: "open", history: [] };
  return {
    sprint,
    schema_version: parsed.schema_version ?? SPRINT_GATES_SCHEMA_VERSION,
    gates: { plan: { status: plan.status, approver: plan.approver, approved_at: plan.approved_at, artifact_hashes: plan.artifact_hashes, history: plan.history ?? [] } },
  };
}

/** Write a sprint's gate state, atomic via temp-file + rename. */
export function writeSprintGates(state: SprintGatesState, opts: SprintGatesIoOpts = {}): void {
  const tddDir = opts.tddDir ?? "./.tdd";
  const dir = sprintDir(tddDir, state.sprint);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "gates.json");
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
  try {
    renameSync(tmp, file);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      /* best-effort cleanup */
    }
    throw err;
  }
}

export interface ApproveSprintPlanArgs {
  sprint: string;
  approver: string;
  /** HITL enforcement: the gate only closes on an explicit human (or proxy) yes. */
  hitlApproved: boolean;
  tddDir?: string;
  now?: () => Date;
}

export type ApproveSprintPlanResult =
  | { ok: true; state: SprintGatesState; alreadyApproved: boolean }
  | { ok: false; reason: string };

/**
 * Approve the sprint plan gate as the HITL reviewer. Teeth (mirrors the deploy
 * gate): refuses unless feature-proposals.md EXISTS and CONFORMS, so the human
 * cannot sign off a sprint plan that was never produced. Idempotent: an
 * already-approved gate returns ok with alreadyApproved=true.
 */
export function approveSprintPlanGate(args: ApproveSprintPlanArgs): ApproveSprintPlanResult {
  if (!args.hitlApproved) return { ok: false, reason: "hitlApproved must be true (the plan gate is HITL)" };
  if (args.approver.length === 0) return { ok: false, reason: "approver must not be empty" };

  const tddDir = args.tddDir ?? "./.tdd";
  const file = sprintProposalPath(tddDir, args.sprint);
  if (!existsSync(file)) {
    return { ok: false, reason: `${PLAN_GATE_ARTIFACT} not found (no sprint plan to review)` };
  }
  const content = readFileSync(file, "utf8");
  const conf = checkArtifactConformance(PLAN_GATE_ARTIFACT, content);
  if (!conf.ok) {
    return { ok: false, reason: `${PLAN_GATE_ARTIFACT} not conformant: ${(conf.violations ?? []).join("; ")}` };
  }

  const state = readSprintGates(args.sprint, { tddDir });
  if (state.gates.plan.status !== "open") {
    return { ok: true, state, alreadyApproved: true };
  }
  const ts = (args.now ?? (() => new Date()))().toISOString();
  const hashes = { [PLAN_GATE_ARTIFACT]: hashArtifact(content) };
  const updated: SprintGatesState = {
    ...state,
    gates: {
      plan: {
        status: "approved",
        approver: args.approver,
        approved_at: ts,
        artifact_hashes: hashes,
        history: [
          ...state.gates.plan.history,
          { action: "approved", at: ts, approver: args.approver, artifact_hashes: hashes },
        ],
      },
    },
  };
  writeSprintGates(updated, { tddDir });
  return { ok: true, state: updated, alreadyApproved: false };
}
