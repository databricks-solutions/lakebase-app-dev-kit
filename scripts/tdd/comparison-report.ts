// Markdown renderer for compareExperiments output. The structured
// payload alone cannot drive the promote / synthesize / continue /
// abandon-all HITL decision: a human needs to read one document and
// answer. The Scrum-Master agent calls renderComparisonReport at
// N>=2 convergence, writes it under .tdd/features/<F>/, and surfaces
// the path back to the PO.
//
// The renderer is a pure function over ComparisonReport. The write
// orchestrator handles file placement and the selection-log breadcrumb.

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { ComparisonReport, ExperimentRow, TagMatrixRow } from "./compare-experiments.js";

export interface WriteComparisonReportArgs {
  tddDir: string;
  featureId: string;
  report: ComparisonReport;
  /**
   * Override the `generated_at` ISO timestamp used in the on-disk
   * filename. Defaults to `report.generated_at`. Pass an explicit
   * value when the caller needs deterministic file paths.
   */
  filenameTimestamp?: string;
  /**
   * Skip the selection-log append. Default: false (append). Set when
   * the caller wants to manage the log entry itself (e.g. dry-run,
   * BDD harness, an agent that emits a richer log line).
   */
  skipSelectionLog?: boolean;
}

export interface WriteComparisonReportResult {
  /** Absolute path of the rendered comparison file. */
  reportPath: string;
  /** True iff a selection-log breadcrumb was appended this call. */
  logEntryAppended: boolean;
  /** The rendered markdown body (also available without writing). */
  content: string;
}

/**
 * Write the rendered comparison report under
 * `<tddDir>/features/<featureId>/comparison-<timestamp>.md` and
 * append a one-line breadcrumb to `<tddDir>/selection-log.md` so the
 * existing narrative-of-record points readers at the new file.
 *
 * The timestamp in the filename is the `generated_at` field from the
 * report (or `filenameTimestamp` override). Colons are stripped so
 * the filename survives ZIP / filesystem round-trips on case-folding
 * platforms.
 */
export function writeComparisonReport(args: WriteComparisonReportArgs): WriteComparisonReportResult {
  const featureDir = join(args.tddDir, "features", args.featureId);
  mkdirSync(featureDir, { recursive: true });
  const rawTs = args.filenameTimestamp ?? args.report.generated_at;
  const safeTs = rawTs.replace(/[:]/g, "-");
  const reportPath = join(featureDir, `comparison-${safeTs}.md`);
  const content = renderComparisonReport(args.report);
  writeFileSync(reportPath, content, "utf8");

  let logEntryAppended = false;
  if (!args.skipSelectionLog) {
    const logPath = join(args.tddDir, "selection-log.md");
    const breadcrumb =
      `\n## ${args.report.generated_at} - Comparison report for ${args.featureId}\n` +
      `- **Recommendation:** ${args.report.recommendation}\n` +
      `- **Rationale:** ${args.report.rationale}\n` +
      `- **Detail:** [comparison-${safeTs}.md](features/${args.featureId}/comparison-${safeTs}.md)\n`;
    if (existsSync(logPath)) {
      appendFileSync(logPath, breadcrumb);
    } else {
      writeFileSync(logPath, breadcrumb.replace(/^\n/, ""));
    }
    logEntryAppended = true;
  }

  return { reportPath, logEntryAppended, content };
}

/**
 * Render a ComparisonReport as a markdown document. Pure function;
 * no filesystem side effects.
 *
 * Layout (top-to-bottom):
 *   1. H1 with feature id + generated timestamp.
 *   2. Recommendation block (callout-style) with rationale.
 *   3. Per-experiment header table (slug, branch, status, signal,
 *      cycles, runtime, artifacts, test totals).
 *   4. Tag x experiment matrix (one row per tag, one column per
 *      experiment). Empty when no experiment reported per-tag data.
 *   5. Schema-diff side-by-side (per-experiment summary).
 *   6. HITL decision block with the four options + a structured
 *      prompt the orchestrator copies verbatim into the next PO
 *      message.
 */
export function renderComparisonReport(report: ComparisonReport): string {
  const lines: string[] = [];
  lines.push(`# Comparison report: ${report.feature_id}`);
  lines.push(``);
  lines.push(`Generated at \`${report.generated_at}\`. ${report.rows.length} experiment(s) evaluated.`);
  lines.push(``);
  lines.push(renderRecommendationBlock(report));
  lines.push(``);
  lines.push(`## Per-experiment summary`);
  lines.push(``);
  lines.push(renderExperimentTable(report.rows));
  lines.push(``);
  lines.push(`## Tag × experiment matrix`);
  lines.push(``);
  lines.push(renderMatrixTable(report.rows, report.matrix));
  lines.push(``);
  lines.push(`## Schema-diff side-by-side`);
  lines.push(``);
  lines.push(renderSchemaDiffTable(report.rows));
  lines.push(``);
  lines.push(renderDecisionBlock(report));
  lines.push(``);
  return lines.join("\n");
}

