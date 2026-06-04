// CLI surface tests for lakebase-scm-state (FEIP-7458, phase A).
//
// Runs the exported runScmStateCli function in-process against tempdir
// project roots so we don't need to build the bundle. Captures stdout
// and checks exit codes; human and --json output are both pinned.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  writeWorkflowState,
  type ScmWorkflowState,
} from "../../scripts/lakebase/scm-workflow-state";
import { runScmStateCli } from "../../scripts/lakebase/scm-state.cli";

let tmpDir: string;
let originalCwd: string;
let stdoutChunks: string[];
let restoreStdoutWrite: () => void;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scm-state-cli-"));
  originalCwd = process.cwd();
  stdoutChunks = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    stdoutChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;
  restoreStdoutWrite = () => {
    process.stdout.write = original;
  };
});

afterEach(() => {
  restoreStdoutWrite();
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function stdout(): string {
  return stdoutChunks.join("");
}

describe("lakebase-scm-state CLI", () => {
  it("exits 1 with a no-state-file message when nothing is scaffolded", () => {
    const code = runScmStateCli(["--project-dir", tmpDir]);
    expect(code).toBe(1);
    expect(stdout()).toContain("(no state file)");
    expect(stdout()).toContain(tmpDir);
  });

  it("renders the gate ladder for a scaffold-complete state", () => {
    writeWorkflowState(tmpDir, {
      version: 1,
      state: "scaffold-complete",
      tier_topology: 2,
      project_id: "demo-app",
    });
    const code = runScmStateCli(["--project-dir", tmpDir]);
    expect(code).toBe(0);
    const out = stdout();
    expect(out).toContain("state          : scaffold-complete");
    expect(out).toContain("tier_topology  : 2 (prod + staging)");
    expect(out).toContain("project_id     : demo-app");
    expect(out).toContain("scaffold-complete");
    expect(out).toContain("feature-claimed");
    expect(out).toContain("pr-ready");
    expect(out).toContain("ci-green");
    expect(out).toContain("merged");
    expect(out).toContain("(advisory:");
  });

  it("renders feature details once feature-claimed", () => {
    const s: ScmWorkflowState = {
      version: 1,
      state: "feature-claimed",
      tier_topology: 2,
      project_id: "demo-app",
      feature_id: "F1-initial-domain",
      branch: "feature/initial-domain",
      parent_branch: "staging",
      lakebase_branch_uid: "br-broad-sky-d2k5gewt",
      claimed_at: "2026-06-03T05:00:00Z",
    };
    writeWorkflowState(tmpDir, s);
    const code = runScmStateCli(["--project-dir", tmpDir]);
    expect(code).toBe(0);
    const out = stdout();
    expect(out).toContain("feature_id     : F1-initial-domain");
    expect(out).toContain("branch         : feature/initial-domain");
    expect(out).toContain("parent_branch  : staging");
    expect(out).toContain("lakebase_uid   : br-broad-sky-d2k5gewt");
  });

  it("--json emits a structured report and pretty-prints with --pretty", () => {
    writeWorkflowState(tmpDir, {
      version: 1,
      state: "scaffold-complete",
      tier_topology: 1,
      project_id: "tiny",
    });
    const code = runScmStateCli([
      "--project-dir",
      tmpDir,
      "--json",
      "--pretty",
    ]);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout());
    expect(parsed.found).toBe(true);
    expect(parsed.state.state).toBe("scaffold-complete");
    expect(parsed.state.tier_topology).toBe(1);
    expect(parsed.gates).toHaveLength(5);
    expect(parsed.gates[0].name).toBe("scaffold-complete");
    expect(parsed.gates[0].passed).toBe(true);
    expect(parsed.gates[0].current).toBe(true);
    expect(parsed.gates[1].passed).toBe(false);
  });

  it("exits 2 when the state file is structurally invalid", () => {
    fs.mkdirSync(path.join(tmpDir, ".lakebase"));
    fs.writeFileSync(
      path.join(tmpDir, ".lakebase/workflow-state.json"),
      JSON.stringify({ version: 1 }),
      "utf8",
    );
    const code = runScmStateCli(["--project-dir", tmpDir]);
    expect(code).toBe(2);
    expect(stdout()).toContain("INVALID");
  });

  it("--help prints usage and exits 0", () => {
    const code = runScmStateCli(["--help"]);
    expect(code).toBe(0);
    expect(stdout()).toContain("lakebase-scm-state");
    expect(stdout()).toContain("Usage:");
  });
});
