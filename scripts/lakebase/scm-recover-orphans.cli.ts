#!/usr/bin/env node
// CLI: detect orphan git branches + (optionally) retroactively claim them
// via the substrate primitive. phase C.

import * as fs from "node:fs";
import * as path from "node:path";
import { isCliEntry } from "../util/cli-entry.js";
import {
  ScmRecoverError,
  recoverOrphans,
  type RecoverOrphansResult,
} from "./scm-recover-orphans.js";

interface ParsedArgs {
  projectDir?: string;
  instance?: string;
  claim?: boolean;
  onlyBranch?: string;
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
      case "--claim":
        out.claim = true;
        break;
      case "--only-branch":
        out.onlyBranch = argv[++i];
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

const HELP = `lakebase-scm-recover-orphans (phase C)

Detect (and optionally claim) git branches that lack a paired Lakebase
branch. Migration path for projects with orphans created by the pre-
phase-C post-checkout fallback hook.

Usage:
  lakebase-scm-recover-orphans [flags]

Default mode (no flags): detect-only. Lists orphans + skipped branches
so you can inspect before acting.

Flags:
  --project-dir <dir>   Project root (default: cwd)
  --instance <id>       Lakebase project id (default: from .env LAKEBASE_PROJECT_ID)
  --claim               Retroactively pair every orphan via the substrate.
                        Only the orphan matching HEAD (or the first one
                        if none match) updates .lakebase/workflow-state.json;
                        the others get their Lakebase pair created but
                        the state row is left alone.
  --only-branch <name>  Limit --claim to a specific branch
  --json                Machine-readable JSON output
  --pretty              Pretty-print JSON
  -h, --help            Show this help

Exit codes:
  0 = success (orphans listed; claim succeeded if requested; no orphans = also 0)
  1 = (reserved for future "no state file" scenario)
  2 = refused (missing instance, claim-conflict, unrecognized --only-branch)
  3 = substrate failure during claim
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

interface Report {
  ok: boolean;
  result?: RecoverOrphansResult;
  error?: { code: string; message: string };
}

function renderHuman(r: Report): string {
  if (!r.ok) {
    return `lakebase-scm-recover-orphans: ${r.error?.code}\n\n  ${r.error?.message}`;
  }
  const res = r.result!;
  const lines: string[] = [];
  lines.push(`tier_topology: ${res.tierTopology}`);
  lines.push("");
  if (res.orphans.length === 0) {
    lines.push("No orphan branches found.");
  } else {
    lines.push(`Orphans (${res.orphans.length}):`);
    for (const o of res.orphans) {
      const marker = o.isCurrent ? "* " : "  ";
      lines.push(`${marker}${o.gitBranch}  -> sanitized "${o.sanitized}"`);
      lines.push(`     reason: ${o.reason}`);
    }
  }
  if (res.skipped.length > 0) {
    lines.push("");
    lines.push("Skipped (not orphans):");
    for (const s of res.skipped) {
      lines.push(`  ${s.gitBranch}  (${s.reason})`);
    }
  }
  if (res.claimed.length > 0) {
    lines.push("");
    lines.push("Claimed:");
    for (const c of res.claimed) {
      lines.push(
        `  ${c.candidate.gitBranch}  -> uid ${c.lakebaseBranchUid}${c.stateUpdated ? " [state-row updated]" : ""}`,
      );
      for (const w of c.warnings) {
        lines.push(`     warning: ${w}`);
      }
    }
  }
  return lines.join("\n");
}

function exitCodeForError(err: Error): number {
  if (err instanceof ScmRecoverError) {
    if (err.code === "substrate-failure") return 3;
    return 2;
  }
  return 3;
}

export async function runScmRecoverOrphansCli(
  argv: string[],
): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  const projectDir = path.resolve(args.projectDir ?? process.cwd());
  const instance = args.instance ?? readEnvProjectId(projectDir);
  try {
    if (!instance) {
      throw new ScmRecoverError(
        "Could not resolve LAKEBASE_PROJECT_ID. Pass --instance explicitly.",
        "missing-instance",
      );
    }
    const result = await recoverOrphans({
      projectDir,
      instance,
      claim: args.claim,
      onlyBranch: args.onlyBranch,
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
    const code = err instanceof ScmRecoverError ? err.code : "substrate-failure";
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
  void runScmRecoverOrphansCli(process.argv.slice(2)).then((c) =>
    process.exit(c),
  );
}
