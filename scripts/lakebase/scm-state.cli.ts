#!/usr/bin/env node
// CLI for inspecting the SCM workflow state (FEIP-7458, phase A).
//
// Read-only: prints the current state, tier topology, feature
// identifiers, and a ladder of gates with pass/pending status. The
// state file is `.lakebase/workflow-state.json` in the project root.
//
// Output modes:
//   default: human-readable text
//   --json : machine-readable structured report (current shape + gates)
//
// Exit codes:
//   0 = state file readable (regardless of which state)
//   1 = no state file (project not scaffolded yet, or pre-state-machine)
//   2 = state file present but invalid (parse / validation failure)

import * as path from "node:path";
import {
  describeGates,
  readWorkflowState,
  type GateStatus,
  type ScmWorkflowState,
} from "./scm-workflow-state.js";

interface ParsedArgs {
  projectDir?: string;
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
      default:
        break;
    }
  }
  return out;
}

const HELP = `lakebase-scm-state (FEIP-7458, phase A)

Inspect the SCM workflow state for a paired project. Reads
\`.lakebase/workflow-state.json\` and prints the current state plus the
gate ladder.

Usage:
  lakebase-scm-state [flags]

Flags:
  --project-dir <dir>    Project to inspect (default: cwd)
  --json                 Machine-readable JSON output
  --pretty               Pretty-print JSON (only with --json)
  -h, --help             Show this help

Exit codes:
  0 = state file readable
  1 = no state file
  2 = state file present but invalid
`;

interface Report {
  projectDir: string;
  stateFile: string;
  found: boolean;
  state?: ScmWorkflowState;
  gates?: GateStatus[];
  error?: string;
}

function buildReport(projectDir: string): Report {
  const stateFile = path.join(projectDir, ".lakebase/workflow-state.json");
  try {
    const state = readWorkflowState(projectDir);
    if (!state) {
      return { projectDir, stateFile, found: false };
    }
    return {
      projectDir,
      stateFile,
      found: true,
      state,
      gates: describeGates(state),
    };
  } catch (e) {
    return {
      projectDir,
      stateFile,
      found: true,
      error: (e as Error).message,
    };
  }
}

function renderHuman(report: Report): string {
  const lines: string[] = [];
  lines.push(`SCM workflow state: ${report.stateFile}`);
  if (!report.found) {
    lines.push("");
    lines.push("  (no state file)");
    lines.push("");
    lines.push(
      "  This project has not been scaffolded with the SCM workflow",
    );
    lines.push(
      "  state machine, or pre-dates phase A. Run lakebase-create-project",
    );
    lines.push(
      "  to scaffold, or write an initial scaffold-complete state via",
    );
    lines.push("  the SCM helpers.");
    return lines.join("\n");
  }
  if (report.error) {
    lines.push("");
    lines.push("  INVALID:");
    for (const ln of report.error.split("\n")) {
      lines.push(`    ${ln}`);
    }
    return lines.join("\n");
  }
  const state = report.state;
  const gates = report.gates;
  if (!state || !gates) {
    return lines.join("\n");
  }
  lines.push("");
  lines.push(`  state          : ${state.state}`);
  lines.push(`  tier_topology  : ${tierLabel(state.tier_topology)}`);
  lines.push(`  project_id     : ${state.project_id}`);
  if (state.feature_id) {
    lines.push(`  feature_id     : ${state.feature_id}`);
  }
  if (state.branch) {
    lines.push(`  branch         : ${state.branch}`);
  }
  if (state.parent_branch) {
    lines.push(`  parent_branch  : ${state.parent_branch}`);
  }
  if (state.lakebase_branch_uid) {
    lines.push(`  lakebase_uid   : ${state.lakebase_branch_uid}`);
  }
  if (state.pr_url) {
    lines.push(`  pr_url         : ${state.pr_url}`);
  }
  if (state.ci_run_url) {
    lines.push(`  ci_run_url     : ${state.ci_run_url}`);
  }
  lines.push("");
  lines.push("  gates:");
  for (const gate of gates) {
    const marker = gate.current ? ">" : gate.passed ? "+" : " ";
    const label = gate.current
      ? "(current)"
      : gate.passed
        ? "(passed)"
        : "(pending)";
    lines.push(`    ${marker} ${gate.name.padEnd(20)} ${label}`);
    for (const inv of gate.invariants) {
      const checkmark = inv.present ? "ok " : "   ";
      lines.push(`        ${checkmark} ${inv.key}`);
    }
  }
  lines.push("");
  lines.push(
    "  (advisory: this CLI is read-only; phase B introduces transition CLIs)",
  );
  return lines.join("\n");
}

function tierLabel(t: 1 | 2 | 3): string {
  switch (t) {
    case 1:
      return "1 (prod only)";
    case 2:
      return "2 (prod + staging)";
    case 3:
      return "3 (prod + staging + dev)";
  }
}

function exitCodeFor(report: Report): number {
  if (!report.found) return 1;
  if (report.error) return 2;
  return 0;
}

function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  const projectDir = path.resolve(args.projectDir ?? process.cwd());
  const report = buildReport(projectDir);
  if (args.json) {
    const indent = args.pretty ? 2 : 0;
    process.stdout.write(`${JSON.stringify(report, null, indent)}\n`);
  } else {
    process.stdout.write(`${renderHuman(report)}\n`);
  }
  return exitCodeFor(report);
}

if (process.argv[1] && process.argv[1].endsWith("scm-state.cli.js")) {
  process.exit(main(process.argv.slice(2)));
}

export { main as runScmStateCli };
