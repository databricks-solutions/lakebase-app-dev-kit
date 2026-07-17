// Unit BDD tests for the migrate primitives.
//
// These tests cover the dispatch logic and the file-scan implementation
// of listSchemaMigrations() for all three languages, using temp project
// directories. The applySchemaMigrations / rollbackSchemaMigration / schemaMigrationStatus
// primitives are exercised end-to-end against a real Lakebase branch in
// migrate-live.test.ts (gated on LAKEBASE_TEST_E2E=1).
//
// No DB connection here; this suite must run cleanly in any environment.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  detectLanguage,
  listSchemaMigrations,
  toolForLanguage,
  SchemaMigrationError,
  applyAndVerifyTierMigration,
} from "../../scripts/lakebase/schema-migrate.js";

function mkTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "migrate-bdd-"));
}

function rm(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe("toolForLanguage", () => {
  it("maps java and kotlin to flyway", () => {
    expect(toolForLanguage("java")).toBe("flyway");
    expect(toolForLanguage("kotlin")).toBe("flyway");
  });

  it("maps python to alembic", () => {
    expect(toolForLanguage("python")).toBe("alembic");
  });

  it("maps nodejs to knex", () => {
    expect(toolForLanguage("nodejs")).toBe("knex");
  });
});

describe("detectLanguage", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkTempDir();
  });
  afterEach(() => {
    rm(dir);
  });

  it("detects java from pom.xml", () => {
    fs.writeFileSync(path.join(dir, "pom.xml"), "<project/>");
    expect(detectLanguage(dir)).toBe("java");
  });

  it("detects python from pyproject.toml", () => {
    fs.writeFileSync(path.join(dir, "pyproject.toml"), "");
    expect(detectLanguage(dir)).toBe("python");
  });

  it("detects python from requirements.txt", () => {
    fs.writeFileSync(path.join(dir, "requirements.txt"), "");
    expect(detectLanguage(dir)).toBe("python");
  });

  it("detects python from alembic.ini", () => {
    fs.writeFileSync(path.join(dir, "alembic.ini"), "");
    expect(detectLanguage(dir)).toBe("python");
  });

  it("detects nodejs from package.json", () => {
    fs.writeFileSync(path.join(dir, "package.json"), "{}");
    expect(detectLanguage(dir)).toBe("nodejs");
  });

  it("prefers pom.xml over package.json when both present (java pairing)", () => {
    fs.writeFileSync(path.join(dir, "pom.xml"), "<project/>");
    fs.writeFileSync(path.join(dir, "package.json"), "{}");
    expect(detectLanguage(dir)).toBe("java");
  });

  it("throws when no marker found", () => {
    expect(() => detectLanguage(dir)).toThrow(SchemaMigrationError);
    expect(() => detectLanguage(dir)).toThrow(/Could not detect project language/);
  });
});

describe("listSchemaMigrations: flyway (java)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkTempDir();
    fs.writeFileSync(path.join(dir, "pom.xml"), "<project/>");
    const migrations = path.join(dir, "src", "main", "resources", "db", "migration");
    fs.mkdirSync(migrations, { recursive: true });
    fs.writeFileSync(path.join(migrations, "V1__init.sql"), "CREATE TABLE x();");
    fs.writeFileSync(path.join(migrations, "V2__add_y.sql"), "ALTER TABLE x ADD y INT;");
    fs.writeFileSync(path.join(migrations, "V10__add_z.sql"), "ALTER TABLE x ADD z INT;");
    // Garbage file ignored by the regex:
    fs.writeFileSync(path.join(migrations, "notes.txt"), "ignored");
  });
  afterEach(() => {
    rm(dir);
  });

  it("enumerates V*.sql files and sorts numerically (V10 after V2)", () => {
    const files = listSchemaMigrations({ projectDir: dir });
    expect(files.map((f) => f.version)).toEqual(["1", "2", "10"]);
    expect(files.every((f) => f.tool === "flyway")).toBe(true);
    expect(files.every((f) => f.type === "SQL")).toBe(true);
  });

  it("description is the slug with underscores replaced by spaces", () => {
    const files = listSchemaMigrations({ projectDir: dir });
    expect(files[0].description).toBe("init");
    expect(files[1].description).toBe("add y");
    expect(files[2].description).toBe("add z");
  });

  it("returns empty when the migration dir is missing", () => {
    rm(path.join(dir, "src", "main", "resources", "db", "migration"));
    expect(listSchemaMigrations({ projectDir: dir })).toEqual([]);
  });
});

