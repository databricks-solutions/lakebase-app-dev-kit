#!/usr/bin/env node
// CLI: adopt the SCM workflow state for an existing project (phase B+).
//
// For projects scaffolded before phase A landed, or projects that were
// hand-paired without going through lakebase-create-project. Reads the
// current branch + the project's Lakebase tier inventory and writes the
// closest matching .lakebase/workflow-state.json.
//
// Output modes:
//   default: human-readable summary + adoption notes
//   --json : machine-readable structured report
//
// Exit codes:
//   0 = adoption succeeded
//   1 = workflow-state.json already present (use --force to overwrite)
//   2 = adoption refused (unrecognized branch, missing pair, missing instance)
//   3 = substrate failure

import * as fs from "node:fs";
import * as path from "node:path";
import { isCliEntry } from "../util/cli-entry.js";
import {
  ScmAdoptError,
  adoptScmState,
  type AdoptStateResult,
} from "./scm-adopt-state.js";

interface ParsedArgs {
  projectDir?: string;
  instance?: string;
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

const HELP = `lakebase-scm-adopt-state (phase B+)

Seed .lakebase/workflow-state.json for a project that pre-dates the
SCM workflow state machine. Reads the current git branch + the
Lakebase tier inventory to construct the closest matching state row.

Usage:
  lakebase-scm-adopt-state [flags]

Flags:
  --project-dir <dir>   Project root (default: cwd)
  --instance <id>       Lakebase project id (default: from .env LAKEBASE_PROJECT_ID)
  --force               Overwrite an existing .lakebase/workflow-state.json
  --json                Machine-readable JSON output
  --pretty              Pretty-print JSON (only with --json)
  -h, --help            Show this help

Exit codes:
  0 = adoption succeeded
  1 = workflow-state.json already present (use --force)
  2 = adoption refused (unrecognized branch / missing pair / missing instance)
  3 = substrate failure
`;

function readEnvProjectId(projectDir: string): string | undefined {
  const envPath = path.join(projectDir, ".env");
  if (!fs.existsSync(envPath)) return undefined;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*LAKEBASE_PROJECT_ID\s*=\s*(.+?)\s*$/);
    if (m) {
      return m[1].replace(/^["']|["']$/g, "");
    }
  }
  return undefined;
}

interface AdoptReport {
  ok: boolean;
  state?: AdoptStateResult["state"];
  notes?: string[];
  error?: { code: string; message: string };
}

function renderHuman(report: AdoptReport): string {
  if (!report.ok) {
    return `lakebase-scm-adopt-state: ${report.error?.code}\n\n  ${report.error?.message}`;
  }
  const s = report.state!;
  const lines: string[] = [];
  lines.push("Adopted SCM workflow state:");
  lines.push(`  state          : ${s.state}`);
  lines.push(`  tier_topology  : ${s.tier_topology}`);
  lines.push(`  project_id     : ${s.project_id}`);
  if (s.feature_id) lines.push(`  feature_id     : ${s.feature_id}`);
  if (s.branch) lines.push(`  branch         : ${s.branch}`);
  if (s.parent_branch) lines.push(`  parent_branch  : ${s.parent_branch}`);
  if (s.lakebase_branch_uid)
    lines.push(`  lakebase_uid   : ${s.lakebase_branch_uid}`);
  if (s.claimed_at) lines.push(`  claimed_at     : ${s.claimed_at}`);
  if (report.notes && report.notes.length > 0) {
    lines.push("");
    lines.push("notes:");
    for (const n of report.notes) {
      lines.push(`  - ${n}`);
    }
  }
  return lines.join("\n");
}

function exitCodeForError(err: Error): number {
  if (err instanceof ScmAdoptError) {
    if (err.code === "already-adopted") return 1;
    return 2;
  }
  return 3;
}

export async function runScmAdoptStateCli(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  const projectDir = path.resolve(args.projectDir ?? process.cwd());
  const instance = args.instance ?? readEnvProjectId(projectDir);
  try {
    if (!instance) {
      throw new ScmAdoptError(
        "Could not resolve LAKEBASE_PROJECT_ID from .env. Pass --instance explicitly.",
        "missing-instance",
      );
    }
    const result = await adoptScmState({
      projectDir,
      instance,
      force: args.force,
    });
    const report: AdoptReport = {
      ok: true,
      state: result.state,
      notes: result.notes,
    };
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
      err instanceof ScmAdoptError ? err.code : "substrate-failure";
    const report: AdoptReport = {
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
  void runScmAdoptStateCli(process.argv.slice(2)).then((c) => process.exit(c));
}
