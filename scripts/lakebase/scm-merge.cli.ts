#!/usr/bin/env node
// CLI: ci-green -> merged (FEIP-7458 phase B+).

import * as path from "node:path";
import {
  ScmMergeError,
  mergeFeature,
  type MergeResult,
} from "./scm-merge.js";

interface ParsedArgs {
  projectDir?: string;
  instance?: string;
  switchTo?: string;
  method?: "merge" | "squash" | "rebase";
  skipLocalCleanup?: boolean;
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
      case "--method":
        out.method = argv[++i] as "merge" | "squash" | "rebase";
        break;
      case "--skip-local-cleanup":
        out.skipLocalCleanup = true;
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

const HELP = `lakebase-scm-merge (FEIP-7458 phase B+)

Transition ci-green -> merged: GitHub merge (squash by default),
remote branch delete, Lakebase feature branch delete, local HEAD
switch to parent + local branch delete, state advance to merged.

Usage:
  lakebase-scm-merge [flags]

Flags:
  --project-dir <dir>     Project root (default: cwd)
  --instance <id>         Lakebase project id (default: from state)
  --switch-to <branch>    Branch to checkout after merge (default: parent_branch)
  --method <merge|squash|rebase>
                          GitHub merge method (default: squash)
  --skip-local-cleanup    Skip the local HEAD switch + branch delete
  --json                  Machine-readable JSON output
  --pretty                Pretty-print JSON
  -h, --help              Show this help

Exit codes:
  0 = merged (state advanced; warnings may be present)
  1 = no state file
  2 = precondition refused (wrong state, missing PR URL / branch fields)
  3 = merge failed (GitHub merge / network)
`;

interface Report {
  ok: boolean;
  result?: MergeResult;
  error?: { code: string; message: string };
}

function renderHuman(r: Report): string {
  if (!r.ok) {
    return `lakebase-scm-merge: ${r.error?.code}\n\n  ${r.error?.message}`;
  }
  const res = r.result!;
  const lines: string[] = ["Merged:"];
  lines.push(`  state                : ${res.state.state}`);
  lines.push(`  merged_at            : ${res.state.merged_at}`);
  lines.push(`  head_after           : ${res.headAfter}`);
  lines.push(`  local_branch_deleted : ${res.localBranchDeleted}`);
  lines.push(`  lakebase_deleted     : ${res.paired.lakebaseBranchDeleted}`);
  lines.push(`  merge_message        : ${res.paired.message}`);
  if (res.warnings.length > 0) {
    lines.push("");
    lines.push("warnings:");
    for (const w of res.warnings) lines.push(`  - ${w}`);
  }
  return lines.join("\n");
}

function exitCodeForError(err: Error): number {
  if (err instanceof ScmMergeError) {
    if (err.code === "no-state-file") return 1;
    if (err.code === "merge-failed") return 3;
    return 2;
  }
  return 3;
}

export async function runScmMergeCli(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  const projectDir = path.resolve(args.projectDir ?? process.cwd());
  try {
    const result = await mergeFeature({
      projectDir,
      instance: args.instance,
      switchTo: args.switchTo,
      method: args.method,
      skipLocalCleanup: args.skipLocalCleanup,
    });
    const report: Report = { ok: true, result };
    if (args.json) {
      const indent = args.pretty ? 2 : 0;
      process.stdout.write(`${JSON.stringify(report, null, indent)}\n`);
    } else {
      process.stdout.write(`${renderHuman(report)}\n`);
    }
    return 0;
  } catch (e) {
    const err = e as Error;
    const code = err instanceof ScmMergeError ? err.code : "substrate-failure";
    const report: Report = {
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

if (process.argv[1] && process.argv[1].endsWith("scm-merge.cli.js")) {
  void runScmMergeCli(process.argv.slice(2)).then((c) => process.exit(c));
}
