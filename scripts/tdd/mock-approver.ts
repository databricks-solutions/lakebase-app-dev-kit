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
//   spec       -> hashes spec.md (or feature.md) + feature.json
//   plan       -> hashes plan.json
//   test_list  -> hashes test-list.json (project root) OR test-list.md
//   promote    -> hashes a promote_ref string passed in by caller
//
// For artifacts that don't exist on disk yet, a placeholder content
// "MOCK_APPROVED" is used so the hash is deterministic + the gate can
// still close. The hashes are not verified against the gate's original
// open conditions in this mock path; that's a real-human concern.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { approveGate } from "./approve-gate.js";
import { readGates, type GateName, type GatesState } from "./gates.js";

export const MOCK_APPROVER = "ci-mock-approver";
const PLACEHOLDER = "MOCK_APPROVED";

export interface MockApproveArgs {
  featureId: string;
  tddDir?: string;
  /** Override the approver identity. Defaults to "ci-mock-approver". */
  approver?: string;
  /** Limit to a single gate; default approves every open gate. */
  onlyGate?: GateName;
  /** For the promote gate, the ref to hash. Default: "mock-promote-ref". */
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

function loadArtifactInputs(
  gate: GateName,
  tddDir: string,
  featureId: string,
  promoteRef: string,
): Record<string, string> {
  const fdir = featureDir(tddDir, featureId);
  const read = (p: string): string => {
    try {
      if (existsSync(p)) return readFileSync(p, "utf8");
    } catch {
      // fall through to placeholder
    }
    return PLACEHOLDER;
  };
  switch (gate) {
    case "spec":
      return {
        "spec.md": read(join(fdir, "spec.md")),
        "feature.md": read(join(fdir, "feature.md")),
        "feature.json": read(join(fdir, "feature.json")),
      };
    case "plan":
      return {
        "plan.json": read(join(fdir, "plan.json")),
      };
    case "test_list":
      return {
        "test-list.json": read(join(fdir, "test-list.json")),
        "test-list.md": read(join(fdir, "test-list.md")),
      };
    case "promote":
      return {
        promote_ref: promoteRef,
      };
  }
}

export function mockApproveOpenGates(args: MockApproveArgs): MockApproveResult {
  const tddDir = args.tddDir ?? "./.tdd";
  const approver = args.approver ?? MOCK_APPROVER;
  const promoteRef = args.promoteRef ?? "mock-promote-ref";

  const state = readGates(args.featureId, { tddDir });
  const approved: GateName[] = [];
  const skipped: MockApproveResult["skipped"] = [];

  const gates: GateName[] =
    args.onlyGate !== undefined
      ? [args.onlyGate]
      : (Object.keys(state.gates) as GateName[]);

  let finalState = state;
  for (const gate of gates) {
    const record = state.gates[gate];
    if (record.status !== "open") {
      skipped.push({ gate, reason: `status=${record.status}` });
      continue;
    }
    const artifactInputs = loadArtifactInputs(
      gate,
      tddDir,
      args.featureId,
      promoteRef,
    );
    const result = approveGate({
      featureId: args.featureId,
      gate,
      approver,
      hitlApproved: true,
      artifactInputs,
      tddDir,
    });
    approved.push(gate);
    finalState = result.state;
  }

  return { approved, skipped, finalState };
}
