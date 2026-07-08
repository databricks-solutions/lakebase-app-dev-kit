// verifyGateIntegrity primitive: pure read + compare of stored vs current
// artifact hashes for a single gate. Pairs with approveGate (G3) on the
// write side.
//
// Design: ADR-0004. Tracker: (G4 /).
//
// The substrate is file-I/O-free for the artifact side: callers pass the
// current artifact contents in `currentInputs` (same shape as approveGate's
// artifactInputs). verifyGateIntegrity:
//   - reads the gate's stored artifact_hashes from gates.json
//   - re-hashes each currentInputs value via G2 hashArtifact
//   - compares stored vs current; reports drifts
//
// Does NOT mutate gates.json. The caller decides what to do with a drift
// verdict (refuse a mutation, prompt the user, log a warning, ...). G8
// wires verify into the test-list-immutability + cycle-start
// flows.

import { hashArtifact } from "./gate-hash";
import { resolveSftddDir } from "./sftdd-paths.js";
import { readGates, type GateName, type GateStatus } from "./gates";

export interface VerifyGateIntegrityArgs {
  featureId: string;
  gate: GateName;
  /** Artifact name -> current content. Must match the names stored at approval. */
  currentInputs: Record<string, string>;
  sftddDir?: string;
}

export interface ArtifactDrift {
  artifact: string;
  expected: string;
  actual: string;
}

export type VerifyGateIntegrityResult =
  | { status: "ok"; gate: GateName }
  | { status: "gate-not-approved"; gate: GateName; current_status: GateStatus }
  | { status: "drift"; gate: GateName; drifts: ArtifactDrift[] };

export function verifyGateIntegrity(
  args: VerifyGateIntegrityArgs
): VerifyGateIntegrityResult {
  const sftddDir = args.sftddDir ?? resolveSftddDir();
  const state = readGates(args.featureId, { sftddDir });
  const record = state.gates[args.gate];

  if (record.status !== "approved") {
    return {
      status: "gate-not-approved",
      gate: args.gate,
      current_status: record.status,
    };
  }

  const stored = record.artifact_hashes ?? {};
  const storedNames = new Set(Object.keys(stored));
  const currentNames = new Set(Object.keys(args.currentInputs));

  if (
    storedNames.size !== currentNames.size ||
    [...storedNames].some((n) => !currentNames.has(n))
  ) {
    const missing = [...storedNames].filter((n) => !currentNames.has(n));
    const extra = [...currentNames].filter((n) => !storedNames.has(n));
    const parts: string[] = [];
    if (missing.length > 0) parts.push(`missing: ${missing.join(", ")}`);
    if (extra.length > 0) parts.push(`unexpected: ${extra.join(", ")}`);
    throw new Error(
      `verifyGateIntegrity: artifact name mismatch for ${args.gate} gate (${parts.join("; ")}). ` +
        `Caller must pass exactly the same artifact names that were captured at approval.`
    );
  }

  const drifts: ArtifactDrift[] = [];
  for (const name of storedNames) {
    const expected = stored[name];
    const actual = hashArtifact(args.currentInputs[name]);
    if (expected !== actual) {
      drifts.push({ artifact: name, expected, actual });
    }
  }

  if (drifts.length === 0) {
    return { status: "ok", gate: args.gate };
  }
  return { status: "drift", gate: args.gate, drifts };
}
