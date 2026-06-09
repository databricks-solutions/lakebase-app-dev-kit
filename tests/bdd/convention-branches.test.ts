// Hermetic coverage for the convention-branches module.
//
// The Lakebase-ONLY tier creators (createFeatureBranch / createTestBranch /
// createUatBranch / createPerfBranch) were DELETED: they made a Lakebase branch
// with no git branch + no .env sync, which violates the kit's one rule (every
// branch is paired through the substrate). The PAIRED tier creators
// (createFeaturePairedBranch / ...) are the only branch-creation path and are
// covered in convention-branches-paired.test.ts. What remains here is the
// shared tier metadata both layers read from.

import { describe, it, expect } from "vitest";
import * as conv from "../../scripts/lakebase/convention-branches.js";

describe("CONVENTION_TIER_DEFAULTS exposes tier metadata", () => {
  it("declares all four tiers with parentBranch + ttl", () => {
    for (const tier of ["feature", "test", "uat", "perf"] as const) {
      const d = conv.CONVENTION_TIER_DEFAULTS[tier];
      expect(d.parentBranch).toBe("staging");
      expect(d.ttl).toMatch(/^\d+s$/);
    }
  });
});
