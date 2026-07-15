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
// INTEGRITY RULE (the 002 gate-integrity finding): a gate is
// only approved when its REAL artifact exists on disk. Previously a missing
// artifact was hashed as a placeholder "MOCK_APPROVED" so the gate could
// "close" anyway. That let the Human Proxy pre-approve plan / test_list / promote
// before those artifacts were ever produced (all four gates default to
// "open"), binding nonexistent artifacts to a fabricated hash and nullifying
// the gate. The mock now SKIPS a gate whose artifacts are absent (recorded in
// `skipped[]` with a reason) instead of fabricating one. A real human approver
// can only sign off on what exists; the Human Proxy must mirror that.
//
// CONFORMANCE RULE (Layer 2): existence is necessary but not
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

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { sftddEnv } from "./sftdd-env.js";
import { join, dirname, basename } from "node:path";
import { approveGate } from "./approve-gate.js";
import { readGates, GATE_NAMES, type GateName, type GatesState } from "./gates.js";
import { checkArtifactConformance, canonicalArtifactName } from "./artifact-conformance.js";
import { emitAgentLogEvent } from "./agent-log.js";
import { featureRequestMd, resolveSftddDir, writeRequested, featureProposalsMd, planningDir } from "./sftdd-paths.js";
// The gate CONDITION (what makes a gate advanceable) is a state-machine property,
// not a proxy decision; it lives in the guard and is enforced on the advance path.
import { resolveArtifactInputs, featureDir } from "./gate-conformance-guard.js";

/**
 * Emit the HITL reviewer's decision to the centralized agent log. The mock
 * approver stands in for the human reviewer, so its validate-then-approve (or
 * refuse) is itself a logged HITL interaction (role: product-owner, approver
 * identity in `data`). Best-effort: logging must never break gate approval.
 */
function logHitlDecision(
  sftddDir: string,
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
          feature_id: featureId,
          slots: { gate: decision.gate, artifacts: decision.artifacts, approver, validated: true },
        },
        { sftddDir },
      );
    } else {
      emitAgentLogEvent(
        {
          role: "product-owner",
          level: "warn",
          event: "gate.rejected",
          feature_id: featureId,
          slots: { gate: decision.gate, reason: decision.reason, approver, validated: false },
        },
        { sftddDir },
      );
    }
  } catch {
    // Logging is observability, not a gate. Never let it break approval.
  }
}

export const HUMAN_PROXY = "human-proxy";

