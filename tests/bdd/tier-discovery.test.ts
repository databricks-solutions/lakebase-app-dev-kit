import { describe, it, expect } from "vitest";
import { isTier, tierBranchNames } from "../../scripts/lakebase/branch-utils.js";
import type { LakebaseBranchInfo } from "../../scripts/lakebase/branch-utils.js";
import { asBranchUid, asBranchName } from "../../scripts/lakebase/branch-id.js";

// Sample branch list mirroring what listBranches() returns for a project
// with one default branch + multiple long-running tiers + one feature.
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
    },
    {
      uid: asBranchUid("br-uat-uid"),
      nameLeaf: asBranchName("uat"),
      name: "projects/p1/branches/uat",
      state: "READY",
      isDefault: false,
    },
    {
      uid: asBranchUid("br-feature-uid"),
      nameLeaf: asBranchName("feature-x"),
      name: "projects/p1/branches/feature-x",
      state: "READY",
      isDefault: false,
    },
  ];
}

describe("isTier", () => {
  it("returns true for any non-default Lakebase branch name", () => {
    const branches = fixture();
    expect(isTier("staging", branches)).toBe(true);
    expect(isTier("uat", branches)).toBe(true);
    // Feature branches are also non-default in the list. The hook treats
    // tier-vs-feature on raw git branch name; sanitize is the caller's
    // responsibility (intentionally – matches post-checkout.sh).
    expect(isTier("feature-x", branches)).toBe(true);
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
    // 'stag' is a prefix of 'staging' but not an exact match
    expect(isTier("stag", branches)).toBe(false);
    expect(isTier("staging-2", branches)).toBe(false);
  });
});

describe("tierBranchNames", () => {
  it("returns every non-default branchId leaf", () => {
    const names = tierBranchNames(fixture()).sort();
    expect(names).toEqual(["feature-x", "staging", "uat"]);
  });

  it("excludes the default branch", () => {
    expect(tierBranchNames(fixture())).not.toContain("production");
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
});
