// FEIP-7210 slice 3: AlembicAdapter contract tests.
//
// Tests assert the adapter's static surface (id, languages, detect,
// list, optional-capability protocol) without invoking the live Alembic
// runner. apply + rollback + status are exercised against real Lakebase
// + Alembic in env-gated live tests.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  _clearRegistryForTests,
  getSchemaMigrationAdapter,
  registerSchemaMigrationAdapter,
} from "../../scripts/lakebase/schema-migration-adapter";
// Import the adapter SECOND so registration is observable. Production
// imports auto-register; tests reset the registry beforeEach then
// re-register to keep assertions explicit.
import { AlembicAdapter } from "../../scripts/lakebase/adapters/alembic-adapter";

const FIXTURE_ROOT = join(__dirname, "fixtures", "migrations-samples", "alembic");

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "alembic-adapter-"));
  _clearRegistryForTests();
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
  _clearRegistryForTests();
});

describe("AlembicAdapter: static surface", () => {
  it("has id='alembic' + languages=['python']", () => {
    expect(AlembicAdapter.id).toBe("alembic");
    expect(AlembicAdapter.languages).toEqual(["python"]);
  });

  it("exposes rollback (Alembic supports downgrade)", () => {
    expect(typeof AlembicAdapter.rollback).toBe("function");
  });

  it("omits baseline in slice 3 (Alembic stamp deferred)", () => {
    expect(typeof AlembicAdapter.baseline).toBe("undefined");
  });

  it("apply + status + list are all functions", () => {
    expect(typeof AlembicAdapter.apply).toBe("function");
    expect(typeof AlembicAdapter.status).toBe("function");
    expect(typeof AlembicAdapter.list).toBe("function");
  });
});

describe("AlembicAdapter: detect", () => {
  it("returns false for an empty project directory", () => {
    expect(AlembicAdapter.detect(projectDir)).toBe(false);
  });

  it("returns true when alembic.ini exists at the project root", () => {
    writeFileSync(join(projectDir, "alembic.ini"), "[alembic]\nscript_location = migrations\n");
    expect(AlembicAdapter.detect(projectDir)).toBe(true);
  });

  it("returns true when migrations/env.py exists (no alembic.ini)", () => {
    mkdirSync(join(projectDir, "migrations"), { recursive: true });
    writeFileSync(join(projectDir, "migrations", "env.py"), "");
    expect(AlembicAdapter.detect(projectDir)).toBe(true);
  });

  it("returns true when alembic/env.py exists (default `alembic init` layout)", () => {
    mkdirSync(join(projectDir, "alembic"), { recursive: true });
    writeFileSync(join(projectDir, "alembic", "env.py"), "");
    expect(AlembicAdapter.detect(projectDir)).toBe(true);
  });

  it("returns FALSE for a Python project with no Alembic markers", () => {
    // pyproject.toml + requirements.txt alone are NOT enough to claim the
    // project. This is tighter than migrate.ts's language-level detection
    // and is the right call for the adapter contract: Python project,
    // but Alembic isn't configured.
    writeFileSync(join(projectDir, "pyproject.toml"), "[project]\nname='x'\n");
    writeFileSync(join(projectDir, "requirements.txt"), "django");
    expect(AlembicAdapter.detect(projectDir)).toBe(false);
  });
});

describe("AlembicAdapter: list (pure file-scan, no DB)", () => {
  function makeVersionsDir(parent: "migrations" | "alembic"): string {
    const dir = join(projectDir, parent, "versions");
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  it("returns an empty array when neither versions directory exists", async () => {
    const r = await AlembicAdapter.list({ projectDir });
    expect(r.files).toEqual([]);
  });

  it("enumerates versions/*.py with parsed revid + description", async () => {
    const dir = makeVersionsDir("migrations");
    writeFileSync(join(dir, "0001_create_users.py"), "");
    writeFileSync(join(dir, "0002_create_orders.py"), "");
    const r = await AlembicAdapter.list({ projectDir });
    expect(r.files).toHaveLength(2);
    expect(r.files[0].version).toBe("0001");
    expect(r.files[0].description).toBe("create users");
    expect(r.files[0].type).toBe("Python");
    expect(r.files[0].tool).toBe("alembic");
    expect(r.files[1].version).toBe("0002");
    expect(r.files[1].description).toBe("create orders");
  });

  it("supports the alembic/versions/ layout (default `alembic init`)", async () => {
    const dir = makeVersionsDir("alembic");
    writeFileSync(join(dir, "0001_init.py"), "");
    const r = await AlembicAdapter.list({ projectDir });
    expect(r.files).toHaveLength(1);
    expect(r.files[0].version).toBe("0001");
  });

  it("prefers migrations/ over alembic/ when both exist", async () => {
    const migrationsDir = makeVersionsDir("migrations");
    const alembicDir = makeVersionsDir("alembic");
    writeFileSync(join(migrationsDir, "0001_from_migrations.py"), "");
    writeFileSync(join(alembicDir, "0001_from_alembic.py"), "");
    const r = await AlembicAdapter.list({ projectDir });
    expect(r.files).toHaveLength(1);
    expect(r.files[0].description).toBe("from migrations");
  });

  it("ignores dunder + non-.py files in versions/", async () => {
    const dir = makeVersionsDir("migrations");
    writeFileSync(join(dir, "0001_valid.py"), "");
    writeFileSync(join(dir, "__init__.py"), "");
    writeFileSync(join(dir, "README.md"), "");
    writeFileSync(join(dir, "0001_valid.pyc"), "");
    const r = await AlembicAdapter.list({ projectDir });
    expect(r.files.map((f) => f.filename)).toEqual(["0001_valid.py"]);
  });

  it("sorts lexicographically by filename (matches Alembic's typical revid scheme)", async () => {
    const dir = makeVersionsDir("migrations");
    writeFileSync(join(dir, "0003_third.py"), "");
    writeFileSync(join(dir, "0001_first.py"), "");
    writeFileSync(join(dir, "0002_second.py"), "");
    const r = await AlembicAdapter.list({ projectDir });
    expect(r.files.map((f) => f.version)).toEqual(["0001", "0002", "0003"]);
  });
});

describe("AlembicAdapter: registry integration", () => {
  it("registerSchemaMigrationAdapter + getSchemaMigrationAdapter('alembic') roundtrip returns the same instance", () => {
    registerSchemaMigrationAdapter(AlembicAdapter);
    expect(getSchemaMigrationAdapter("alembic")).toBe(AlembicAdapter);
  });
});

describe("AlembicAdapter: against the alembic fixture project", () => {
  it("detect() returns true on the canonical fixture (alembic.ini + env.py + versions/)", () => {
    expect(AlembicAdapter.detect(FIXTURE_ROOT)).toBe(true);
  });

  it("list() finds both fixture migrations in apply order", async () => {
    const r = await AlembicAdapter.list({ projectDir: FIXTURE_ROOT });
    expect(r.files).toHaveLength(2);
    expect(r.files[0].version).toBe("0001");
    expect(r.files[0].description).toBe("create users");
    expect(r.files[1].version).toBe("0002");
    expect(r.files[1].description).toBe("create orders");
  });
});