export interface HumanProxyArgs {
  featureId: string;
  sftddDir?: string;
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


export function drainGatesAsHumanProxy(args: HumanProxyArgs): HumanProxyResult {
  const sftddDir = args.sftddDir ?? resolveSftddDir();
  const approver = args.approver ?? HUMAN_PROXY;
  const fdir = featureDir(sftddDir, args.featureId);

  let state = readGates(args.featureId, { sftddDir });
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
    const resolved = resolveArtifactInputs(gate, fdir, args.promoteRef, sftddDir, args.featureId);
    if ("reason" in resolved) {
      skipped.push({ gate, reason: resolved.reason });
      // The HITL reviewer refused: the artifact was missing or did not carry
      // its expected elements. Record that interaction.
      logHitlDecision(sftddDir, args.featureId, approver, {
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
      sftddDir,
    });
    approved.push(gate);
    state = result.state;
    // The HITL reviewer validated the expected elements + approved. Record it.
    logHitlDecision(sftddDir, args.featureId, approver, {
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
  sftddDir?: string;
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
  const sftddDir = args.sftddDir ?? resolveSftddDir();

  const refuse = (reason: string): SupplyResult => {
    try {
      emitAgentLogEvent(
        {
          role: "product-owner",
          level: "warn",
          event: "intake.refused",
          feature_id: args.featureId,
          slots: { artifact, to: args.to, reason, approver, validated: false },
        },
        { sftddDir },
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
        feature_id: args.featureId,
        slots: { artifact, from: args.from, to: args.to, approver, validated: true },
      },
      { sftddDir },
    );
  } catch {
    /* logging is observability, never a gate */
  }
  return { ok: true, artifact, to: args.to };
}

// ─── author-requests supply (the PO artifacts, given when the state machine asks) ─
//
// At the planning `author-requests` step the state machine needs the Product
// Owner's feature-request.md per committed feature. The machine is identical
// for a human and the proxy: interactive, the driver stops here and the HUMAN
// provides the requests (directly, or by working with the PO agent); headless,
// the Human Proxy provides the pre-recorded answers WHEN ASKED (not before) and
// logs each, then sync-backlog projects the backlog from what was supplied.
//
// The committed set + each request's recorded source are the orchestrator's
// call, passed in via LAKEBASE_SFTDD_SPRINT_REQUESTS as one `<feature_id>\t<source
// path>` per line (the recorded file is named independently of the feature id,
// e.g. v1-initial-domain.md -> F1-initial-domain). Unset => no-op (the live
// human provides them out-of-band); the driver still advances once they exist.

export interface SupplyRequestsArgs {
  sftddDir?: string;
  approver?: string;
  /** Override the recorded pairs; defaults to $LAKEBASE_SFTDD_SPRINT_REQUESTS. */
  pairs?: Array<{ featureId: string; from: string }>;
  /** The sprint these requests belong to. When set, the supplied feature ids are
   *  recorded to sprints/<sprint>/requested.json so syncBacklog scopes THIS
   *  sprint's backlog to them (a multi-sprint run must not pull an earlier
   *  sprint's already-built features into a later sprint). */
  sprint?: string;
}

export interface SupplyRequestsResult {
  supplied: string[];
  skipped: Array<{ featureId: string; reason: string }>;
}

/** Parse the `<feature_id>\t<source>` lines from $LAKEBASE_SFTDD_SPRINT_REQUESTS. */
function recordedRequestPairs(): Array<{ featureId: string; from: string }> {
  const raw = sftddEnv("SPRINT_REQUESTS") ?? "";
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const [featureId, ...rest] = line.split("\t");
      const from = rest.join("\t").trim();
      return featureId && from ? [{ featureId: featureId.trim(), from }] : [];
    });
}

/**
 * Supply the sprint's recorded feature-request.md files when the state machine
 * asks (the headless stand-in for the PO authoring them). Each is validate-then-
 * placed at features/<id>/feature-request.md via supplyArtifact, which logs the
 * interaction. Returns what was supplied + skipped.
 */
export function supplyRequests(args: SupplyRequestsArgs = {}): SupplyRequestsResult {
  const sftddDir = args.sftddDir ?? resolveSftddDir();
  const pairs = args.pairs ?? recordedRequestPairs();
  const supplied: string[] = [];
  const skipped: SupplyRequestsResult["skipped"] = [];
  for (const { featureId, from } of pairs) {
    const res = supplyArtifact({
      from,
      to: featureRequestMd(sftddDir, featureId),
      artifact: "feature-request.md",
      sftddDir,
      featureId,
      approver: args.approver,
    });
    if (res.ok) supplied.push(featureId);
    else skipped.push({ featureId, reason: res.reason ?? "unknown" });
  }
  // Record this sprint's requested feature ids so syncBacklog scopes the backlog
  // to them, through the shared writeRequested (merges, so a resume that
  // re-supplies never shrinks the set). Only when a sprint is named
  // (single-sprint/legacy leaves it unscoped for back-compat).
  if (args.sprint && supplied.length > 0) {
    writeRequested(sftddDir, args.sprint, supplied);
  }
  return { supplied, skipped };
}

export interface SupplyProposalsResult {
  written: boolean;
  count: number;
  reason?: string;
}

/** The one-line ask (first `# ` heading) + the first non-heading paragraph of a
 *  recorded feature-request.md, so a projected proposal reads like the real one. */
function summarizeRequest(from: string): { ask: string; rationale: string } {
  let text = "";
  try {
    text = readFileSync(from, "utf8");
  } catch {
    return { ask: "", rationale: "" };
  }
  const lines = text.split("\n");
  const heading = lines.find((l) => /^#\s+\S/.test(l.trim()));
  const ask = heading ? heading.replace(/^#\s+/, "").trim() : "";
  const para = lines.find((l) => l.trim() && !/^#/.test(l.trim()) && !/^[-*]\s/.test(l.trim()));
  return { ask, rationale: para?.trim() ?? "" };
}

/**
 * DETERMINISTIC propose (the capture/headless stand-in for the Spec Author's
 * live proposal turn): project feature-proposals.md from the sprint's recorded
 * feature-requests ($LAKEBASE_SFTDD_SPRINT_REQUESTS) instead of spawning an LLM
 * that may write nothing then claim the file exists (the propose protocol-violation
 * abort). One candidate section per recorded feature, with its one-line ask +
 * rationale lifted from the request. Unset env / no pairs => not written (the live
 * LLM propose still runs for interactive users). Output conforms as md-narrative.
 */
export function supplyProposals(
  args: { sftddDir?: string; pairs?: Array<{ featureId: string; from: string }>; uiTrack?: boolean } = {},
): SupplyProposalsResult {
  const sftddDir = args.sftddDir ?? resolveSftddDir();
  const pairs = args.pairs ?? recordedRequestPairs();
  if (pairs.length === 0) return { written: false, count: 0, reason: "no recorded feature-requests (LAKEBASE_SFTDD_SPRINT_REQUESTS unset/empty)" };
  const sections = pairs.map(({ featureId, from }) => {
    const { ask, rationale } = summarizeRequest(from);
    return (
      `## ${featureId}\n\n` +
      `**One-line ask:** ${ask || featureId}\n\n` +
      (rationale ? `**Rationale:** ${rationale}\n\n` : "") +
      `**E2E story:** ${args.uiTrack ? "Yes." : "As required."}\n`
    );
  });
  const body =
    `# Feature Proposals\n\n` +
    `Candidate features for this sprint, projected deterministically from the recorded ` +
    `feature-requests (the headless stand-in for the Spec Author's live proposal turn).\n\n` +
    sections.join("\n");
  mkdirSync(planningDir(sftddDir), { recursive: true });
  writeFileSync(featureProposalsMd(sftddDir), body);
  return { written: true, count: pairs.length };
}
