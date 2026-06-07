// Human Proxy for automated smoke tests.
//
// The TDD workflow's gates (spec / plan / test_list / promote) are
// state-recorded in `.tdd/features/<F>/gates.json` and refuse to advance
// without a human approver. For end-to-end automated smoke runs we
// need a stand-in human that says "yes" to every open gate, with the
// right per-gate artifact inputs hashed into the gate record.
//
// This is the Human Proxy. It is NOT for production use, only for smoke
// harnesses and similar headless test contexts. The default approver
// identity is "human-proxy" so a real audit trail can grep it out
// of selection-log.md / gates.json history.
//
// Per-gate artifact convention (mirrors ADR-0004):
//   spec       -> feature-spec.json + feature-spec.md (both required, the Spec
//                 Author's structured draft spec)
//   plan       -> plan.json (required)
//   test_list  -> test-list.json and/or test-list.md (at least one required)
//   promote    -> a caller-supplied promote_ref string (required)
//
// INTEGRITY RULE (FEIP-7508 / the 002 gate-integrity finding): a gate is
// only approved when its REAL artifact exists on disk. Previously a missing
// artifact was hashed as a placeholder "MOCK_APPROVED" so the gate could
// "close" anyway. That let the Human Proxy pre-approve plan / test_list / promote
// before those artifacts were ever produced (all four gates default to
// "open"), binding nonexistent artifacts to a fabricated hash and nullifying
// the gate. The mock now SKIPS a gate whose artifacts are absent (recorded in
// `skipped[]` with a reason) instead of fabricating one. A real human approver
// can only sign off on what exists; the Human Proxy must mirror that.
//
// CONFORMANCE RULE (FEIP-7508 Layer 2): existence is necessary but not
// sufficient. Every resolved artifact is checked against its declared format
// via checkArtifactConformance (JSON against its schema; narrative MD against
// its role-documented required sections). A non-conformant artifact is treated
// like a missing one: the gate is SKIPPED with the violations as the reason,
// never approved. A real approver would not sign off a malformed spec; nor
// does the Human Proxy.
//
// Note (flagged, not enforced here): gate ORDERING (spec -> plan -> test_list
// -> promote) is intentionally NOT imposed by this mock, because the N=1
// /design path produces no plan.json, so a rigid chain would stall. Sequencing
// belongs in the orchestrator once the phase<->gate<->mode mapping is settled.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { approveGate } from "./approve-gate.js";
import { readGates, GATE_NAMES, type GateName, type GatesState } from "./gates.js";
import { checkArtifactConformance } from "./artifact-conformance.js";
import { emitAgentLogEvent } from "./agent-log.js";

/**
 * Emit the HITL reviewer's decision to the centralized agent log. The mock
 * approver stands in for the human reviewer, so its validate-then-approve (or
 * refuse) is itself a logged HITL interaction (role: product-owner, approver
 * identity in `data`). Best-effort: logging must never break gate approval.
 */
function logHitlDecision(
  tddDir: string,
  featureId: string,
  approver: string,
  decision:
    | { kind: "approved"; gate: GateName; artifacts: string[] }
    | { kind: "refused"; gate: GateName; reason: string },
): void {
  try {
    if (decision.kind === "approved") {
      emitAgentLogEvent(
        {
          role: "product-owner",
          level: "info",
          event: "gate.approved",
          message: `${approver} validated ${decision.gate} artifacts (${decision.artifacts.join(", ")}): expected elements present + conformant; approved`,
          feature_id: featureId,
          data: { gate: decision.gate, artifacts: decision.artifacts, approver, validated: true },
        },
        { tddDir },
      );
    } else {
      emitAgentLogEvent(
        {
          role: "product-owner",
          level: "warn",
          event: "gate.refused",
          message: `${approver} refused ${decision.gate}: ${decision.reason}`,
          feature_id: featureId,
          data: { gate: decision.gate, reason: decision.reason, approver, validated: false },
        },
        { tddDir },
      );
    }
  } catch {
    // Logging is observability, not a gate. Never let it break approval.
  }
}

export const HUMAN_PROXY = "human-proxy";

export interface HumanProxyArgs {
  featureId: string;
  tddDir?: string;
  /** Override the approver identity. Defaults to "human-proxy". */
  approver?: string;
  /** Limit to a single gate; default approves every open gate whose artifacts exist. */
  onlyGate?: GateName;
  /** For the promote gate, the ref to hash. When absent, the promote gate is skipped. */
  promoteRef?: string;
}

