#!/usr/bin/env node
// CLI: SCM workflow doctor (FEIP-7458 phase C). Read-only diagnostic.

import * as fs from "node:fs";
import * as path from "node:path";
import { runDoctor, type DoctorReport } from "./scm-doctor.js";

interface ParsedArgs {
  projectDir?: string;
  instance?: string;
  json?: boolean;
  pretty?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--project-dir":
      case "--cwd":
        out.projectDir = argv[++i];
        break;
      case "--instance":
        out.instance = argv[++i];
        break;
      case "--json":
        out.json = true;
        break;
      case "--pretty":
        out.pretty = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
    }
  }
  return out;
}

const HELP = `lakebase-scm-doctor (FEIP-7458 phase C)

Read-only diagnostic. Cross-checks .lakebase/workflow-state.json,
.env, the current git branch, and the Lakebase tier inventory.
Reports inconsistencies + suggests a remediation command per finding.

Usage:
  lakebase-scm-doctor [flags]

Flags:
  --project-dir <dir>   Project root (default: cwd)
  --instance <id>       Lakebase project id (default: from .env)
  --json                Machine-readable JSON report
  --pretty              Pretty-print JSON
  -h, --help            Show this help

Exit codes:
  0 = no findings (or only "ok" findings)
  1 = warnings present (state usable but drifting)
  2 = failures present (state broken; remediation required)
`;

function readEnvProjectId(projectDir: string): string | undefined {
  const envPath = path.join(projectDir, ".env");
  if (!fs.existsSync(envPath)) return undefined;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*LAKEBASE_PROJECT_ID\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return undefined;
}

function renderHuman(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push(`SCM workflow doctor: ${report.projectDir}`);
  lines.push("");
  lines.push(
    `  workflow_state_present : ${report.workflowStatePresent ? "yes" : "no"}`,
  );
  if (report.state) {
    lines.push(`  current_state          : ${report.state.state}`);
    lines.push(
      `  tier_topology          : ${report.state.tier_topology}${
        report.inferredTierTopology &&
        report.inferredTierTopology !== report.state.tier_topology
          ? ` (lakebase suggests ${report.inferredTierTopology})`
          : ""
      }`,
    );
  }
  lines.push(`  worst_severity         : ${report.worstSeverity}`);
  lines.push("");
  if (report.findings.length === 0) {
    lines.push("No findings.");
  } else {
    lines.push("Findings:");
    for (const f of report.findings) {
      lines.push(`  [${f.severity.toUpperCase()}] ${f.id}`);
      lines.push(`    ${f.message}`);
      if (f.suggestion) {
        lines.push(`    suggest: ${f.suggestion}`);
      }
    }
  }
  return lines.join("\n");
}

function exitCodeFor(report: DoctorReport): number {
  if (report.worstSeverity === "fail") return 2;
  if (report.worstSeverity === "warn") return 1;
  return 0;
}

export async function runScmDoctorCli(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  const projectDir = path.resolve(args.projectDir ?? process.cwd());
  const instance = args.instance ?? readEnvProjectId(projectDir);
  const report = await runDoctor({ projectDir, instance });
  if (args.json) {
    const indent = args.pretty ? 2 : 0;
    process.stdout.write(`${JSON.stringify(report, null, indent)}\n`);
  } else {
    process.stdout.write(`${renderHuman(report)}\n`);
  }
  return exitCodeFor(report);
}

if (process.argv[1] && process.argv[1].endsWith("scm-doctor.cli.js")) {
  void runScmDoctorCli(process.argv.slice(2)).then((c) => process.exit(c));
}
