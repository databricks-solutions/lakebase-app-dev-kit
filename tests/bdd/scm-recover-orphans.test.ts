// Unit tests for scm-recover-orphans (FEIP-7458 phase C).
//
// Mocks listBranches + listLocalBranches + createFeaturePairedBranch
// so we drive the detection + claim paths without touching the real
// substrate.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const mockListLakebase = vi.fn();
const mockListLocal = vi.fn();
const mockCreateFeaturePaired = vi.fn();

vi.mock("../../scripts/lakebase/branch-utils.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../scripts/lakebase/branch-utils.js")
  >("../../scripts/lakebase/branch-utils.js");
  return {
    ...actual,
    listBranches: (...args: unknown[]) => mockListLakebase(...args),
  };
});
vi.mock("../../scripts/git/branches.js", () => ({
  listLocalBranches: (...args: unknown[]) => mockListLocal(...args),
  listRemoteBranches: vi.fn(),
  hasRemoteBranch: vi.fn(),
}));
vi.mock("../../scripts/lakebase/convention-branches.js", () => ({
  createFeaturePairedBranch: (...args: unknown[]) =>
    mockCreateFeaturePaired(...args),
}));

const rec = await import("../../scripts/lakebase/scm-recover-orphans.js");
const state = await import("../../scripts/lakebase/scm-workflow-state.js");

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scm-recover-"));
  mockListLakebase.mockReset();
  mockListLocal.mockReset();
  mockCreateFeaturePaired.mockReset();
  mockCreateFeaturePaired.mockResolvedValue({
    branch: { name: "p/branches/feature-orphan", uid: "br-orphan" },
    gitBranch: "feature/orphan",
    gitBranchCreated: false,
    envSynced: true,
    warnings: [],
  });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function lbDefaultPlusStaging() {
  return [
    { name: "p/branches/main", uid: "u-main", isDefault: true },
    { name: "p/branches/staging", uid: "u-staging" },
  ];
}

describe("recoverOrphans (detect-only)", () => {
  it("refuses without an instance", async () => {
    await expect(
      rec.recoverOrphans({ projectDir: tmpDir, instance: "" }),
    ).rejects.toMatchObject({ code: "missing-instance" });
  });

  it("finds orphans + skips tiers + skips default branch", async () => {
    mockListLakebase.mockResolvedValue(lbDefaultPlusStaging());
    mockListLocal.mockResolvedValue([
      { name: "main", isCurrent: false, isRemote: false },
      { name: "staging", isCurrent: false, isRemote: false },
      { name: "feature/initial-domain", isCurrent: true, isRemote: false },
      { name: "feature/already-paired", isCurrent: false, isRemote: false },
    ]);
    mockListLakebase.mockResolvedValueOnce([
      ...lbDefaultPlusStaging(),
      {
        name: "p/branches/feature-already-paired",
        uid: "u-paired",
      },
    ]);
    const result = await rec.recoverOrphans({
      projectDir: tmpDir,
      instance: "p",
    });
    expect(result.tierTopology).toBe(2);
    expect(result.orphans.map((o) => o.gitBranch)).toEqual([
      "feature/initial-domain",
    ]);
    expect(
      result.skipped.find((s) => s.gitBranch === "main"),
    ).toBeDefined();
    expect(
      result.skipped.find((s) => s.gitBranch === "staging"),
    ).toBeDefined();
    expect(
      result.skipped.find((s) => s.gitBranch === "feature/already-paired"),
    ).toBeDefined();
    expect(result.claimed).toEqual([]);
  });

  it("flags non-feature/<slug> branches as orphans too", async () => {
    mockListLakebase.mockResolvedValue([
      { name: "p/branches/main", uid: "u-main", isDefault: true },
    ]);
    mockListLocal.mockResolvedValue([
      { name: "main", isCurrent: false, isRemote: false },
      { name: "hotfix/oops", isCurrent: false, isRemote: false },
    ]);
    const result = await rec.recoverOrphans({
      projectDir: tmpDir,
      instance: "p",
    });
    expect(result.orphans.map((o) => o.gitBranch)).toEqual(["hotfix/oops"]);
  });
});

describe("recoverOrphans (claim)", () => {
  it("claims each orphan via substrate + updates state row for HEAD's orphan", async () => {
    mockListLakebase.mockResolvedValue(lbDefaultPlusStaging());
    mockListLocal.mockResolvedValue([
      { name: "main", isCurrent: false, isRemote: false },
      { name: "feature/one", isCurrent: false, isRemote: false },
      { name: "feature/two", isCurrent: true, isRemote: false },
    ]);
    mockCreateFeaturePaired
      .mockResolvedValueOnce({
        branch: { name: "p/branches/feature-one", uid: "br-one" },
        gitBranch: "feature/one",
        gitBranchCreated: false,
        envSynced: true,
        warnings: [],
      })
      .mockResolvedValueOnce({
        branch: { name: "p/branches/feature-two", uid: "br-two" },
        gitBranch: "feature/two",
        gitBranchCreated: false,
        envSynced: true,
        warnings: [],
      });
    const result = await rec.recoverOrphans({
      projectDir: tmpDir,
      instance: "p",
      claim: true,
      now: () => new Date("2026-06-03T12:00:00Z"),
    });
    expect(result.claimed).toHaveLength(2);
    expect(result.stateUpdatedFor).toBe("feature/two"); // HEAD wins
    const onState = state.readWorkflowState(tmpDir);
    expect(onState?.state).toBe("feature-claimed");
    expect(onState?.branch).toBe("feature/two");
    expect(onState?.lakebase_branch_uid).toBe("br-two");
  });

  it("--only-branch limits claim to one orphan", async () => {
    mockListLakebase.mockResolvedValue(lbDefaultPlusStaging());
    mockListLocal.mockResolvedValue([
      { name: "main", isCurrent: false, isRemote: false },
      { name: "feature/one", isCurrent: false, isRemote: false },
      { name: "feature/two", isCurrent: true, isRemote: false },
    ]);
    mockCreateFeaturePaired.mockResolvedValueOnce({
      branch: { name: "p/branches/feature-one", uid: "br-one" },
      gitBranch: "feature/one",
      gitBranchCreated: false,
      envSynced: true,
      warnings: [],
    });
    const result = await rec.recoverOrphans({
      projectDir: tmpDir,
      instance: "p",
      claim: true,
      onlyBranch: "feature/one",
      now: () => new Date("2026-06-03T12:00:00Z"),
    });
    expect(result.claimed).toHaveLength(1);
    expect(mockCreateFeaturePaired).toHaveBeenCalledTimes(1);
    expect(result.stateUpdatedFor).toBe("feature/one");
  });

  it("--only-branch with unknown name throws claim-conflict", async () => {
    mockListLakebase.mockResolvedValue(lbDefaultPlusStaging());
    mockListLocal.mockResolvedValue([
      { name: "feature/x", isCurrent: true, isRemote: false },
    ]);
    await expect(
      rec.recoverOrphans({
        projectDir: tmpDir,
        instance: "p",
        claim: true,
        onlyBranch: "feature/nope",
      }),
    ).rejects.toMatchObject({ code: "claim-conflict" });
  });
});
