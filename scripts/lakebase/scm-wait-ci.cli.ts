#!/usr/bin/env node
// CLI: pr-ready -> ci-green (phase B+).

import * as path from "node:path";
import { isCliEntry } from "../util/cli-entry.js";
import {
  ScmWaitCiError,
  waitForCi,
  type WaitCiResult,
} from "./scm-wait-ci.js";

interface ParsedArgs {
  projectDir?: string;
  timeoutSec?: number;
  pollSec?: number;
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
      case "--timeout-sec":
        out.timeoutSec = Number.parseInt(argv[++i], 10);
        break;
      case "--poll-sec":
        out.pollSec = Number.parseInt(argv[++i], 10);
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

const HELP = `lakebase-scm-wait-ci (phase B+)

Block until the PR's CI checks turn green, then transition
pr-ready -> ci-green. On CI failure or timeout, exits non-zero
without advancing state.

Usage:
  lakebase-scm-wait-ci [flags]

Flags:
  --project-dir <dir>     Project root (default: cwd)
  --timeout-sec <n>       Total poll budget (default: 1800 = 30 minutes)
  --poll-sec <n>          Seconds between polls (default: 30)
  --json                  Machine-readable JSON output
  --pretty                Pretty-print JSON
  -h, --help              Show this help

Exit codes:
  0 = ci-green (state advanced)
  1 = no state file
  2 = precondition refused (wrong state, missing branch)
  3 = CI failed (state unchanged; re-push fixes + re-run)
  4 = timeout (state unchanged; re-run with a larger budget)
`;

interface Report {
  ok: boolean;
  result?: WaitCiResult;
  error?: { code: string; message: string };
}

function renderHuman(r: Report): string {
  if (!r.ok) {
    return `lakebase-scm-wait-ci: ${r.error?.code}\n\n  ${r.error?.message}`;
  }
  const res = r.result!;
  const lines: string[] = ["CI green:"];
  lines.push(`  state        : ${res.state.state}`);
  lines.push(`  pr_url       : ${res.state.pr_url}`);
  lines.push(`  ci_run_url   : ${res.state.ci_run_url}`);
  lines.push(`  ci_green_at  : ${res.state.ci_green_at}`);
  lines.push(`  polls        : ${res.polls}`);
  return lines.join("\n");
}

function exitCodeForError(err: Error): number {
  if (err instanceof ScmWaitCiError) {
    switch (err.code) {
      case "no-state-file":
        return 1;
      case "bad-precondition":
        return 2;
      case "ci-failed":
        return 3;
      case "timeout":
        return 4;
      case "no-github-remote":
      case "pr-not-found":
        return 2;
    }
  }
  return 3;
}

export async function runScmWaitCiCli(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  const projectDir = path.resolve(args.projectDir ?? process.cwd());
  try {
    const result = await waitForCi({
      projectDir,
      timeoutMs: args.timeoutSec ? args.timeoutSec * 1000 : undefined,
      pollMs: args.pollSec ? args.pollSec * 1000 : undefined,
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
    const code =
      err instanceof ScmWaitCiError ? err.code : "substrate-failure";
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

if (isCliEntry(import.meta.url)) {
  void runScmWaitCiCli(process.argv.slice(2)).then((c) => process.exit(c));
}
