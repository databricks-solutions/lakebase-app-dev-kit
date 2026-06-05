// Mock HITL approver for automated smoke tests.
//
// The TDD workflow's gates (spec / plan / test_list / promote) are
// state-recorded in `.tdd/features/<F>/gates.json` and refuse to advance
// without a human approver. For end-to-end automated smoke runs we
// need a stand-in human that says "yes" to every open gate, with the
// right per-gate artifact inputs hashed into the gate record.
//
// This is the mock. It is NOT for production use, only for smoke
// harnesses and similar headless test contexts. The default approver
// identity is "ci-mock-approver" so a real audit trail can grep it out
// of selection-log.md / gates.json history.
//
// Per-gate artifact convention (mirrors ADR-0004):
//   spec       -> feature.json + feature.md (both required, the Spec Author's
//                 structured draft spec); spec.md (PO intent) included if present
//   plan       -> plan.json (required)
//   test_list  -> test-list.json and/or test-list.md (at least one required)
//   promote    -> a caller-supplied promote_ref string (required)
//
// INTEGRITY RULE (FEIP-7508 / the 002 gate-integrity finding): a gate is
// only approved when its REAL artifact exists on disk. Previously a missing
// artifact was hashed as a placeholder "MOCK_APPROVED" so the gate could
// "close" anyway. That let the mock pre-approve plan / test_list / promote
// before those artifacts were ever produced (all four gates default to
// "open"), binding nonexistent artifacts to a fabricated hash and nullifying
// the gate. The mock now SKIPS a gate whose artifacts are absent (recorded in
// `skipped[]` with a reason) instead of fabricating one. A real human approver
// can only sign off on what exists; the mock must mirror that.
//
// CONFORMANCE RULE (FEIP-7508 Layer 2): existence is necessary but not
// sufficient. Every resolved artifact is checked against its declared format
// via checkArtifactConformance (JSON against its schema; narrative MD against
// its role-documented required sections). A non-conformant artifact is treated
// like a missing one: the gate is SKIPPED with the violations as the reason,
// never approved. A real approver would not sign off a malformed spec; nor
// does the mock.
//
// Note (flagged, not enforced here): gate ORDERING (spec -> plan -> test_list
// -> promote) is intentionally NOT imposed by this mock, because the N=1
// /design path produces no plan.json, so a rigid chain would stall. Sequencing
// belongs in the orchestrator once the phase<->gate<->mode mapping is settled.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { approveGate } from "./approve-gate.js";
import { readGates, GATE_NAMES, type GateName, type GatesState } from "./gates.js";
import { checkArtifactConformance } from "./artifact-conformance.js";

export const MOCK_APPROVER = "ci-mock-approver";

export interface MockApproveArgs {
  featureId: string;
  tddDir?: string;
  /** Override the approver identity. Defaults to "ci-mock-approver". */
  approver?: string;
  /** Limit to a single gate; default approves every open gate whose artifacts exist. */
  onlyGate?: GateName;
  /** For the promote gate, the ref to hash. When absent, the promote gate is skipped. */
  promoteRef?: string;
}

export interface MockApproveResult {
  approved: GateName[];
  skipped: Array<{ gate: GateName; reason: string }>;
  finalState: GatesState;
}

function featureDir(tddDir: string, featureId: string): string {
  return join(tddDir, "features", featureId);
}

/**
 * Aggregate conformance check over a set of resolved inputs. Returns a reason
 * string listing every violation when any artifact fails its declared format,
 * or null when all conform. Layer 2 of the gate: existence (Layer 1) is
 * checked by the callers below; this enforces "does what exists conform?".
 */
function conformanceReason(inputs: Record<string, string>): string | null {
  const problems: string[] = [];
  for (const [name, content] of Object.entries(inputs)) {
    const result = checkArtifactConformance(name, content);
    if (!result.ok) problems.push(...result.violations);
  }
  return problems.length === 0 ? null : `format conformance failed: ${problems.join("; ")}`;
}

