// FEIP-7210 slice 3: KnexAdapter contract tests.
//
// Tests assert the adapter's static surface (id, languages, detect,
// list, optional-capability protocol) without invoking the live Knex
// runner. apply + rollback + status are exercised against real Lakebase
// + Knex in env-gated live tests.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  _clearRegistryForTests,
  getAdapter,
  registerAdapter,
} from "../../scripts/lakebase/migration-adapter";
import { KnexAdapter } from "../../scripts/lakebase/adapters/knex-adapter";

const FIXTURE_ROOT = join(__dirname, "fixtures", "migrations-samples", "knex");

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "knex-adapter-"));
  _clearRegistryForTests();
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
  _clearRegistryForTests();
});

describe("KnexAdapter: static surface", () => {
  it("has id='knex' + languages=['nodejs']", () => {
    expect(KnexAdapter.id).toBe("knex");
    expect(KnexAdapter.languages).toEqual(["nodejs"]);
  });

  it("exposes rollback (Knex supports migrate:rollback)", () => {
    expect(typeof KnexAdapter.rollback).toBe("function");
  });

  it("omits baseline (Knex has no native baseline concept)", () => {
    expect(typeof KnexAdapter.baseline).toBe("undefined");
  });

  it("apply + status + list are all functions", () => {
    expect(typeof KnexAdapter.apply).toBe("function");
    expect(typeof KnexAdapter.status).toBe("function");
    expect(typeof KnexAdapter.list).toBe("function");
  });
});

describe("KnexAdapter: detect", () => {
  it("returns false for an empty project directory", () => {
    expect(KnexAdapter.detect(projectDir)).toBe(false);
  });

  it("returns true when knexfile.js exists at the project root", () => {
    writeFileSync(join(projectDir, "knexfile.js"), "module.exports = {};");
    expect(KnexAdapter.detect(projectDir)).toBe(true);
  });

  it("returns true when knexfile.ts exists at the project root", () => {
    writeFileSync(join(projectDir, "knexfile.ts"), "export default {};");
    expect(KnexAdapter.detect(projectDir)).toBe(true);
  });

  it("returns true when knexfile.mjs exists at the project root", () => {
    writeFileSync(join(projectDir, "knexfile.mjs"), "export default {};");
    expect(KnexAdapter.detect(projectDir)).toBe(true);
  });

  it("returns true when knexfile.cjs exists at the project root", () => {
    writeFileSync(join(projectDir, "knexfile.cjs"), "module.exports = {};");
    expect(KnexAdapter.detect(projectDir)).toBe(true);
  });

  it("returns FALSE for a Node.js project with no knexfile (package.json alone is not enough)", () => {
    writeFileSync(join(projectDir, "package.json"), '{"name":"x","version":"0.0.1"}');
    expect(KnexAdapter.detect(projectDir)).toBe(false);
  });

  it("does NOT detect a knexfile in a subdirectory (root-only marker)", () => {
    mkdirSync(join(projectDir, "subdir"));
    writeFileSync(join(projectDir, "subdir", "knexfile.js"), "module.exports = {};");
    expect(KnexAdapter.detect(projectDir)).toBe(false);
  });
});

describe("KnexAdapter: list (pure file-scan, no DB)", () => {
  function makeMigrationsDir(): string {
    const dir = join(projectDir, "migrations");
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  it("returns an empty array when the migrations directory does not exist", async () => {
    const r = await KnexAdapter.list({ projectDir });
    expect(r.files).toEqual([]);
  });

  it("enumerates timestamp-prefixed .js files with parsed version + description", async () => {
    const dir = makeMigrationsDir();
    writeFileSync(join(dir, "20260101000000_create_users.js"), "");
    writeFileSync(join(dir, "20260102000000_create_orders.js"), "");
    const r = await KnexAdapter.list({ projectDir });
    expect(r.files).toHaveLength(2);
    expect(r.files[0].version).toBe("20260101000000");
    expect(r.files[0].description).toBe("create users");
    expect(r.files[0].type).toBe("JavaScript");
    expect(r.files[0].tool).toBe("knex");
    expect(r.files[1].version).toBe("20260102000000");
    expect(r.files[1].description).toBe("create orders");
  });

  it("supports .ts migrations with type='TypeScript'", async () => {
    const dir = makeMigrationsDir();
    writeFileSync(join(dir, "20260101000000_create_users.ts"), "");
    const r = await KnexAdapter.list({ projectDir });
    expect(r.files).toHaveLength(1);
    expect(r.files[0].type).toBe("TypeScript");
  });

  it("sorts by timestamp prefix (oldest first), matching Knex apply order", async () => {
    const dir = makeMigrationsDir();
    writeFileSync(join(dir, "20260103000000_third.js"), "");
    writeFileSync(join(dir, "20260101000000_first.js"), "");
    writeFileSync(join(dir, "20260102000000_second.js"), "");
    const r = await KnexAdapter.list({ projectDir });
    expect(r.files.map((f) => f.description)).toEqual(["first", "second", "third"]);
  });

  it("ignores dotfiles + non-js/ts files", async () => {
    const dir = makeMigrationsDir();
    writeFileSync(join(dir, "20260101000000_valid.js"), "");
    writeFileSync(join(dir, ".DS_Store"), "");
    writeFileSync(join(dir, "README.md"), "");
    writeFileSync(join(dir, "20260101000000_valid.js.bak"), "");
    const r = await KnexAdapter.list({ projectDir });
    expect(r.files.map((f) => f.filename)).toEqual(["20260101000000_valid.js"]);
  });
});

describe("KnexAdapter: registry integration", () => {
  it("registerAdapter + getAdapter('knex') roundtrip returns the same instance", () => {
    registerAdapter(KnexAdapter);
    expect(getAdapter("knex")).toBe(KnexAdapter);
  });
});

describe("KnexAdapter: against the knex fixture project", () => {
  it("detect() returns true on the canonical fixture (knexfile.js + migrations/)", () => {
    expect(KnexAdapter.detect(FIXTURE_ROOT)).toBe(true);
  });

  it("list() finds both fixture migrations in apply order", async () => {
    const r = await KnexAdapter.list({ projectDir: FIXTURE_ROOT });
    expect(r.files).toHaveLength(2);
    expect(r.files[0].version).toBe("20260101000000");
    expect(r.files[0].description).toBe("create users");
    expect(r.files[1].version).toBe("20260102000000");
    expect(r.files[1].description).toBe("create orders");
  });
});
