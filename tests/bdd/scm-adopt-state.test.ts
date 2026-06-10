// Unit tests for scm-adopt-state (phase B+).
//
// Mocks listBranches + getBranchByName + getCurrentBranch. Pins the
// adoption decision tree: tier-topology inference, scaffold-complete vs
// feature-claimed, lakebase-pair-missing refusal.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const mockListBranches = vi.fn();
const mockGetBranchByName = vi.fn();
const mockGetCurrentBranch = vi.fn();

vi.mock("../../scripts/lakebase/branch-utils.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../scripts/lakebase/branch-utils.js")
  >("../../scripts/lakebase/branch-utils.js");
  return {
    ...actual,
    listBranches: (...args: unknown[]) => mockListBranches(...args),
    getBranchByName: (...args: unknown[]) => mockGetBranchByName(...args),
  };
});

vi.mock("../../scripts/git/inspect.js", () => ({
  getCurrentBranch: (...args: unknown[]) => mockGetCurrentBranch(...args),
  getRepoRoot: vi.fn(),
}));

const adopt = await import("../../scripts/lakebase/scm-adopt-state.js");
const state = await import("../../scripts/lakebase/scm-workflow-state.js");

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scm-adopt-"));
  mockListBranches.mockReset();
  mockGetBranchByName.mockReset();
  mockGetCurrentBranch.mockReset();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const fixedNow = () => new Date("2026-06-03T12:00:00Z");

describe("inferTierTopology", () => {
  it("returns 1 when only the default branch exists", () => {
    expect(
      adopt.inferTierTopology([
        { name: "projects/p/branches/main", uid: "u1", isDefault: true },
      ] as Parameters<typeof adopt.inferTierTopology>[0]),
    ).toBe(1);
  });
  it("returns 2 when staging exists", () => {
    expect(
      adopt.inferTierTopology([
        { name: "projects/p/branches/main", uid: "u1", isDefault: true },
        { name: "projects/p/branches/staging", uid: "u2" },
      ] as Parameters<typeof adopt.inferTierTopology>[0]),
    ).toBe(2);
  });
  it("returns 3 when staging + dev exist", () => {
    expect(
      adopt.inferTierTopology([
        { name: "projects/p/branches/main", uid: "u1", isDefault: true },
        { name: "projects/p/branches/staging", uid: "u2" },
        { name: "projects/p/branches/dev", uid: "u3" },
      ] as Parameters<typeof adopt.inferTierTopology>[0]),
    ).toBe(3);
  });
});

describe("adoptScmState", () => {
  it("refuses when missing instance", async () => {
    await expect(
      adopt.adoptScmState({ projectDir: tmpDir, instance: "" }),
    ).rejects.toMatchObject({ code: "missing-instance" });
  });

  it("refuses when workflow-state already present (no --force)", async () => {
    state.writeWorkflowState(tmpDir, {
      version: 1,
      state: "scaffold-complete",
      tier_topology: 2,
      project_id: "p",
    });
    await expect(
      adopt.adoptScmState({ projectDir: tmpDir, instance: "p" }),
    ).rejects.toMatchObject({ code: "already-adopted" });
  });

  it("seeds scaffold-complete when on a tier branch (staging, tier 2)", async () => {
    mockGetCurrentBranch.mockResolvedValue("staging");
    mockListBranches.mockResolvedValue([
      { name: "projects/p/branches/main", uid: "u1", isDefault: true },
      { name: "projects/p/branches/staging", uid: "u2" },
    ]);
    const result = await adopt.adoptScmState({
      projectDir: tmpDir,
      instance: "p",
      now: fixedNow,
    });
    expect(result.state.state).toBe("scaffold-complete");
    expect(result.state.tier_topology).toBe(2);
    expect(state.readWorkflowState(tmpDir)?.state).toBe("scaffold-complete");
  });

  it("seeds feature-claimed when on feature/<slug> with paired Lakebase branch", async () => {
    mockGetCurrentBranch.mockResolvedValue("feature/initial-domain");
    mockListBranches.mockResolvedValue([
      { name: "projects/p/branches/main", uid: "u1", isDefault: true },
      { name: "projects/p/branches/staging", uid: "u2" },
    ]);
    mockGetBranchByName.mockResolvedValue({
      name: "projects/p/branches/feature-initial-domain",
      uid: "br-feature",
    });
    const result = await adopt.adoptScmState({
      projectDir: tmpDir,
      instance: "p",
      now: fixedNow,
    });
    expect(result.state.state).toBe("feature-claimed");
    expect(result.state.feature_id).toBe("initial-domain");
    expect(result.state.branch).toBe("feature/initial-domain");
    expect(result.state.parent_branch).toBe("staging");
    expect(result.state.lakebase_branch_uid).toBe("br-feature");
    expect(result.state.claimed_at).toBe("2026-06-03T12:00:00.000Z");
  });

  it("refuses on feature/<slug> when no Lakebase pair exists", async () => {
    mockGetCurrentBranch.mockResolvedValue("feature/orphan");
    mockListBranches.mockResolvedValue([
      { name: "projects/p/branches/main", uid: "u1", isDefault: true },
    ]);
    mockGetBranchByName.mockResolvedValue(undefined);
    await expect(
      adopt.adoptScmState({ projectDir: tmpDir, instance: "p" }),
    ).rejects.toMatchObject({ code: "lakebase-pair-missing" });
  });

  it("refuses on unrecognized branch (hotfix/*, not tier, not feature/*)", async () => {
    mockGetCurrentBranch.mockResolvedValue("hotfix/something");
    mockListBranches.mockResolvedValue([
      { name: "projects/p/branches/main", uid: "u1", isDefault: true },
    ]);
    await expect(
      adopt.adoptScmState({ projectDir: tmpDir, instance: "p" }),
    ).rejects.toMatchObject({ code: "unrecognized-branch" });
  });

  it("--force lets adoption overwrite an existing state row", async () => {
    state.writeWorkflowState(tmpDir, {
      version: 1,
      state: "scaffold-complete",
      tier_topology: 1,
      project_id: "p",
    });
    mockGetCurrentBranch.mockResolvedValue("staging");
    mockListBranches.mockResolvedValue([
      { name: "projects/p/branches/main", uid: "u1", isDefault: true },
      { name: "projects/p/branches/staging", uid: "u2" },
    ]);
    const result = await adopt.adoptScmState({
      projectDir: tmpDir,
      instance: "p",
      force: true,
      now: fixedNow,
    });
    expect(result.state.tier_topology).toBe(2);
  });
});
