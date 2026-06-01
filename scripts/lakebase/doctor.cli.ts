#!/usr/bin/env node
// CLI for the doctor health checks (FEIP-7330, P0.4). Output modes:
//   default: human-readable colorized table (no color when not a TTY)
//   --json : machine-readable structured report
//
// Exit codes:
//   0 = all OK
//   1 = at least one WARN
//   2 = at least one FAIL

import { runDoctor, type CheckResult, type DoctorReport } from "./doctor.js";

interface ParsedArgs {
  projectDir?: string;
  profile?: string;
  host?: string;
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
      case "--profile":
        out.profile = argv[++i];
        break;
      case "--host":
        out.host = argv[++i];
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

const HELP = `lakebase-doctor (FEIP-7330)

Run health checks on a Lakebase project: Databricks CLI presence + auth,
.env shape, Lakebase project reachability, git remote, detected
language, git hooks.

Usage:
  lakebase-doctor [flags]

Flags:
  --project-dir <dir>    Project to inspect (default: cwd)
  --profile <name>       Databricks CLI profile (default: $DATABRICKS_CONFIG_PROFILE)
  --host <url>           Workspace host override (skips resolveDatabricksHost)
  --json                 Machine-readable JSON output
  --pretty               Pretty-print JSON (only with --json)

Exit codes:
  0 = all OK
  1 = at least one WARN
  2 = at least one FAIL

Examples:
  lakebase-doctor
  lakebase-doctor --project-dir ~/projects/my-app
  lakebase-doctor --json --pretty
`;

function badge(status: CheckResult["status"]): string {
  switch (status) {
    case "ok":
      return "  OK  ";
    case "warn":
      return " WARN ";
    case "fail":
      return " FAIL ";
    case "skip":
      return " SKIP ";
  }
}

function printHuman(report: DoctorReport): void {
  for (const c of report.checks) {
    process.stdout.write(`[${badge(c.status)}] ${c.name.padEnd(20)}  ${c.message}\n`);
    if (c.hint && c.status !== "ok") {
      process.stdout.write(`                          -> ${c.hint}\n`);
    }
  }
  process.stdout.write(`\nOverall: ${report.overall.toUpperCase()}\n`);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const report = await runDoctor({
    projectDir: args.projectDir,
    profile: args.profile,
    host: args.host,
  });
  if (args.json) {
    process.stdout.write(
      (args.pretty
        ? JSON.stringify(report, null, 2)
        : JSON.stringify(report)) + "\n"
    );
  } else {
    printHuman(report);
  }
  if (report.overall === "fail") return 2;
  if (report.overall === "warn") return 1;
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(
      `${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  }
);
