// FEIP-7210 slice 1: SchemaMigrationAdapter interface + registry contract.
//
// Types-only PR. Tests assert the registry shape + resolution logic so
// later slices that register concrete adapters (Flyway / Alembic / Knex)
// inherit the contract guarantees.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _clearRegistryForTests,
  getSchemaMigrationAdapter,
  listSchemaMigrationAdapters,
  registerSchemaMigrationAdapter,
  resolveSchemaMigrationAdapter,
  UnresolvedSchemaMigrationAdapterError,
  type ApplyResult,
  type BaselineResult,
  type ListResult,
  type SchemaMigrationAdapter,
  type RollbackResult,
  type StatusResult,
} from "../../scripts/lakebase/schema-migration-adapter";

function fakeAdapter(
  id: SchemaMigrationAdapter["id"],
  detect: (projectDir: string) => boolean = () => false
): SchemaMigrationAdapter {
  return {
    id,
    languages: [],
    detect,
    apply: async (): Promise<ApplyResult> => ({ applied_migrations: [], status: "ok" }),
    status: async (): Promise<StatusResult> => ({
      applied_version: null,
      pending: [],
      applied: [],
      status: "ok",
    }),
    list: async (): Promise<ListResult> => ({ files: [] }),
  };
}

beforeEach(() => {
  _clearRegistryForTests();
});

afterEach(() => {
  _clearRegistryForTests();
});

describe("migration-adapter: registry shape", () => {
  it("starts empty", () => {
    expect(listSchemaMigrationAdapters()).toEqual([]);
  });

  it("register + get + list roundtrip", () => {
    const flyway = fakeAdapter("flyway");
    registerSchemaMigrationAdapter(flyway);
    expect(getSchemaMigrationAdapter("flyway")).toBe(flyway);
    expect(listSchemaMigrationAdapters()).toEqual([flyway]);
  });

  it("re-registering an id overwrites the prior adapter (last write wins)", () => {
    const a = fakeAdapter("flyway");
    const b = fakeAdapter("flyway");
    registerSchemaMigrationAdapter(a);
    registerSchemaMigrationAdapter(b);
    expect(getSchemaMigrationAdapter("flyway")).toBe(b);
    expect(listSchemaMigrationAdapters()).toHaveLength(1);
  });

  it("supports the four canonical ids: flyway, alembic, knex, custom", () => {
    registerSchemaMigrationAdapter(fakeAdapter("flyway"));
    registerSchemaMigrationAdapter(fakeAdapter("alembic"));
    registerSchemaMigrationAdapter(fakeAdapter("knex"));
    registerSchemaMigrationAdapter(fakeAdapter("custom"));
    expect(listSchemaMigrationAdapters().map((a) => a.id).sort()).toEqual([
      "alembic",
      "custom",
      "flyway",
      "knex",
    ]);
  });
});

describe("migration-adapter: resolveSchemaMigrationAdapter explicit override", () => {
  it("returns the registered adapter when the override matches", () => {
    const flyway = fakeAdapter("flyway");
    registerSchemaMigrationAdapter(flyway);
    expect(resolveSchemaMigrationAdapter("/any", "flyway")).toBe(flyway);
  });

  it("throws UnresolvedSchemaMigrationAdapterError when the override is not registered", () => {
    registerSchemaMigrationAdapter(fakeAdapter("flyway"));
    expect(() => resolveSchemaMigrationAdapter("/any", "alembic")).toThrow(UnresolvedSchemaMigrationAdapterError);
    expect(() => resolveSchemaMigrationAdapter("/any", "alembic")).toThrow(/not a registered adapter/);
  });

  it("the error message lists the registered ids", () => {
    registerSchemaMigrationAdapter(fakeAdapter("flyway"));
    registerSchemaMigrationAdapter(fakeAdapter("alembic"));
    try {
      resolveSchemaMigrationAdapter("/any", "knex");
    } catch (err) {
      expect((err as Error).message).toMatch(/flyway/);
      expect((err as Error).message).toMatch(/alembic/);
    }
  });
});

describe("migration-adapter: resolveSchemaMigrationAdapter auto-detect", () => {
  it("returns the first adapter whose detect() returns true", () => {
    const flyway = fakeAdapter("flyway", () => false);
    const alembic = fakeAdapter("alembic", () => true);
    registerSchemaMigrationAdapter(flyway);
    registerSchemaMigrationAdapter(alembic);
    expect(resolveSchemaMigrationAdapter("/any")).toBe(alembic);
  });

  it("returns the first match in registration order (stable for tie-breaks)", () => {
    const flyway = fakeAdapter("flyway", () => true);
    const alembic = fakeAdapter("alembic", () => true);
    registerSchemaMigrationAdapter(flyway);
    registerSchemaMigrationAdapter(alembic);
    expect(resolveSchemaMigrationAdapter("/any")).toBe(flyway);
  });

  it("throws UnresolvedSchemaMigrationAdapterError when no adapter detects + no override", () => {
    registerSchemaMigrationAdapter(fakeAdapter("flyway", () => false));
    expect(() => resolveSchemaMigrationAdapter("/any")).toThrow(UnresolvedSchemaMigrationAdapterError);
    expect(() => resolveSchemaMigrationAdapter("/any")).toThrow(/Cannot resolve migration tool/);
  });

  it("error hint enumerates the registered adapters", () => {
    registerSchemaMigrationAdapter(fakeAdapter("flyway", () => false));
    registerSchemaMigrationAdapter(fakeAdapter("knex", () => false));
    try {
      resolveSchemaMigrationAdapter("/any");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toMatch(/migration_tool/);
      expect(msg).toMatch(/flyway/);
      expect(msg).toMatch(/knex/);
    }
  });
});

describe("migration-adapter: optional capability protocol", () => {
  it("rollback + baseline are optional; absence is observable via property check", () => {
    const minimal = fakeAdapter("flyway"); // no rollback, no baseline
    registerSchemaMigrationAdapter(minimal);
    expect(typeof minimal.rollback).toBe("undefined");
    expect(typeof minimal.baseline).toBe("undefined");
  });

  it("adapters can opt into rollback + baseline", () => {
    const full: SchemaMigrationAdapter = {
      ...fakeAdapter("alembic"),
      rollback: async (): Promise<RollbackResult> => ({
        rolled_back: [],
        status: "ok",
      }),
      baseline: async (): Promise<BaselineResult> => ({
        status: "ok",
        baseline_version: "0",
      }),
    };
    registerSchemaMigrationAdapter(full);
    expect(typeof full.rollback).toBe("function");
    expect(typeof full.baseline).toBe("function");
  });
});
