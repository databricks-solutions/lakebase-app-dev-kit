#!/usr/bin/env node
// CLI: feature-claimed -> pr-ready (phase B+).

import * as path from "node:path";
import { isCliEntry } from "../util/cli-entry.js";
import {
  ScmPreparePrError,
  preparePr,
  type PreparePrResult,
} from "./scm-prepare-pr.js";

interface ParsedArgs {
  projectDir?: string;
  title?: string;
  body?: string;
  remote?: string;
  allowNoCommits?: boolean;
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
      case "--title":
        out.title = argv[++i];
        break;
      case "--body":
        out.body = argv[++i];
        break;
      case "--remote":
        out.remote = argv[++i];
        break;
      case "--allow-no-commits":
        out.allowNoCommits = true;
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

const HELP = `lakebase-scm-prepare-pr (phase B+)

Transition feature-claimed -> pr-ready: push the feature branch and
open a GitHub PR against the parent branch. Re-runs reuse an existing
open PR for the same branch.

Usage:
  lakebase-scm-prepare-pr [flags]

Flags:
  --project-dir <dir>     Project root (default: cwd)
  --title <str>           PR title (default: "feat: <feature-id>")
  --body <str>            PR body (default: generated stub)
  --remote <name>         git remote to push to (default: origin)
  --allow-no-commits      Open a PR with 0 commits ahead of parent
  --force                 Push even with a dirty working tree
  --json                  Machine-readable JSON output
  --pretty                Pretty-print JSON
  -h, --help              Show this help

Exit codes:
  0 = pr-ready
  1 = no state file
  2 = precondition refused (wrong state, dirty tree, 0 commits, wrong branch)
  3 = substrate failure (push / PR create)
`;

interface Report {
  ok: boolean;
  result?: PreparePrResult;
  error?: { code: string; message: string };
}

function renderHuman(r: Report): string {
  if (!r.ok) {
    return `lakebase-scm-prepare-pr: ${r.error?.code}\n\n  ${r.error?.message}`;
  }
  const res = r.result!;
  const lines: string[] = ["PR ready:"];
  lines.push(`  state       : ${res.state.state}`);
  lines.push(`  branch      : ${res.state.branch}`);
  lines.push(`  pr_url      : ${res.prUrl}`);
  lines.push(`  pushed_at   : ${res.state.pushed_at}`);
  lines.push(`  pr_created  : ${res.prCreated}`);
  return lines.join("\n");
}

function exitCodeForError(err: Error): number {
  if (err instanceof ScmPreparePrError) {
    if (err.code === "no-state-file") return 1;
    if (
      err.code === "push-failed" ||
      err.code === "pr-failed" ||
      err.code === "no-github-remote"
    )
      return 3;
    return 2;
  }
  return 3;
}

export async function runScmPreparePrCli(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  const projectDir = path.resolve(args.projectDir ?? process.cwd());
  try {
    const result = await preparePr({
      projectDir,
      title: args.title,
      body: args.body,
      remote: args.remote,
      allowNoCommits: args.allowNoCommits,
      force: args.force,
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
    const code = err instanceof ScmPreparePrError ? err.code : "substrate-failure";
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
  void runScmPreparePrCli(process.argv.slice(2)).then((c) => process.exit(c));
}
