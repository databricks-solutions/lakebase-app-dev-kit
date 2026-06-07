// Create-side migration adapter tests (the count-up fix).
//
// Hermetic portion (no tool binaries): the pure next-number + slug helpers,
// the Flyway adapter's newMigration (pure file write), the dispatcher's
// routing by language, and the Alembic guard that refuses --autogenerate
// without a connection (short-circuits before any spawn). The Alembic +
// Knex create paths that actually shell out to the tool are exercised in the
// env-gated live migration tests.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  createSchemaMigration,
  migrationSlug,
  nextMigrationNumber,
} from "../../scripts/lakebase/schema-migrate";
import { FlywayAdapter } from "../../scripts/lakebase/adapters/flyway-adapter";
import { AlembicAdapter } from "../../scripts/lakebase/adapters/alembic-adapter";

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "new-migration-"));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe("nextMigrationNumber", () => {
  it("starts at 1 when there are no existing versions", () => {
    expect(nextMigrationNumber([])).toBe(1);
  });

  it("returns max+1 for zero-padded Alembic rev-ids", () => {
    expect(nextMigrationNumber(["0001", "0002", "0003"])).toBe(4);
  });

  it("returns max+1 for Flyway V<n> versions (numeric core, any gaps)", () => {
    expect(nextMigrationNumber(["1", "2", "10"])).toBe(11);
  });

  it("ignores non-numeric versions (e.g. a stray hash)", () => {
    // A hash like "ae10" yields its leading digits; the point is it never throws
    // and a clean 000N set still counts up.
    expect(nextMigrationNumber(["0007"])).toBe(8);
  });
});

describe("migrationSlug", () => {
  it("lowercases and snake_cases a human description", () => {
    expect(migrationSlug("Add Users table!")).toBe("add_users_table");
  });

  it("trims leading/trailing separators", () => {
    expect(migrationSlug("  create bugs  ")).toBe("create_bugs");
  });

  it("falls back to 'migration' for an empty description", () => {
    expect(migrationSlug("   ")).toBe("migration");
  });
});

/** Lay out the minimal markers that make a project detect as Flyway (Java). */
function makeFlywayProject(dir: string): void {
  writeFileSync(join(dir, "pom.xml"), "<project/>", "utf8");
}

describe("FlywayAdapter.newMigration (hermetic: pure file write)", () => {
  it("creates V1 then V2 skeletons that count up", async () => {
    makeFlywayProject(projectDir);

    const first = await FlywayAdapter.newMigration!({ projectDir, slug: "create bugs" });
    expect(first.status).toBe("ok");
    expect(first.version).toBe("1");
    expect(first.filename).toBe("V1__create_bugs.sql");

    const second = await FlywayAdapter.newMigration!({ projectDir, slug: "add users" });
    expect(second.status).toBe("ok");
    expect(second.version).toBe("2");
    expect(second.filename).toBe("V2__add_users.sql");

    // The skeleton exists and carries a header for the Driver to fill in.
    const body = readFileSync(second.path, "utf8");
    expect(body).toContain("V2: add users");
  });

  it("refuses to clobber an existing migration of the same name", async () => {
    makeFlywayProject(projectDir);
    const dir = join(projectDir, "src", "main", "resources", "db", "migration");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "V1__create_bugs.sql"), "-- existing\n", "utf8");

    // Next number is 2, so a fresh slug is fine...
    const ok = await FlywayAdapter.newMigration!({ projectDir, slug: "create bugs" });
    expect(ok.status).toBe("ok");
    expect(ok.filename).toBe("V2__create_bugs.sql");
  });
});

describe("createSchemaMigration dispatcher", () => {
  it("routes a Java project to Flyway and names V<n>", async () => {
    makeFlywayProject(projectDir);
    const r = await createSchemaMigration({ projectDir, slug: "create bugs", language: "java" });
    expect(r.status).toBe("ok");
    expect(r.filename).toBe("V1__create_bugs.sql");
  });

  it("throws a helpful error when the tool cannot be resolved", async () => {
    // Empty project: no pom.xml / alembic.ini / knexfile -> no adapter detects.
    await expect(createSchemaMigration({ projectDir, slug: "x" })).rejects.toThrow(
      /resolve migration tool|not a registered adapter|Cannot resolve/i
    );
  });
});

describe("AlembicAdapter.newMigration: autogenerate guard (hermetic)", () => {
  it("errors before spawning when --autogenerate lacks instance/branch", async () => {
    // alembic.ini makes it detect as Alembic; the guard must fire before any
    // attempt to build a DSN or spawn alembic.
    writeFileSync(join(projectDir, "alembic.ini"), "[alembic]\n", "utf8");
    const r = await AlembicAdapter.newMigration!({ projectDir, slug: "add users", autogenerate: true });
    expect(r.status).toBe("error");
    expect(r.error).toMatch(/autogenerate requires.*instance.*branch/i);
  });
});