describe("listSchemaMigrations: alembic (python)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkTempDir();
    fs.writeFileSync(path.join(dir, "alembic.ini"), "");
    const versions = path.join(dir, "migrations", "versions");
    fs.mkdirSync(versions, { recursive: true });
    fs.writeFileSync(path.join(versions, "ae103abc_init.py"), "");
    fs.writeFileSync(path.join(versions, "bf204def_add_users.py"), "");
    fs.writeFileSync(path.join(versions, "__init__.py"), "");
  });
  afterEach(() => {
    rm(dir);
  });

  it("enumerates *.py files in migrations/versions/, skips __init__", () => {
    const files = listSchemaMigrations({ projectDir: dir });
    expect(files.map((f) => f.filename).sort()).toEqual([
      "ae103abc_init.py",
      "bf204def_add_users.py",
    ]);
    expect(files.every((f) => f.tool === "alembic")).toBe(true);
    expect(files.every((f) => f.type === "Python")).toBe(true);
  });

  it("parses version (revid before underscore) and description", () => {
    const files = listSchemaMigrations({ projectDir: dir }).sort((a, b) =>
      a.filename.localeCompare(b.filename)
    );
    expect(files[0].version).toBe("ae103abc");
    expect(files[0].description).toBe("init");
    expect(files[1].version).toBe("bf204def");
    expect(files[1].description).toBe("add users");
  });

  it("also finds alembic/versions/ as alternative layout", () => {
    rm(path.join(dir, "migrations"));
    const versions = path.join(dir, "alembic", "versions");
    fs.mkdirSync(versions, { recursive: true });
    fs.writeFileSync(path.join(versions, "cc305ghi_alt.py"), "");
    const files = listSchemaMigrations({ projectDir: dir });
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe("cc305ghi_alt.py");
  });
});

describe("listSchemaMigrations: knex (nodejs)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkTempDir();
    fs.writeFileSync(path.join(dir, "package.json"), "{}");
    const migrations = path.join(dir, "migrations");
    fs.mkdirSync(migrations, { recursive: true });
    fs.writeFileSync(path.join(migrations, "20260101120000_init.js"), "");
    fs.writeFileSync(path.join(migrations, "20260102140000_add_users.ts"), "");
    fs.writeFileSync(path.join(migrations, ".gitkeep"), "");
  });
  afterEach(() => {
    rm(dir);
  });

  it("enumerates timestamped *.js and *.ts files, sorts by timestamp", () => {
    const files = listSchemaMigrations({ projectDir: dir });
    expect(files.map((f) => f.filename)).toEqual([
      "20260101120000_init.js",
      "20260102140000_add_users.ts",
    ]);
    expect(files[0].version).toBe("20260101120000");
    expect(files[0].type).toBe("JavaScript");
    expect(files[1].version).toBe("20260102140000");
    expect(files[1].type).toBe("TypeScript");
    expect(files.every((f) => f.tool === "knex")).toBe(true);
  });

  it("parses description from name slug", () => {
    const files = listSchemaMigrations({ projectDir: dir });
    expect(files[0].description).toBe("init");
    expect(files[1].description).toBe("add users");
  });
});

describe("listSchemaMigrations: language override", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkTempDir();
    // No detection markers – language must be passed explicitly.
    const migrations = path.join(dir, "migrations", "versions");
    fs.mkdirSync(migrations, { recursive: true });
    fs.writeFileSync(path.join(migrations, "aa111_init.py"), "");
  });
  afterEach(() => {
    rm(dir);
  });

  it("honors explicit language argument when detection would fail", () => {
    expect(() => listSchemaMigrations({ projectDir: dir })).toThrow(SchemaMigrationError);
    const files = listSchemaMigrations({ projectDir: dir, language: "python" });
    expect(files).toHaveLength(1);
    expect(files[0].tool).toBe("alembic");
  });
});

