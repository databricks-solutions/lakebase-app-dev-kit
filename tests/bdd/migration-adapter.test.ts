// FEIP-7210 slice 1: MigrationAdapter interface + registry contract.
//
// Types-only PR. Tests assert the registry shape + resolution logic so
// later slices that register concrete adapters (Flyway / Alembic / Knex)
// inherit the contract guarantees.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _clearRegistryForTests,
  getAdapter,
  listAdapters,
  registerAdapter,
  resolveAdapter,
  UnresolvedAdapterError,
  type ApplyResult,
  type BaselineResult,
  type ListResult,
  type MigrationAdapter,
  type RollbackResult,
  type StatusResult,
} from "../../scripts/lakebase/migration-adapter";

function fakeAdapter(
  id: MigrationAdapter["id"],
  detect: (projectDir: string) => boolean = () => false
): MigrationAdapter {
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
    expect(listAdapters()).toEqual([]);
  });

  it("register + get + list roundtrip", () => {
    const flyway = fakeAdapter("flyway");
    registerAdapter(flyway);
    expect(getAdapter("flyway")).toBe(flyway);
    expect(listAdapters()).toEqual([flyway]);
  });

  it("re-registering an id overwrites the prior adapter (last write wins)", () => {
    const a = fakeAdapter("flyway");
    const b = fakeAdapter("flyway");
    registerAdapter(a);
    registerAdapter(b);
    expect(getAdapter("flyway")).toBe(b);
    expect(listAdapters()).toHaveLength(1);
  });

  it("supports the four canonical ids: flyway, alembic, knex, custom", () => {
    registerAdapter(fakeAdapter("flyway"));
    registerAdapter(fakeAdapter("alembic"));
    registerAdapter(fakeAdapter("knex"));
    registerAdapter(fakeAdapter("custom"));
    expect(listAdapters().map((a) => a.id).sort()).toEqual([
      "alembic",
      "custom",
      "flyway",
      "knex",
    ]);
  });
});

describe("migration-adapter: resolveAdapter explicit override", () => {
  it("returns the registered adapter when the override matches", () => {
    const flyway = fakeAdapter("flyway");
    registerAdapter(flyway);
    expect(resolveAdapter("/any", "flyway")).toBe(flyway);
  });

  it("throws UnresolvedAdapterError when the override is not registered", () => {
    registerAdapter(fakeAdapter("flyway"));
    expect(() => resolveAdapter("/any", "alembic")).toThrow(UnresolvedAdapterError);
    expect(() => resolveAdapter("/any", "alembic")).toThrow(/not a registered adapter/);
  });

  it("the error message lists the registered ids", () => {
    registerAdapter(fakeAdapter("flyway"));
    registerAdapter(fakeAdapter("alembic"));
    try {
      resolveAdapter("/any", "knex");
    } catch (err) {
      expect((err as Error).message).toMatch(/flyway/);
      expect((err as Error).message).toMatch(/alembic/);
    }
  });
});

describe("migration-adapter: resolveAdapter auto-detect", () => {
  it("returns the first adapter whose detect() returns true", () => {
    const flyway = fakeAdapter("flyway", () => false);
    const alembic = fakeAdapter("alembic", () => true);
    registerAdapter(flyway);
    registerAdapter(alembic);
    expect(resolveAdapter("/any")).toBe(alembic);
  });

  it("returns the first match in registration order (stable for tie-breaks)", () => {
    const flyway = fakeAdapter("flyway", () => true);
    const alembic = fakeAdapter("alembic", () => true);
    registerAdapter(flyway);
    registerAdapter(alembic);
    expect(resolveAdapter("/any")).toBe(flyway);
  });

  it("throws UnresolvedAdapterError when no adapter detects + no override", () => {
    registerAdapter(fakeAdapter("flyway", () => false));
    expect(() => resolveAdapter("/any")).toThrow(UnresolvedAdapterError);
    expect(() => resolveAdapter("/any")).toThrow(/Cannot resolve migration tool/);
  });

  it("error hint enumerates the registered adapters", () => {
    registerAdapter(fakeAdapter("flyway", () => false));
    registerAdapter(fakeAdapter("knex", () => false));
    try {
      resolveAdapter("/any");
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
    registerAdapter(minimal);
    expect(typeof minimal.rollback).toBe("undefined");
    expect(typeof minimal.baseline).toBe("undefined");
  });

  it("adapters can opt into rollback + baseline", () => {
    const full: MigrationAdapter = {
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
    registerAdapter(full);
    expect(typeof full.rollback).toBe("function");
    expect(typeof full.baseline).toBe("function");
  });
});
