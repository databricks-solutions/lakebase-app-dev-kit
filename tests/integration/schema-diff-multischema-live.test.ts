// W10 live integration: multi-schema schema diff.
//
// The eval found schema-diff silently empty for objects outside `public`
// because the inventory query hardcoded table_schema='public'. This test
// provisions a Lakebase project, creates an object in a NON-public schema
// (`cfg`), and proves the scoped inventory now sees it:
//   - schema "cfg"   -> includes the cfg object
//   - schema "public" (default) -> does NOT include it (the old behavior)
//   - schema "all"   -> includes it, qualified as cfg.<table>
//
// Gating:
//   LAKEBASE_TEST_E2E=1   must be set; the suite skips otherwise
//   DATABRICKS_HOST       workspace URL to provision against
//   databricks CLI        authenticated to that workspace

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { queryBranchSchema } from "../../scripts/lakebase/branch-schema.js";
import { getConnection } from "../../scripts/lakebase/get-connection.js";
import {
  createLakebaseProject,
  deleteLakebaseProject,
} from "../../scripts/lakebase/lakebase-project.js";
import { getDefaultBranch } from "../../scripts/lakebase/branch-utils.js";

const E2E = process.env.LAKEBASE_TEST_E2E === "1";
const DATABRICKS_HOST = process.env.DATABRICKS_HOST ?? "";

function hasCmd(cmd: string): boolean {
  return spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;
}
const RUN_SUITE = E2E && !!DATABRICKS_HOST && (E2E ? hasCmd("databricks") : false);

describe.skipIf(!RUN_SUITE)(
  "schema diff – non-public schema (live, freshly-provisioned project)",
  () => {
    let projectId: string;
    let branchName: string;
    const tableName = `w10_probe_${Date.now()}`;

    beforeAll(async () => {
      projectId = `w10-multischema-${Date.now()}`;
      console.log(`  [setup] creating Lakebase project ${projectId} on ${DATABRICKS_HOST}`);
      await createLakebaseProject({ projectId, host: DATABRICKS_HOST });

      const dflt = await getDefaultBranch({ instance: projectId, host: DATABRICKS_HOST });
      if (!dflt) throw new Error(`Project ${projectId} has no default branch after creation.`);
      branchName = (dflt.name ?? "").split("/branches/").pop() ?? dflt.uid;
      console.log(`  [setup] default branch: ${branchName}`);

      // Create a table in a NON-public schema.
      const pool = await getConnection({ output: "pool", instance: projectId, branch: branchName });
      try {
        await pool.query("CREATE SCHEMA IF NOT EXISTS cfg");
        await pool.query(`CREATE TABLE cfg.${tableName} (id int primary key, label text)`);
      } finally {
        await pool.end();
      }
    }, 240_000);

    afterAll(async () => {
      if (projectId) {
        try {
          const pool = await getConnection({ output: "pool", instance: projectId, branch: branchName });
          await pool.query("DROP SCHEMA IF EXISTS cfg CASCADE");
          await pool.end();
        } catch {
          /* project delete removes everything anyway */
        }
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await deleteLakebaseProject({ projectId, host: DATABRICKS_HOST });
            console.log(`  [teardown] deleted Lakebase project ${projectId}`);
            break;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (/not.?found/i.test(msg)) break;
            if (attempt === 3) {
              console.error(`  [teardown] FAILED to delete ${projectId}: ${msg}`);
              console.error(`  [teardown] clean up manually: databricks postgres delete-project ${projectId}`);
            } else {
              await new Promise((r) => setTimeout(r, 5_000 * attempt));
            }
          }
        }
      }
    }, 240_000);

    it("schema 'cfg' inventories the cfg table (the eval's empty-diff bug, fixed)", async () => {
      const tables = await queryBranchSchema({ instance: projectId, branch: branchName, schema: "cfg" });
      expect(tables.map((t) => t.name)).toContain(tableName);
    }, 60_000);

    it("default (public) scope does NOT see the cfg table (old hardcoded behavior)", async () => {
      const tables = await queryBranchSchema({ instance: projectId, branch: branchName });
      expect(tables.map((t) => t.name)).not.toContain(tableName);
    }, 60_000);

    it("schema 'all' sees the cfg table, qualified as cfg.<table>", async () => {
      const tables = await queryBranchSchema({ instance: projectId, branch: branchName, schema: "all" });
      expect(tables.map((t) => t.name)).toContain(`cfg.${tableName}`);
    }, 60_000);
  },
);

describe.skipIf(RUN_SUITE)("schema-diff multi-schema – skip-when-env-missing", () => {
  it("documents the skip reason", () => {
    // eslint-disable-next-line no-console
    console.log("LAKEBASE_TEST_E2E/DATABRICKS_HOST/databricks CLI not all present – W10 live suite skipped.");
    expect(RUN_SUITE).toBe(false);
  });
});