describe("flyway rollback + knex apply: error paths", () => {
  // Flyway: apply + status are implemented (live test covers them).
  // Rollback intentionally throws because Flyway Community Edition has
  // no `undo`.
  // Knex: runner is fully implemented as of slice 3 (the
  // original primitives lift shipped it as a stub). Live
  // behavior is exercised by env-gated suites; here we only lock the
  // pre-shell-out validation (no knexfile at root).

  it("flyway rollback throws with the Flyway Community caveat", async () => {
    const dir = mkTempDir();
    try {
      const { rollbackFlyway } = await import("../../scripts/lakebase/schema-migrate-runners/flyway.js");
      await expect(
        rollbackFlyway({ projectDir: dir, dsn: "x", target: "-1" })
      ).rejects.toThrow(/Flyway Community Edition does not support/);
    } finally {
      rm(dir);
    }
  });

  it("knex apply throws SchemaMigrationError when no knexfile is present", async () => {
    const dir = mkTempDir();
    fs.writeFileSync(path.join(dir, "package.json"), "{}");
    try {
      const { applyKnex } = await import("../../scripts/lakebase/schema-migrate-runners/knex.js");
      await expect(applyKnex({ projectDir: dir, dsn: "x" })).rejects.toThrow(/No knexfile found/);
    } finally {
      rm(dir);
    }
  });
});

// FEIP-8050 / Finding 25: the promote local-migrate fallback must VERIFY the
// target branch is at head after applying, and report migrate-unconfirmed (which
// BLOCKS the merge) instead of a false "in sync" derived from the apply exit code.
describe("applyAndVerifyTierMigration (Finding 25)", () => {
  const target = { instance: "p", branch: "staging", projectDir: "/x" };
  const okApply = async () => ({ applied: [], alreadyAtLatest: false, tool: "alembic" as const });

  it("returns ok when the target verifies at head (no pending after apply)", async () => {
    const res = await applyAndVerifyTierMigration(target, {
      apply: okApply,
      status: async () => ({ current: "rev2", pending: [], tool: "alembic" }),
    });
    expect(res.ok).toBe(true);
    expect(res.detail).toMatch(/staging at head/);
  });

  it("returns migrate-unconfirmed (ok=false) when the target still has pending migrations", async () => {
    // The exact failure: the apply ran (against the wrong branch / partially) but
    // the TARGET staging is still behind, so reporting in-sync would be a lie.
    const res = await applyAndVerifyTierMigration(target, {
      apply: okApply,
      status: async () => ({ current: "rev1", pending: [{ version: "rev2", filename: "rev2.py", description: "", type: "versioned", tool: "alembic" }], tool: "alembic" }),
    });
    expect(res.ok).toBe(false);
    expect(res.detail).toMatch(/migrate-unconfirmed/);
    expect(res.detail).toMatch(/1 pending/);
  });

  it("returns migrate-unconfirmed when the verification itself cannot run", async () => {
    const res = await applyAndVerifyTierMigration(target, {
      apply: okApply,
      status: async () => { throw new Error("branch unreachable"); },
    });
    expect(res.ok).toBe(false);
    expect(res.detail).toMatch(/migrate-unconfirmed: could not verify/);
  });

  it("returns ok=false with the apply error when the apply itself throws", async () => {
    const res = await applyAndVerifyTierMigration(target, {
      apply: async () => { throw new Error("alembic exploded"); },
      status: async () => ({ current: "rev2", pending: [], tool: "alembic" }),
    });
    expect(res.ok).toBe(false);
    expect(res.detail).toMatch(/alembic exploded/);
  });

  it("scm-merge's local-migrate fallback is wired to the verify (static)", () => {
    const src = fs.readFileSync(
      new URL("../../scripts/lakebase/scm-merge.cli.ts", import.meta.url),
      "utf8",
    );
    expect(src).toMatch(/applyAndVerifyTierMigration\(/);
    // The bare apply-without-verify must be gone from the fallback.
    expect(src).not.toMatch(/localMigrateFallback[\s\S]*await applySchemaMigrations\(/);
  });
});
