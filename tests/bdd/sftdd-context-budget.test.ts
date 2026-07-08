// Context-budget guard: the driver only RESUMES a warm session when it still
// leaves >= 40% of the model window free; otherwise it starts the turn fresh.
// Pins the window sizing, the per-turn token total, and the resume predicate so
// a long session can never start a turn it cannot fit ("Prompt is too long").

import { describe, it, expect } from "vitest";
import {
  contextWindowFor,
  turnContextTokens,
  resumeFitsBudget,
  CONTEXT_FREE_FRACTION_REQUIRED,
  isPromptTooLongSignal,
  startsFreshEachTurn,
  heavyRoles,
  requiredFreeFraction,
  DEFAULT_HEAVY_ROLES,
} from "../../scripts/sftdd/context-budget.js";

describe("contextWindowFor", () => {
  it("defaults to the standard 200k window", () => {
    expect(contextWindowFor("opus")).toBe(200_000);
    expect(contextWindowFor("sonnet")).toBe(200_000);
    expect(contextWindowFor("claude-opus-4-8")).toBe(200_000);
  });
  it("gives a 1m-tagged model the 1M window", () => {
    expect(contextWindowFor("claude-opus-4-8[1m]")).toBe(1_000_000);
    expect(contextWindowFor("opus-1m")).toBe(1_000_000);
  });
});

describe("turnContextTokens", () => {
  it("sums fresh input + both cache tiers + the appended output", () => {
    expect(
      turnContextTokens({
        inputTokens: 10_000,
        outputTokens: 2_000,
        cacheReadTokens: 50_000,
        cacheCreationTokens: 8_000,
      }),
    ).toBe(70_000);
  });
  it("tolerates missing cache fields", () => {
    expect(turnContextTokens({ inputTokens: 1_000, outputTokens: 500 })).toBe(1_500);
  });
});

describe("resumeFitsBudget (>=40% free required)", () => {
  it("requires the 40% free fraction", () => {
    expect(CONTEXT_FREE_FRACTION_REQUIRED).toBe(0.4);
  });
  it("a fresh/empty session always fits", () => {
    expect(resumeFitsBudget(0, "opus")).toBe(true);
  });
  it("fits at exactly 60% of the window, not above it", () => {
    expect(resumeFitsBudget(120_000, "opus")).toBe(true); // 60% of 200k
    expect(resumeFitsBudget(120_001, "opus")).toBe(false); // < 40% free -> fresh
  });
  it("scales to the 1M window", () => {
    expect(resumeFitsBudget(599_999, "opus-1m")).toBe(true);
    expect(resumeFitsBudget(600_001, "opus-1m")).toBe(false);
    // The same 600k context would NOT fit a 200k model (starts fresh there).
    expect(resumeFitsBudget(600_000, "opus")).toBe(false);
  });
});

describe("isPromptTooLongSignal (mid-turn overflow detection -> fresh-session retry)", () => {
  it("matches claude's context-overflow phrasings (the F6/S3 killer)", () => {
    expect(isPromptTooLongSignal("Prompt is too long")).toBe(true);
    expect(isPromptTooLongSignal("Error: prompt is too long: 1234567 tokens > 200000")).toBe(true);
    expect(isPromptTooLongSignal("the prompt too long for this model")).toBe(true);
    expect(isPromptTooLongSignal("this exceeds the maximum context length")).toBe(true);
    expect(isPromptTooLongSignal("context window exceeded")).toBe(true);
    expect(isPromptTooLongSignal("context length too long")).toBe(true);
  });
  it("does NOT match ordinary turn output (no false retry on unrelated failures)", () => {
    expect(isPromptTooLongSignal("All 10 tests pass.")).toBe(false);
    expect(isPromptTooLongSignal("claude exited 1")).toBe(false);
    expect(isPromptTooLongSignal("Error: ENOENT no such file")).toBe(false);
    expect(isPromptTooLongSignal("the test list is too long to enumerate here")).toBe(false);
  });
});

describe("proactive per-turn cap: OFF by default (builders warm-resume within a story)", () => {
  it("no role starts fresh by default; the reactive resumeFitsBudget guard is the backstop", () => {
    // Speed lever: the builders warm-resume across a story's cycles (prompt-cache
    // reuse), and resumeFitsBudget starts a turn fresh only when the prior context
    // would overflow the free-window fraction. No proactive always-FRESH cap.
    expect(startsFreshEachTurn("driver", {})).toBe(false);
    expect(startsFreshEachTurn("navigator", {})).toBe(false);
    expect(startsFreshEachTurn("spec-author", {})).toBe(false);
    expect([...DEFAULT_HEAVY_ROLES]).toEqual([]);
    expect(heavyRoles({}).size).toBe(0);
  });

  it("LAKEBASE_SFTDD_HEAVY_ROLES restores the proactive always-FRESH cap for the named roles", () => {
    const only = { LAKEBASE_SFTDD_HEAVY_ROLES: "driver,navigator" };
    expect(startsFreshEachTurn("driver", only)).toBe(true);
    expect(startsFreshEachTurn("Navigator", only)).toBe(true); // case-insensitive
    expect(startsFreshEachTurn("spec-author", only)).toBe(false);
    const off = { LAKEBASE_SFTDD_HEAVY_ROLES: "" };
    expect(heavyRoles(off).size).toBe(0);
    expect(startsFreshEachTurn("driver", off)).toBe(false);
  });
});

describe("configurable warm-window threshold (smaller warm window on demand)", () => {
  it("defaults to the module constant; a valid env value tightens it", () => {
    expect(requiredFreeFraction({})).toBe(CONTEXT_FREE_FRACTION_REQUIRED);
    // 200k window: default 0.4 fits <=120k; a 0.7 required-free fits only <=60k.
    expect(resumeFitsBudget(100_000, "opus", {})).toBe(true);
    expect(resumeFitsBudget(100_000, "opus", { LAKEBASE_SFTDD_CONTEXT_FREE_FRACTION: "0.7" })).toBe(false);
  });
  it("ignores an out-of-range or non-numeric override (falls back to the default)", () => {
    expect(requiredFreeFraction({ LAKEBASE_SFTDD_CONTEXT_FREE_FRACTION: "9" })).toBe(CONTEXT_FREE_FRACTION_REQUIRED);
    expect(requiredFreeFraction({ LAKEBASE_SFTDD_CONTEXT_FREE_FRACTION: "abc" })).toBe(CONTEXT_FREE_FRACTION_REQUIRED);
  });
});
