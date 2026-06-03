#!/usr/bin/env node
// CLI: abandon the in-flight feature claim and reset to scaffold-complete.
// FEIP-7458 phase B+.

import * as path from "node:path";
import {
  ScmAbandonError,
  abandonFeatureBranch,
  type AbandonFeatureResult,
} from "./scm-abandon-feature.js";

interface ParsedArgs {
  projectDir?: string;
  instance?: string;
  switchTo?: string;
  force?: boolean;
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
      case "--switch-to":
        out.switchTo = argv[++i];
        break;
      case "--force":
        out.force = true;
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

const HELP = `lakebase-scm-abandon-feature (FEIP-7458 phase B+)

Unwind a feature claim: switch HEAD to the parent branch, delete the
paired Lakebase + git branch, reset workflow-state to scaffold-complete.

Usage:
  lakebase-scm-abandon-feature [flags]

Flags:
  --project-dir <dir>   Project root (default: cwd)
  --instance <id>       Lakebase project id override (default: from state)
  --switch-to <branch>  Branch to checkout before deletion (default: parent_branch)
  --force               Allow abandon even with a dirty working tree
                        (the uncommitted changes will be lost)
  --json                Machine-readable JSON output
  --pretty              Pretty-print JSON (only with --json)
  -h, --help            Show this help

Exit codes:
  0 = abandoned (state reset to scaffold-complete; may include partial warnings)
  1 = no state file
  2 = precondition refused (wrong state, dirty tree without --force, missing fields)
  3 = substrate failure
`;

interface AbandonReport {
  ok: boolean;
  result?: AbandonFeatureResult;
  error?: { code: string; message: string };
}

function renderHuman(report: AbandonReport): string {
  if (!report.ok) {
    return `lakebase-scm-abandon-feature: ${report.error?.code}\n\n  ${report.error?.message}`;
  }
  const r = report.result!;
  const lines: string[] = ["Feature abandoned:"];
  lines.push(`  state             : ${r.state.state}`);
  lines.push(`  lakebase_deleted  : ${r.lakebaseDeleted}`);
  lines.push(`  git_local_deleted : ${r.gitLocalDeleted}`);
  lines.push(`  git_remote_deleted: ${r.gitRemoteDeleted}`);
  if (r.warnings.length > 0) {
    lines.push("");
    lines.push("warnings:");
    for (const w of r.warnings) lines.push(`  - ${w}`);
  }
  return lines.join("\n");
}

function exitCodeForError(err: Error): number {
  if (err instanceof ScmAbandonError) {
    if (err.code === "no-state-file") return 1;
    return 2;
  }
  return 3;
}

export async function runScmAbandonFeatureCli(
  argv: string[],
): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  const projectDir = path.resolve(args.projectDir ?? process.cwd());
  try {
    const result = await abandonFeatureBranch({
      projectDir,
      instance: args.instance,
      switchTo: args.switchTo,
      force: args.force,
    });
    const report: AbandonReport = { ok: true, result };
    if (args.json) {
      const indent = args.pretty ? 2 : 0;
      process.stdout.write(`${JSON.stringify(report, null, indent)}\n`);
    } else {
      process.stdout.write(`${renderHuman(report)}\n`);
    }
    return 0;
  } catch (e) {
    const err = e as Error;
    const code =
      err instanceof ScmAbandonError ? err.code : "substrate-failure";
    const report: AbandonReport = {
      ok: false,
      error: { code, message: err.message },
    };
    if (args.json) {
      const indent = args.pretty ? 2 : 0;
      process.stdout.write(`${JSON.stringify(report, null, indent)}\n`);
    } else {
      process.stderr.write(`${renderHuman(report)}\n`);
    }
    return exitCodeForError(err);
  }
}

if (process.argv[1] && process.argv[1].endsWith("scm-abandon-feature.cli.js")) {
  void runScmAbandonFeatureCli(process.argv.slice(2)).then((c) =>
    process.exit(c),
  );
}