export interface HumanProxyResult {
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
      // feature-spec.json + feature-spec.md (both required). product-overview.md
      // (the Product Owner's project-level overview) is NOT part of the
      // per-feature spec gate and is deliberately not included here.
      const featureJson = readIfPresent("feature-spec.json");
      if (featureJson === undefined) {
        return { reason: "feature-spec.json not found (spec phase not complete)" };
      }
      const featureMd = readIfPresent("feature-spec.md");
      if (featureMd === undefined) {
        return { reason: "feature-spec.md not found (structured draft spec incomplete)" };
      }
      const inputs: Record<string, string> = {
        "feature-spec.json": featureJson,
        "feature-spec.md": featureMd,
      };
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
    case "deploy": {
      // The deploy (working-software) gate locks the Release Engineer's
      // deploy-evidence.json. Teeth (FEIP-7461): refuse unless the increment was
      // actually reachable AND its feature-verify passed against the running
      // app, not merely that the evidence file exists + conforms.
      const evidence = readIfPresent("deploy-evidence.json");
      if (evidence === undefined) {
        return { reason: "deploy-evidence.json not found (feature not deployed + verified)" };
      }
      let parsed: { reachable?: unknown; verify?: { passed?: unknown } };
      try {
        parsed = JSON.parse(evidence) as typeof parsed;
      } catch {
        return { reason: "deploy-evidence.json is not valid JSON" };
      }
      if (parsed.reachable !== true) {
        return { reason: "deploy-evidence records reachable=false (app not reachable on the target)" };
      }
      if (parsed.verify?.passed !== true) {
        return { reason: "deploy-evidence records verify.passed=false (feature-verify did not pass against the running app)" };
      }
      return withConformance({ "deploy-evidence.json": evidence });
    }
  }
}

export function drainGatesAsHumanProxy(args: HumanProxyArgs): HumanProxyResult {
  const tddDir = args.tddDir ?? "./.tdd";
  const approver = args.approver ?? HUMAN_PROXY;
  const fdir = featureDir(tddDir, args.featureId);

  let state = readGates(args.featureId, { tddDir });
  const approved: GateName[] = [];
  const skipped: HumanProxyResult["skipped"] = [];

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
      // The HITL reviewer refused: the artifact was missing or did not carry
      // its expected elements. Record that interaction.
      logHitlDecision(tddDir, args.featureId, approver, {
        kind: "refused",
        gate,
        reason: resolved.reason,
      });
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
    // The HITL reviewer validated the expected elements + approved. Record it.
    logHitlDecision(tddDir, args.featureId, approver, {
      kind: "approved",
      gate,
      artifacts: Object.keys(resolved.inputs),
    });
  }

  return { approved, skipped, finalState: state };
}

// ─── stage-aware intake supply ──────────────────────────────────────────────
//
// The Human Proxy stands in for the human at every orchestrated touchpoint, not
// only gates. At an INTAKE step (the orchestrator needs an artifact the human
// would have authored, e.g. product-overview.md / nfrs.md / design-brief.md /
// feature-request.md), the proxy SUPPLIES the pre-recorded artifact: it
// validates the recorded content conforms to the artifact's declared format,
// places it at the target path, and logs the interaction. A missing or
// non-conformant recording is REFUSED (hard-block), the same as a human who
// cannot hand over an artifact that does not meet its format.

export interface SupplyArgs {
  /** Recorded source file the human authored ahead of time. */
  from: string;
  /** Target path the orchestrator wants the artifact at (under .tdd/). */
  to: string;
  /** Canonical artifact name for conformance keying. Defaults to basename(to). */
  artifact?: string;
  /** .tdd/ root, for logging. */
  tddDir?: string;
  /** Feature id, for logging (intake artifacts may be project- or feature-level). */
  featureId?: string;
  /** Proxy identity. Defaults to "human-proxy". */
  approver?: string;
}

export interface SupplyResult {
  ok: boolean;
  artifact: string;
  to: string;
  /** Present when ok === false. */
  reason?: string;
}

export function supplyArtifact(args: SupplyArgs): SupplyResult {
  const approver = args.approver ?? HUMAN_PROXY;
  const artifact = args.artifact ?? basename(args.to);
  const tddDir = args.tddDir ?? "./.tdd";

  const refuse = (reason: string): SupplyResult => {
    try {
      emitAgentLogEvent(
        {
          role: "product-owner",
          level: "warn",
          event: "intake.refused",
          message: `${approver} could not supply ${artifact}: ${reason}`,
          feature_id: args.featureId,
          data: { artifact, to: args.to, reason, approver, validated: false },
        },
        { tddDir },
      );
    } catch {
      /* logging is observability, never a gate */
    }
    return { ok: false, artifact, to: args.to, reason };
  };

  if (!existsSync(args.from)) {
    return refuse(`recorded source not found: ${args.from}`);
  }
  const content = readFileSync(args.from, "utf8");
  const conformance = checkArtifactConformance(artifact, content);
  if (!conformance.ok) {
    return refuse(`format conformance failed: ${conformance.violations.join("; ")}`);
  }

  mkdirSync(dirname(args.to), { recursive: true });
  writeFileSync(args.to, content);

  try {
    emitAgentLogEvent(
      {
        role: "product-owner",
        level: "info",
        event: "intake.supplied",
        message: `${approver} supplied ${artifact} (recorded HIL answer, format-conformant) -> ${args.to}`,
        feature_id: args.featureId,
        data: { artifact, from: args.from, to: args.to, approver, validated: true },
      },
      { tddDir },
    );
  } catch {
    /* logging is observability, never a gate */
  }
  return { ok: true, artifact, to: args.to };
}
