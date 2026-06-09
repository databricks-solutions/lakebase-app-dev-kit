// observability: a centralized structured logger for the TDD-workflow
// role agents. The workflow is a relay of isolated-memory agents; each emits
// what it is doing (and why, at debug level) so the whole run is
// reconstructable from one file: .tdd/agent-log.jsonl (JSON Lines).
//
// emitAgentLogEvent validates against agent-log-event.schema.json, stamps the
// timestamp, and atomically appends a single line. readAgentLog parses + filters.
//
// Concurrency: each emit is a single appendFileSync of one "line\n". On POSIX
// a write smaller than PIPE_BUF is atomic, so concurrent role agents interleave
// at line boundaries without corrupting each other (log lines are small).

import { appendFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { getValidator, formatSchemaErrors } from "./schema-loader";

export type AgentRole =
  | "spec-author"
  | "ux-designer"
  | "architect-reviewer"
  | "test-strategist"
  | "orchestrator"
  | "navigator"
  | "driver"
  | "product-owner"
  | "release-engineer";

export type AgentLogLevel = "debug" | "info" | "warn" | "error";

/** Severity ordering for minLevel filtering. */
const LEVEL_ORDER: Record<AgentLogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * Structured payload. `feature_id` is the top-level metadata attribute (the
 * primary scope key); `phase` / `cycle_id` and any event-specific keys
 * (artifact path, gate name, conformance violations, ...) follow.
 */
export interface AgentLogMetadata {
  feature_id?: string;
  phase?: string;
  cycle_id?: string;
  [key: string]: unknown;
}

/** One persisted log line. Field order: timestamp, level, role, event, message, metadata. */
export interface AgentLogEvent {
  timestamp: string;
  level: AgentLogLevel;
  role: AgentRole;
  event: string;
  message: string;
  metadata?: AgentLogMetadata;
}

/**
 * Input to emit. The logger stamps `timestamp` if omitted and assembles
 * `metadata` from the convenience fields (`feature_id` / `phase` / `cycle_id` /
 * `data`) plus any explicit `metadata`, with `feature_id` first.
 */
export interface AgentLogEventInput {
  timestamp?: string;
  level: AgentLogLevel;
  role: AgentRole;
  event: string;
  message: string;
  feature_id?: string;
  phase?: string;
  cycle_id?: string;
  data?: Record<string, unknown>;
  metadata?: AgentLogMetadata;
}

export interface AgentLogIoOpts {
  /** Path to the .tdd/ root. Default: "./.tdd". */
  tddDir?: string;
  /** Test seam for a deterministic clock. */
  now?: () => Date;
}

function logFilePath(tddDir: string): string {
  return join(tddDir, "agent-log.jsonl");
}

/**
 * Validate, timestamp, and append one structured event to the centralized
 * agent log. Throws when the event fails schema validation (so a malformed
 * emit is caught at the source, not discovered later in the log). Returns the
 * full event that was written.
 */
export function emitAgentLogEvent(input: AgentLogEventInput, opts: AgentLogIoOpts = {}): AgentLogEvent {
  const tddDir = opts.tddDir ?? "./.tdd";
  const now = opts.now ?? (() => new Date());
  // Assemble metadata with feature_id first, then phase / cycle_id, then the
  // free-form payload + any explicit metadata. Omit entirely when empty.
  const metadata: AgentLogMetadata = {
    ...(input.feature_id !== undefined ? { feature_id: input.feature_id } : {}),
    ...(input.phase !== undefined ? { phase: input.phase } : {}),
    ...(input.cycle_id !== undefined ? { cycle_id: input.cycle_id } : {}),
    ...(input.data ?? {}),
    ...(input.metadata ?? {}),
  };
  const event: AgentLogEvent = {
    timestamp: input.timestamp ?? now().toISOString(),
    level: input.level,
    role: input.role,
    event: input.event,
    message: input.message,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };

  const validate = getValidator("agent-log-event.schema.json");
  if (!validate(event)) {
    throw new Error(`invalid agent log event: ${formatSchemaErrors(validate).join("; ")}`);
  }

  appendFileSync(logFilePath(tddDir), `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export interface ReadAgentLogOpts extends AgentLogIoOpts {
  role?: AgentRole;
  featureId?: string;
  /** Minimum severity to include (e.g. "info" hides "debug"). */
  minLevel?: AgentLogLevel;
}

/**
 * Read + filter the centralized log. Returns [] when no log exists yet.
 * Malformed lines are skipped (a partially-written tail never throws).
 */
export function readAgentLog(opts: ReadAgentLogOpts = {}): AgentLogEvent[] {
  const tddDir = opts.tddDir ?? "./.tdd";
  const file = logFilePath(tddDir);
  if (!existsSync(file)) return [];

  const minRank = opts.minLevel !== undefined ? LEVEL_ORDER[opts.minLevel] : undefined;
  const out: AgentLogEvent[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.trim().length === 0) continue;
    let ev: AgentLogEvent;
    try {
      ev = JSON.parse(line) as AgentLogEvent;
    } catch {
      continue; // skip a malformed / partially-written line
    }
    if (opts.role !== undefined && ev.role !== opts.role) continue;
    if (opts.featureId !== undefined && ev.metadata?.feature_id !== opts.featureId) continue;
    if (minRank !== undefined && LEVEL_ORDER[ev.level] < minRank) continue;
    out.push(ev);
  }
  return out;
}
