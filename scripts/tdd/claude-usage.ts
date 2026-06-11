// Parse per-turn usage from a `claude -p --output-format stream-json` run.
//
// stream-json emits one JSON object per line: a `system` init, `assistant` /
// `user` messages (+ tool_use / tool_result), and a terminal `result` event that
// carries the turn's token usage + cost. We read the `result` event for the
// CONTEXT SIZE (input_tokens, the prompt the model processed) + output_tokens +
// the prompt-cache reuse + dollar cost. Pure + tolerant: a missing / malformed
// stream just yields undefined (usage is observability, never load-bearing).

export interface TurnUsage {
  /** The turn's context size: input tokens the model processed this turn. */
  inputTokens: number;
  /** Tokens the model generated this turn. */
  outputTokens: number;
  /** Prompt-cache tokens read (warm-resume reuse), if reported. */
  cacheReadTokens?: number;
  /** Prompt-cache tokens written this turn, if reported. */
  cacheCreationTokens?: number;
  /** Dollar cost of the turn, if reported. */
  costUsd?: number;
}

interface ResultEvent {
  type?: string;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Map a parsed `result` event to TurnUsage, or undefined if it has no usage. */
export function usageFromResultEvent(ev: ResultEvent): TurnUsage | undefined {
  if (!ev || ev.type !== "result" || !ev.usage) return undefined;
  const u = ev.usage;
  const usage: TurnUsage = {
    inputTokens: numOr(u.input_tokens, 0),
    outputTokens: numOr(u.output_tokens, 0),
  };
  if (typeof u.cache_read_input_tokens === "number") usage.cacheReadTokens = u.cache_read_input_tokens;
  if (typeof u.cache_creation_input_tokens === "number") usage.cacheCreationTokens = u.cache_creation_input_tokens;
  if (typeof ev.total_cost_usd === "number") usage.costUsd = ev.total_cost_usd;
  return usage;
}

/**
 * Scan stream-json output (any chunking) for the LAST `result` event and return
 * its usage. Accepts the full text or an array of lines; non-JSON / partial
 * lines are skipped. Returns undefined when no result event is present.
 */
export function parseTurnUsage(streamJson: string | string[]): TurnUsage | undefined {
  const lines = Array.isArray(streamJson) ? streamJson : streamJson.split("\n");
  let last: TurnUsage | undefined;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed[0] !== "{") continue;
    let ev: ResultEvent;
    try {
      ev = JSON.parse(trimmed) as ResultEvent;
    } catch {
      continue;
    }
    const u = usageFromResultEvent(ev);
    if (u) last = u;
  }
  return last;
}

/** Pull the human-readable assistant text out of a single stream-json line, so
 *  the runner can tee readable output to the console instead of raw JSON. Returns
 *  "" for non-assistant-text lines (system/tool/result/partials without text). */
export function assistantTextFromLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed || trimmed[0] !== "{") return "";
  let ev: { type?: string; message?: { content?: unknown } };
  try {
    ev = JSON.parse(trimmed) as typeof ev;
  } catch {
    return "";
  }
  if (ev.type !== "assistant" || !ev.message || !Array.isArray(ev.message.content)) return "";
  const parts: string[] = [];
  for (const block of ev.message.content as Array<{ type?: string; text?: string }>) {
    if (block?.type === "text" && typeof block.text === "string") parts.push(block.text);
  }
  return parts.join("");
}
