import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import {
  queryBranchSchema,
  queryBranchTables,
  buildSchemaQuery,
  isAllSchemas,
  schemaObjectName,
} from "../../scripts/lakebase/branch-schema.js";

const cliAvailable = (() => {
  try {
    execFileSync("databricks", ["--version"], { stdio: "ignore", timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
})();

const TEST_INSTANCE = process.env.LAKEBASE_TEST_INSTANCE;
const TEST_BRANCH = process.env.LAKEBASE_TEST_BRANCH;
const live = cliAvailable && !!TEST_INSTANCE && !!TEST_BRANCH;

describe.skipIf(!live)("queryBranchSchema – live pg connect", () => {
  it("returns an array (may be empty for a freshly provisioned branch)", async () => {
    const schema = await queryBranchSchema({
      instance: TEST_INSTANCE!,
      branch: TEST_BRANCH!,
    });
    expect(Array.isArray(schema)).toBe(true);
    for (const t of schema) {
      expect(typeof t.name).toBe("string");
      expect(Array.isArray(t.columns)).toBe(true);
    }
  }, 45_000);

  it("queryBranchTables returns just the names", async () => {
    const names = await queryBranchTables({
      instance: TEST_INSTANCE!,
      branch: TEST_BRANCH!,
    });
    expect(Array.isArray(names)).toBe(true);
    for (const n of names) {
      expect(typeof n).toBe("string");
    }
  }, 45_000);

  it("skips flyway_schema_history by default", async () => {
    const names = await queryBranchTables({
      instance: TEST_INSTANCE!,
      branch: TEST_BRANCH!,
    });
    expect(names).not.toContain("flyway_schema_history");
  }, 45_000);
});

describe("W10: schema-scoped inventory query (hermetic)", () => {
  it("defaults to the public schema, bare table names", () => {
    const q = buildSchemaQuery();
    expect(q.text).toMatch(/c\.table_schema = \$1/);
    expect(q.values).toEqual(["public"]);
    expect(isAllSchemas(undefined)).toBe(false);
  });

  it("scopes to a specific non-public schema via a bound parameter (no injection)", () => {
    const q = buildSchemaQuery("cfg");
    expect(q.values).toEqual(["cfg"]);
    // The schema name is bound, never interpolated into SQL text.
    expect(q.text).not.toContain("cfg");
    expect(isAllSchemas("cfg")).toBe(false);
    // A single named schema keeps bare table names.
    expect(schemaObjectName({ table_schema: "cfg", table_name: "settings" }, false)).toBe("settings");
  });

  it("'all' / '*' scans every non-system schema and qualifies names", () => {
    for (const all of ["all", "ALL", "*"]) {
      expect(isAllSchemas(all)).toBe(true);
      const q = buildSchemaQuery(all);
      expect(q.values).toEqual([]);
      expect(q.text).toMatch(/NOT IN \('pg_catalog','information_schema'\)/);
      expect(q.text).not.toMatch(/table_schema = \$1/);
    }
    expect(schemaObjectName({ table_schema: "cfg", table_name: "settings" }, true)).toBe("cfg.settings");
  });

  it("blank/whitespace schema falls back to public", () => {
    expect(buildSchemaQuery("   ").values).toEqual(["public"]);
    expect(buildSchemaQuery("").values).toEqual(["public"]);
  });
});

describe("branch-schema – skip-when-env-missing", () => {
  it("documents the skip reason when CLI or env is missing", () => {
    if (live) return;
    // eslint-disable-next-line no-console
    console.log(
      !cliAvailable
        ? "`databricks` CLI not available – live branch-schema suite skipped."
        : "LAKEBASE_TEST_INSTANCE/LAKEBASE_TEST_BRANCH not set – live branch-schema suite skipped."
    );
    expect(live).toBe(false);
  });
});
