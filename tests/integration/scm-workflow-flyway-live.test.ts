// Live integration test for the SCM workflow CLIs with a real Flyway
// migration round-trip on a Java-language project.
//
// Sibling to scm-workflow-e2e-live.test.ts (alembic/Python) and
// scm-workflow-knex-live.test.ts (knex/Nodejs). All three share the
// driver in _helpers/scm-workflow-migration-fixture.ts. See that
// file for the full sequence and assertions.
//
// What this file specifically proves:
//   1. A new Flyway migration committed in the feature branch is
//      applied to the ci-pr-N Lakebase branch during wait-ci (proven
//      by querying the branch's public schema for the marker table).
//   2. The same migration is then applied to the parent branch
//      (staging) during merge --wait-migrate (proven by querying
//      staging's schema).
//   3. The JDK probe step runs (not skipped) on a Java project,
//      asserting the probe-then-fallback wiring is correct.

import { describe, it, beforeAll, afterAll } from "vitest";
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
  "SCM workflow CLIs - live e2e with Flyway/Java",
  () => {
    let ctx: ScmWorkflowMigrationE2EContext | undefined;
    let allPassed = false;

    it(
      "happy path: java + flyway migration -> claim -> prepare-pr -> wait-ci -> merge --wait-migrate, schema applied on ci-pr-N + staging",
      async () => {
        ctx = await runScmWorkflowMigrationE2E({
          language: "java",
          tool: "flyway",
          writeMigration: ({ projectDir, markerTable }) => {
            // V<N>__<name>.sql under src/main/resources/db/migration/.
            // The scaffold ships NO placeholder migration (just a README),
            // so V1 is the first user slot. baselineOnMigrate anchors the
            // non-empty public schema, so V1 applies as pending.
            const migDir = path.join(
              projectDir,
              "src",
              "main",
              "resources",
              "db",
              "migration",
            );
            fs.mkdirSync(migDir, { recursive: true });
            const file = path.join(migDir, "V1__live_e2e_marker.sql");
            fs.writeFileSync(
              file,
              [
                `-- Live e2e marker (flyway). Created by`,
                `-- tests/integration/scm-workflow-flyway-live.test.ts`,
                `-- to prove merge --wait-migrate applies real`,
                `-- migrations through the SCM workflow.`,
                ``,
                `CREATE TABLE ${markerTable} (`,
                `    id SERIAL PRIMARY KEY,`,
                `    note VARCHAR(128) NOT NULL`,
                `);`,
                ``,
              ].join("\n"),
            );
            return [file];
          },
        });
        allPassed = true;
      },
      45 * 60_000, // 45-min budget: Maven build + Flyway migrate cycles take real time
    );

    afterAll(async () => {
      if (!ctx) return;
      if (!allPassed) {
        printLeaveIntactNotice(ctx);
        return;
      }
      console.log("");
      console.log("[TEARDOWN] Flyway live e2e passed. Cleaning up.");
      await teardownScmWorkflowMigrationE2E(ctx);
    }, 5 * 60_000);
  },
);
