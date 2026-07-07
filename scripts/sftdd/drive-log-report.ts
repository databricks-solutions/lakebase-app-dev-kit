// Per-turn TOOL-CALL report parsed from the drive's STDOUT log (not the agent
// log). timing-report.ts answers "where did wall-clock go" from the timestamped
// agent log; this answers the complementary "WHY is a turn slow" , the driver's
// worst GREEN turn spent 407s across 93 tool calls, and each tool call is a full
// model round-trip. Turn cost is round-trip-bound, so the lever is cutting calls
// (inject context so the agent stops rediscovering it, stop re-running tests).
// This makes calls-per-turn A/B-measurable across runs, the enabler for the
// build-turn speed levers.
//
// It parses the compact-tee format the driver emits:
//   `  · <Tool> <rest>`                     one tool invocation
//   `[drive] <role> turn <seconds>s (<model>)`  the turn's close (flushes counts)
// A cold spawn / interstitial prose is ignored; only these two shapes matter.

/** One tool call, classified for the Bash sub-breakdown that dominates cost. */
export type ToolClass = "pytest" | "discovery" | "other";

/** A single completed turn: the tool calls made since the previous turn close. */
export interface DriveTurn {
  role: string;
  model: string;
  seconds: number;
  /** Total `· <tool>` lines attributed to this turn. */
  toolCalls: number;
  /** Count per tool name (Bash, Read, Edit, Write, ...). */
  byTool: Record<string, number>;
  /** Bash calls that invoked pytest (the test-thrash signal). */
  pytestRuns: number;
  /** Bash calls that were pure discovery (find/grep/ls/cat/echo). */
  discoveryCalls: number;
}

/** A summed grouping (by role or model). */
export interface DriveRollup {
  key: string;
  turns: number;
  seconds: number;
  toolCalls: number;
  avgSeconds: number;
  avgToolCalls: number;
  maxToolCalls: number;
}

export interface DriveLogReport {
  turns: DriveTurn[];
  byRole: DriveRollup[];
  byModel: DriveRollup[];
  totalSeconds: number;
  totalToolCalls: number;
}

const TOOL_LINE = /^\s*·\s+(\S+)(?:\s+([\s\S]*))?$/;
const TURN_CLOSE = /^\[drive\]\s+([a-z][a-z-]*)\s+turn\s+([\d.]+)s\s+\(([a-z]+)\)/;
const DISCOVERY_FIRST_TOKEN = /^(find|grep|ls|cat|echo)\b/;

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Classify a tool line's work for the Bash sub-breakdown. */
export function classifyToolCall(tool: string, rest: string): ToolClass {
  if (tool !== "Bash") return "other";
  if (/\bpytest\b/.test(rest)) return "pytest";
  if (DISCOVERY_FIRST_TOKEN.test(rest.trimStart())) return "discovery";
  return "other";
}

/** Parse a drive stdout log into per-turn tool-call counts + role/model rollups. */
export function parseDriveLog(text: string): DriveLogReport {
  const turns: DriveTurn[] = [];
  let byTool: Record<string, number> = {};
  let toolCalls = 0;
  let pytestRuns = 0;
  let discoveryCalls = 0;

  const reset = (): void => {
    byTool = {};
    toolCalls = 0;
    pytestRuns = 0;
    discoveryCalls = 0;
  };

  for (const line of text.split("\n")) {
    const close = TURN_CLOSE.exec(line);
    if (close) {
      turns.push({
        role: close[1],
        model: close[3],
        seconds: Number(close[2]),
        toolCalls,
        byTool,
        pytestRuns,
        discoveryCalls,
      });
      reset();
      continue;
    }
    const tool = TOOL_LINE.exec(line);
    if (tool) {
      const name = tool[1];
      const rest = tool[2] ?? "";
      byTool[name] = (byTool[name] ?? 0) + 1;
      toolCalls += 1;
      const cls = classifyToolCall(name, rest);
      if (cls === "pytest") pytestRuns += 1;
      else if (cls === "discovery") discoveryCalls += 1;
    }
  }

  return {
    turns,
    byRole: rollup(turns, (t) => t.role),
    byModel: rollup(turns, (t) => t.model),
    totalSeconds: round(turns.reduce((a, t) => a + t.seconds, 0)),
    totalToolCalls: turns.reduce((a, t) => a + t.toolCalls, 0),
  };
}

function rollup(turns: DriveTurn[], keyOf: (t: DriveTurn) => string): DriveRollup[] {
  const acc = new Map<string, { turns: number; seconds: number; calls: number; maxCalls: number }>();
  for (const t of turns) {
    const key = keyOf(t);
    const cur = acc.get(key) ?? { turns: 0, seconds: 0, calls: 0, maxCalls: 0 };
    cur.turns += 1;
    cur.seconds += t.seconds;
    cur.calls += t.toolCalls;
    cur.maxCalls = Math.max(cur.maxCalls, t.toolCalls);
    acc.set(key, cur);
  }
  return [...acc.entries()]
    .map(([key, v]) => ({
      key,
      turns: v.turns,
      seconds: round(v.seconds),
      toolCalls: v.calls,
      avgSeconds: round(v.seconds / v.turns),
      avgToolCalls: round(v.calls / v.turns),
      maxToolCalls: v.maxCalls,
    }))
    .sort((a, b) => b.seconds - a.seconds);
}

function fmtSecs(n: number): string {
  if (n >= 60) {
    const m = Math.floor(n / 60);
    const s = Math.round(n % 60);
    return `${m}m${String(s).padStart(2, "0")}s`;
  }
  return `${n.toFixed(1)}s`;
}

function rollupBlock(title: string, rows: DriveRollup[]): string {
  if (rows.length === 0) return `${title}\n  (none)\n`;
  const keyW = Math.max(title.length, ...rows.map((r) => r.key.length));
  const lines = rows.map(
    (r) =>
      `  ${r.key.padEnd(keyW)}  ${fmtSecs(r.seconds).padStart(8)}  ` +
      `(${r.turns}x, avg ${fmtSecs(r.avgSeconds)}, ${r.toolCalls} calls, avg ${r.avgToolCalls}/turn, max ${r.maxToolCalls})`,
  );
  return `${title}\n${lines.join("\n")}\n`;
}

/** Render a human-readable report; parseDriveLog's return is the machine API. */
export function formatDriveLogReport(report: DriveLogReport, topN = 10): string {
  if (report.turns.length === 0) return "drive-log: no turn-close lines found (need a stream-json drive log).\n";
  const out: string[] = [];
  out.push(
    `drive-log tool-calls , ${report.turns.length} turns, ${report.totalToolCalls} tool calls over ${fmtSecs(report.totalSeconds)}`,
  );
  out.push("");
  out.push(rollupBlock("by role", report.byRole));
  out.push(rollupBlock("by model", report.byModel));
  const worst = [...report.turns].sort((a, b) => b.toolCalls - a.toolCalls).slice(0, topN);
  out.push(`heaviest ${worst.length} turns (by tool calls)`);
  for (const t of worst) {
    const bash = t.byTool.Bash ?? 0;
    out.push(
      `  ${String(t.toolCalls).padStart(3)} calls  ${fmtSecs(t.seconds).padStart(8)}  ${t.role}/${t.model}` +
        `  [Bash ${bash}: ${t.pytestRuns} pytest, ${t.discoveryCalls} discovery]`,
    );
  }
  return `${out.join("\n")}\n`;
}
