// Live integration test for the Knex migrate runner.
// The runner was a stub in the original primitives lift (FEIP-7091);
// slice 3 of FEIP-7210 promoted it to a real shell-out implementation
// and this suite exercises the full lifecycle against real Lakebase.
//
// Provisions its own Lakebase project on the configured Databricks
// workspace, scaffolds a Knex-style Node.js project layout (knexfile.js
// + two migrations), installs knex + pg locally so `npx --no-install`
// can find them, then exercises the full apply / status / rollback /
// re-apply lifecycle against the default branch.
//
// Unlike Flyway, Knex supports rollback natively, so this test covers
// the round trip: apply -> verify tables exist -> rollback --all ->
// verify tables gone -> re-apply.
//
// Gating:
//   LAKEBASE_TEST_E2E=1          must be set; the suite skips otherwise
//   DATABRICKS_HOST              workspace URL to provision against
//   databricks CLI               authenticated to that workspace
//   npm + npx                    on PATH (used to install knex locally)
//   node                         on PATH (used by npx to run knex)

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  applyMigrations,
  listMigrations,
  migrationStatus,
  rollbackMigration,
} from "../../scripts/lakebase/migrate.js";
import { getConnection } from "../../scripts/lakebase/get-connection.js";
import {
  createLakebaseProject,
  deleteLakebaseProject,
} from "../../scripts/lakebase/lakebase-project.js";
import { getDefaultBranch } from "../../scripts/lakebase/branch-utils.js";

const E2E = process.env.LAKEBASE_TEST_E2E === "1";
const DATABRICKS_HOST = process.env.DATABRICKS_HOST ?? "";

function hasCmd(cmd: string): boolean {
  const res = spawnSync(cmd, ["--version"], { stdio: "ignore" });
  return res.status === 0;
}

const DATABRICKS_AVAILABLE = E2E ? hasCmd("databricks") : false;
const NPM_AVAILABLE = E2E ? hasCmd("npm") : false;
const NPX_AVAILABLE = E2E ? hasCmd("npx") : false;
const NODE_AVAILABLE = E2E ? hasCmd("node") : false;

const RUN_SUITE =
  E2E && DATABRICKS_HOST && DATABRICKS_AVAILABLE && NPM_AVAILABLE && NPX_AVAILABLE && NODE_AVAILABLE;

