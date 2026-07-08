// Reconstitute the agent-log into ONE coherent recording after a design-REPLAYED
// capture, so the log faithfully reproduces the original run (token counts + cost)
// AND reads as a single continuous timeline , not a mix of the original design
// dates and this run's wall-clock build dates, and not the thin synthetic
// "present on disk (reconciled)" placeholders.
//
// Inputs:
//   - the project's live agent-log.jsonl (design lane = thin/replayed; build lane =
//     this run's REAL turns with real token/cost on this run's clock)
//   - the corpus design-lane log (`agent-log.design.jsonl`): the ORIGINAL design
//     turns verbatim, incl. each turn's token counts + cost_usd, on the original
//     capture date.
//
// Output (rewrites the project agent-log.jsonl, returns the events):
//   1. DESIGN entries = the corpus originals, verbatim (original timestamps, real
//      cost). These REPLACE the live design entries (intake / product-owner /
//      orchestrator / replayed roles) , so their retroactive date + cost win.
//   2. LIVE non-design entries (the build/deploy turns, and any design turn that
//      had to run LIVE this run , e.g. F6's spec-author breakdown the original
//      lacked) are KEPT with their real token/cost, but their timestamps are
//      SHIFTED onto the original capture's timeline (continuing right after the
//      last design turn), so the whole log shares the original date.
//   3. Synthetic "reconciled" placeholders are DROPPED (the originals cover them).

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { type AgentLogEvent } from "./agent-log.js";

/** Identity ignoring timestamp + token numbers, so a live design entry and its
 *  recorded original collapse (the original wins), while a genuinely-live turn the
 *  corpus never had (the one live breakdown, every build turn) is preserved. */
function sig(e: AgentLogEvent): string {
  const m = e.metadata ?? {};
  return JSON.stringify([e.role, e.event, e.message, m.feature_id ?? "", m.story ?? "", (m.path as string) ?? (m.artifact as string) ?? ""]);
}

function ts(e: AgentLogEvent): number {
  const t = Date.parse(e.timestamp);
  return Number.isFinite(t) ? t : 0;
}

export interface ReconstituteOpts {
  sftddDir: string;
  /** Path to the corpus design-lane log (agent-log.design.jsonl). */
  designLogPath: string;
}

/** Parse a .jsonl agent-log file into events (skipping blank/malformed lines). */
function readJsonl(file: string): AgentLogEvent[] {
  if (!existsSync(file)) return [];
  const out: AgentLogEvent[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      out.push(JSON.parse(line) as AgentLogEvent);
    } catch {
      /* skip */
    }
  }
  return out;
}

/**
 * Rewrite the project agent-log into the reconstituted, single-timeline form.
 * Returns the final ordered events (also written to disk). Idempotent: re-running
 * reproduces the same log (design from the corpus; live entries re-anchored from
 * their original relative order after the last design turn).
 */
export function reconstituteAgentLog(opts: ReconstituteOpts): AgentLogEvent[] {
  const projectLog = join(opts.sftddDir, "agent-log.jsonl");
  const design = readJsonl(opts.designLogPath).sort((a, b) => ts(a) - ts(b));
  if (design.length === 0) return readJsonl(projectLog); // nothing to reconstitute against

  const designSigs = new Set(design.map(sig));
  const live = readJsonl(projectLog);

  // Keep build/deploy + any genuinely-live design turn (not in the corpus); drop
  // synthetic reconciled placeholders and the live duplicates of recorded design.
  const keep = live.filter((e) => {
    if (e.metadata?.reconciled === true) return false;
    return !designSigs.has(sig(e));
  });
  keep.sort((a, b) => ts(a) - ts(b));

  // Re-anchor the kept live entries onto the original timeline: shift them so the
  // first lands 1s after the last design turn, preserving their relative spacing
  // (so the real build cadence + costs survive, just dated to the capture day).
  const lastDesign = ts(design[design.length - 1]);
  const firstLive = keep.length ? ts(keep[0]) : 0;
  const offset = lastDesign + 1000 - firstLive;
  const reanchored = keep.map((e) => ({ ...e, timestamp: new Date(ts(e) + offset).toISOString() }));

  const final = [...design, ...reanchored];

  // Rewrite the log verbatim (truncate + write every line as-is, preserving exact
  // token/cost fields , the normal emit path would re-render + drop them).
  writeFileSync(projectLog, final.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
  return final;
}
