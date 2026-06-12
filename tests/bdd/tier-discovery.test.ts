import { describe, it, expect } from "vitest";
import {
  isTier,
  tierBranchNames,
  isLongRunningTierBranch,
  DEFAULT_PROTECTED_TIER_NAMES,
  resolveProtectedTierNames,
  protectedTierNamesFromEnv,
} from "../../scripts/lakebase/branch-utils.js";
import type { LakebaseBranchInfo } from "../../scripts/lakebase/branch-utils.js";
import { asBranchUid, asBranchName } from "../../scripts/lakebase/branch-id.js";

// Sample branch list mirroring what listBranches() returns for a project
// with one default branch + two long-running tiers (no expireTime) +
// two feature branches (one with TTL, one bare). Tiers are no_expiry by
// convention; features carry a TTL or were created with default
// expiration. The default branch is also excluded.
function fixture(): LakebaseBranchInfo[] {
  return [
    {
      uid: asBranchUid("br-prod-uid"),
      nameLeaf: asBranchName("production"),
      name: "projects/p1/branches/production",
      state: "READY",
      isDefault: true,
    },
    {
      uid: asBranchUid("br-staging-uid"),
      nameLeaf: asBranchName("staging"),
      name: "projects/p1/branches/staging",
      state: "READY",
      isDefault: false,
      // No expireTime: created via createLongRunningBranch (no_expiry: true)
    },
    {
      uid: asBranchUid("br-uat-uid"),
      nameLeaf: asBranchName("uat"),
      name: "projects/p1/branches/uat",
      state: "READY",
      isDefault: false,
      // No expireTime: long-running tier
    },
    {
      uid: asBranchUid("br-feature-x-uid"),
      nameLeaf: asBranchName("feature-x"),
      name: "projects/p1/branches/feature-x",
      state: "READY",
      isDefault: false,
      expireTime: "2026-06-30T00:00:00Z",
    },
    {
      uid: asBranchUid("br-demo-feature-uid"),
      nameLeaf: asBranchName("demo-feature"),
      name: "projects/p1/branches/demo-feature",
      state: "READY",
      isDefault: false,
      expireTime: "2026-07-15T12:00:00Z",
    },
  ];
}

describe("isLongRunningTierBranch", () => {
  it("returns true for non-default branches with no expireTime", () => {
    const branches = fixture();
    const staging = branches.find((b) => b.nameLeaf === "staging")!;
    const uat = branches.find((b) => b.nameLeaf === "uat")!;
    expect(isLongRunningTierBranch(staging)).toBe(true);
    expect(isLongRunningTierBranch(uat)).toBe(true);
  });

  it("returns false for the default branch even when expireTime is absent", () => {
    const prod = fixture().find((b) => b.isDefault)!;
    expect(isLongRunningTierBranch(prod)).toBe(false);
  });

  it("returns false for non-default branches that carry an expireTime (feature branches)", () => {
    const branches = fixture();
    const feature = branches.find((b) => b.nameLeaf === "feature-x")!;
    const demoFeature = branches.find((b) => b.nameLeaf === "demo-feature")!;
    expect(isLongRunningTierBranch(feature)).toBe(false);
    expect(isLongRunningTierBranch(demoFeature)).toBe(false);
  });
});

describe("isTier", () => {
  it("returns true for a long-running branch whose name is in the protected set", () => {
    const branches = fixture();
    expect(isTier("staging", branches)).toBe(true);
  });

  it("returns false for a long-running branch with an off-convention name (the new rule)", () => {
    // uat IS long-running here, but it is NOT in the default protected set,
    // so by default it is treated as an ordinary branch, not a tier.
    const branches = fixture();
    expect(isTier("uat", branches)).toBe(false);
  });

  it("protects an off-default name when it is supplied via the per-project set", () => {
    const branches = fixture();
    const names = resolveProtectedTierNames(["uat"]);
    expect(isTier("uat", branches, names)).toBe(true);
    // staging stays protected (still in the default base).
    expect(isTier("staging", branches, names)).toBe(true);
  });

  it("returns false for feature branches even though they're non-default", () => {
    // Reproduces the follow-up bug: feature-x and demo-feature
    // are non-default Lakebase branches, but they carry an expireTime
    // (created with TTL) so they're NOT tiers.
    const branches = fixture();
    expect(isTier("feature-x", branches)).toBe(false);
    expect(isTier("demo-feature", branches)).toBe(false);
  });

  it("returns false for the default branch", () => {
    const branches = fixture();
    expect(isTier("production", branches)).toBe(false);
  });

  it("returns false for unknown names", () => {
    const branches = fixture();
    expect(isTier("does-not-exist", branches)).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(isTier("", fixture())).toBe(false);
  });

  it("returns false for empty branch list", () => {
    expect(isTier("staging", [])).toBe(false);
  });

  it("matches by exact branchId leaf, not substring", () => {
    const branches = fixture();
    expect(isTier("stag", branches)).toBe(false);
    expect(isTier("staging-2", branches)).toBe(false);
  });
});

