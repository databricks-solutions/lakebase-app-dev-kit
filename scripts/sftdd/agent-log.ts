// observability: a centralized structured logger for the TDD-workflow
// role agents. The workflow is a relay of isolated-memory agents; each emits
// what it is doing (and why, at debug level) so the whole run is
// reconstructable from one file: .sftdd/agent-log.jsonl (JSON Lines).
//
// emitAgentLogEvent validates against agent-log-event.schema.json, stamps the
// timestamp, and atomically appends a single line. readAgentLog parses + filters.
//
// Concurrency: each emit is a single appendFileSync of one "line\n". On POSIX
// a write smaller than PIPE_BUF is atomic, so concurrent role agents interleave
// at line boundaries without corrupting each other (log lines are small).

import { appendFileSync, existsSync, readFileSync } from "fs";
import { resolveTddDir } from "./sftdd-paths.js";
import { join } from "path";
import { getValidator, formatSchemaErrors } from "./schema-loader";
import { renderEventMessage, type AgentLogEventName } from "./agent-log-events.js";

export type { AgentLogEventName } from "./agent-log-events.js";

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

/** One persisted log line. Field order: timestamp, level, role, model?, effort?, event, message, metadata. */
export interface AgentLogEvent {
  timestamp: string;
  level: AgentLogLevel;
  role: AgentRole;
  /** The model the role's turn ran with (per-turn dispatch events); omitted otherwise. */
  model?: string;
  /** The --effort the role's turn ran with ("default" => no flag); per-turn dispatch events. */
  effort?: string;
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
  /** The model the role's turn ran with (set on the per-turn dispatch events). */
  model?: string;
  /** The --effort the role's turn ran with ("default" => no flag). */
  effort?: string;
  /** Must be one of the closed vocabulary (agent-log-events.ts). */
  event: AgentLogEventName;
  /**
   * Values that fill the event's message template (its `{{ placeholders }}`).
   * Every required slot must be present or the emit THROWS (nothing dropped).
   * Slots are also folded into `metadata` so the structured payload carries them.
   * `role` / `feature_id` / `phase` / `cycle_id` are available to the template too
   * (from the fields below), so they do not need to be repeated here.
   */
  slots?: Record<string, unknown>;
  feature_id?: string;
  phase?: string;
  cycle_id?: string;
  metadata?: AgentLogMetadata;
}

export interface AgentLogIoOpts {
  /** Path to the .sftdd/ root. Default: "./.sftdd". */
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
/** Render + validate ONE event input into a full AgentLogEvent (no write). Throws
 *  when the event is off-vocabulary, missing a required slot, or schema-invalid.
 *  Shared by the single + batch emitters so both enforce the identical contract. */
function buildAgentLogEvent(input: AgentLogEventInput, now: () => Date): AgentLogEvent {
  const slots = input.slots ?? {};
  // The message is RENDERED from the event's template + the render context (the
  // top-level fields the template may reference + the slots). renderEventMessage
  // THROWS if `event` is off-vocabulary or any required slot is missing , the
  // format is enforced at the source and nothing is dropped.
  const renderCtx: Record<string, unknown> = {
    role: input.role,
    ...(input.feature_id !== undefined ? { feature_id: input.feature_id } : {}),
    ...(input.phase !== undefined ? { phase: input.phase } : {}),
    ...(input.cycle_id !== undefined ? { cycle_id: input.cycle_id } : {}),
    ...slots,
  };
  const message = renderEventMessage(input.event, renderCtx);
  // Assemble metadata with feature_id first, then phase / cycle_id, then the
  // slots + any explicit metadata. Omit entirely when empty.
  const metadata: AgentLogMetadata = {
    ...(input.feature_id !== undefined ? { feature_id: input.feature_id } : {}),
    ...(input.phase !== undefined ? { phase: input.phase } : {}),
    ...(input.cycle_id !== undefined ? { cycle_id: input.cycle_id } : {}),
    ...slots,
    ...(input.metadata ?? {}),
  };
  const event: AgentLogEvent = {
    timestamp: input.timestamp ?? now().toISOString(),
    level: input.level,
    role: input.role,
    // model + effort sit right after role (the per-turn dispatch events carry them).
    ...(input.model ? { model: input.model } : {}),
    ...(input.effort ? { effort: input.effort } : {}),
    event: input.event,
    message,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
  const validate = getValidator("agent-log-event.schema.json");
  if (!validate(event)) {
    throw new Error(`invalid agent log event: ${formatSchemaErrors(validate).join("; ")}`);
  }
  return event;
}

export function emitAgentLogEvent(input: AgentLogEventInput, opts: AgentLogIoOpts = {}): AgentLogEvent {
  const tddDir = opts.tddDir ?? resolveTddDir();
  const now = opts.now ?? (() => new Date());
  const event = buildAgentLogEvent(input, now);
  appendFileSync(logFilePath(tddDir), `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

/**
 * Emit MANY events in ONE process + ONE append (a single `\n`-joined write), so a
 * role that has several judgment events for a turn (reasoning + a smell flag + a
 * concern) pays ONE `lakebase-sftdd-log` subprocess spawn instead of N. Every
 * event is rendered + schema-validated FIRST; if ANY is invalid the whole batch
 * throws and NOTHING is written (no partial batch on disk). An empty list is a
 * no-op. Returns the events written.
 */
export function emitAgentLogEvents(inputs: AgentLogEventInput[], opts: AgentLogIoOpts = {}): AgentLogEvent[] {
  if (inputs.length === 0) return [];
  const tddDir = opts.tddDir ?? resolveTddDir();
  const now = opts.now ?? (() => new Date());
  const events = inputs.map((i) => buildAgentLogEvent(i, now)); // validates all before any write
  appendFileSync(logFilePath(tddDir), events.map((e) => `${JSON.stringify(e)}\n`).join(""), "utf8");
  return events;
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
  const tddDir = opts.tddDir ?? resolveTddDir();
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
