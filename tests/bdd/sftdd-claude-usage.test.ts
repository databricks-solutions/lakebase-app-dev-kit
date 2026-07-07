// Parsing per-turn usage from `claude -p --output-format stream-json` output:
// the terminal `result` event carries the turn's CONTEXT SIZE (input_tokens) +
// output + prompt-cache reuse + cost. Sample lines mirror the real v2.1.x shape.

import { describe, it, expect } from "vitest";
import { parseTurnUsage, usageFromResultEvent, assistantTextFromLine, assistantEventSummary } from "../../scripts/sftdd/claude-usage.js";

// A representative stream-json transcript: system init, an assistant text msg,
// a tool use, then the terminal result event with usage (the shape probed live).
const STREAM = [
  '{"type":"system","subtype":"init","session_id":"abc"}',
  '{"type":"assistant","message":{"content":[{"type":"text","text":"Writing the failing test."}]}}',
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write","input":{}}]}}',
  '{"type":"user","message":{"content":[{"type":"tool_result"}]}}',
  '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":0.0948,"usage":{"input_tokens":11623,"output_tokens":4,"cache_read_input_tokens":10172,"cache_creation_input_tokens":3150}}',
].join("\n");

describe("parseTurnUsage", () => {
  it("extracts context size (input_tokens) + output + cache + cost from the result event", () => {
    const u = parseTurnUsage(STREAM);
    expect(u).toBeDefined();
    expect(u!.inputTokens).toBe(11623); // the turn's context size
    expect(u!.outputTokens).toBe(4);
    expect(u!.cacheReadTokens).toBe(10172);
    expect(u!.cacheCreationTokens).toBe(3150);
    expect(u!.costUsd).toBeCloseTo(0.0948, 4);
  });

  it("accepts an array of lines + skips non-JSON / partial lines", () => {
    const u = parseTurnUsage(["not json", "", "  ", ...STREAM.split("\n")]);
    expect(u?.inputTokens).toBe(11623);
  });

  it("returns undefined when there is no result event", () => {
    expect(parseTurnUsage('{"type":"assistant","message":{"content":[]}}')).toBeUndefined();
    expect(parseTurnUsage("")).toBeUndefined();
  });

  it("takes the LAST result event when several appear", () => {
    const two = [
      '{"type":"result","usage":{"input_tokens":100,"output_tokens":1}}',
      '{"type":"result","usage":{"input_tokens":999,"output_tokens":2}}',
    ].join("\n");
    expect(parseTurnUsage(two)!.inputTokens).toBe(999);
  });
});

describe("usageFromResultEvent: tolerant of missing fields", () => {
  it("defaults input/output to 0 and omits absent cache/cost", () => {
    const u = usageFromResultEvent({ type: "result", usage: {} });
    expect(u).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
  it("returns undefined for a non-result event or one with no usage", () => {
    expect(usageFromResultEvent({ type: "assistant" })).toBeUndefined();
    expect(usageFromResultEvent({ type: "result" })).toBeUndefined();
  });
});

describe("assistantTextFromLine: tee readable text, skip the rest", () => {
  it("returns the assistant text content", () => {
    expect(assistantTextFromLine('{"type":"assistant","message":{"content":[{"type":"text","text":"hello"}]}}')).toBe("hello");
  });
  it("returns '' for system/tool/result/non-JSON lines", () => {
    expect(assistantTextFromLine('{"type":"system"}')).toBe("");
    expect(assistantTextFromLine('{"type":"result","usage":{}}')).toBe("");
    expect(assistantTextFromLine("garbage")).toBe("");
    expect(assistantTextFromLine('{"type":"assistant","message":{"content":[{"type":"tool_use"}]}}')).toBe("");
  });
});

describe("assistantEventSummary: compact tool actions + text, drop nothing structural", () => {
  it("summarizes tool_use as name + target (file_path / command)", () => {
    const write = assistantEventSummary(
      '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"app/models/inventory.py"}}]}}',
    );
    expect(write.tools).toEqual(["Write app/models/inventory.py"]);
    expect(write.text).toBe("");
    const bash = assistantEventSummary(
      '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"uv run pytest"}}]}}',
    );
    expect(bash.tools).toEqual(["Bash uv run pytest"]);
  });

  it("separates interstitial text from tool actions in the same event", () => {
    const ev = assistantEventSummary(
      '{"type":"assistant","message":{"content":[{"type":"text","text":"Now let me write it."},{"type":"tool_use","name":"Edit","input":{"file_path":"a.py"}}]}}',
    );
    expect(ev.text).toBe("Now let me write it."); // the caller buffers text; only the LAST survives
    expect(ev.tools).toEqual(["Edit a.py"]);
  });

  it("returns empties for non-assistant / malformed lines", () => {
    expect(assistantEventSummary('{"type":"result","usage":{}}')).toEqual({ text: "", tools: [] });
    expect(assistantEventSummary("garbage")).toEqual({ text: "", tools: [] });
  });
});
