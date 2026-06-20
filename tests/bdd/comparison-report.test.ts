// BDD coverage for the comparison-report renderer + writer.
// Hermetic: pure-function renderer + tmpdir writer; no shell-outs.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  renderComparisonReport,
  writeComparisonReport,
} from "../../scripts/sftdd/comparison-report";
import type { ComparisonReport, ExperimentRow, TagMatrixRow } from "../../scripts/sftdd/compare-experiments";

const FIXED_TIMESTAMP = "2026-06-02T08:15:00.000Z";

function row(overrides: Partial<ExperimentRow>): ExperimentRow {
  return {
    experiment_slug: overrides.experiment_slug ?? "exp-x",
    branch_id: overrides.branch_id ?? "feature-x",
    status: overrides.status ?? "succeeded",
    signal: overrides.signal ?? "winning",
    cycle_count: overrides.cycle_count ?? 3,
    artifact_count: overrides.artifact_count ?? 2,
    ...overrides,
  };
}

function matrixRow(overrides: Partial<TagMatrixRow>): TagMatrixRow {
  return {
    tag: overrides.tag ?? "api",
    cells: overrides.cells ?? {},
  };
}

function mkReport(overrides: Partial<ComparisonReport>): ComparisonReport {
  return {
    feature_id: overrides.feature_id ?? "F1-checkout",
    story_id: overrides.story_id ?? "S1-cart",
    generated_at: overrides.generated_at ?? FIXED_TIMESTAMP,
    rows: overrides.rows ?? [],
    matrix: overrides.matrix ?? [],
    recommendation: overrides.recommendation ?? "continue",
    rationale: overrides.rationale ?? "no decision yet",
  };
}

function mkTempTdd(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `feip7208-${prefix}-`));
}

