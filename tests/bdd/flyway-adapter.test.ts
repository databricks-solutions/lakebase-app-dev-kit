// slice 2: FlywayAdapter contract tests.
//
// Tests assert the adapter's static surface (id, languages, detect, list,
// optional-capability protocol) without invoking the live Maven runner.
// apply + status are exercised against real Lakebase + Flyway in
// tests/bdd/migrate-live-flyway.test.ts (env-gated).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  _clearRegistryForTests,
  getSchemaMigrationAdapter,
  registerSchemaMigrationAdapter,
} from "../../scripts/lakebase/schema-migration-adapter";
// Import the adapter module SECOND so we can isolate registration.
// In production this auto-registers on first import; tests reset the
// registry beforeEach then re-register explicitly to assert behavior.
import { FlywayAdapter } from "../../scripts/lakebase/adapters/flyway-adapter";

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "flyway-adapter-"));
  _clearRegistryForTests();
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
  _clearRegistryForTests();
});

describe("FlywayAdapter: static surface", () => {
  it("has id='flyway' + languages=['java', 'kotlin']", () => {
    expect(FlywayAdapter.id).toBe("flyway");
    expect(FlywayAdapter.languages).toEqual(["java", "kotlin"]);
  });

  it("omits rollback (Flyway Community Edition lacks the capability)", () => {
    expect(typeof FlywayAdapter.rollback).toBe("undefined");
  });

  it("omits baseline in slice 2 (deferred to a follow-up)", () => {
    expect(typeof FlywayAdapter.baseline).toBe("undefined");
  });

  it("apply + status + list are all functions", () => {
    expect(typeof FlywayAdapter.apply).toBe("function");
    expect(typeof FlywayAdapter.status).toBe("function");
    expect(typeof FlywayAdapter.list).toBe("function");
  });
});

describe("FlywayAdapter: detect", () => {
  it("returns false for an empty project directory", () => {
    expect(FlywayAdapter.detect(projectDir)).toBe(false);
  });

  it("returns true when pom.xml exists at the project root", () => {
    writeFileSync(join(projectDir, "pom.xml"), "<project></project>");
    expect(FlywayAdapter.detect(projectDir)).toBe(true);
  });

  it("does NOT detect on pom.xml in a subdirectory (root-only marker)", () => {
    mkdirSync(join(projectDir, "subdir"));
    writeFileSync(join(projectDir, "subdir", "pom.xml"), "<project></project>");
    expect(FlywayAdapter.detect(projectDir)).toBe(false);
  });

  it("does NOT detect when alembic.ini is present without pom.xml", () => {
    writeFileSync(join(projectDir, "alembic.ini"), "[alembic]");
    expect(FlywayAdapter.detect(projectDir)).toBe(false);
  });
});

describe("FlywayAdapter: list (pure file-scan, no DB)", () => {
  function makeMigrationsDir(): string {
    const dir = join(projectDir, "src", "main", "resources", "db", "migration");
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  it("returns an empty array when the migrations directory does not exist", async () => {
    const r = await FlywayAdapter.list({ projectDir });
    expect(r.files).toEqual([]);
  });

  it("enumerates V<n>__<desc>.sql files with parsed version + description", async () => {
    const dir = makeMigrationsDir();
    writeFileSync(join(dir, "V1__create_orders.sql"), "create table orders ();");
    writeFileSync(join(dir, "V2__add_audit_log.sql"), "create table audit ();");
    const r = await FlywayAdapter.list({ projectDir });
    expect(r.files).toHaveLength(2);
    expect(r.files[0].version).toBe("1");
    expect(r.files[0].description).toBe("create orders");
    expect(r.files[0].type).toBe("SQL");
    expect(r.files[0].tool).toBe("flyway");
    expect(r.files[1].version).toBe("2");
  });

  it("sorts by Flyway version order (1, 2, 10), not lexicographic (1, 10, 2)", async () => {
    const dir = makeMigrationsDir();
    writeFileSync(join(dir, "V10__ten.sql"), "");
    writeFileSync(join(dir, "V2__two.sql"), "");
    writeFileSync(join(dir, "V1__one.sql"), "");
    const r = await FlywayAdapter.list({ projectDir });
    expect(r.files.map((f) => f.version)).toEqual(["1", "2", "10"]);
  });

  it("ignores files that do not match V<n>__<desc>.sql", async () => {
    const dir = makeMigrationsDir();
    writeFileSync(join(dir, "V1__valid.sql"), "");
    writeFileSync(join(dir, "README.md"), "docs");
    writeFileSync(join(dir, "U1__undo.sql"), "");
    writeFileSync(join(dir, "V__missing_version.sql"), "");
    const r = await FlywayAdapter.list({ projectDir });
    expect(r.files.map((f) => f.filename)).toEqual(["V1__valid.sql"]);
  });

  it("handles multi-component versions like V1.2.3__patch.sql", async () => {
    const dir = makeMigrationsDir();
    writeFileSync(join(dir, "V1.2.3__patch.sql"), "");
    writeFileSync(join(dir, "V1.2__minor.sql"), "");
    writeFileSync(join(dir, "V1__major.sql"), "");
    const r = await FlywayAdapter.list({ projectDir });
    expect(r.files.map((f) => f.version)).toEqual(["1", "1.2", "1.2.3"]);
  });
});

describe("FlywayAdapter: registry integration", () => {
  it("registerSchemaMigrationAdapter + getSchemaMigrationAdapter('flyway') roundtrip returns the same instance", () => {
    registerSchemaMigrationAdapter(FlywayAdapter);
    expect(getSchemaMigrationAdapter("flyway")).toBe(FlywayAdapter);
  });
});
