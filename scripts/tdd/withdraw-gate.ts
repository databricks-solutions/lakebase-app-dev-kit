// withdrawGate primitive: retract an approved gate + cascade to downstream
// gates per ADR-0004's open question #3 (strict cascade).
//
// Tracker: FEIP-7357 (G5 / FEIP-7362).
//
// Cascade rules (named gates, not numbered):
//   spec      withdraw -> plan + test_list also withdraw (if currently approved)
//   plan      withdraw -> test_list also withdraws  (if currently approved)
//   test_list withdraw -> leaf
//   promote   withdraw -> leaf (independent gate)
//
// Cascaded gates record `withdrawal_reason: "cascade:<source-gate>"` so the
// audit trail captures WHY a gate was withdrawn even when the user did not
// explicitly retract it.
//
// Idempotent: withdrawing an already-withdrawn, open, or superseded gate is
// a no-op (returns the unchanged state without throwing). Approveing back
// is a separate operation (callers re-issue approveGate after the gate
// returns to "open" via... TBD; for now, withdrawn is terminal until the
// schema_version bump).

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  readGates,
  writeGates,
  type GateHistoryEntry,
  type GateName,
  type GateRecord,
  type GatesState,
} from "./gates";

/**
 * For each gate, the downstream gates that are auto-withdrawn when this
 * gate is explicitly withdrawn. Order in the array preserves the natural
 * upstream-to-downstream traversal used in history entries + selection log.
 */
const CASCADE_TARGETS: Record<GateName, GateName[]> = {
  spec: ["plan", "test_list"],
  plan: ["test_list"],
  test_list: [],
  promote: [],
};

export interface WithdrawGateArgs {
  featureId: string;
  gate: GateName;
  approver: string;
  reason: string;
  tddDir?: string;
  /** Test seam: deterministic clock. */
  now?: () => Date;
  /** Append a narrative entry to selection-log.md. Default: true. */
  writeSelectionLog?: boolean;
}

export interface WithdrawGateResult {
  state: GatesState;
  /** Gates that transitioned to "withdrawn" on this call (source + cascades). */
  withdrawn_gates: GateName[];
  /** True when nothing changed (source gate was not approved). */
  noop: boolean;
}

export function withdrawGate(args: WithdrawGateArgs): WithdrawGateResult {
  if (args.approver.length === 0) {
    throw new Error("withdrawGate: approver must not be empty");
  }
  if (args.reason.length === 0) {
    throw new Error("withdrawGate: reason must not be empty");
  }

  const tddDir = args.tddDir ?? "./.tdd";
  const now = args.now ?? (() => new Date());
  const writeLog = args.writeSelectionLog ?? true;

  const state = readGates(args.featureId, { tddDir });
  const sourceRecord = state.gates[args.gate];

  // Idempotent no-op: source gate is not currently approved.
  if (sourceRecord.status !== "approved") {
    return { state, withdrawn_gates: [], noop: true };
  }

  const ts = now().toISOString();
  const withdrawn: GateName[] = [args.gate];
  const nextGates: Record<GateName, GateRecord> = { ...state.gates };

  nextGates[args.gate] = transitionToWithdrawn(
    sourceRecord,
    args.approver,
    ts,
    args.reason,
    null
  );

  for (const target of CASCADE_TARGETS[args.gate]) {
    const tgtRecord = state.gates[target];
    if (tgtRecord.status === "approved") {
      nextGates[target] = transitionToWithdrawn(
        tgtRecord,
        args.approver,
        ts,
        `cascade:${args.gate}`,
        args.gate
      );
      withdrawn.push(target);
    }
  }

  const updatedState: GatesState = { ...state, gates: nextGates };
  writeGates(updatedState, { tddDir });

  if (writeLog) {
    appendSelectionLog(tddDir, {
      ts,
      featureId: args.featureId,
      sourceGate: args.gate,
      approver: args.approver,
      reason: args.reason,
      cascadedGates: withdrawn.slice(1),
    });
  }

  return { state: updatedState, withdrawn_gates: withdrawn, noop: false };
}

function transitionToWithdrawn(
  prior: GateRecord,
  approver: string,
  ts: string,
  reason: string,
  cascadeFrom: GateName | null
): GateRecord {
  const historyEntry: GateHistoryEntry = cascadeFrom
    ? { action: "cascade-withdrawn", at: ts, approver, reason }
    : { action: "withdrawn", at: ts, approver, reason };
  return {
    status: "withdrawn",
    withdrawal_reason: reason,
    history: [...prior.history, historyEntry],
    // Preserve artifact_hashes + approver + approved_at from the prior
    // approval; auditors may want to see what was previously approved.
    approver: prior.approver,
    approved_at: prior.approved_at,
    artifact_hashes: prior.artifact_hashes,
  };
}

interface SelectionLogEntry {
  ts: string;
  featureId: string;
  sourceGate: GateName;
  approver: string;
  reason: string;
  cascadedGates: GateName[];
}

function appendSelectionLog(tddDir: string, entry: SelectionLogEntry): void {
  const logPath = join(tddDir, "selection-log.md");
  const cascadeLine =
    entry.cascadedGates.length > 0
      ? `- **Cascade:** ${entry.cascadedGates.join(", ")}`
      : `- **Cascade:** none`;
  const lines = [
    "",
    `## ${entry.ts} – Withdraw ${entry.sourceGate} for ${entry.featureId}`,
    `- **Withdrawn by:** ${entry.approver}`,
    `- **Reason:** ${entry.reason}`,
    cascadeLine,
    "",
  ];
  const text = lines.join("\n");
  if (existsSync(logPath)) {
    writeFileSync(logPath, readFileSync(logPath, "utf8") + text);
  } else {
    writeFileSync(logPath, text);
  }
}
