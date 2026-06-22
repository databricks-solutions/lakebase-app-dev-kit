// The driver records its coarse phase in .tdd/workflow-state.json (distinct from
// the SCM state in .lakebase/workflow-state.json). This file is per-PROJECT, not
// per-feature: every feature drive reads/writes the same `phase` slot. These
// helpers are the single read/write surface for that slot so the path + JSON
// round-trip live in one place.

import * as fs from "node:fs";
import { workflowStateJson } from "./sftdd-paths.js";

/** Terminal phases a finished feature stamps into the per-project phase slot. */
const TERMINAL_PHASES = new Set(["done", "shipped"]);

/** Persist the driver's coarse phase, preserving any other fields on the file. */
export function writeWorkflowPhase(tddDir: string, phase: string): void {
  const file = workflowStateJson(tddDir);
  let state: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    try {
      state = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      state = {};
    }
  }
  state.phase = phase;
  fs.mkdirSync(tddDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
}

/**
 * A fresh `--feature X` invocation must not inherit a PRIOR feature's terminal
 * TDD phase. When the last feature finished, the driver stamped "shipped"/"done"
 * into this per-project file, and the SCM claim (.lakebase/) does not touch it.
 * So the 2nd+ feature's drive would read phase === "done" and return its done
 * action without building. When the persisted phase is terminal, clear it so the
 * derive step recomputes the feature phase (breakdown -> design -> build) for the
 * feature now being driven. A mid-flight feature (phase design/build/deploy/
 * promote) is left intact, so resuming an in-progress feature still works.
 *
 * Returns true iff a stale terminal phase was cleared.
 */
export function resetStaleTerminalPhase(tddDir: string): boolean {
  const file = workflowStateJson(tddDir);
  if (!fs.existsSync(file)) return false;
  let state: Record<string, unknown>;
  try {
    state = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return false;
  }
  if (typeof state.phase === "string" && TERMINAL_PHASES.has(state.phase)) {
    delete state.phase;
    fs.writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
    return true;
  }
  return false;
}
