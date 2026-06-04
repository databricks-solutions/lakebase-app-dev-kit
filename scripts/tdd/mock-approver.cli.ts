#!/usr/bin/env node
// CLI: mock HITL approver for automated smoke runs.
//
//   lakebase-tdd-mock-approver --feature <id>           # approve all open gates
//   lakebase-tdd-mock-approver --feature <id> --gate spec
//   lakebase-tdd-mock-approver --feature <id> --json --pretty
//
// Wraps mockApproveOpenGates. Exit codes:
//   0 = at least one gate approved (or all already-closed; idempotent no-op also returns 0)
//   2 = bad args
//   3 = substrate failure

import { isCliEntry } from "../util/cli-entry.js";
import { mockApproveOpenGates } from "./mock-approver.js";
import type { GateName } from "./gates.js";

interface ParsedArgs {
  feature?: string;
  gate?: GateName;
  tddDir?: string;
  approver?: string;
  promoteRef?: string;
  json?: boolean;
  pretty?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--feature":
        out.feature = argv[++i];
        break;
      case "--gate":
        out.gate = argv[++i] as GateName;
        break;
      case "--tdd-dir":
        out.tddDir = argv[++i];
        break;
      case "--approver":
        out.approver = argv[++i];
        break;
      case "--promote-ref":
        out.promoteRef = argv[++i];
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

const HELP = `lakebase-tdd-mock-approver

Mock HITL approver for automated smoke / headless test runs. Calls
approveGate on every open gate for a feature with hitlApproved=true,
default approver "ci-mock-approver". NOT for production use.

Usage:
  lakebase-tdd-mock-approver --feature <id> [flags]

Flags:
  --feature <id>          Feature id (required, e.g. F1-initial-domain)
  --gate <name>           Approve only one gate (spec | plan | test_list | promote)
  --tdd-dir <path>        .tdd/ root (default: ./.tdd)
  --approver <name>       Approver identity (default: ci-mock-approver)
  --promote-ref <str>     promote gate ref string (default: mock-promote-ref)
  --json                  Machine-readable JSON output
  --pretty                Pretty-print JSON
  -h, --help              Show this help
`;

export function runMockApproverCli(argv: string[]): number {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  if (!args.feature) {
    process.stderr.write(`Error: --feature is required.\n\n${HELP}\n`);
    return 2;
  }
  try {
    const result = mockApproveOpenGates({
      featureId: args.feature,
      tddDir: args.tddDir,
      approver: args.approver,
      onlyGate: args.gate,
      promoteRef: args.promoteRef,
    });
    if (args.json) {
      process.stdout.write(
        `${JSON.stringify(
          { ok: true, ...result },
          null,
          args.pretty ? 2 : 0,
        )}\n`,
      );
    } else {
      process.stdout.write(
        `mock-approver: approved ${result.approved.length} gate(s)${result.approved.length ? ": " + result.approved.join(", ") : ""}\n`,
      );
      if (result.skipped.length > 0) {
        process.stdout.write(
          `mock-approver: skipped ${result.skipped.length}: ${result.skipped.map((s) => `${s.gate} (${s.reason})`).join(", ")}\n`,
        );
      }
    }
    return 0;
  } catch (e) {
    const err = e as Error;
    process.stderr.write(`mock-approver: ${err.message}\n`);
    return 3;
  }
}

if (isCliEntry(import.meta.url)) {
  process.exit(runMockApproverCli(process.argv.slice(2)));
}
