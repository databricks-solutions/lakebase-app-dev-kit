#!/usr/bin/env node
// CLI: emit (or read) a structured agent-log event. observability.
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
  type AgentLogEventName,
} from "./agent-log.js";
import { reconcileArtifactLog } from "./log-reconcile.js";
import { recordBlockingSmellFlag } from "./escalation.js";

interface ParsedArgs {
  read?: boolean;
  reconcile?: boolean;
  role?: string;
  level?: string;
  minLevel?: string;
  event?: string;
  feature?: string;
  phase?: string;
  cycle?: string;
  data?: string;
  /** Template slot values from repeatable --slot key=value. */
  slots?: Record<string, unknown>;
  tddDir?: string;
  json?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--read": out.read = true; break;
      case "--reconcile": out.reconcile = true; break;
      case "--role": out.role = argv[++i]; break;
      case "--level": out.level = argv[++i]; break;
      case "--min-level": out.minLevel = argv[++i]; break;
      case "--event": out.event = argv[++i]; break;
      case "--slot": {
        const kv = argv[++i] ?? "";
        const eq = kv.indexOf("=");
        if (eq > 0) (out.slots ??= {})[kv.slice(0, eq)] = kv.slice(eq + 1);
        break;
      }
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
  lakebase-tdd-log --role <r> --level <l> --event <e> --slot k=v [--slot k=v ...] [flags]
    --role     spec-author|ux-designer|architect-reviewer|test-strategist|
               orchestrator|navigator|driver|product-owner|release-engineer
    --level    debug|info|warn|error
    --event    event name from the CLOSED vocabulary (agent-log-events.ts). An
               off-vocabulary event is rejected (exit 3). The message is RENDERED
               from the event's template; you fill its slots.
    --slot k=v fill one template slot (repeatable). A missing required slot is
               rejected (exit 3). The event NAME carries the phase; slots carry
               the specifics. NOTE: cycle.* events are CODE-emitted by the
               orchestration, agents do not emit them.
    --feature <id>   --phase <p>   --cycle <id>   --data '<json of extra slots>'

Read:
  lakebase-tdd-log --read [--role <r>] [--min-level <l>] [--feature <id>] [--json]

Reconcile (structural observability backstop):
  lakebase-tdd-log --reconcile --feature <id> [--json]
    Emit an artifact.written for every on-disk design artifact the log does not
    already cover, so observability does not depend on a role model emitting its
    own events. Idempotent. The orchestrator / smoke calls this after each phase.

Common:
  --tdd-dir <path>   .tdd/ root (default ./.tdd)
  -h, --help
`;

export function runAgentLogCli(argv: string[]): number {
  const a = parseArgs(argv);
  if (a.help) { process.stdout.write(`${HELP}\n`); return 0; }

  if (a.reconcile) {
    // Structural observability backstop: emit an artifact.written for every
    // on-disk design artifact the log does not already cover, so the log
    // reflects what was produced even when a role model skipped its own
    // emits. Idempotent. Requires --feature.
    if (!a.feature) {
      process.stderr.write("Error: --reconcile requires --feature.\n");
      return 2;
    }
    try {
      const emitted = reconcileArtifactLog({ tddDir: a.tddDir, featureId: a.feature });
      if (a.json) {
        process.stdout.write(`${JSON.stringify(emitted)}\n`);
      } else {
        process.stdout.write(`reconciled ${emitted.length} event(s) into the log for ${a.feature}\n`);
        // Most reconciled events are artifact.written (a `path`); some are code-
        // emitted reasoning (e.g. the architect's established-conventions note),
        // which carries a `note`, not a `path`. Print whichever identifies it,
        // never a bare `undefined`.
        for (const e of emitted) {
          const meta = e.metadata as { path?: string; note?: string } | undefined;
          process.stdout.write(`  + [${e.role}] ${meta?.path ?? meta?.note ?? e.message}\n`);
        }
      }
      return 0;
    } catch (e) {
      process.stderr.write(`lakebase-tdd-log --reconcile: ${(e as Error).message}\n`);
      return 3;
    }
  }

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
        process.stdout.write(`${e.timestamp} ${e.level.toUpperCase().padEnd(5)} [${e.role}] ${e.event}: ${e.message}\n`);
      }
    }
    return 0;
  }

  if (!a.role || !a.level || !a.event) {
    process.stderr.write(`Error: emit requires --role --level --event (+ the event's --slot values).\n\n${HELP}\n`);
    return 2;
  }
  const slots: Record<string, unknown> = { ...(a.slots ?? {}) };
  if (a.data !== undefined) {
    try {
      Object.assign(slots, JSON.parse(a.data) as Record<string, unknown>);
    } catch (e) {
      process.stderr.write(`Error: --data is not valid JSON: ${(e as Error).message}\n`);
      return 2;
    }
  }
  const input: AgentLogEventInput = {
    role: a.role as AgentRole,
    level: a.level as AgentLogLevel,
    event: a.event as AgentLogEventName,
    feature_id: a.feature,
    phase: a.phase,
    cycle_id: a.cycle,
    slots,
  };
  try {
    emitAgentLogEvent(input, { tddDir: a.tddDir });
    // A role-flagged BLOCKING smell must HALT the loop, not just log: mirror it
    // into smells.json so the driver's firstPendingEscalation -> raise-to-hil
    // fires before the next dispatch. No-op for advisory/unknown smell names.
    if (a.event === "smell.flagged" && typeof slots.smell === "string") {
      // Carry story/ac scope when the role names it (slots), so revise-routing
      // (FEIP-7626) knows which story to send back. The probe also falls back to
      // the active build story when scope is absent.
      recordBlockingSmellFlag(
        a.tddDir ?? "./.tdd",
        slots.smell,
        typeof slots.detail === "string" ? slots.detail : undefined,
        {
          story_id: typeof slots.story === "string" ? slots.story : undefined,
          ac_id: typeof slots.ac === "string" ? slots.ac : undefined,
        },
      );
    }
    return 0;
  } catch (e) {
    process.stderr.write(`lakebase-tdd-log: ${(e as Error).message}\n`);
    return 3;
  }
}

if (isCliEntry(import.meta.url)) {
  process.exit(runAgentLogCli(process.argv.slice(2)));
}
