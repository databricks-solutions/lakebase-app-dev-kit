// migrateGatesFromSelectionLog primitive: one-shot scanner that synthesizes
// gates.json for a feature that has approvals + withdrawals recorded in
// selection-log.md but no structured state yet.
//
// Tracker: (G6 /).
//
// Use case: a feature scaffolded before the gates state machine existed
// has its HITL history in selection-log narrative only. Without backfill,
// readGates would return the default-open shape and the feature would
// appear to have NO prior approvals, even when the human-readable log
// shows the PO already signed off on spec + plan + test_list.
//
// Per ADR-0004's open question #4, the backfill is BEST-EFFORT:
//   - Approval timestamps + approvers + the gate that was approved are
//     recovered from selection-log headings.
//   - Artifact hashes captured at the original approval moment are NOT
//     recoverable (the approval narrative does not store them in the
//     legacy format). The caller may pass currentInputsByGate so the
//     backfill hashes the CURRENT artifact content as a baseline; this
//     lets verifyGateIntegrity work going forward but cannot prove
//     against the historical content.
//   - History entries are marked migrated: true so auditors can tell
//     synthesized entries apart from native ones.
//
// Refuses if gates.json already exists unless force: true.

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { hashArtifact } from "./gate-hash";
import { resolveSftddDir, findFeatureDir } from "./sftdd-paths.js";
import {
  defaultGatesState,
  readGates,
  writeGates,
  GATE_NAMES,
  type GateHistoryEntry,
  type GateName,
  type GateRecord,
  type GatesState,
} from "./gates";

export interface MigrateGatesArgs {
  featureId: string;
  /**
   * Per-gate current artifact contents. The migrator hashes these and
   * stores the result on any gate whose final status (per selection-log)
   * is "approved". Gates with no entry here get migrated to status =
   * "approved" without artifact_hashes; verifyGateIntegrity will return
   * gate-not-approved style errors when called against them.
   */
  currentInputsByGate?: Partial<Record<GateName, Record<string, string>>>;
  sftddDir?: string;
  /** Overwrite an existing gates.json. Default: false. */
  force?: boolean;
}

export interface MigrateGatesResult {
  /** Was a migration performed (vs. refused due to existing gates.json)? */
  migrated: boolean;
  /** Skip reason when migrated=false. */
  reason?: "gates-json-exists" | "selection-log-absent" | "no-entries-found";
  /** The resulting state written to disk. */
  state: GatesState;
  /** Per-gate count of selection-log entries observed during the scan. */
  entry_counts: Record<GateName, number>;
}

interface ParsedEntry {
  ts: string;
  action: "approve" | "withdraw";
  gate: GateName;
  approver?: string;
}

const HEADING_RE =
  /^##\s+(\S+T\S+?)\s+–\s+(Approve|Withdraw)\s+(spec|plan|test_list|promote)\s+for\s+(\S+)\s*$/;
const APPROVED_BY_RE = /\*\*(?:Approved|Withdrawn) by:\*\*\s*(\S.*?)\s*$/;

export function migrateGatesFromSelectionLog(
  args: MigrateGatesArgs
): MigrateGatesResult {
  const sftddDir = args.sftddDir ?? resolveSftddDir();

  // Refusal: existing gates.json without force.
  try {
    readGates(args.featureId, { sftddDir });
    // Reach here only when the feature dir exists AND a parseable gates.json
    // exists OR the default-open shape was returned. Distinguish by file
    // presence.
    if (gatesFileExists(sftddDir, args.featureId) && !args.force) {
      return {
        migrated: false,
        reason: "gates-json-exists",
        state: readGates(args.featureId, { sftddDir }),
        entry_counts: emptyCounts(),
      };
    }
  } catch {
    // Feature dir missing surfaces below via writeGates anyway; the regular
    // path catches that.
  }

  const logPath = join(sftddDir, "selection-log.md");
  if (!existsSync(logPath)) {
    return {
      migrated: false,
      reason: "selection-log-absent",
      state: defaultGatesState(args.featureId),
      entry_counts: emptyCounts(),
    };
  }

  const entries = parseSelectionLog(readFileSync(logPath, "utf8"), args.featureId);
  if (entries.length === 0) {
    return {
      migrated: false,
      reason: "no-entries-found",
      state: defaultGatesState(args.featureId),
      entry_counts: emptyCounts(),
    };
  }

  const counts = emptyCounts();
  for (const e of entries) counts[e.gate] += 1;

  const state = defaultGatesState(args.featureId);
  for (const e of entries) {
    const record = state.gates[e.gate];
    const historyEntry: GateHistoryEntry = {
      action: "migrated",
      at: e.ts,
      approver: e.approver ?? "unknown (migrated)",
      migrated: true,
      reason:
        e.action === "approve"
          ? "migrated from selection-log (approval)"
          : "migrated from selection-log (withdrawal)",
    };
    record.history.push(historyEntry);
    if (e.action === "approve") {
      record.status = "approved";
      record.approver = e.approver ?? record.approver ?? "unknown (migrated)";
      record.approved_at = e.ts;
      const inputs = args.currentInputsByGate?.[e.gate];
      if (inputs) {
        const hashes: Record<string, string> = {};
        for (const [name, content] of Object.entries(inputs)) {
          hashes[name] = hashArtifact(content);
        }
        record.artifact_hashes = hashes;
      }
    } else {
      record.status = "withdrawn";
      record.withdrawal_reason = "migrated from selection-log (withdrawal)";
    }
  }

  writeGates(state, { sftddDir });
  return { migrated: true, state, entry_counts: counts };
}

function gatesFileExists(sftddDir: string, featureId: string): boolean {
  // One feature-dir resolution rule (sftdd-paths), not a local copy.
  const dir = findFeatureDir(sftddDir, featureId);
  return dir ? existsSync(join(dir, "gates.json")) : false;
}

function emptyCounts(): Record<GateName, number> {
  const out = {} as Record<GateName, number>;
  for (const name of GATE_NAMES) out[name] = 0;
  return out;
}

function parseSelectionLog(text: string, featureId: string): ParsedEntry[] {
  const out: ParsedEntry[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = HEADING_RE.exec(lines[i]);
    if (!m) continue;
    const [, ts, verb, gateRaw, fid] = m;
    // Loose feature-id match: header writes the full id, but callers may
    // ask for a slug prefix.
    if (!fid.startsWith(featureId) && !featureId.startsWith(fid)) continue;
    const action = verb === "Approve" ? "approve" : "withdraw";
    // Look ahead for the approver line in the next ~6 lines.
    let approver: string | undefined;
    for (let j = i + 1; j < Math.min(i + 7, lines.length); j++) {
      const am = APPROVED_BY_RE.exec(lines[j]);
      if (am) {
        approver = am[1].trim();
        break;
      }
    }
    out.push({ ts, action, gate: gateRaw as GateName, approver });
  }
  return out;
}