/**
 * Resolve the artifact inputs for a gate from files that ACTUALLY exist AND
 * conform to their declared format. Returns a `reason` (so the caller skips
 * rather than fabricates) when a required artifact is absent or any present
 * artifact is non-conformant. Never substitutes placeholder content.
 */
function resolveArtifactInputs(
  gate: GateName,
  fdir: string,
  promoteRef: string | undefined,
): { inputs: Record<string, string> } | { reason: string } {
  const readIfPresent = (name: string): string | undefined => {
    const p = join(fdir, name);
    try {
      return existsSync(p) ? readFileSync(p, "utf8") : undefined;
    } catch {
      return undefined;
    }
  };

  const withConformance = (
    inputs: Record<string, string>,
  ): { inputs: Record<string, string> } | { reason: string } => {
    const reason = conformanceReason(inputs);
    return reason === null ? { inputs } : { reason };
  };

  switch (gate) {
    case "spec": {
      // The spec gate locks the Spec Author's structured draft spec:
      // feature.json + feature.md (both required). spec.md (PO intent) is the
      // living, un-gated source, included only when present.
      const featureJson = readIfPresent("feature.json");
      if (featureJson === undefined) {
        return { reason: "feature.json not found (spec phase not complete)" };
      }
      const featureMd = readIfPresent("feature.md");
      if (featureMd === undefined) {
        return { reason: "feature.md not found (structured draft spec incomplete)" };
      }
      const inputs: Record<string, string> = {
        "feature.json": featureJson,
        "feature.md": featureMd,
      };
      const specMd = readIfPresent("spec.md");
      if (specMd !== undefined) inputs["spec.md"] = specMd;
      return withConformance(inputs);
    }
    case "plan": {
      const planJson = readIfPresent("plan.json");
      if (planJson === undefined) {
        return { reason: "plan.json not found (plan phase not produced)" };
      }
      return withConformance({ "plan.json": planJson });
    }
    case "test_list": {
      const tlJson = readIfPresent("test-list.json");
      const tlMd = readIfPresent("test-list.md");
      if (tlJson === undefined && tlMd === undefined) {
        return { reason: "test-list.json/md not found (test-strategist phase not complete)" };
      }
      const inputs: Record<string, string> = {};
      if (tlJson !== undefined) inputs["test-list.json"] = tlJson;
      if (tlMd !== undefined) inputs["test-list.md"] = tlMd;
      return withConformance(inputs);
    }
    case "promote": {
      if (promoteRef === undefined || promoteRef.length === 0) {
        return { reason: "no promote_ref supplied (nothing to promote)" };
      }
      // promote_ref has no declared format; conformance is a no-op for it.
      return withConformance({ promote_ref: promoteRef });
    }
  }
}

export function mockApproveOpenGates(args: MockApproveArgs): MockApproveResult {
  const tddDir = args.tddDir ?? "./.tdd";
  const approver = args.approver ?? MOCK_APPROVER;
  const fdir = featureDir(tddDir, args.featureId);

  let state = readGates(args.featureId, { tddDir });
  const approved: GateName[] = [];
  const skipped: MockApproveResult["skipped"] = [];

  const gates: GateName[] =
    args.onlyGate !== undefined ? [args.onlyGate] : [...GATE_NAMES];

  for (const gate of gates) {
    const record = state.gates[gate];
    if (record.status !== "open") {
      skipped.push({ gate, reason: `status=${record.status}` });
      continue;
    }
    const resolved = resolveArtifactInputs(gate, fdir, args.promoteRef);
    if ("reason" in resolved) {
      skipped.push({ gate, reason: resolved.reason });
      continue;
    }
    const result = approveGate({
      featureId: args.featureId,
      gate,
      approver,
      hitlApproved: true,
      artifactInputs: resolved.inputs,
      tddDir,
    });
    approved.push(gate);
    state = result.state;
  }

  return { approved, skipped, finalState: state };
}
