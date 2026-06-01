// Unit tests for the Knex runner's `migrate:status` parser. The runner
// was a stub in the original primitives lift (FEIP-7091); slice 3 of
// FEIP-7210 promoted it to a real shell-out implementation.
//
// The runner derives apply/rollback results from before/after status
// diffs. That makes parseKnexStatus the hinge: if it breaks on a Knex
// CLI output format change, the whole runner silently mis-reports. We
// lock the contract here with snapshot-style fixtures of Knex 3.x output
// so a future Knex upgrade that drifts the format trips these tests
// before it ships.

import { describe, expect, it } from "vitest";
import { parseKnexStatus } from "../../scripts/lakebase/migrate-runners/knex";

describe("parseKnexStatus", () => {
  it("returns empty arrays for empty output", () => {
    expect(parseKnexStatus("")).toEqual({ completed: [], pending: [] });
  });

  it("parses 'No Pending' as zero pending", () => {
    const out = [
      "Using environment: development",
      "Found 1 Completed Migration file/files.",
      "20260101000000_create_users.js",
      "No Pending Migration files Found.",
      "",
    ].join("\n");
    const r = parseKnexStatus(out);
    expect(r.completed).toEqual(["20260101000000_create_users.js"]);
    expect(r.pending).toEqual([]);
  });

  it("parses completed + pending sections", () => {
    const out = [
      "Using environment: development",
      "Found 1 Completed Migration file/files.",
      "20260101000000_create_users.js",
      "Found 2 Pending Migration file/files.",
      "20260102000000_create_orders.js",
      "20260103000000_create_payments.js",
      "",
    ].join("\n");
    const r = parseKnexStatus(out);
    expect(r.completed).toEqual(["20260101000000_create_users.js"]);
    expect(r.pending).toEqual([
      "20260102000000_create_orders.js",
      "20260103000000_create_payments.js",
    ]);
  });

  it("parses zero completed + multiple pending (fresh DB)", () => {
    const out = [
      "Found 0 Completed Migration file/files.",
      "Found 2 Pending Migration file/files.",
      "20260101000000_create_users.js",
      "20260102000000_create_orders.js",
    ].join("\n");
    const r = parseKnexStatus(out);
    expect(r.completed).toEqual([]);
    expect(r.pending).toEqual([
      "20260101000000_create_users.js",
      "20260102000000_create_orders.js",
    ]);
  });

  it("ignores informational lines (Using environment:, blanks)", () => {
    const out = [
      "Using environment: development",
      "",
      "Found 1 Completed Migration file/files.",
      "",
      "20260101000000_create_users.js",
      "",
      "No Pending Migration files Found.",
    ].join("\n");
    const r = parseKnexStatus(out);
    expect(r.completed).toEqual(["20260101000000_create_users.js"]);
    expect(r.pending).toEqual([]);
  });

  it("recognizes .ts + .cjs + .mjs filenames in the migration list", () => {
    const out = [
      "Found 2 Completed Migration file/files.",
      "20260101000000_users.ts",
      "20260101000001_orders.cjs",
      "Found 1 Pending Migration file/files.",
      "20260102000000_payments.mjs",
    ].join("\n");
    const r = parseKnexStatus(out);
    expect(r.completed).toEqual(["20260101000000_users.ts", "20260101000001_orders.cjs"]);
    expect(r.pending).toEqual(["20260102000000_payments.mjs"]);
  });

  it("is case-insensitive on the section headers", () => {
    // Knex's casing isn't normative; some CI environments shift to all-caps
    // when piped through certain log wrappers. Be tolerant.
    const out = [
      "FOUND 1 COMPLETED MIGRATION FILE/FILES.",
      "20260101000000_users.js",
      "NO PENDING MIGRATION FILES FOUND.",
    ].join("\n");
    const r = parseKnexStatus(out);
    expect(r.completed).toEqual(["20260101000000_users.js"]);
    expect(r.pending).toEqual([]);
  });

  it("handles CRLF line endings", () => {
    const out =
      "Found 1 Completed Migration file/files.\r\n" +
      "20260101000000_users.js\r\n" +
      "No Pending Migration files Found.\r\n";
    const r = parseKnexStatus(out);
    expect(r.completed).toEqual(["20260101000000_users.js"]);
    expect(r.pending).toEqual([]);
  });
});