describe.skipIf(!RUN_SUITE)(
  "migrate live (knex against a freshly-provisioned Lakebase project)",
  () => {
    let projectDir: string;
    let projectId: string;
    let branchName: string;
    const usersTable = `users_${Date.now()}`;
    const ordersTable = `orders_${Date.now()}`;

    beforeAll(async () => {
      projectId = `migrate-7099-${Date.now()}`;
      projectDir = fs.mkdtempSync(path.join(os.tmpdir(), `migrate-knex-live-${projectId}-`));
      scaffoldKnexProject(projectDir, usersTable, ordersTable);

      console.log(`  [setup] installing knex + pg in ${projectDir} (this can take ~30s)`);
      const install = spawnSync("npm", ["install", "--silent", "--no-audit", "--no-fund", "knex@^3", "pg@^8"], {
        cwd: projectDir,
        stdio: "inherit",
      });
      if (install.status !== 0) {
        throw new Error(`npm install failed with code ${install.status}`);
      }

      console.log(`  [setup] creating Lakebase project ${projectId} on ${DATABRICKS_HOST}`);
      await createLakebaseProject({ projectId, host: DATABRICKS_HOST });

      const dflt = await getDefaultBranch({ instance: projectId, host: DATABRICKS_HOST });
      if (!dflt) {
        throw new Error(
          `Project ${projectId} has no default branch after creation. Check workspace + permissions.`
        );
      }
      const fullName = dflt.name ?? "";
      branchName = fullName.split("/branches/").pop() ?? dflt.uid;
      console.log(`  [setup] default branch: ${branchName}`);
    }, 240_000);

    afterAll(async () => {
      if (projectId) {
        try {
          const pool = await getConnection({
            output: "pool",
            instance: projectId,
            branch: branchName,
          });
          await pool.query(`DROP TABLE IF EXISTS ${ordersTable}`);
          await pool.query(`DROP TABLE IF EXISTS ${usersTable}`);
          await pool.query(`DROP TABLE IF EXISTS knex_migrations`);
          await pool.query(`DROP TABLE IF EXISTS knex_migrations_lock`);
          await pool.end();
        } catch {
          // Best effort; project delete below removes everything anyway.
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
              console.error(
                `  [teardown] clean up manually: databricks postgres delete-project ${projectId}`
              );
            } else {
              await new Promise((r) => setTimeout(r, 5_000 * attempt));
            }
          }
        }
      }
      fs.rmSync(projectDir, { recursive: true, force: true });
    }, 240_000);

    it("listMigrations enumerates both scaffolded migrations in apply order", () => {
      const files = listMigrations({ projectDir });
      expect(files).toHaveLength(2);
      expect(files[0].tool).toBe("knex");
      expect(files[0].description.toLowerCase()).toContain("users");
      expect(files[1].description.toLowerCase()).toContain("orders");
    });

    it("migrationStatus reports current=undefined and two pending before apply", async () => {
      const status = await migrationStatus({
        instance: projectId,
        branch: branchName,
        projectDir,
      });
      expect(status.tool).toBe("knex");
      expect(status.current).toBeUndefined();
      expect(status.pending).toHaveLength(2);
    }, 60_000);

    it("applyMigrations applies both migrations; tables exist in DB", async () => {
      const result = await applyMigrations({
        instance: projectId,
        branch: branchName,
        projectDir,
      });
      expect(result.tool).toBe("knex");
      expect(result.alreadyAtLatest).toBe(false);
      expect(result.applied).toHaveLength(2);

      const pool = await getConnection({
        output: "pool",
        instance: projectId,
        branch: branchName,
      });
      try {
        const u = await pool.query(`SELECT to_regclass($1) AS oid`, [usersTable]);
        expect(u.rows[0].oid).not.toBeNull();
        const o = await pool.query(`SELECT to_regclass($1) AS oid`, [ordersTable]);
        expect(o.rows[0].oid).not.toBeNull();
      } finally {
        await pool.end();
      }
    }, 180_000);

    it("migrationStatus reports a current version and no pending after apply", async () => {
      const status = await migrationStatus({
        instance: projectId,
        branch: branchName,
        projectDir,
      });
      expect(status.current).toBeDefined();
      expect(status.pending).toHaveLength(0);
    }, 60_000);

    it("applyMigrations is idempotent: second call reports alreadyAtLatest", async () => {
      const result = await applyMigrations({
        instance: projectId,
        branch: branchName,
        projectDir,
      });
      expect(result.alreadyAtLatest).toBe(true);
      expect(result.applied).toEqual([]);
    }, 60_000);

    it("rollbackMigration with target='all' rolls back both migrations; tables dropped", async () => {
      const result = await rollbackMigration({
        instance: projectId,
        branch: branchName,
        projectDir,
        target: "all",
      });
      expect(result.tool).toBe("knex");
      expect(result.rolledBack).toHaveLength(2);

      const pool = await getConnection({
        output: "pool",
        instance: projectId,
        branch: branchName,
      });
      try {
        const u = await pool.query(`SELECT to_regclass($1) AS oid`, [usersTable]);
        expect(u.rows[0].oid).toBeNull();
        const o = await pool.query(`SELECT to_regclass($1) AS oid`, [ordersTable]);
        expect(o.rows[0].oid).toBeNull();
      } finally {
        await pool.end();
      }
    }, 180_000);

    it("re-apply after rollback restores both tables (round-trip lifecycle works)", async () => {
      const result = await applyMigrations({
        instance: projectId,
        branch: branchName,
        projectDir,
      });
      expect(result.alreadyAtLatest).toBe(false);
      expect(result.applied).toHaveLength(2);

      const pool = await getConnection({
        output: "pool",
        instance: projectId,
        branch: branchName,
      });
      try {
        const u = await pool.query(`SELECT to_regclass($1) AS oid`, [usersTable]);
        expect(u.rows[0].oid).not.toBeNull();
        const o = await pool.query(`SELECT to_regclass($1) AS oid`, [ordersTable]);
        expect(o.rows[0].oid).not.toBeNull();
      } finally {
        await pool.end();
      }
    }, 180_000);
  }
);

/**
 * Scaffold a Knex-compatible project: package.json (so detectLanguage()
 * returns "nodejs"), knexfile.js that reads DATABASE_URL, and two
 * migrations under ./migrations that create the named users + orders
 * tables. The Lakebase project name is timestamped so concurrent runs
 * don't collide on table names.
 */
function scaffoldKnexProject(dir: string, usersTable: string, ordersTable: string): void {
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "knex-live-fixture", version: "0.0.1", private: true }, null, 2) + "\n"
  );

  fs.writeFileSync(
    path.join(dir, "knexfile.js"),
    `module.exports = {
  client: "pg",
  connection: process.env.DATABASE_URL,
  migrations: { directory: "./migrations" },
};
`
  );

  const migrationsDir = path.join(dir, "migrations");
  fs.mkdirSync(migrationsDir, { recursive: true });

  // Knex apply order is timestamp-ascending. Stamp the two files apart
  // so they sort deterministically even when generated in the same ms.
  fs.writeFileSync(
    path.join(migrationsDir, `20260101000000_create_${usersTable}.js`),
    `exports.up = function (knex) {
  return knex.schema.createTable("${usersTable}", (t) => {
    t.increments("id").primary();
    t.string("email", 255).notNullable().unique();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("${usersTable}");
};
`
  );

  fs.writeFileSync(
    path.join(migrationsDir, `20260102000000_create_${ordersTable}.js`),
    `exports.up = function (knex) {
  return knex.schema.createTable("${ordersTable}", (t) => {
    t.increments("id").primary();
    t.integer("user_id").notNullable().references("id").inTable("${usersTable}");
    t.integer("total_cents").notNullable();
    t.timestamp("placed_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};
exports.down = function (knex) {
  return knex.schema.dropTableIfExists("${ordersTable}");
};
`
  );
}
