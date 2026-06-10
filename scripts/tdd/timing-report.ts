// P0 (agent-loop optimization enabler): a per-turn timing report derived from
// the centralized agent log (.tdd/agent-log.jsonl). The orchestrator already
// stamps every event with an ISO timestamp; this turns that stream into
// durations so every optimization (P1 test-strategist outlier, P2 review
// pre-digest, P7 inter-phase overhead, ...) is A/B-measurable from the log
// instead of eyeballed.
//
// Model: the log is a time-ordered sequence of events, each marking the
// COMPLETION of some work (a role wrote its artifact, then emitted; the
// orchestration stamped a RED/GREEN cycle). The gap between event[i-1] and
// event[i] is "how long the system spent producing event[i]", so each span is
// attributed to event[i]'s role + event + phase. This is an APPROXIMATION (it
// cannot see a cold `claude -p` boot before a turn's first emit, and a turn that
// emits several events splits across spans), but it is faithful enough to find
// the outliers the optimization plan targets , and it costs nothing extra to
// collect (the timestamps already exist).

import { readAgentLog, type AgentLogEvent, type ReadAgentLogOpts } from "./agent-log.js";

/** One inter-event span: the work that produced `event` since the prior event. */
export interface TurnTiming {
  /** 1-based position of the ending event in the ordered stream. */
  index: number;
  role: string;
  event: string;
  phase?: string;
  story?: string;
  ac?: string;
  cycleId?: string;
  /** Prior event's timestamp (when this span began). */
  startedAt: string;
  /** This event's timestamp (when this span ended). */
  endedAt: string;
  /** endedAt - startedAt, in seconds (>= 0). */
  seconds: number;
}

/** A summed grouping (by phase, role, or role/event kind). */
export interface GroupRollup {
  key: string;
  /** Total seconds across the group's spans. */
  seconds: number;
  /** Number of spans in the group. */
  count: number;
  /** seconds / count. */
  avgSeconds: number;
  /** Largest single span in the group. */
  maxSeconds: number;
}

export interface TimingReport {
  /** Total events considered (with a parseable timestamp). */
  events: number;
  /** Wall-clock span of the whole log: last - first, in seconds. */
  totalSeconds: number;
  startedAt?: string;
  endedAt?: string;
  /** Per inter-event span (every event after the first). */
  turns: TurnTiming[];
  /** Spans summed by `metadata.phase` (desc by total seconds). */
  byPhase: GroupRollup[];
  /** Spans summed by `role` (desc). */
  byRole: GroupRollup[];
  /** Spans summed by `role/event` kind (desc) , the per-turn-type breakdown. */
  byKind: GroupRollup[];
  /** The N slowest individual spans (desc) , the outliers to attack. */
  slowest: TurnTiming[];
}

export interface ComputeTimingOpts {
  /** How many slowest spans to surface (default 10). */
  topN?: number;
}

