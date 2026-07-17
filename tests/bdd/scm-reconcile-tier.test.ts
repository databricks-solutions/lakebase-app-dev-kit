// Finding 21 GAP A (FEIP-8050): reconcile a shared TIER branch whose DB is ahead of
// code. Hermetic: the reconcile DECISION + orchestration via injected probe/stamp/drop
// seams (the live alembic stamp + DROP TABLE on a real tier is validated by a live
// drive, not here). Plus the identifier-safety guard and the unsupported-adapter path.

import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  reconcileTierBranch,
  dropBranchTables,
} from "../../scripts/lakebase/scm-reconcile-tier.js";
import { stampSchemaMigration } from "../../scripts/lakebase/schema-migrate.js";
import { resolveSchemaMigrationAdapter } from "../../scripts/lakebase/schema-migration-adapter.js";
import "../../scripts/lakebase/adapters/alembic-adapter.js";

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "reconcile-tier-"));
}

const TIER = { instance: "p", branch: "staging", projectDir: "/proj" };

describe("reconcileTierBranch (Finding 21 GAP A)", () => {
  it("refuses to stamp a tier that is NOT db-ahead (healthy branch, no mutation)", async () => {
    const stamp = vi.fn(async () => ({ stamped: "x" }));
    const drop = vi.fn(async () => []);
    const res = await reconcileTierBranch(
      { ...TIER, toRevision: "rev2" },
      { probe: async () => null, stamp, dropTables: drop },
    );
    expect(res.reconciled).toBe(false);
    expect(res.reason).toMatch(/not ahead of code/);
    expect(stamp).not.toHaveBeenCalled();
    expect(drop).not.toHaveBeenCalled();
  });

  it("drops the named orphan tables and stamps to head when the tier IS db-ahead", async () => {
    const stamp = vi.fn(async (a: { revision: string }) => ({ stamped: a.revision }));
    const drop = vi.fn(async (a: { tables: string[] }) => a.tables);
    const res = await reconcileTierBranch(
      { ...TIER, toRevision: "20260716003518", dropTables: ["stock_adjustments"] },
      { probe: async () => "20260716070934", stamp, dropTables: drop },
    );
    expect(res.reconciled).toBe(true);
    expect(res.wasOrphanedAt).toBe("20260716070934");
    expect(res.stampedTo).toBe("20260716003518");
    expect(res.droppedTables).toEqual(["stock_adjustments"]);
    expect(drop).toHaveBeenCalledOnce();
    expect(stamp).toHaveBeenCalledWith(expect.objectContaining({ branch: "staging", revision: "20260716003518" }));
  });

  it("stamps without dropping when no tables are named", async () => {
    const stamp = vi.fn(async (a: { revision: string }) => ({ stamped: a.revision }));
    const drop = vi.fn(async () => ["should-not-run"]);
    const res = await reconcileTierBranch(
      { ...TIER, toRevision: "rev2" },
      { probe: async () => "phantom", stamp, dropTables: drop },
    );
    expect(res.reconciled).toBe(true);
    expect(res.droppedTables).toEqual([]);
    expect(drop).not.toHaveBeenCalled();
  });

  it("refuses when db-ahead but no target head can be derived (empty migrations, no --to-revision)", async () => {
    const dir = mkTmp(); // no migration files -> localCodeHead undefined
    try {
      const stamp = vi.fn(async () => ({ stamped: "x" }));
      const res = await reconcileTierBranch(
        { instance: "p", branch: "staging", projectDir: dir },
        { probe: async () => "phantom", stamp },
      );
      expect(res.reconciled).toBe(false);
      expect(res.reason).toMatch(/no local migrations/);
      expect(stamp).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("dropBranchTables identifier safety", () => {
  it("refuses an unsafe table identifier BEFORE opening any connection", async () => {
    await expect(
      dropBranchTables({ instance: "p", branch: "staging", projectDir: "/x", tables: ["ok_table", "bad; DROP DATABASE"] }),
    ).rejects.toThrow(/unsafe table identifier/);
  });
});

describe("stampSchemaMigration adapter routing", () => {
  it("the Alembic adapter exposes a stamp method (the supported path)", () => {
    const dir = mkTmp();
    try {
      fs.writeFileSync(path.join(dir, "alembic.ini"), "[alembic]\n");
      const adapter = resolveSchemaMigrationAdapter(dir);
      expect(typeof adapter.stamp).toBe("function");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws for a tool without a stamp (e.g. Knex)", async () => {
    const dir = mkTmp();
    try {
      fs.writeFileSync(path.join(dir, "knexfile.js"), "module.exports = {};\n");
      await expect(
        stampSchemaMigration({ instance: "p", branch: "staging", revision: "head", projectDir: dir, language: "nodejs" }),
      ).rejects.toThrow(/does not support stamp/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
