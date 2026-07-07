import { describe, it, expect } from "vitest";
import { parseDriveLog, classifyToolCall, formatDriveLogReport } from "../../scripts/sftdd/drive-log-report.js";

const LOG = [
  "[drive] 013 dispatch driver for green",
  "  · Bash uv run pytest tests/step_defs/test_s1.py -v",
  "  · Edit app/routes/stock_routes.py",
  "  · Read app/services/stock_service.py",
  "  · Bash find tests -name '*fitness*'",
  "  · Bash uv run pytest tests/architecture/test_layering.py",
  "All tests GREEN.",
  "[drive] driver turn 407.3s (haiku)",
  "[drive] 014 dispatch navigator for review",
  "  · Read .sftdd/cycles/x/review.json",
  "  · Bash grep -r foo app/",
  "Verdict written.",
  "[drive] navigator turn 15.8s (sonnet)",
].join("\n");

describe("classifyToolCall", () => {
  it("marks Bash pytest invocations as pytest", () => {
    expect(classifyToolCall("Bash", "uv run pytest tests/x.py")).toBe("pytest");
  });
  it("marks Bash find/grep/ls/cat/echo as discovery", () => {
    expect(classifyToolCall("Bash", "find tests -name x")).toBe("discovery");
    expect(classifyToolCall("Bash", "grep -r foo app/")).toBe("discovery");
  });
  it("non-Bash tools are 'other' regardless of content", () => {
    expect(classifyToolCall("Read", "pytest something")).toBe("other");
    expect(classifyToolCall("Edit", "app/x.py")).toBe("other");
  });
});

describe("parseDriveLog", () => {
  it("attributes tool calls to the turn they precede, split by tool + class", () => {
    const r = parseDriveLog(LOG);
    expect(r.turns).toHaveLength(2);

    const green = r.turns[0];
    expect(green.role).toBe("driver");
    expect(green.model).toBe("haiku");
    expect(green.seconds).toBe(407.3);
    expect(green.toolCalls).toBe(5);
    expect(green.byTool).toEqual({ Bash: 3, Edit: 1, Read: 1 });
    expect(green.pytestRuns).toBe(2);
    expect(green.discoveryCalls).toBe(1);

    const review = r.turns[1];
    expect(review.role).toBe("navigator");
    expect(review.toolCalls).toBe(2);
    expect(review.discoveryCalls).toBe(1);
    expect(review.pytestRuns).toBe(0);
  });

  it("rolls up by role and model and totals", () => {
    const r = parseDriveLog(LOG);
    expect(r.totalToolCalls).toBe(7);
    expect(r.byRole.find((x) => x.key === "driver")?.maxToolCalls).toBe(5);
    expect(r.byModel.find((x) => x.key === "haiku")?.turns).toBe(1);
  });

  it("resets counts between turns (no leakage across closes)", () => {
    const r = parseDriveLog(LOG);
    // The navigator turn must not inherit the driver turn's 5 calls.
    expect(r.turns[1].toolCalls).toBe(2);
  });

  it("returns an empty report when no turn-close lines are present", () => {
    const r = parseDriveLog("  · Bash echo hi\nsome prose\n");
    expect(r.turns).toHaveLength(0);
    expect(formatDriveLogReport(r)).toMatch(/no turn-close lines/);
  });
});
