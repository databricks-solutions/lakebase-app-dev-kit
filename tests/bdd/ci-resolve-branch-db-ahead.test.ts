// Finding 21 GAP B (FEIP-8050): a reused ci-pr-<N> whose source parentage is
// correct still rode inherited pollution through, if the ci-pr was FIRST cut while
// its source tier (staging) carried a phantom alembic_version / orphan table, the
// VERIFIED reuse kept that pollution even after the source tier was reconciled, so
// CI re-failed with the same "Can't locate revision". resolveCiBranch now probes a
// reused ci-pr for db-ahead-of-code (--reset-on-db-ahead) and re-forks from the
// now-clean source when orphaned.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockListBranches = vi.fn();
const mockGetBranchByName = vi.fn();
const mockGetDefaultBranch = vi.fn();
const mockCreateBranch = vi.fn();
const mockDeleteBranch = vi.fn();
const mockGetEndpoint = vi.fn();
const mockEnsureEndpoint = vi.fn();
const mockGetCredential = vi.fn();

vi.mock("../../scripts/lakebase/branch-utils.js", () => ({
  listBranches: (a: unknown) => mockListBranches(a),
  getBranchByName: (n: unknown, a: unknown) => mockGetBranchByName(n, a),
  getDefaultBranch: (a: unknown) => mockGetDefaultBranch(a),
}));
vi.mock("../../scripts/lakebase/branch-create.js", () => ({
  createBranch: (a: unknown) => mockCreateBranch(a),
}));
vi.mock("../../scripts/lakebase/branch-delete.js", () => ({
  deleteBranch: (a: unknown) => mockDeleteBranch(a),
}));
vi.mock("../../scripts/lakebase/branch-endpoint.js", () => ({
  getEndpoint: (a: unknown) => mockGetEndpoint(a),
  ensureEndpoint: (a: unknown) => mockEnsureEndpoint(a),
  getCredential: (a: unknown) => mockGetCredential(a),
}));

const { resolveCiBranch } = await import("../../scripts/lakebase/ci-resolve-branch.js");

const CI = "ci-pr-2";
function branches() {
  return [
    { name: "p/branches/ci-pr-2", uid: "u-ci", sourceBranchId: "staging" },
    { name: "p/branches/staging", uid: "u-staging" },
    { name: "p/branches/main", uid: "u-main", isDefault: true },
  ];
}

beforeEach(() => {
  for (const m of [
    mockListBranches, mockGetBranchByName, mockGetDefaultBranch,
    mockCreateBranch, mockDeleteBranch, mockGetEndpoint, mockEnsureEndpoint, mockGetCredential,
  ]) m.mockReset();
  mockListBranches.mockResolvedValue(branches());
  mockGetEndpoint.mockResolvedValue({ host: "h.example.com" });
  mockGetCredential.mockResolvedValue({ token: "tok", email: "user@example.com" });
  mockCreateBranch.mockResolvedValue(undefined);
  mockDeleteBranch.mockResolvedValue(undefined);
});

describe("resolveCiBranch --reset-on-db-ahead (Finding 21 GAP B)", () => {
  it("re-forks a reused ci-pr when its DB is ahead of code (orphan revision)", async () => {
    // The reused branch verifies its parentage (staging), but the injected probe
    // finds a phantom revision -> delete + re-fork from staging.
    const probe = vi.fn(async () => "20260716070934");
    // waitUntilDeleted sees the branch gone; waitUntilReady sees the re-fork READY.
    mockGetBranchByName
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ name: CI, uid: "u-ci2", state: "READY" });

    const r = await resolveCiBranch({
      instance: "p",
      lakebaseName: CI,
      createFrom: "staging",
      recreateOnSourceMismatch: true,
      resetOnDbAhead: true,
      ensureEndpoint: true,
      checkBranchDbAheadOfCode: probe,
      projectDir: "/proj",
    });

    expect(probe).toHaveBeenCalledOnce();
    expect(r.status).toBe("RECREATED_DB_AHEAD");
    expect(mockDeleteBranch).toHaveBeenCalledOnce();
    expect(mockCreateBranch).toHaveBeenCalledOnce();
    // Re-forked from the correct (now-clean) source.
    expect(mockCreateBranch.mock.calls[0][0]).toMatchObject({ parentBranch: "staging" });
  });

  it("keeps a reused ci-pr as VERIFIED when its DB is NOT ahead of code", async () => {
    const probe = vi.fn(async () => null);
    const r = await resolveCiBranch({
      instance: "p",
      lakebaseName: CI,
      createFrom: "staging",
      recreateOnSourceMismatch: true,
      resetOnDbAhead: true,
      ensureEndpoint: true,
      checkBranchDbAheadOfCode: probe,
      projectDir: "/proj",
    });
    expect(probe).toHaveBeenCalledOnce();
    expect(r.status).toBe("VERIFIED");
    expect(mockDeleteBranch).not.toHaveBeenCalled();
    expect(mockCreateBranch).not.toHaveBeenCalled();
  });

  it("does not probe when --reset-on-db-ahead is off (back-compat)", async () => {
    const probe = vi.fn(async () => "orphan");
    const r = await resolveCiBranch({
      instance: "p",
      lakebaseName: CI,
      createFrom: "staging",
      recreateOnSourceMismatch: true,
      ensureEndpoint: true,
      checkBranchDbAheadOfCode: probe,
    });
    expect(probe).not.toHaveBeenCalled();
    expect(r.status).toBe("VERIFIED");
  });

  it("a probe failure never blocks CI (best-effort): stays VERIFIED", async () => {
    const probe = vi.fn(async () => { throw new Error("branch unreachable"); });
    const r = await resolveCiBranch({
      instance: "p",
      lakebaseName: CI,
      createFrom: "staging",
      recreateOnSourceMismatch: true,
      resetOnDbAhead: true,
      ensureEndpoint: true,
      checkBranchDbAheadOfCode: probe,
    });
    expect(r.status).toBe("VERIFIED");
    expect(mockDeleteBranch).not.toHaveBeenCalled();
  });
});
