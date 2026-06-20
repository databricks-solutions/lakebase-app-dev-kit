#!/usr/bin/env node
// CLI: per-turn timing report from the centralized agent log
// (.tdd/agent-log.jsonl). The enabler (P0) for the agent-loop optimization plan
// , prints where wall-clock actually goes so each change is A/B-measurable.
//
//   lakebase-sftdd-timing [--tdd-dir <path>] [--feature <id>] [--top <n>] [--json]
//
// Exit codes: 0 ok; 2 bad args.

import { join } from "path";
import { isCliEntry } from "../util/cli-entry.js";
import { timingReportFromLog, formatTimingReport } from "./timing-report.js";
import { readRunConfig, formatRunConfig } from "./run-config.js";

interface ParsedArgs {
  tddDir?: string;
  feature?: string;
  top?: number;
  json?: boolean;
  help?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs | { error: string } {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--tdd-dir": out.tddDir = argv[++i]; break;
      case "--feature": out.feature = argv[++i]; break;
      case "--top": {
        const n = Number(argv[++i]);
        if (!Number.isFinite(n) || n < 0) return { error: "--top expects a non-negative number" };
        out.top = Math.floor(n);
        break;
      }
      case "--json": out.json = true; break;
      case "--help": case "-h": out.help = true; break;
      default: return { error: `unknown arg: ${argv[i]}` };
    }
  }
  return out;
}

const HELP = `lakebase-sftdd-timing

Per-turn timing report from the agent log (.tdd/agent-log.jsonl). Spans are the
gaps between consecutive log events, attributed to the ending event, then rolled
up by phase, role, and role/event kind, with the slowest spans surfaced.

  lakebase-sftdd-timing [flags]
    --tdd-dir <path>  .tdd/ root (default ./.tdd)
    --feature <id>    only this feature's events
    --top <n>         how many slowest spans to surface (default 10)
    --json            emit the TimingReport as JSON (the machine API)
    -h, --help
`;

export function runTimingCli(argv: string[]): number {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    process.stderr.write(`Error: ${parsed.error}\n\n${HELP}\n`);
    return 2;
  }
  if (parsed.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  const report = timingReportFromLog(
    { tddDir: parsed.tddDir, featureId: parsed.feature },
    { topN: parsed.top },
  );
  // P0.1: pair the timing with the run's model + option matrix so it is
  // self-describing and two reports are A/B-comparable. Read from the same .tdd.
  const tddDir = parsed.tddDir ?? join(process.cwd(), ".tdd");
  const config = readRunConfig(tddDir) ?? null;
  if (parsed.json) {
    process.stdout.write(`${JSON.stringify({ config, timing: report }, null, 2)}\n`);
  } else {
    if (config) process.stdout.write(formatRunConfig(config) + "\n");
    process.stdout.write(formatTimingReport(report));
  }
  return 0;
}

if (isCliEntry(import.meta.url)) {
  process.exit(runTimingCli(process.argv.slice(2)));
}