function metaStr(ev: AgentLogEvent, key: string): string | undefined {
  const v = ev.metadata?.[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function parseTs(ts: string): number {
  const n = Date.parse(ts);
  return Number.isNaN(n) ? NaN : n;
}

function rollup(turns: TurnTiming[], keyOf: (t: TurnTiming) => string | undefined): GroupRollup[] {
  const acc = new Map<string, { seconds: number; count: number; max: number }>();
  for (const t of turns) {
    const key = keyOf(t);
    if (key === undefined) continue;
    const cur = acc.get(key) ?? { seconds: 0, count: 0, max: 0 };
    cur.seconds += t.seconds;
    cur.count += 1;
    cur.max = Math.max(cur.max, t.seconds);
    acc.set(key, cur);
  }
  return [...acc.entries()]
    .map(([key, v]) => ({
      key,
      seconds: round(v.seconds),
      count: v.count,
      avgSeconds: round(v.seconds / v.count),
      maxSeconds: round(v.max),
    }))
    .sort((a, b) => b.seconds - a.seconds);
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Turn an ordered agent-log stream into a timing report. Events with an
 * unparseable timestamp are dropped; the rest are sorted ascending (stable on
 * ties) and each adjacent pair becomes one attributed span.
 */
export function computeTiming(events: AgentLogEvent[], opts: ComputeTimingOpts = {}): TimingReport {
  const topN = opts.topN ?? 10;
  // Keep only timestamp-parseable events, remembering original order so equal
  // timestamps (sub-second emits) stay in emit order rather than reshuffling.
  const stamped = events
    .map((ev, i) => ({ ev, i, t: parseTs(ev.timestamp) }))
    .filter((x) => !Number.isNaN(x.t))
    .sort((a, b) => a.t - b.t || a.i - b.i);

  if (stamped.length === 0) {
    return { events: 0, totalSeconds: 0, turns: [], byPhase: [], byRole: [], byKind: [], slowest: [] };
  }

  const turns: TurnTiming[] = [];
  for (let k = 1; k < stamped.length; k++) {
    const prev = stamped[k - 1];
    const cur = stamped[k];
    turns.push({
      index: k + 1,
      role: cur.ev.role,
      event: cur.ev.event,
      phase: metaStr(cur.ev, "phase"),
      story: metaStr(cur.ev, "story"),
      ac: metaStr(cur.ev, "ac"),
      cycleId: metaStr(cur.ev, "cycle_id"),
      startedAt: prev.ev.timestamp,
      endedAt: cur.ev.timestamp,
      seconds: round((cur.t - prev.t) / 1000),
    });
  }

  const first = stamped[0];
  const last = stamped[stamped.length - 1];
  const slowest = [...turns].sort((a, b) => b.seconds - a.seconds).slice(0, topN);

  return {
    events: stamped.length,
    totalSeconds: round((last.t - first.t) / 1000),
    startedAt: first.ev.timestamp,
    endedAt: last.ev.timestamp,
    turns,
    byPhase: rollup(turns, (t) => t.phase ?? "(none)"),
    byRole: rollup(turns, (t) => t.role),
    byKind: rollup(turns, (t) => `${t.role}/${t.event}`),
    slowest,
  };
}

/** Read the log (filtered by feature, if given) and compute its timing report. */
export function timingReportFromLog(
  read: ReadAgentLogOpts = {},
  opts: ComputeTimingOpts = {},
): TimingReport {
  return computeTiming(readAgentLog(read), opts);
}

function fmtSecs(n: number): string {
  if (n >= 60) {
    const m = Math.floor(n / 60);
    const s = Math.round(n % 60);
    return `${m}m${String(s).padStart(2, "0")}s`;
  }
  return `${n.toFixed(1)}s`;
}

function rollupBlock(title: string, rows: GroupRollup[]): string {
  if (rows.length === 0) return `${title}\n  (none)\n`;
  const keyW = Math.max(title.length, ...rows.map((r) => r.key.length));
  const lines = rows.map(
    (r) =>
      `  ${r.key.padEnd(keyW)}  ${fmtSecs(r.seconds).padStart(8)}  ` +
      `(${r.count}x, avg ${fmtSecs(r.avgSeconds)}, max ${fmtSecs(r.maxSeconds)})`,
  );
  return `${title}\n${lines.join("\n")}\n`;
}

/** Render a human-readable report. The JSON form (TimingReport) is the machine API. */
export function formatTimingReport(report: TimingReport): string {
  if (report.events === 0) return "agent-log timing: no timestamped events found.\n";
  const out: string[] = [];
  out.push(
    `agent-log timing , ${report.events} events over ${fmtSecs(report.totalSeconds)} ` +
      `(${report.startedAt} -> ${report.endedAt})`,
  );
  out.push("");
  out.push(rollupBlock("by phase", report.byPhase));
  out.push(rollupBlock("by role", report.byRole));
  out.push(rollupBlock("by kind (role/event)", report.byKind));
  out.push(`slowest ${report.slowest.length} spans`);
  for (const t of report.slowest) {
    const scope = [t.story, t.ac].filter(Boolean).join("/");
    out.push(
      `  ${fmtSecs(t.seconds).padStart(8)}  ${t.role}/${t.event}` +
        `${t.phase ? ` [${t.phase}]` : ""}${scope ? ` ${scope}` : ""}`,
    );
  }
  out.push("");
  out.push("(spans are gaps between consecutive log events, attributed to the ending event;");
  out.push(" a cold agent spawn before a turn's first emit is not separately visible.)");
  return `${out.join("\n")}\n`;
}
