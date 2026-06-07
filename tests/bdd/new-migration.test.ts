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
  collapseMigrationHeads,
  createSchemaMigration,
  migrationSlug,
  migrationTimestamp,
} from "../../scripts/lakebase/schema-migrate";
import { FlywayAdapter } from "../../scripts/lakebase/adapters/flyway-adapter";
import { AlembicAdapter } from "../../scripts/lakebase/adapters/alembic-adapter";
import { KnexAdapter } from "../../scripts/lakebase/adapters/knex-adapter";
import { FIXABLE_FINDING_IDS } from "../../scripts/lakebase/scm-doctor";

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "new-migration-"));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe("migrationTimestamp", () => {
  it("formats a 14-digit UTC YYYYMMDDHHMMSS stamp", () => {
    const d = new Date(Date.UTC(2026, 5, 7, 11, 50, 3)); // 2026-06-07 11:50:03 UTC
    expect(migrationTimestamp(d)).toBe("20260607115003");
  });

  it("zero-pads single-digit fields", () => {
    const d = new Date(Date.UTC(2026, 0, 2, 3, 4, 5)); // 2026-01-02 03:04:05 UTC
    expect(migrationTimestamp(d)).toBe("20260102030405");
  });

  it("is lexicographically == chronologically ordered (so versions sort)", () => {
    const earlier = migrationTimestamp(new Date(Date.UTC(2026, 5, 7, 11, 0, 0)));
    const later = migrationTimestamp(new Date(Date.UTC(2026, 5, 7, 11, 0, 1)));
    expect(earlier < later).toBe(true);
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
  it("creates a timestamp-versioned V<ts>__<slug>.sql skeleton", async () => {
    makeFlywayProject(projectDir);

    const r = await FlywayAdapter.newMigration!({ projectDir, slug: "create bugs" });
    expect(r.status).toBe("ok");
    // Version is a 14-digit timestamp; filename embeds it + the slug.
    expect(r.version).toMatch(/^\d{14}$/);
    expect(r.filename).toMatch(/^V\d{14}__create_bugs\.sql$/);

    // The skeleton exists and carries a header for the Driver to fill in.
    const body = readFileSync(r.path, "utf8");
    expect(body).toContain("create bugs");
  });
});

describe("createSchemaMigration dispatcher", () => {
  it("routes a Java project to Flyway and names V<timestamp>", async () => {
    makeFlywayProject(projectDir);
    const r = await createSchemaMigration({ projectDir, slug: "create bugs", language: "java" });
    expect(r.status).toBe("ok");
    expect(r.filename).toMatch(/^V\d{14}__create_bugs\.sql$/);
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

describe("collapseMigrationHeads dispatcher (hermetic: flat-list tools no-op)", () => {
  it("is a no-op for a Flyway project (flat list, no DAG -> no collapseHeads)", async () => {
    makeFlywayProject(projectDir);
    const r = await collapseMigrationHeads({ projectDir, language: "java" });
    expect(r.status).toBe("noop");
  });

  it("is a no-op for a Knex project (flat list, no DAG)", async () => {
    writeFileSync(join(projectDir, "knexfile.js"), "module.exports = {};\n", "utf8");
    const r = await collapseMigrationHeads({ projectDir, language: "nodejs" });
    expect(r.status).toBe("noop");
  });

  it("only the Alembic adapter (a DAG tool) implements collapseHeads", () => {
    expect(typeof AlembicAdapter.collapseHeads).toBe("function");
    expect(FlywayAdapter.collapseHeads).toBeUndefined();
    expect(KnexAdapter.collapseHeads).toBeUndefined();
  });

  it("dry-run is also a no-op for flat-list tools", async () => {
    makeFlywayProject(projectDir);
    const r = await collapseMigrationHeads({ projectDir, language: "java", dryRun: true });
    expect(r.status).toBe("noop");
  });

  it("scm-doctor registers multiple-migration-heads as fixable", () => {
    expect([...FIXABLE_FINDING_IDS]).toContain("multiple-migration-heads");
  });
});