describe("tierBranchNames", () => {
  it("returns only long-running branches whose name is in the protected set (default base)", () => {
    // staging is in the default set; uat is long-running but off-convention,
    // so it is excluded by default (treated as an ordinary branch).
    const names = tierBranchNames(fixture()).sort();
    expect(names).toEqual(["staging"]);
  });

  it("includes an off-default long-running name when supplied via the per-project set", () => {
    const names = tierBranchNames(fixture(), resolveProtectedTierNames(["uat"])).sort();
    expect(names).toEqual(["staging", "uat"]);
  });

  it("excludes the default branch", () => {
    expect(tierBranchNames(fixture())).not.toContain("production");
  });

  it("excludes feature branches that carry an expireTime", () => {
    const names = tierBranchNames(fixture());
    expect(names).not.toContain("feature-x");
    expect(names).not.toContain("demo-feature");
  });

  it("returns [] when every branch is default (degenerate case)", () => {
    const onlyDefault: LakebaseBranchInfo[] = [
      {
        uid: asBranchUid("br-only-default-uid"),
        nameLeaf: asBranchName("main"),
        name: "projects/p/branches/main",
        state: "READY",
        isDefault: true,
      },
    ];
    expect(tierBranchNames(onlyDefault)).toEqual([]);
  });

  it("returns [] when the list is empty", () => {
    expect(tierBranchNames([])).toEqual([]);
  });

  it("returns [] when every non-default branch carries an expireTime (all features)", () => {
    const allFeatures: LakebaseBranchInfo[] = [
      {
        uid: asBranchUid("br-default-uid"),
        nameLeaf: asBranchName("production"),
        name: "projects/p/branches/production",
        state: "READY",
        isDefault: true,
      },
      {
        uid: asBranchUid("br-feature-a-uid"),
        nameLeaf: asBranchName("feature-a"),
        name: "projects/p/branches/feature-a",
        state: "READY",
        isDefault: false,
        expireTime: "2026-06-15T00:00:00Z",
      },
    ];
    expect(tierBranchNames(allFeatures)).toEqual([]);
  });
});

describe("protected tier-name set (named AND long-running)", () => {
  it("ships the canonical default hierarchy", () => {
    expect([...DEFAULT_PROTECTED_TIER_NAMES].sort()).toEqual(
      ["dev", "main", "master", "staging"],
    );
  });

  it("resolveProtectedTierNames unions the default with normalized extras", () => {
    const names = resolveProtectedTierNames([" QA ", "Demo", "staging"]);
    expect(names.has("qa")).toBe(true); // trimmed + lowercased
    expect(names.has("demo")).toBe(true);
    expect(names.has("staging")).toBe(true); // still present (no dup)
    expect(names.has("dev")).toBe(true); // default retained
  });

  it("resolveProtectedTierNames ignores blank extras", () => {
    const names = resolveProtectedTierNames(["", "   "]);
    expect([...names].sort()).toEqual(["dev", "main", "master", "staging"]);
  });

  it("protectedTierNamesFromEnv reads LAKEBASE_TIER_NAMES + configured trunk/staging/base", () => {
    const names = protectedTierNamesFromEnv({
      LAKEBASE_TIER_NAMES: "qa, demo ,",
      LAKEBASE_STAGING_BRANCH: "stg",
      LAKEBASE_BASE_BRANCH: "integration",
      LAKEBASE_TRUNK_BRANCH: "trunk",
    });
    for (const n of ["qa", "demo", "stg", "integration", "trunk", "staging", "dev", "main", "master"]) {
      expect(names.has(n)).toBe(true);
    }
  });

  it("protectedTierNamesFromEnv with no extras is exactly the default set", () => {
    expect([...protectedTierNamesFromEnv({})].sort()).toEqual(
      ["dev", "main", "master", "staging"],
    );
  });
});
