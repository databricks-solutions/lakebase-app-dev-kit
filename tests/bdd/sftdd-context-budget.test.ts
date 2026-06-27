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
