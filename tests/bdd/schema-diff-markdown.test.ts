import { describe, it, expect } from "vitest";
import {
  formatSchemaDiffAsMarkdown,
  type SchemaDiffResult,
} from "../../scripts/lakebase/schema-diff.js";

// Pure-function tests for the canonical markdown emitter. The output
// shape is consumed by prepare-commit-msg, GH Actions PR comments, and
// the extension's commit-detail view; tests pin the structure so
// downstream parsers don't break under refactor.

function baseResult(overrides: Partial<SchemaDiffResult> = {}): SchemaDiffResult {
  return {
    branchName: "feature-x",
    comparisonBranchName: "staging",
    timestamp: "2026-06-04T00:00:00Z",
    migrations: [],
    created: [],
    modified: [],
    removed: [],
    branchTables: [],
    inSync: true,
    ...overrides,
  };
}

describe("formatSchemaDiffAsMarkdown", () => {
  it("emits the header and in-sync message when there are no changes", () => {
    const md = formatSchemaDiffAsMarkdown(baseResult());
    expect(md).toContain("**SCHEMA CHANGES (Lakebase diff)**");
    expect(md).toContain("No schema changes (in sync).");
  });

  it("emits + TABLE blocks with column lines for created tables", () => {
    const md = formatSchemaDiffAsMarkdown(
      baseResult({
        inSync: false,
        created: [
          {
            type: "TABLE",
            name: "orders",
            columns: [
              { name: "id", dataType: "integer" },
              { name: "note", dataType: "varchar(128)" },
            ],
          },
        ],
      })
    );
    expect(md).toContain("+ TABLE orders (CREATED)");
    expect(md).toContain("  L id integer");
    expect(md).toContain("  L note varchar(128)");
  });

  it("emits + INDEX line (no columns) for created indexes", () => {
    const md = formatSchemaDiffAsMarkdown(
      baseResult({
        inSync: false,
        created: [{ type: "INDEX", name: "orders_user_id_idx" }],
      })
    );
    expect(md).toContain("+ INDEX orders_user_id_idx (CREATED)");
    expect(md).not.toContain("  L ");
  });

  it("emits ~ TABLE blocks with + column lines for modified tables", () => {
    const md = formatSchemaDiffAsMarkdown(
      baseResult({
        inSync: false,
        modified: [
          {
            type: "TABLE",
            name: "users",
            columns: [],
            addedColumns: [{ name: "email", dataType: "varchar(255)" }],
            removedColumns: [],
            prodColumns: [],
          },
        ],
      })
    );
    expect(md).toContain("~ TABLE users (MODIFIED)");
    expect(md).toContain("  + email varchar(255)");
  });

  it("emits - TABLE / - INDEX for removed objects", () => {
    const md = formatSchemaDiffAsMarkdown(
      baseResult({
        inSync: false,
        removed: [
          { type: "TABLE", name: "deprecated_logs" },
          { type: "INDEX", name: "deprecated_logs_idx" },
        ],
      })
    );
    expect(md).toContain("- TABLE deprecated_logs (REMOVED)");
    expect(md).toContain("- INDEX deprecated_logs_idx (REMOVED)");
  });

  it("separates blocks with blank lines (parseable by downstream consumers)", () => {
    const md = formatSchemaDiffAsMarkdown(
      baseResult({
        inSync: false,
        created: [{ type: "TABLE", name: "a", columns: [] }],
        removed: [{ type: "TABLE", name: "b" }],
      })
    );
    // header (1) + blank (1) + "+ TABLE a (CREATED)" + blank + "- TABLE b (REMOVED)"
    const lines = md.split("\n");
    const blankBetween = lines.findIndex((l) => l === "+ TABLE a (CREATED)") + 1;
    expect(lines[blankBetween]).toBe("");
    expect(lines[blankBetween + 1]).toBe("- TABLE b (REMOVED)");
  });

  it("surfaces the error field when getSchemaDiff couldn't compute", () => {
    const md = formatSchemaDiffAsMarkdown(
      baseResult({ inSync: false, error: "branch not READY yet" })
    );
    expect(md).toContain("Could not compute schema diff: branch not READY yet");
  });
});
