// Structured HITL gate state for the TDD workflow.
//
// On-disk: .tdd/features/<F>/gates.json
//
// gates.json is the substrate's authoritative gate state. selection-log.md
// stays as narrative-of-record (humans grep it when debugging). The
// orchestrator + downstream primitives (FEIP-7213 test-list immutability,
// FEIP-7215 feature-status) read this file instead of regex-scanning the log.
//
// Design: ADR-0004. Tracker: FEIP-7357. This module ships G1 only: types +
// readGates + writeGates. approveGate / verifyGateIntegrity / withdrawGate /
// hash-normalization / migration backfill / concurrent-write atomicity land
// in G2 through G7.

import { existsSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

export const GATES_SCHEMA_VERSION = 1;

export const GATE_NAMES = ["spec", "plan", "test_list", "promote"] as const;
export type GateName = (typeof GATE_NAMES)[number];

export const GATE_STATUSES = ["open", "approved", "superseded", "withdrawn"] as const;
export type GateStatus = (typeof GATE_STATUSES)[number];

export type GateHistoryAction =
  | "approved"
  | "withdrawn"
  | "superseded"
  | "cascade-withdrawn"
  | "migrated";

export interface GateHistoryEntry {
  action: GateHistoryAction;
  at: string;
  approver: string;
  artifact_hashes?: Record<string, string>;
  reason?: string;
  /** True when the history entry was synthesized by the selection-log backfill (G6). */
  migrated?: boolean;
}

export interface GateRecord {
  status: GateStatus;
  approver?: string;
  approved_at?: string;
  artifact_hashes?: Record<string, string>;
  withdrawal_reason?: string;
  history: GateHistoryEntry[];
}

export interface GatesState {
  feature_id: string;
  schema_version: number;
  gates: Record<GateName, GateRecord>;
}

export interface GatesIoOpts {
  /** Path to the .tdd/ root. Default: "./.tdd". */
  tddDir?: string;
}

export function defaultGatesState(featureId: string): GatesState {
  return {
    feature_id: featureId,
    schema_version: GATES_SCHEMA_VERSION,
    gates: {
      spec: { status: "open", history: [] },
      plan: { status: "open", history: [] },
      test_list: { status: "open", history: [] },
      promote: { status: "open", history: [] },
    },
  };
}

/**
 * Read gates state for a feature. Returns the default-open shape when no
 * gates.json exists yet (a fresh feature has all four gates open). Does NOT
 * create the file; read is non-mutating.
 *
 * Throws when the feature directory cannot be resolved, or when gates.json
 * exists but is malformed.
 */
export function readGates(featureId: string, opts: GatesIoOpts = {}): GatesState {
  const tddDir = opts.tddDir ?? "./.tdd";
  const file = gatesFilePath(tddDir, featureId);
  if (!existsSync(file)) {
    return defaultGatesState(featureId);
  }
  const raw = readFileSync(file, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`gates.json at ${file} is not valid JSON: ${cause}`);
  }
  return validateGatesState(parsed, file);
}

/**
 * Write gates state for a feature, atomic via temp-file + rename. If the
 * process is killed mid-call the on-disk gates.json is either the prior
 * content or the new content, never a partial write.
 *
 * Concurrent-write coordination (G7) is layered on top of this primitive;
 * the rename is atomic but two callers can still race the read-modify-write
 * cycle. Callers that need that guarantee should use approveGate (G3) or
 * an explicit lock helper once G7 lands.
 */
export function writeGates(state: GatesState, opts: GatesIoOpts = {}): void {
  if (state.feature_id.length === 0) {
    throw new Error("writeGates: state.feature_id must not be empty");
  }
  const tddDir = opts.tddDir ?? "./.tdd";
  const file = gatesFilePath(tddDir, state.feature_id);
  const tempFile = `${file}.tmp.${process.pid}.${Date.now()}`;
  const payload = JSON.stringify(state, null, 2) + "\n";
  writeFileSync(tempFile, payload, "utf8");
  try {
    renameSync(tempFile, file);
  } catch (err) {
    try {
      unlinkSync(tempFile);
    } catch {
      // Best-effort cleanup; surface the rename error.
    }
    throw err;
  }
}

function gatesFilePath(tddDir: string, featureId: string): string {
  return join(findFeatureDir(tddDir, featureId), "gates.json");
}

function findFeatureDir(tddDir: string, featureId: string): string {
  const featuresDir = join(tddDir, "features");
  if (!existsSync(featuresDir)) {
    throw new Error(`${featuresDir} does not exist`);
  }
  const candidates = readdirSync(featuresDir).filter((d) => d.startsWith(featureId));
  if (candidates.length === 0) {
    throw new Error(`feature ${featureId} not found under ${featuresDir}`);
  }
  return join(featuresDir, candidates[0]);
}

function validateGatesState(parsed: unknown, file: string): GatesState {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`gates.json at ${file} is not an object`);
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.feature_id !== "string" || obj.feature_id.length === 0) {
    throw new Error(`gates.json at ${file}: missing or invalid feature_id`);
  }
  if (typeof obj.schema_version !== "number") {
    throw new Error(`gates.json at ${file}: missing or invalid schema_version`);
  }
  if (typeof obj.gates !== "object" || obj.gates === null) {
    throw new Error(`gates.json at ${file}: missing or invalid gates`);
  }
  const gates = obj.gates as Record<string, unknown>;
  const out: Record<GateName, GateRecord> = {
    spec: validateGateRecord(gates.spec, "spec", file),
    plan: validateGateRecord(gates.plan, "plan", file),
    test_list: validateGateRecord(gates.test_list, "test_list", file),
    promote: validateGateRecord(gates.promote, "promote", file),
  };
  return {
    feature_id: obj.feature_id,
    schema_version: obj.schema_version,
    gates: out,
  };
}

function validateGateRecord(parsed: unknown, gateName: GateName, file: string): GateRecord {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`gates.json at ${file}: gate ${gateName} is not an object`);
  }
  const obj = parsed as Record<string, unknown>;
  const status = obj.status;
  if (typeof status !== "string" || !GATE_STATUSES.includes(status as GateStatus)) {
    throw new Error(
      `gates.json at ${file}: gate ${gateName} has invalid status (${String(status)}); expected one of ${GATE_STATUSES.join(", ")}`
    );
  }
  const history = obj.history;
  if (history !== undefined && !Array.isArray(history)) {
    throw new Error(`gates.json at ${file}: gate ${gateName} history must be an array`);
  }
  return {
    status: status as GateStatus,
    approver: typeof obj.approver === "string" ? obj.approver : undefined,
    approved_at: typeof obj.approved_at === "string" ? obj.approved_at : undefined,
    artifact_hashes:
      obj.artifact_hashes && typeof obj.artifact_hashes === "object"
        ? (obj.artifact_hashes as Record<string, string>)
        : undefined,
    withdrawal_reason:
      typeof obj.withdrawal_reason === "string" ? obj.withdrawal_reason : undefined,
    history: (history as GateHistoryEntry[] | undefined) ?? [],
  };
}
