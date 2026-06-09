// Unit tests for scm-abandon-feature (phase B+).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const mockDeletePaired = vi.fn();
const mockIsDirty = vi.fn();
const mockGetCurrentBranch = vi.fn();
const mockExec = vi.fn();

vi.mock("../../scripts/lakebase/paired-branch.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../scripts/lakebase/paired-branch.js")
  >("../../scripts/lakebase/paired-branch.js");
  return {
    ...actual,
    deletePairedBranch: (...args: unknown[]) => mockDeletePaired(...args),
  };
});
vi.mock("../../scripts/git/inspect.js", () => ({
  getCurrentBranch: (...args: unknown[]) => mockGetCurrentBranch(...args),
  getRepoRoot: vi.fn(),
}));
vi.mock("../../scripts/git/status.js", () => ({
  isDirty: (...args: unknown[]) => mockIsDirty(...args),
  hasUpstream: vi.fn(),
  getAheadBehind: vi.fn(),
}));
vi.mock("../../scripts/util/exec.js", () => ({
  exec: (...args: unknown[]) => mockExec(...args),
  shq: (s: string) => `'${s}'`,
}));

const abandon = await import("../../scripts/lakebase/scm-abandon-feature.js");
const state = await import("../../scripts/lakebase/scm-workflow-state.js");

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scm-abandon-"));
  mockDeletePaired.mockReset();
  mockIsDirty.mockReset();
  mockGetCurrentBranch.mockReset();
  mockExec.mockReset();
  mockDeletePaired.mockResolvedValue({
    lakebaseDeleted: true,
    gitLocalDeleted: true,
    gitRemoteDeleted: true,
    warnings: [],
  });
  mockIsDirty.mockResolvedValue(false);
  mockGetCurrentBranch.mockResolvedValue("feature/x");
  mockExec.mockResolvedValue("");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function seedClaim(): void {
  state.writeWorkflowState(tmpDir, {
    version: 1,
    state: "feature-claimed",
    tier_topology: 2,
    project_id: "p",
    feature_id: "x",
    branch: "feature/x",
    parent_branch: "staging",
    lakebase_branch_uid: "br-x",
    claimed_at: "2026-05-01T00:00:00Z",
  });
}

describe("abandonFeatureBranch", () => {
  it("refuses when no state file", async () => {
    await expect(
      abandon.abandonFeatureBranch({ projectDir: tmpDir }),
    ).rejects.toMatchObject({ code: "no-state-file" });
  });

  it("refuses when not at feature-claimed", async () => {
    state.writeWorkflowState(tmpDir, {
      version: 1,
      state: "scaffold-complete",
      tier_topology: 2,
      project_id: "p",
    });
    await expect(
      abandon.abandonFeatureBranch({ projectDir: tmpDir }),
    ).rejects.toMatchObject({ code: "bad-precondition" });
  });

  it("refuses on dirty working tree without --force", async () => {
    seedClaim();
    mockIsDirty.mockResolvedValue(true);
    await expect(
      abandon.abandonFeatureBranch({ projectDir: tmpDir }),
    ).rejects.toMatchObject({ code: "dirty-working-tree" });
    expect(mockDeletePaired).not.toHaveBeenCalled();
  });

  it("--force overrides dirty check", async () => {
    seedClaim();
    mockIsDirty.mockResolvedValue(true);
    const result = await abandon.abandonFeatureBranch({
      projectDir: tmpDir,
      force: true,
    });
    expect(result.state.state).toBe("scaffold-complete");
    expect(mockDeletePaired).toHaveBeenCalledTimes(1);
  });

  it("switches HEAD to parent_branch before delete + resets state", async () => {
    seedClaim();
    mockGetCurrentBranch.mockResolvedValue("feature/x");
    const result = await abandon.abandonFeatureBranch({ projectDir: tmpDir });
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining("git checkout"),
      expect.objectContaining({ cwd: tmpDir }),
    );
    expect(mockExec.mock.calls[0][0]).toContain('"staging"');
    expect(result.state.state).toBe("scaffold-complete");
    expect(result.state.feature_id).toBeUndefined();
    expect(result.state.branch).toBeUndefined();
    expect(result.lakebaseDeleted).toBe(true);
  });

  it("--switch-to overrides parent_branch", async () => {
    seedClaim();
    await abandon.abandonFeatureBranch({
      projectDir: tmpDir,
      switchTo: "main",
    });
    expect(mockExec.mock.calls[0][0]).toContain('"main"');
  });

  it("propagates substrate warnings", async () => {
    seedClaim();
    mockDeletePaired.mockResolvedValue({
      lakebaseDeleted: false,
      gitLocalDeleted: true,
      gitRemoteDeleted: true,
      warnings: ["Lakebase delete failed: branch not found"],
    });
    const result = await abandon.abandonFeatureBranch({
      projectDir: tmpDir,
    });
    expect(result.warnings).toContain(
      "Lakebase delete failed: branch not found",
    );
    expect(result.state.state).toBe("scaffold-complete");
  });
});
