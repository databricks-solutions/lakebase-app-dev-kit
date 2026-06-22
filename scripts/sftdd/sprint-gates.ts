// Sprint-scoped HITL gate state.
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

import type { GateRecord } from "./gates.js";
import { hashArtifact } from "./gate-hash.js";
import { checkArtifactConformance } from "./artifact-conformance.js";
import { resolveTddDir, sprintDir, sprintGatesJson, featureProposalsMd } from "./sftdd-paths.js";

// sprintDir lives in sftdd-paths now (single source of truth); re-exported for
// the existing public API.
export { sprintDir } from "./sftdd-paths.js";

export const SPRINT_GATES_SCHEMA_VERSION = 1;

/** The sprint backlog artifact the plan gate locks (the Spec Author's proposal). */
export const PLAN_GATE_ARTIFACT = "feature-proposals.md";

export interface SprintGatesState {
  sprint: string;
  schema_version: number;
  gates: { plan: GateRecord };
}

export interface SprintGatesIoOpts {
  /** Path to the artifact root. Default: resolved (.sftdd, or legacy .tdd). */
  tddDir?: string;
}

export function defaultSprintGatesState(sprint: string): SprintGatesState {
  return {
    sprint,
    schema_version: SPRINT_GATES_SCHEMA_VERSION,
    gates: { plan: { status: "open", history: [] } },
  };
}

function sprintGatesFile(tddDir: string, sprint: string): string {
  return sprintGatesJson(tddDir, sprint);
}

/**
 * Read a sprint's gate state. Returns the default (plan gate open) when no
 * gates.json exists yet. Does not create the file; read is non-mutating.
 */
export function readSprintGates(sprint: string, opts: SprintGatesIoOpts = {}): SprintGatesState {
  const tddDir = opts.tddDir ?? resolveTddDir();
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
  const tddDir = opts.tddDir ?? resolveTddDir();
  mkdirSync(sprintDir(tddDir, state.sprint), { recursive: true });
  const file = sprintGatesJson(tddDir, state.sprint);
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

  const tddDir = args.tddDir ?? resolveTddDir();
  const file = featureProposalsMd(tddDir);
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
