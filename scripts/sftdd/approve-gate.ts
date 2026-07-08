// approveGate primitive: HITL-gated approval of a single gate in the
// feature's gates.json state. Composes G1 (readGates / writeGates) +
// G2 (hashArtifact) + dual-writes a narrative entry to selection-log.md.
//
// Design: ADR-0004. Tracker: (G3 /).
//
// The hash inputs are passed by the caller, not read from disk by this
// primitive. The orchestrator (G8) is responsible for collecting the
// per-gate-scoped artifact contents and passing them in. Keeping the
// substrate file-I/O-free for the artifact side leaves approveGate
// pure-on-state + easy to test.
//
// Gate refusal:
//   - hitlApproved !== true     -> throws "requires hitlApproved: true"
//   - gate not currently "open" -> throws GateAlreadyClosedError
//
// On success:
//   - Writes the new GatesState atomically via writeGates (G1).
//   - Appends a history entry with action "approved", approver, timestamp,
//     and the captured artifact_hashes.
//   - Appends a narrative entry to .tdd/selection-log.md so humans grepping
//     the log see the same approval the structured state records.

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolveSftddDir } from "./sftdd-paths.js";
import { join } from "path";
import { hashArtifact } from "./gate-hash";
import { withGatesLock } from "./gates-lock";
import {
  readGates,
  writeGates,
  type GateName,
  type GatesState,
} from "./gates";

export class GateAlreadyClosedError extends Error {
  constructor(
    public readonly gate: GateName,
    public readonly currentStatus: string
  ) {
    super(
      `gate ${gate} is not open (current status: ${currentStatus}); withdraw or supersede before re-approving`
    );
    this.name = "GateAlreadyClosedError";
  }
}

export interface ApproveGateArgs {
  featureId: string;
  gate: GateName;
  approver: string;
  /** Set to true to record the HITL approval. approveGate refuses to run otherwise. */
  hitlApproved: boolean;
  /**
   * Artifact name -> content map. The substrate hashes each value via
   * hashArtifact and stores the result on the gate record. Per ADR-0004
   * the per-gate scope is a CONVENTION (spec hashes feature-spec.md + feature-spec.json,
   * plan hashes plan.json, test_list hashes test-list.json, promote hashes
   * a promote_ref string) enforced at the call site, not here.
   */
  artifactInputs: Record<string, string>;
  sftddDir?: string;
  /** Test seam: inject a deterministic clock for reproducible timestamps. */
  now?: () => Date;
  /**
   * Append the narrative entry to selection-log.md. Default: true. Set to
   * false in tests or when the caller drives the narrative separately
   * (e.g. promoteExperiment already writes its own promote entry).
   */
  writeSelectionLog?: boolean;
}

export interface ApproveGateResult {
  state: GatesState;
  capturedHashes: Record<string, string>;
}

export function approveGate(args: ApproveGateArgs): ApproveGateResult {
  if (!args.hitlApproved) {
    throw new Error("approveGate requires hitlApproved: true (HITL Gate)");
  }
  if (args.approver.length === 0) {
    throw new Error("approveGate: approver must not be empty");
  }
  const artifactNames = Object.keys(args.artifactInputs);
  if (artifactNames.length === 0) {
    throw new Error(
      `approveGate: gate ${args.gate} must capture at least one artifact (got empty artifactInputs)`
    );
  }

  const sftddDir = args.sftddDir ?? resolveSftddDir();
  const now = args.now ?? (() => new Date());
  const writeLog = args.writeSelectionLog ?? true;

  // Lock the gates.json read-modify-write critical section so concurrent
  // approveGate calls cannot lose either approval (G7 /).
  return withGatesLock(
    args.featureId,
    (): ApproveGateResult => {
      const state = readGates(args.featureId, { sftddDir });
      const record = state.gates[args.gate];
      if (record.status !== "open") {
        throw new GateAlreadyClosedError(args.gate, record.status);
      }

      const capturedHashes: Record<string, string> = {};
      for (const name of artifactNames) {
        capturedHashes[name] = hashArtifact(args.artifactInputs[name]);
      }

      const ts = now().toISOString();
      const updatedState: GatesState = {
        ...state,
        gates: {
          ...state.gates,
          [args.gate]: {
            status: "approved",
            approver: args.approver,
            approved_at: ts,
            artifact_hashes: capturedHashes,
            history: [
              ...record.history,
              {
                action: "approved",
                at: ts,
                approver: args.approver,
                artifact_hashes: capturedHashes,
              },
            ],
          },
        },
      };

      writeGates(updatedState, { sftddDir });

      if (writeLog) {
        appendSelectionLog(sftddDir, {
          ts,
          gate: args.gate,
          featureId: args.featureId,
          approver: args.approver,
          capturedHashes,
        });
      }

      return { state: updatedState, capturedHashes };
    },
    { sftddDir }
  );
}

interface SelectionLogEntry {
  ts: string;
  gate: GateName;
  featureId: string;
  approver: string;
  capturedHashes: Record<string, string>;
}

function appendSelectionLog(sftddDir: string, entry: SelectionLogEntry): void {
  const logPath = join(sftddDir, "selection-log.md");
  const hashList = Object.entries(entry.capturedHashes)
    .map(([name, hash]) => `  - \`${name}\`: \`sha256:${hash}\``)
    .join("\n");
  const lines = [
    "",
    `## ${entry.ts} – Approve ${entry.gate} for ${entry.featureId}`,
    `- **Approved by:** ${entry.approver}`,
    `- **Artifact hashes:**`,
    hashList,
    "",
  ];
  const text = lines.join("\n");
  if (existsSync(logPath)) {
    writeFileSync(logPath, readFileSync(logPath, "utf8") + text);
  } else {
    writeFileSync(logPath, text);
  }
}
