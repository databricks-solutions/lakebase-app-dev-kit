// mutateTestList primitive: substrate-enforced test-list immutability.
//
// Tracker:. Composes the gates state machine
// (approveGate / verifyGateIntegrity / readGates / writeGates) with the
// existing test-list IO so that once a test_list gate is approved the
// test list cannot be silently rewritten.
//
// Background:
//   writeMasterTestList (scripts/sftdd/test-list.ts) is the original write
//   surface. It is fine for INITIAL authoring (the Test Strategist agent
//   writes the first version before the test_list gate is approved). It
//   is NOT fine for post-approval edits: nothing stops a stray callsite
//   from overwriting an approved test list and silently erasing the
//   gate's integrity baseline.
//
// Design:
//   mutateTestList is the post-approval write surface. It refuses to
//   overwrite an approved test_list without an explicit hitlReapproved
//   flag. With that flag set, it atomically supersedes the existing
//   approval, writes the new content, and re-approves the gate with
//   the new artifact hash. The whole supersede+write+approve cycle
//   happens inside the gates lock so concurrent callers cannot race.
//
//   Open/withdrawn/superseded gates: write goes through cleanly (the
//   gate isn't currently protecting anything).
//
// Open-question reconciliation with ADR-0004:
//   The originating ticket name mentioned a "Gate 3 re-approval token";
//   ADR-0004 open Q #1 settled on integrity-check rather than tokens.
//   This implementation follows the ADR: no token round-trip, just a
//   direct flag + atomic state transition.

import { hashArtifact } from "./gate-hash";
import { resolveTddDir } from "./sftdd-paths.js";
import { withGatesLock } from "./gates-lock";
import {
  readGates,
  writeGates,
  type GateRecord,
  type GatesState,
} from "./gates";
import { writeMasterTestList, type TestList } from "./test-list";

export class TestListImmutabilityError extends Error {
  constructor(
    public readonly featureId: string,
    public readonly gateStatus: string
  ) {
    super(
      `test-list for ${featureId} is immutable: the test_list gate is ${gateStatus} ` +
        `and the caller did not pass hitlReapproved: true. ` +
        `Use mutateTestList({ hitlReapproved: true, approver, ... }) to supersede + re-approve atomically.`
    );
    this.name = "TestListImmutabilityError";
  }
}

export interface MutateTestListArgs {
  featureId: string;
  newTestList: TestList;
  approver: string;
  /**
   * Set to true to supersede + re-approve the test_list gate as part of
   * the same atomic operation. Required when the gate is currently
   * "approved"; ignored when the gate is open / withdrawn / superseded
   * (the write is unprotected in those states).
   */
  hitlReapproved: boolean;
  tddDir?: string;
  /** Test seam: deterministic clock. */
  now?: () => Date;
}

export interface MutateTestListResult {
  /** Resulting gates.json state (updated when the gate was approved+reapproved). */
  state: GatesState;
  /** Captured hash of the new test-list.json content. */
  capturedHash: string;
  /** True iff this call supersede+re-approved the test_list gate (vs. unprotected write). */
  reapproved: boolean;
}

export function mutateTestList(args: MutateTestListArgs): MutateTestListResult {
  if (args.approver.length === 0) {
    throw new Error("mutateTestList: approver must not be empty");
  }
  if (args.featureId !== args.newTestList.feature_id) {
    throw new Error(
      `mutateTestList: featureId mismatch (args.featureId='${args.featureId}' but newTestList.feature_id='${args.newTestList.feature_id}')`
    );
  }

  const tddDir = args.tddDir ?? resolveTddDir();
  const now = args.now ?? (() => new Date());

  return withGatesLock(
    args.featureId,
    (): MutateTestListResult => {
      const currentState = readGates(args.featureId, { tddDir });
      const gateRecord = currentState.gates.test_list;
      const newContent = JSON.stringify(args.newTestList, null, 2) + "\n";
      const newHash = hashArtifact(newContent);

      if (gateRecord.status === "approved") {
        if (!args.hitlReapproved) {
          throw new TestListImmutabilityError(args.featureId, gateRecord.status);
        }
        // Supersede + write + re-approve atomically. Build the new
        // gates state directly (rather than calling withdrawGate +
        // approveGate which would each take the lock; we're inside it
        // already + want a single state transition for the audit).
        const ts = now().toISOString();
        const supersededRecord: GateRecord = {
          status: "superseded",
          approver: gateRecord.approver,
          approved_at: gateRecord.approved_at,
          artifact_hashes: gateRecord.artifact_hashes,
          history: [
            ...gateRecord.history,
            {
              action: "superseded",
              at: ts,
              approver: args.approver,
              reason: "test-list mutation via mutateTestList",
            },
          ],
        };
        const newApprovedRecord: GateRecord = {
          status: "approved",
          approver: args.approver,
          approved_at: ts,
          artifact_hashes: { "test-list.json": newHash },
          history: [
            ...supersededRecord.history,
            {
              action: "approved",
              at: ts,
              approver: args.approver,
              artifact_hashes: { "test-list.json": newHash },
            },
          ],
        };
        const updated: GatesState = {
          ...currentState,
          gates: { ...currentState.gates, test_list: newApprovedRecord },
        };
        writeMasterTestList(tddDir, args.newTestList);
        writeGates(updated, { tddDir });
        return { state: updated, capturedHash: newHash, reapproved: true };
      }

      // Unprotected states: open / withdrawn / superseded. Write goes
      // through; gates state is unchanged.
      writeMasterTestList(tddDir, args.newTestList);
      return { state: currentState, capturedHash: newHash, reapproved: false };
    },
    { tddDir }
  );
}

/**
 * Convenience: predicate that callers can use to decide whether they
 * need to pass hitlReapproved without running into the throw.
 */
export function isTestListProtected(featureId: string, opts: { tddDir?: string } = {}): boolean {
  const tddDir = opts.tddDir ?? resolveTddDir();
  try {
    const state = readGates(featureId, { tddDir });
    return state.gates.test_list.status === "approved";
  } catch {
    return false;
  }
}

