#!/usr/bin/env node
// CLI for the SCM workflow's claim-feature-branch transition (FEIP-7458 phase B).
//
//   scaffold-complete | merged --[claim]--> feature-claimed
//
// Wraps claimFeatureBranch with argv parsing + text / JSON output. The
// substrate primitives it calls do the real Lakebase + git + .env work;
// this bin's job is to enforce the precondition and persist the new
// workflow state.
//
// Output modes:
//   default: human-readable summary
//   --json : machine-readable structured report
//
// Exit codes:
//   0 = transition succeeded (or no-op idempotent re-claim)
//   1 = no state file (project not scaffolded; run lakebase-create-project)
//   2 = precondition refused (wrong state, missing instance, bad feature-id,
//       or workflow already at feature-claimed for a DIFFERENT feature)
//   3 = substrate failure (Lakebase create / git checkout / .env sync failed)

import * as path from "node:path";
import { isCliEntry } from "../util/cli-entry.js";
import {
  ScmClaimError,
  claimFeatureBranch,
  type ClaimFeatureBranchResult,
} from "./scm-claim-feature.js";

interface ParsedArgs {
  featureId?: string;
  projectDir?: string;
  instance?: string;
  parent?: string;
  noIdempotent?: boolean;
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
      case "--parent":
        out.parent = argv[++i];
        break;
      case "--no-idempotent":
        out.noIdempotent = true;
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
        if (!a.startsWith("-") && out.featureId === undefined) {
          out.featureId = a;
        }
        break;
    }
  }
  return out;
}

const HELP = `lakebase-scm-claim-feature-branch (FEIP-7458, phase B)

Claim a new feature branch through the SCM workflow. Cuts the paired
Lakebase + git branch via createFeaturePairedBranch (30-day TTL),
syncs .env, and advances .lakebase/workflow-state.json from
scaffold-complete (or merged) to feature-claimed.

Usage:
  lakebase-scm-claim-feature-branch <feature-id> [flags]

Arguments:
  <feature-id>          Feature identifier (e.g. "initial-domain").
                        Sanitized; the branch becomes feature/<slug>.

Flags:
  --project-dir <dir>   Project to claim in (default: cwd)
  --instance <id>       Lakebase project id (default: from workflow state)
  --parent <branch>     Override parent branch (default: per tier_topology
                        - tier 1: project default, tier 2: staging, tier 3: dev)
  --no-idempotent       Re-running with the same feature-id fails instead
                        of returning the existing claim as a no-op.
  --json                Machine-readable JSON output
  --pretty              Pretty-print JSON (only with --json)
  -h, --help            Show this help

Exit codes:
  0 = transition succeeded (or idempotent no-op)
  1 = no state file
  2 = precondition refused
  3 = substrate failure
`;

interface ClaimReport {
  ok: boolean;
  alreadyClaimed?: boolean;
  feature_id?: string;
  branch?: string;
  parent_branch?: string;
  lakebase_branch_uid?: string;
  claimed_at?: string;
  warnings?: string[];
  error?: { code: string; message: string };
}

function reportFromResult(result: ClaimFeatureBranchResult): ClaimReport {
  return {
    ok: true,
    alreadyClaimed: result.alreadyClaimed,
    feature_id: result.state.feature_id,
    branch: result.state.branch,
    parent_branch: result.state.parent_branch,
    lakebase_branch_uid: result.state.lakebase_branch_uid,
    claimed_at: result.state.claimed_at,
    warnings: result.paired.warnings.length > 0 ? result.paired.warnings : undefined,
  };
}

function reportFromError(e: ScmClaimError | Error): ClaimReport {
  if (e instanceof ScmClaimError) {
    return { ok: false, error: { code: e.code, message: e.message } };
  }
  return { ok: false, error: { code: "substrate-failure", message: e.message } };
}

function exitCodeForError(e: ScmClaimError | Error): number {
  if (!(e instanceof ScmClaimError)) return 3;
  if (e.code === "no-state-file") return 1;
  return 2;
}

function renderHuman(report: ClaimReport): string {
  const lines: string[] = [];
  if (!report.ok) {
    lines.push(`lakebase-scm-claim-feature-branch: ${report.error?.code}`);
    lines.push("");
    for (const ln of (report.error?.message ?? "").split("\n")) {
      lines.push(`  ${ln}`);
    }
    return lines.join("\n");
  }
  const header = report.alreadyClaimed
    ? "Feature already claimed (no-op):"
    : "Feature claimed:";
  lines.push(header);
  lines.push(`  feature_id    : ${report.feature_id ?? "(unknown)"}`);
  lines.push(`  branch        : ${report.branch ?? "(unknown)"}`);
  lines.push(`  parent_branch : ${report.parent_branch ?? "(unknown)"}`);
  lines.push(`  lakebase_uid  : ${report.lakebase_branch_uid ?? "(unknown)"}`);
  lines.push(`  claimed_at    : ${report.claimed_at ?? "(unknown)"}`);
  if (report.warnings && report.warnings.length > 0) {
    lines.push("");
    lines.push("  warnings:");
    for (const w of report.warnings) {
      lines.push(`    - ${w}`);
    }
  }
  return lines.join("\n");
}

export async function runScmClaimFeatureCli(
  argv: string[],
): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  if (!args.featureId) {
    process.stderr.write(
      `Error: <feature-id> is required.\n\n${HELP}\n`,
    );
    return 2;
  }
  const projectDir = path.resolve(args.projectDir ?? process.cwd());
  try {
    const result = await claimFeatureBranch({
      projectDir,
      featureId: args.featureId,
      instance: args.instance,
      parentBranchOverride: args.parent,
      idempotent: args.noIdempotent !== true,
    });
    const report = reportFromResult(result);
    if (args.json) {
      const indent = args.pretty ? 2 : 0;
      process.stdout.write(`${JSON.stringify(report, null, indent)}\n`);
    } else {
      process.stdout.write(`${renderHuman(report)}\n`);
    }
    return 0;
  } catch (e) {
    const err = e as Error;
    const report = reportFromError(err);
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
  void runScmClaimFeatureCli(process.argv.slice(2)).then((code) =>
    process.exit(code),
  );
}
