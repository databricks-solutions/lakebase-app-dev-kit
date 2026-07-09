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
  /** The fine activity token the event carried (red/green/review/refactor/
   *  design/breakdown/propose/...), if any. */
  phase?: string;
  /** The coarse lifecycle phase this turn belongs to (design | planning | build
   *  | deploy | gate | other), DERIVED from role + event + fine phase. Unlike the
   *  raw `phase`, this is always set , so the rollup attributes every event
   *  (incl. the agent-emitted reasoning / artifact.written / cycle.* that carry
   *  no phase slot of their own). */
  coarsePhase: string;
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
  /** Total USD across the group (turn.usage rollups only; 0 for gap rollups). */
  costUsd?: number;
}

/** One role turn, from the driver's `turn.usage` event. Unlike the inter-event
 *  spans above, this is the driver's OWN measurement of a role subprocess's
 *  wall-time (duration_ms), so it is the clean per-turn compute cost , no idle
 *  gap, no cold-boot blind spot. This is the signal to compare against a
 *  baseline. */
export interface TurnUsage {
  role: string;
  model?: string;
  /** The fine activity token (propose/estimate/design/red/green/...). */
  phase?: string;
  /** Coarse lifecycle phase, derived so planning is filterable. */
  coarsePhase: string;
  story?: string;
  seconds: number;
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
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
  /** Spans summed by the DERIVED coarse lifecycle phase (design | planning |
   *  build | deploy | gate | other), desc by total seconds. Every event is
   *  attributed (unlike the raw `metadata.phase`, which most events omit). */
  byPhase: GroupRollup[];
  /** Spans summed by `role` (desc). */
  byRole: GroupRollup[];
  /** Spans summed by `role/event` kind (desc) , the per-turn-type breakdown. */
  byKind: GroupRollup[];
  /** The N slowest individual spans (desc) , the outliers to attack. */
  slowest: TurnTiming[];
  /** MEASURED role turns from `turn.usage` events (the driver's own per-turn
   *  wall-time). Empty on older logs that predate turn.usage. When
   *  `skipPlanning` is set, planning-phase turns are excluded from these. */
  turnUsage: TurnUsage[];
  /** turn.usage rolled up by role (desc by seconds), with cost. The clean
   *  per-role turn-time signal , compare this to a baseline, not the gap rollup. */
  byRoleTurns: GroupRollup[];
  /** turn.usage rolled up by role/model (desc), so a per-turn second is compared
   *  within its own model tier (opus vs sonnet vs haiku are not comparable). */
  byModelTurns: GroupRollup[];
  /** Total measured turn compute + cost (after any planning filter). */
  turnSeconds: number;
  turnCostUsd: number;
}

export interface ComputeTimingOpts {
  /** How many slowest spans to surface (default 10). */
  topN?: number;
  /** Drop planning-phase turns (propose/estimate/author-requests/plan) from the
   *  turn.usage rollups , the sprint-planning lane has no design/build baseline. */
  skipPlanning?: boolean;
}

