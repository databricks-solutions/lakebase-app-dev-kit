// CLI surface tests for lakebase-scm-claim-feature-branch (FEIP-7458 phase B).
//
// Drives runScmClaimFeatureCli in-process with the substrate primitive
// stubbed. Verifies argv parsing, output shapes (text + JSON), and exit
// codes for each precondition class.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const mockCreateFeaturePairedBranch = vi.fn();
const mockGetDefaultBranchId = vi.fn();

vi.mock("../../scripts/lakebase/convention-branches.js", () => ({
  createFeaturePairedBranch: (...args: unknown[]) =>
    mockCreateFeaturePairedBranch(...args),
}));
vi.mock("../../scripts/lakebase/lakebase-project.js", () => ({
  getDefaultBranchId: (...args: unknown[]) => mockGetDefaultBranchId(...args),
}));

const cli = await import("../../scripts/lakebase/scm-claim-feature.cli.js");
const state = await import("../../scripts/lakebase/scm-workflow-state.js");

let tmpDir: string;
let stdoutChunks: string[];
let stderrChunks: string[];
let restoreStdoutWrite: () => void;
let restoreStderrWrite: () => void;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scm-claim-cli-"));
  stdoutChunks = [];
  stderrChunks = [];
  const originalStdout = process.stdout.write.bind(process.stdout);
  const originalStderr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    stdoutChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    stderrChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  }) as typeof process.stderr.write;
  restoreStdoutWrite = () => {
    process.stdout.write = originalStdout;
  };
  restoreStderrWrite = () => {
    process.stderr.write = originalStderr;
  };

  mockCreateFeaturePairedBranch.mockReset();
  mockGetDefaultBranchId.mockReset();
  mockCreateFeaturePairedBranch.mockResolvedValue({
    branch: {
      name: "projects/p/branches/feature-initial-domain",
      uid: "br-broad-sky-d2k5gewt",
      state: "READY",
      isDefault: false,
    },
    gitBranch: "feature-initial-domain",
    gitBranchCreated: true,
    envSynced: true,
    warnings: [],
  });
});

afterEach(() => {
  restoreStdoutWrite();
  restoreStderrWrite();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function stdout(): string {
  return stdoutChunks.join("");
}
function stderr(): string {
  return stderrChunks.join("");
}

describe("lakebase-scm-claim-feature-branch CLI", () => {
  it("--help prints usage and exits 0", async () => {
    const code = await cli.runScmClaimFeatureCli(["--help"]);
    expect(code).toBe(0);
    expect(stdout()).toContain("lakebase-scm-claim-feature-branch");
    expect(stdout()).toContain("scaffold-complete");
  });

  it("missing feature-id arg exits 2 with usage on stderr", async () => {
    const code = await cli.runScmClaimFeatureCli([
      "--project-dir",
      tmpDir,
    ]);
    expect(code).toBe(2);
    expect(stderr()).toContain("<feature-id> is required");
  });

  it("no state file exits 1", async () => {
    const code = await cli.runScmClaimFeatureCli([
      "initial-domain",
      "--project-dir",
      tmpDir,
    ]);
    expect(code).toBe(1);
    expect(stderr()).toContain("no-state-file");
  });

  it("happy path: writes feature-claimed state and prints summary", async () => {
    state.writeWorkflowState(tmpDir, {
      version: 1,
      state: "scaffold-complete",
      tier_topology: 2,
      project_id: "demo-app",
    });
    const code = await cli.runScmClaimFeatureCli([
      "initial-domain",
      "--project-dir",
      tmpDir,
    ]);
    expect(code).toBe(0);
    const out = stdout();
    expect(out).toContain("Feature claimed:");
    expect(out).toContain("feature_id    : initial-domain");
    expect(out).toContain("branch        : feature-initial-domain");
    expect(out).toContain("parent_branch : staging");
    expect(out).toContain("lakebase_uid  : br-broad-sky-d2k5gewt");

    const reread = state.readWorkflowState(tmpDir);
    expect(reread?.state).toBe("feature-claimed");
  });

  it("--json emits structured JSON on success", async () => {
    state.writeWorkflowState(tmpDir, {
      version: 1,
      state: "scaffold-complete",
      tier_topology: 2,
      project_id: "demo-app",
    });
    const code = await cli.runScmClaimFeatureCli([
      "initial-domain",
      "--project-dir",
      tmpDir,
      "--json",
      "--pretty",
    ]);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout());
    expect(parsed.ok).toBe(true);
    expect(parsed.branch).toBe("feature-initial-domain");
    expect(parsed.parent_branch).toBe("staging");
  });

  it("--json emits structured JSON on precondition error (exit 2)", async () => {
    state.writeWorkflowState(tmpDir, {
      version: 1,
      state: "pr-ready",
      tier_topology: 2,
      project_id: "p",
      feature_id: "old",
      branch: "feature/old",
      parent_branch: "staging",
      lakebase_branch_uid: "br-old",
      claimed_at: "2026-05-01T00:00:00Z",
      pr_url: "https://github.com/o/r/pull/1",
      pushed_at: "2026-05-01T01:00:00Z",
    });
    const code = await cli.runScmClaimFeatureCli([
      "new-feature",
      "--project-dir",
      tmpDir,
      "--json",
    ]);
    expect(code).toBe(2);
    const parsed = JSON.parse(stdout());
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("bad-precondition");
  });

  it("idempotent re-claim of same feature exits 0 with already-claimed flag", async () => {
    state.writeWorkflowState(tmpDir, {
      version: 1,
      state: "feature-claimed",
      tier_topology: 2,
      project_id: "p",
      feature_id: "initial-domain",
      branch: "feature-initial-domain",
      parent_branch: "staging",
      lakebase_branch_uid: "br-old",
      claimed_at: "2026-05-01T00:00:00Z",
    });
    const code = await cli.runScmClaimFeatureCli([
      "initial-domain",
      "--project-dir",
      tmpDir,
      "--json",
    ]);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout());
    expect(parsed.ok).toBe(true);
    expect(parsed.alreadyClaimed).toBe(true);
    expect(mockCreateFeaturePairedBranch).not.toHaveBeenCalled();
  });
});
