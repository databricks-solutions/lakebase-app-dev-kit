// Hermetic coverage for the per-tier-type PAIRED helpers.
//
// createFeaturePairedBranch / createTestPairedBranch / createUatPairedBranch /
// createPerfPairedBranch must forward the convention TTL + parent into
// createPairedBranch. Verifies the contract that fixes the FEIP-7422 smoke
// gap: feature branches must get the 30-day TTL, not the legacy no_expiry
// default from createPairedBranch.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { KIT_TIMEOUTS, formatLakebaseTtl } from "../../scripts/lakebase/kit-config.js";

const mockCreatePairedBranch = vi.fn();

vi.mock("../../scripts/lakebase/paired-branch.js", () => ({
  createPairedBranch: (...args: unknown[]) => mockCreatePairedBranch(...args),
}));

// Import after the mock is registered.
const conv = await import("../../scripts/lakebase/convention-branches.js");

beforeEach(() => {
  mockCreatePairedBranch.mockReset();
  mockCreatePairedBranch.mockResolvedValue({
    branch: {
      name: "projects/p/branches/feature-x",
      uid: "br-x",
      state: "READY",
      isDefault: false,
    },
    gitBranch: "feature-x",
    gitBranchCreated: true,
    envSynced: true,
    warnings: [],
  });
});

describe("convention-branches paired: defaults", () => {
  it("createFeaturePairedBranch forwards 30d TTL + parent=staging + cwd", async () => {
    await conv.createFeaturePairedBranch({
      instance: "p",
      branch: "feature/x",
      cwd: "/some/project",
    });
    expect(mockCreatePairedBranch).toHaveBeenCalledTimes(1);
    expect(mockCreatePairedBranch.mock.calls[0][0]).toMatchObject({
      instance: "p",
      branch: "feature/x",
      parentBranch: "staging",
      ttl: formatLakebaseTtl(KIT_TIMEOUTS.featureBranchTtlMs),
      cwd: "/some/project",
    });
  });

  it("createTestPairedBranch forwards 14d test TTL + parent=staging", async () => {
    await conv.createTestPairedBranch({
      instance: "p",
      branch: "test/x",
      cwd: "/some/project",
    });
    expect(mockCreatePairedBranch.mock.calls[0][0]).toMatchObject({
      parentBranch: "staging",
      ttl: formatLakebaseTtl(KIT_TIMEOUTS.testBranchTtlMs),
    });
  });

  it("createUatPairedBranch forwards 14d uat TTL + parent=staging", async () => {
    await conv.createUatPairedBranch({
      instance: "p",
      branch: "uat/x",
      cwd: "/some/project",
    });
    expect(mockCreatePairedBranch.mock.calls[0][0]).toMatchObject({
      parentBranch: "staging",
      ttl: formatLakebaseTtl(KIT_TIMEOUTS.uatBranchTtlMs),
    });
  });

  it("createPerfPairedBranch forwards 7d perf TTL + parent=staging", async () => {
    await conv.createPerfPairedBranch({
      instance: "p",
      branch: "perf/x",
      cwd: "/some/project",
    });
    expect(mockCreatePairedBranch.mock.calls[0][0]).toMatchObject({
      parentBranch: "staging",
      ttl: formatLakebaseTtl(KIT_TIMEOUTS.perfBranchTtlMs),
    });
  });

  it("crucially: NONE of the paired helpers set noExpiry (would silently create a tier)", async () => {
    await conv.createFeaturePairedBranch({ instance: "p", branch: "x", cwd: "/x" });
    expect(mockCreatePairedBranch.mock.calls[0][0].noExpiry).toBeUndefined();
    mockCreatePairedBranch.mockClear();

    await conv.createTestPairedBranch({ instance: "p", branch: "x", cwd: "/x" });
    expect(mockCreatePairedBranch.mock.calls[0][0].noExpiry).toBeUndefined();
    mockCreatePairedBranch.mockClear();

    await conv.createUatPairedBranch({ instance: "p", branch: "x", cwd: "/x" });
    expect(mockCreatePairedBranch.mock.calls[0][0].noExpiry).toBeUndefined();
    mockCreatePairedBranch.mockClear();

    await conv.createPerfPairedBranch({ instance: "p", branch: "x", cwd: "/x" });
    expect(mockCreatePairedBranch.mock.calls[0][0].noExpiry).toBeUndefined();
  });
});

describe("convention-branches paired: caller overrides", () => {
  it("ttl override is forwarded as-is (workspace caps override the convention default)", async () => {
    await conv.createFeaturePairedBranch({
      instance: "p",
      branch: "feature/x",
      cwd: "/x",
      ttl: "604800s",
    });
    expect(mockCreatePairedBranch.mock.calls[0][0].ttl).toBe("604800s");
  });

  it("parentBranch override is forwarded as-is", async () => {
    await conv.createFeaturePairedBranch({
      instance: "p",
      branch: "feature/x",
      cwd: "/x",
      parentBranch: "production",
    });
    expect(mockCreatePairedBranch.mock.calls[0][0].parentBranch).toBe("production");
  });

  it("createGitBranch=false + syncEnv=false are forwarded", async () => {
    await conv.createFeaturePairedBranch({
      instance: "p",
      branch: "feature/x",
      cwd: "/x",
      createGitBranch: false,
      syncEnv: false,
    });
    expect(mockCreatePairedBranch.mock.calls[0][0]).toMatchObject({
      createGitBranch: false,
      syncEnv: false,
    });
  });
});