function renderRecommendationBlock(report: ComparisonReport): string {
  return [
    `> **Recommendation:** \`${report.recommendation}\``,
    `>`,
    `> ${report.rationale}`,
  ].join("\n");
}

function renderExperimentTable(rows: ExperimentRow[]): string {
  if (rows.length === 0) return `_No experiments cut yet._`;
  const header = [
    "| Experiment | Branch | Status | Signal | Cycles | Tests pass / fail | Code diff | Runtime | Artifacts |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  const body = rows.map((r) => {
    const tests =
      r.tests_passed === undefined && r.tests_failed === undefined
        ? "-"
        : `${r.tests_passed ?? 0} / ${r.tests_failed ?? 0}`;
    const codeDiff = r.code_diff_lines === undefined ? "-" : `${r.code_diff_lines} lines`;
    const runtime = r.duration_ms === undefined ? "-" : formatDurationMs(r.duration_ms);
    return `| \`${r.experiment_slug}\` | \`${r.branch_id}\` | ${r.status} | ${r.signal} | ${r.cycle_count} | ${tests} | ${codeDiff} | ${runtime} | ${r.artifact_count} |`;
  });
  return [...header, ...body].join("\n");
}

function renderMatrixTable(rows: ExperimentRow[], matrix: TagMatrixRow[]): string {
  if (matrix.length === 0) {
    return `_No per-tag outcomes recorded yet. The matrix populates once experiments record runner outcomes for [API] / [E2E] / [Infra] tags._`;
  }
  const slugs = rows.map((r) => r.experiment_slug);
  const header = [
    `| Tag | ${slugs.map((s) => `\`${s}\``).join(" | ")} |`,
    `|---|${slugs.map(() => "---").join("|")}|`,
  ];
  const body = matrix.map((row) => {
    const cells = slugs.map((slug) => {
      const cell = row.cells[slug];
      if (cell === null || cell === undefined) return "-";
      return `${cell.passed} / ${cell.failed}`;
    });
    return `| \`${row.tag}\` | ${cells.join(" | ")} |`;
  });
  return [...header, ...body].join("\n");
}

function renderSchemaDiffTable(rows: ExperimentRow[]): string {
  if (rows.length === 0) return `_No experiments to diff yet._`;
  const anyDiff = rows.some((r) => r.schema_diff_summary && r.schema_diff_summary.length > 0);
  if (!anyDiff) {
    return `_No experiment has recorded a schema-diff summary yet (e.g. branches still provisioning)._`;
  }
  const header = ["| Experiment | Schema-diff vs parent |", "|---|---|"];
  const body = rows.map((r) => {
    const summary = r.schema_diff_summary
      ? r.schema_diff_summary.replace(/\|/g, "\\|").replace(/\n/g, " ")
      : "-";
    return `| \`${r.experiment_slug}\` | ${summary} |`;
  });
  return [...header, ...body].join("\n");
}

function renderDecisionBlock(report: ComparisonReport): string {
  const slugs = report.rows.map((r) => `\`${r.experiment_slug}\``);
  const winners = report.rows.filter((r) => r.signal === "winning").map((r) => r.experiment_slug);
  const winnerLine =
    winners.length === 1
      ? `Substrate signal indicates a single winner: \`${winners[0]}\`.`
      : winners.length > 1
        ? `Substrate signal indicates multiple winning experiments: ${winners.map((s) => `\`${s}\``).join(", ")}.`
        : `No experiment is currently signalling "winning"; substrate recommendation is \`${report.recommendation}\`.`;
  return [
    `## HITL decision`,
    ``,
    winnerLine,
    ``,
    `Choose one path forward (the Scrum-Master orchestrator will route accordingly):`,
    ``,
    `1. **Promote** \`<slug>\` - take a single experiment to the feature PR as-is. Loser branches are archived.`,
    `2. **Synthesize** - cherry-pick capabilities across ${slugs.join(", ") || "the experiments"} into a new synthesis branch and renegotiate the spec.`,
    `3. **Continue** - let cycles keep running; no decision yet.`,
    `4. **Abandon all** - none of the strategies converged; re-run the design-spec gate with new opinion gaps.`,
    ``,
    `Reply with one of: \`promote <slug>\`, \`synthesize\`, \`continue\`, \`abandon-all\`.`,
  ].join("\n");
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 100) / 10;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds - minutes * 60);
  return `${minutes}m ${remainder}s`;
}