function rm(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

describe("renderComparisonReport: layout", () => {
  it("renders the canonical four sections plus header + recommendation", () => {
    const report = mkReport({
      rows: [row({ experiment_slug: "exp-a" }), row({ experiment_slug: "exp-b" })],
    });
    const md = renderComparisonReport(report);
    expect(md).toMatch(/^# Comparison report: F1-checkout/);
    expect(md).toMatch(/## Per-experiment summary/);
    expect(md).toMatch(/## Tag × experiment matrix/);
    expect(md).toMatch(/## Schema-diff side-by-side/);
    expect(md).toMatch(/## HITL decision/);
    // Recommendation callout near the top.
    expect(md).toMatch(/> \*\*Recommendation:\*\* `continue`/);
  });

  it("lists every experiment in the per-experiment table", () => {
    const report = mkReport({
      rows: [
        row({ experiment_slug: "exp-postgres-arrays", branch_id: "checkout-pg" }),
        row({ experiment_slug: "exp-json-blob", branch_id: "checkout-json" }),
      ],
    });
    const md = renderComparisonReport(report);
    expect(md).toMatch(/`exp-postgres-arrays`/);
    expect(md).toMatch(/`checkout-pg`/);
    expect(md).toMatch(/`exp-json-blob`/);
    expect(md).toMatch(/`checkout-json`/);
  });

  it("surfaces a friendly placeholder when no per-tag data has been recorded yet", () => {
    const report = mkReport({ rows: [row({})], matrix: [] });
    const md = renderComparisonReport(report);
    expect(md).toMatch(/No per-tag outcomes recorded yet/);
  });

  it("renders the tag × experiment matrix with one row per tag", () => {
    const report = mkReport({
      rows: [row({ experiment_slug: "exp-a" }), row({ experiment_slug: "exp-b" })],
      matrix: [
        matrixRow({
          tag: "api",
          cells: { "exp-a": { passed: 5, failed: 0 }, "exp-b": { passed: 5, failed: 1 } },
        }),
        matrixRow({
          tag: "e2e",
          cells: { "exp-a": { passed: 1, failed: 0 }, "exp-b": null },
        }),
      ],
    });
    const md = renderComparisonReport(report);
    expect(md).toMatch(/\| `api` \| 5 \/ 0 \| 5 \/ 1 \|/);
    expect(md).toMatch(/\| `e2e` \| 1 \/ 0 \| - \|/);
  });

  it("places experiments that have no schema-diff data behind a placeholder, otherwise renders a side-by-side table", () => {
    const noDiff = mkReport({ rows: [row({ schema_diff_summary: undefined })] });
    const noDiffMd = renderComparisonReport(noDiff);
    expect(noDiffMd).toMatch(/No experiment has recorded a schema-diff summary yet/);

    const withDiff = mkReport({
      rows: [
        row({ experiment_slug: "exp-a", schema_diff_summary: "+orders, +cart_items" }),
        row({ experiment_slug: "exp-b", schema_diff_summary: "+orders, +cart_json" }),
      ],
    });
    const withDiffMd = renderComparisonReport(withDiff);
    expect(withDiffMd).toMatch(/\| `exp-a` \| \+orders, \+cart_items \|/);
    expect(withDiffMd).toMatch(/\| `exp-b` \| \+orders, \+cart_json \|/);
  });

  it("escapes pipe characters in schema-diff summaries so the table stays intact", () => {
    const report = mkReport({
      rows: [row({ experiment_slug: "exp-a", schema_diff_summary: "col_a int | col_b text" })],
    });
    const md = renderComparisonReport(report);
    expect(md).toMatch(/col_a int \\\| col_b text/);
  });
});

describe("renderComparisonReport: HITL decision block", () => {
  it("includes all four options + the structured reply prompt", () => {
    const md = renderComparisonReport(mkReport({ rows: [row({})] }));
    expect(md).toMatch(/\*\*Promote\*\*/);
    expect(md).toMatch(/\*\*Synthesize\*\*/);
    expect(md).toMatch(/\*\*Continue\*\*/);
    expect(md).toMatch(/\*\*Abandon all\*\*/);
    expect(md).toMatch(/Reply with one of: `promote <slug>`, `synthesize`, `continue`, `abandon-all`/);
  });

  it("calls out a single winner by slug when one exists", () => {
    const report = mkReport({
      rows: [
        row({ experiment_slug: "exp-pg", signal: "winning" }),
        row({ experiment_slug: "exp-json", signal: "stalled" }),
      ],
    });
    const md = renderComparisonReport(report);
    expect(md).toMatch(/Substrate signal indicates a single winner: `exp-pg`/);
  });

  it("lists multiple winners when more than one experiment signals winning", () => {
    const report = mkReport({
      rows: [
        row({ experiment_slug: "exp-pg", signal: "winning" }),
        row({ experiment_slug: "exp-json", signal: "winning" }),
      ],
    });
    const md = renderComparisonReport(report);
    expect(md).toMatch(/multiple winning experiments: `exp-pg`, `exp-json`/);
  });

  it("falls back to the substrate recommendation when no experiment is winning", () => {
    const report = mkReport({
      rows: [row({ signal: "stalled" })],
      recommendation: "abandon-all",
    });
    const md = renderComparisonReport(report);
    expect(md).toMatch(/No experiment is currently signalling "winning"; substrate recommendation is `abandon-all`/);
  });
});

describe("writeComparisonReport", () => {
  let tddDir: string;
  beforeEach(() => {
    tddDir = mkTempTdd("write");
  });
  afterEach(() => rm(tddDir));

  it("writes the rendered markdown to features/<F>/comparison-<timestamp>.md and appends a selection-log entry", () => {
    const report = mkReport({});
    const result = writeComparisonReport({ tddDir, featureId: "F1", report });
    expect(fs.existsSync(result.reportPath)).toBe(true);
    expect(result.reportPath).toMatch(/features\/F1\/comparison-2026-06-02T08-15-00\.000Z\.md$/);
    expect(result.content).toMatch(/# Comparison report: F1-checkout/);
    expect(result.logEntryAppended).toBe(true);
    const log = fs.readFileSync(path.join(tddDir, "selection-log.md"), "utf8");
    expect(log).toMatch(/Comparison report for F1/);
    expect(log).toMatch(/comparison-2026-06-02T08-15-00\.000Z\.md/);
  });

  it("honors filenameTimestamp override for deterministic paths", () => {
    const report = mkReport({});
    const result = writeComparisonReport({
      tddDir,
      featureId: "F1",
      report,
      filenameTimestamp: "fixed-ts",
    });
    expect(result.reportPath).toMatch(/comparison-fixed-ts\.md$/);
  });

  it("skipSelectionLog=true skips the breadcrumb append", () => {
    const result = writeComparisonReport({
      tddDir,
      featureId: "F1",
      report: mkReport({}),
      skipSelectionLog: true,
    });
    expect(result.logEntryAppended).toBe(false);
    expect(fs.existsSync(path.join(tddDir, "selection-log.md"))).toBe(false);
  });

  it("appends to an existing selection-log without clobbering prior content", () => {
    const logPath = path.join(tddDir, "selection-log.md");
    fs.writeFileSync(logPath, "# Selection log\n\nPrior entry.\n");
    writeComparisonReport({ tddDir, featureId: "F1", report: mkReport({}) });
    const log = fs.readFileSync(logPath, "utf8");
    expect(log).toMatch(/Prior entry\./);
    expect(log).toMatch(/Comparison report for F1/);
  });
});
