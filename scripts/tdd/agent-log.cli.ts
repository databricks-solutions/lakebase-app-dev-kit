#!/usr/bin/env node
// CLI: emit (or read) a structured agent-log event. FEIP-7510 observability.
//
// Emit (the entry point a headless role agent shells out to):
//   lakebase-tdd-log --role spec-author --level info \
//     --event artifact.written --message "wrote feature-spec.json" \
//     --feature F1-initial-domain --data '{"path":"feature-spec.json"}'
//
// Read (tail / filter the centralized log):
//   lakebase-tdd-log --read [--role driver] [--min-level info] [--feature F1] [--json]
//
// Exit codes: 0 ok; 2 bad args; 3 emit/validation failure.

import { isCliEntry } from "../util/cli-entry.js";
import {
  emitAgentLogEvent,
  readAgentLog,
  type AgentRole,
  type AgentLogLevel,
  type AgentLogEventInput,
} from "./agent-log.js";

interface ParsedArgs {
  read?: boolean;
  role?: string;
  level?: string;
  minLevel?: string;
  event?: string;
  message?: string;
  feature?: string;
  phase?: string;
  cycle?: string;
  data?: string;
  tddDir?: string;
  json?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--read": out.read = true; break;
      case "--role": out.role = argv[++i]; break;
      case "--level": out.level = argv[++i]; break;
      case "--min-level": out.minLevel = argv[++i]; break;
      case "--event": out.event = argv[++i]; break;
      case "--message": out.message = argv[++i]; break;
      case "--feature": out.feature = argv[++i]; break;
      case "--phase": out.phase = argv[++i]; break;
      case "--cycle": out.cycle = argv[++i]; break;
      case "--data": out.data = argv[++i]; break;
      case "--tdd-dir": out.tddDir = argv[++i]; break;
      case "--json": out.json = true; break;
      case "--help": case "-h": out.help = true; break;
    }
  }
  return out;
}

const HELP = `lakebase-tdd-log

Emit or read a structured TDD-workflow agent log event (.tdd/agent-log.jsonl).

Emit:
  lakebase-tdd-log --role <r> --level <l> --event <e> --message <m> [flags]
    --role     spec-author|ux-designer|architect-reviewer|test-strategist|
               scrum-master|navigator|driver|product-owner
    --level    debug|info|warn|error
    --event    dotted event name (e.g. phase.start, artifact.written, gate.surfaced)
    --message  human-readable one-liner
    --feature <id>   --phase <p>   --cycle <id>   --data '<json>'

Read:
  lakebase-tdd-log --read [--role <r>] [--min-level <l>] [--feature <id>] [--json]

Common:
  --tdd-dir <path>   .tdd/ root (default ./.tdd)
  -h, --help
`;

export function runAgentLogCli(argv: string[]): number {
  const a = parseArgs(argv);
  if (a.help) { process.stdout.write(`${HELP}\n`); return 0; }

  if (a.read) {
    const events = readAgentLog({
      tddDir: a.tddDir,
      role: a.role as AgentRole | undefined,
      featureId: a.feature,
      minLevel: a.minLevel as AgentLogLevel | undefined,
    });
    if (a.json) {
      process.stdout.write(`${JSON.stringify(events)}\n`);
    } else {
      for (const e of events) {
        process.stdout.write(`${e.ts} ${e.level.toUpperCase().padEnd(5)} [${e.role}] ${e.event}: ${e.message}\n`);
      }
    }
    return 0;
  }

  if (!a.role || !a.level || !a.event || !a.message) {
    process.stderr.write(`Error: emit requires --role --level --event --message.\n\n${HELP}\n`);
    return 2;
  }
  let data: Record<string, unknown> | undefined;
  if (a.data !== undefined) {
    try {
      data = JSON.parse(a.data);
    } catch (e) {
      process.stderr.write(`Error: --data is not valid JSON: ${(e as Error).message}\n`);
      return 2;
    }
  }
  const input: AgentLogEventInput = {
    role: a.role as AgentRole,
    level: a.level as AgentLogLevel,
    event: a.event,
    message: a.message,
    feature_id: a.feature,
    phase: a.phase,
    cycle_id: a.cycle,
    data,
  };
  try {
    emitAgentLogEvent(input, { tddDir: a.tddDir });
    return 0;
  } catch (e) {
    process.stderr.write(`lakebase-tdd-log: ${(e as Error).message}\n`);
    return 3;
  }
}

if (isCliEntry(import.meta.url)) {
  process.exit(runAgentLogCli(process.argv.slice(2)));
}
