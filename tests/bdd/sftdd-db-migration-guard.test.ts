// FEIP-8039: an aborted build ran alembic upgrade against a paired Lakebase
// branch, and later a re-cut feature reused that same stale branch with the
// applied table + a stray alembic_version whose migration file was git-reset
// away, so accept/deploy/promote alembic steps failed "Can't locate revision".
//
// Hermetic slice (prevention + detection primitives):
//   - a build/experiment migration REFUSES a protected-tier target branch
//     (opt-in allowTier for the promote path that migrates the parent tier by design);
//   - dbRevisionOrphaned: the DB's applied revision has no local migration file (DB ahead);
//   - parseAlembicMissingRevision: recover the orphan rev id from alembic's error.
// (The live recover , reset the polluted branch + a re-cut refuse , lands with a smoke.)

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertMigrationBranchAllowed,
  TierMigrationRefusedError,
  dbRevisionOrphaned,
  parseAlembicMissingRevision,
  applySchemaMigrations,
} from "../../scripts/lakebase/schema-migrate.js";

describe("assertMigrationBranchAllowed (FEIP-8039)", () => {
  for (const tier of ["staging", "dev", "main", "master"]) {
    it(`refuses a protected tier "${tier}" for a build/experiment migration`, () => {
      expect(() => assertMigrationBranchAllowed(tier, {})).toThrow(TierMigrationRefusedError);
    });
  }
  it("allows a protected tier when allowTier is set (the promote path migrates the parent tier by design)", () => {
    expect(() => assertMigrationBranchAllowed("staging", { allowTier: true })).not.toThrow();
  });
  it("allows a feature or experiment branch", () => {
    expect(() => assertMigrationBranchAllowed("feature-f2-adjust-stock", {})).not.toThrow();
    expect(() => assertMigrationBranchAllowed("experiment-s1-exp1", {})).not.toThrow();
  });
  it("honors a project-configured extra tier via LAKEBASE_TIER_NAMES", () => {
    expect(() => assertMigrationBranchAllowed("qa", {}, { LAKEBASE_TIER_NAMES: "qa" })).toThrow(
      TierMigrationRefusedError,
    );
  });
});

describe("applySchemaMigrations refuses a protected tier before touching the DB (FEIP-8039)", () => {
  let proj: string;
  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), "db-guard-"));
  });
  afterEach(() => {
    rmSync(proj, { recursive: true, force: true });
  });
  it("rejects with TierMigrationRefusedError for branch=staging with no allowTier (no DB call)", async () => {
    await expect(
      applySchemaMigrations({ instance: "inst-x", branch: "staging", projectDir: proj }),
    ).rejects.toBeInstanceOf(TierMigrationRefusedError);
  });
});

describe("dbRevisionOrphaned (FEIP-8039)", () => {
  it("true when the applied DB revision has no local migration file (DB ahead of code)", () => {
    expect(dbRevisionOrphaned("20260716070934", ["20260716003518"])).toBe(true);
  });
  it("false when the applied revision has a local file", () => {
    expect(dbRevisionOrphaned("20260716003518", ["20260716003518", "20260101000000"])).toBe(false);
  });
  it("false for a fresh / unstamped DB (no applied revision)", () => {
    expect(dbRevisionOrphaned(null, ["20260716003518"])).toBe(false);
    expect(dbRevisionOrphaned("", ["20260716003518"])).toBe(false);
  });
});

describe("parseAlembicMissingRevision (FEIP-8039)", () => {
  it("extracts the orphan revision id from alembic's \"Can't locate revision\" error", () => {
    const stderr = "ERROR [alembic.util.messaging] Can't locate revision identified by '20260716070934'";
    expect(parseAlembicMissingRevision(stderr)).toBe("20260716070934");
  });
  it("returns null for an unrelated error", () => {
    expect(parseAlembicMissingRevision("sqlalchemy: connection refused")).toBeNull();
  });
});
