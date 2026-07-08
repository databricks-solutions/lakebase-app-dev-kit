// The driver's coarse phase lives in .tdd/workflow-state.json, a PER-PROJECT
// file. A fresh `--feature X` drive must not inherit a prior feature's terminal
// phase ("shipped"/"done"), or it would exit its done action without building
// the new feature. resetStaleTerminalPhase clears only terminal phases; a
// mid-flight phase is left intact so resuming an in-progress feature still works.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  writeWorkflowPhase,
  resetStaleTerminalPhase,
} from "../../scripts/sftdd/workflow-phase.js";

let sftddDir: string;
const stateFile = () => path.join(sftddDir, "workflow-state.json");
const readState = () => JSON.parse(fs.readFileSync(stateFile(), "utf8"));

beforeEach(() => {
  sftddDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-phase-"));
});
afterEach(() => {
  fs.rmSync(sftddDir, { recursive: true, force: true });
});

describe("writeWorkflowPhase", () => {
  it("creates the file + writes the phase when none exists", () => {
    writeWorkflowPhase(sftddDir, "implementation");
    expect(readState().phase).toBe("implementation");
  });

  it("preserves other fields on the file", () => {
    fs.writeFileSync(
      stateFile(),
      JSON.stringify({ phase: "discovery", started_at: "2026-06-12T00:00:00Z" }),
    );
    writeWorkflowPhase(sftddDir, "review");
    const s = readState();
    expect(s.phase).toBe("review");
    expect(s.started_at).toBe("2026-06-12T00:00:00Z");
  });
});

describe("resetStaleTerminalPhase", () => {
  for (const terminal of ["done", "shipped"]) {
    it(`clears a stale "${terminal}" phase (so the next feature re-derives)`, () => {
      fs.writeFileSync(
        stateFile(),
        JSON.stringify({ phase: terminal, started_at: "2026-06-12T00:00:00Z" }),
      );
      expect(resetStaleTerminalPhase(sftddDir)).toBe(true);
      const s = readState();
      expect(s.phase).toBeUndefined();
      // Non-phase fields survive the reset.
      expect(s.started_at).toBe("2026-06-12T00:00:00Z");
    });
  }

  for (const midFlight of [
    "discovery",
    "implementation",
    "design-spec-gate",
    "deploy",
    "review",
  ]) {
    it(`leaves a mid-flight "${midFlight}" phase intact (resume still works)`, () => {
      fs.writeFileSync(stateFile(), JSON.stringify({ phase: midFlight }));
      expect(resetStaleTerminalPhase(sftddDir)).toBe(false);
      expect(readState().phase).toBe(midFlight);
    });
  }

  it("is a no-op (false) when the file does not exist", () => {
    expect(resetStaleTerminalPhase(sftddDir)).toBe(false);
    expect(fs.existsSync(stateFile())).toBe(false);
  });

  it("is a no-op (false) on a malformed file", () => {
    fs.writeFileSync(stateFile(), "{ not json");
    expect(resetStaleTerminalPhase(sftddDir)).toBe(false);
  });

  it("is a no-op (false) when there is no phase field at all", () => {
    fs.writeFileSync(stateFile(), JSON.stringify({ started_at: "x" }));
    expect(resetStaleTerminalPhase(sftddDir)).toBe(false);
    expect(readState().started_at).toBe("x");
  });
});
