// Live integration test for the SCM workflow CLIs with a real Knex
// migration round-trip on a Nodejs-language project.
//
// Sibling to scm-workflow-e2e-live.test.ts (alembic/Python) and
// scm-workflow-flyway-live.test.ts (flyway/Java). All three share
// the driver in _helpers/scm-workflow-migration-fixture.ts.
//
// What this file specifically proves:
//   1. A new Knex migration committed in the feature branch is
//      applied to the ci-pr-N Lakebase branch during wait-ci (proven
//      by querying the branch's public schema for the marker table).
//   2. The same migration is then applied to the parent branch
//      (staging) during merge --wait-migrate (proven by querying
//      staging's schema).
//   3. The JDK probe step is SKIPPED on a Nodejs project (the
//      probe is gated on lang == 'java'). This is the live
//      regression assertion against the scaffold bug where
//      setup-java ran unconditionally.

import { describe, it, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  runScmWorkflowMigrationE2E,
  teardownScmWorkflowMigrationE2E,
  printLeaveIntactNotice,
  type ScmWorkflowMigrationE2EContext,
} from "./_helpers/scm-workflow-migration-fixture.js";

const E2E = process.env.LAKEBASE_TEST_E2E_GITHUB === "1";
const DATABRICKS_HOST = process.env.DATABRICKS_HOST ?? "";
const HAS_DATABRICKS =
  DATABRICKS_HOST !== "" ||
  fs.existsSync(path.join(require("node:os").homedir(), ".databrickscfg"));
const RUN_SUITE = E2E && HAS_DATABRICKS;

describe.skipIf(!RUN_SUITE)(
  "SCM workflow CLIs - live e2e with Knex/Nodejs",
  () => {
    let ctx: ScmWorkflowMigrationE2EContext | undefined;
    let allPassed = false;

    it(
      "happy path: nodejs + knex migration -> claim -> prepare-pr -> wait-ci -> merge --wait-migrate, schema applied on ci-pr-N + staging",
      async () => {
        ctx = await runScmWorkflowMigrationE2E({
          language: "nodejs",
          tool: "knex",
          writeMigration: ({ projectDir, markerTable }) => {
            // <NNN>_<name>.js under migrations/. The scaffold ships NO
            // placeholder migration (just a README), so 001 is the first
            // user slot.
            const migDir = path.join(projectDir, "migrations");
            fs.mkdirSync(migDir, { recursive: true });
            const file = path.join(migDir, "001_live_e2e_marker.js");
            fs.writeFileSync(
              file,
              [
                `// Live e2e marker (knex). Created by`,
                `// tests/integration/scm-workflow-knex-live.test.ts`,
                `// to prove merge --wait-migrate applies real`,
                `// migrations through the SCM workflow.`,
                ``,
                `exports.up = function (knex) {`,
                `  return knex.schema.createTable("${markerTable}", (table) => {`,
                `    table.increments("id").primary();`,
                `    table.string("note", 128).notNullable();`,
                `  });`,
                `};`,
                ``,
                `exports.down = function (knex) {`,
                `  return knex.schema.dropTableIfExists("${markerTable}");`,
                `};`,
                ``,
              ].join("\n"),
            );
            return [file];
          },
        });
        allPassed = true;
      },
      45 * 60_000, // 45-min budget: npm install + knex migrate cycles take real time
    );

    afterAll(async () => {
      if (!ctx) return;
      if (!allPassed) {
        printLeaveIntactNotice(ctx);
        return;
      }
      console.log("");
      console.log("[TEARDOWN] Knex live e2e passed. Cleaning up.");
      await teardownScmWorkflowMigrationE2E(ctx);
    }, 5 * 60_000);
  },
);