function metaStr(ev: AgentLogEvent, key: string): string | undefined {
  const v = ev.metadata?.[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function metaNum(ev: AgentLogEvent, key: string): number | undefined {
  const v = ev.metadata?.[key];
  return typeof v === "number" && !Number.isNaN(v) ? v : undefined;
}

/** Roll up measured turns (turn.usage) by a key, summing seconds + cost. */
function rollupTurns(turns: TurnUsage[], keyOf: (t: TurnUsage) => string | undefined): GroupRollup[] {
  const acc = new Map<string, { seconds: number; count: number; max: number; cost: number }>();
  for (const t of turns) {
    const key = keyOf(t);
    if (key === undefined) continue;
    const cur = acc.get(key) ?? { seconds: 0, count: 0, max: 0, cost: 0 };
    cur.seconds += t.seconds;
    cur.count += 1;
    cur.max = Math.max(cur.max, t.seconds);
    cur.cost += t.costUsd;
    acc.set(key, cur);
  }
  return [...acc.entries()]
    .map(([key, v]) => ({
      key,
      seconds: round(v.seconds),
      count: v.count,
      avgSeconds: round(v.seconds / v.count),
      maxSeconds: round(v.max),
      costUsd: round100(v.cost),
    }))
    .sort((a, b) => b.seconds - a.seconds);
}

function round100(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Map a fine activity token (the orchestrator's handoff/phase.start `phase`
 *  slot) to its coarse lifecycle phase. */
const FINE_TO_COARSE: Record<string, string> = {
  red: "build",
  green: "build",
  review: "build",
  refactor: "build",
  build: "build",
  design: "design",
  breakdown: "design",
  propose: "planning",
  estimate: "planning",
  "author-requests": "planning",
  plan: "planning",
  deploy: "deploy",
};

/**
 * Derive the coarse lifecycle phase for an event. Prefers the fine `phase` token
 * when present (the orchestrator sets it on handoff/phase.start); otherwise falls
 * back to role + event name, so the events that carry NO phase , the code-emitted
 * cycle.* and the agent-emitted reasoning / artifact.written / smell.flagged ,
 * are still attributed (the "(none)" bucket the raw phase rollup left as 80% of
 * the wall-clock). Build vs deploy vs design/planning is what the rollup answers.
 */
function deriveCoarsePhase(role: string, event: string, finePhase?: string): string {
  if (finePhase && FINE_TO_COARSE[finePhase]) return FINE_TO_COARSE[finePhase];
  if (event.startsWith("deploy.") || event.startsWith("verify.") || event.startsWith("adherence.") || role === "release-engineer") {
    return "deploy";
  }
  if (event.startsWith("cycle.") || event.startsWith("experiment.") || event.startsWith("smell.") || role === "navigator" || role === "driver") {
    return "build";
  }
  if (role === "product-owner") return "planning";
  if (role === "spec-author" || role === "architect-reviewer" || role === "test-strategist" || role === "ux-designer") {
    return "design";
  }
  if (event.startsWith("gate.")) return "gate";
  return "other";
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
    return {
      events: 0, totalSeconds: 0, turns: [], byPhase: [], byRole: [], byKind: [], slowest: [],
      turnUsage: [], byRoleTurns: [], byModelTurns: [], turnSeconds: 0, turnCostUsd: 0,
    };
  }

  const turns: TurnTiming[] = [];
  for (let k = 1; k < stamped.length; k++) {
    const prev = stamped[k - 1];
    const cur = stamped[k];
    const finePhase = metaStr(cur.ev, "phase");
    turns.push({
      index: k + 1,
      role: cur.ev.role,
      event: cur.ev.event,
      phase: finePhase,
      coarsePhase: deriveCoarsePhase(cur.ev.role, cur.ev.event, finePhase),
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

  // MEASURED turns: the driver's own per-turn wall-time from turn.usage events
  // (duration_ms), the clean per-turn compute cost , no idle gap. This is the
  // signal to compare against a baseline; the gap rollups above stay for finding
  // inter-event overhead. Optionally drop the planning lane (no design/build
  // baseline). Older logs without turn.usage yield an empty list (graceful).
  let turnUsage: TurnUsage[] = events
    .filter((ev) => ev.event === "turn.usage")
    .map((ev) => {
      const phase = metaStr(ev, "phase");
      const durMs = metaNum(ev, "duration_ms") ?? 0;
      return {
        role: ev.role,
        model: ev.model,
        phase,
        coarsePhase: deriveCoarsePhase(ev.role, "turn.usage", phase),
        story: metaStr(ev, "story"),
        seconds: round(durMs / 1000),
        costUsd: metaNum(ev, "cost_usd") ?? 0,
        inputTokens: metaNum(ev, "input_tokens"),
        outputTokens: metaNum(ev, "output_tokens"),
      };
    });
  if (opts.skipPlanning) {
    turnUsage = turnUsage.filter((t) => t.coarsePhase !== "planning");
  }

  return {
    events: stamped.length,
    totalSeconds: round((last.t - first.t) / 1000),
    startedAt: first.ev.timestamp,
    endedAt: last.ev.timestamp,
    turns,
    byPhase: rollup(turns, (t) => t.coarsePhase),
    byRole: rollup(turns, (t) => t.role),
    byKind: rollup(turns, (t) => `${t.role}/${t.event}`),
    slowest,
    turnUsage,
    byRoleTurns: rollupTurns(turnUsage, (t) => t.role),
    byModelTurns: rollupTurns(turnUsage, (t) => `${t.role}/${t.model ?? "?"}`),
    turnSeconds: round(turnUsage.reduce((s, t) => s + t.seconds, 0)),
    turnCostUsd: round100(turnUsage.reduce((s, t) => s + t.costUsd, 0)),
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

/** Like rollupBlock, for measured turn.usage rollups , shows avg/max + cost. */
function turnRollupBlock(title: string, rows: GroupRollup[]): string {
  if (rows.length === 0) return `${title}\n  (none)\n`;
  const keyW = Math.max(title.length, ...rows.map((r) => r.key.length));
  const lines = rows.map(
    (r) =>
      `  ${r.key.padEnd(keyW)}  ${String(r.count).padStart(3)}x  ` +
      `avg ${fmtSecs(r.avgSeconds).padStart(8)}  max ${fmtSecs(r.maxSeconds).padStart(8)}  ` +
      `$${(r.costUsd ?? 0).toFixed(2)}`,
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
  // Measured per-turn compute (turn.usage) , the durable, baseline-comparable
  // signal. Lead with it; the gap rollups below are for inter-event overhead.
  if (report.turnUsage.length > 0) {
    const planNote = report.turnUsage.some((t) => t.coarsePhase === "planning") ? "" : " , planning excluded";
    out.push(
      `MEASURED turns (turn.usage): ${report.turnUsage.length} turns, ` +
        `${fmtSecs(report.turnSeconds)} compute, $${report.turnCostUsd.toFixed(2)}${planNote}`,
    );
    out.push(turnRollupBlock("by role (measured)", report.byRoleTurns));
    out.push(turnRollupBlock("by role/model (measured, tier-matched)", report.byModelTurns));
    out.push("");
  }
  out.push(rollupBlock("by phase (coarse lifecycle)", report.byPhase));
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
