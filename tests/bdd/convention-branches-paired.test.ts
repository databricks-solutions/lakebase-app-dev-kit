// Hermetic coverage for the per-tier-type PAIRED helpers.
//
// createTestPairedBranch / createUatPairedBranch / createPerfPairedBranch
// forward their convention TTL + parent into createPairedBranch.
//
// FEATURE branches are the exception: they are created NON-EXPIRING (noExpiry,
// no TTL). A feature branch hosts the per-story experiment child branches
//, and Lakebase forbids an expiring branch from having children
// ("Branches with an expiration date cannot have child branches", surfaced by
// the live TDD-workflow smoke). Feature branches are reaped by the SCM workflow
// (abandon / merge / doctor call deleteBranch), not by TTL, deletion of a
// no-expiry branch through the substrate is confirmed.

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
  it("createFeaturePairedBranch forwards noExpiry (NO ttl) + parent=staging + cwd", async () => {
    await conv.createFeaturePairedBranch({
      instance: "p",
      branch: "feature/x",
      cwd: "/some/project",
    });
    expect(mockCreatePairedBranch).toHaveBeenCalledTimes(1);
    const call = mockCreatePairedBranch.mock.calls[0][0];
    expect(call).toMatchObject({
      instance: "p",
      branch: "feature/x",
      parentBranch: "staging",
      noExpiry: true,
      cwd: "/some/project",
    });
    // Must NOT carry a TTL: an expiring feature branch cannot parent the
    // per-story experiment branches.
    expect(call.ttl).toBeUndefined();
  });

  it("createFeaturePairedBranch still honors an explicit ttl override (noExpiry then omitted)", async () => {
    await conv.createFeaturePairedBranch({ instance: "p", branch: "feature/y", ttl: "3600s", cwd: "/some/project" });
    const call = mockCreatePairedBranch.mock.calls[0][0];
    expect(call.ttl).toBe("3600s");
    expect(call.noExpiry).toBeUndefined();
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

  it("only the FEATURE helper sets noExpiry; test/uat/perf stay finite-TTL", async () => {
    // Feature branches are non-expiring (they parent per-story experiments).
    await conv.createFeaturePairedBranch({ instance: "p", branch: "x", cwd: "/x" });
    expect(mockCreatePairedBranch.mock.calls[0][0].noExpiry).toBe(true);
    expect(mockCreatePairedBranch.mock.calls[0][0].ttl).toBeUndefined();
    mockCreatePairedBranch.mockClear();

    // test / uat / perf are finite-lifetime tiers: TTL, never noExpiry.
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
