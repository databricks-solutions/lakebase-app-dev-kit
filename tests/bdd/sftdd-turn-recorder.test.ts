// The universal turn recorder captures EVERY state-machine turn (design + build
// + gates + ...) as a replayable timeline: turns/<NNNN>-<label>/ (manifest + the
// .tdd/code delta produced) + a cumulative recorded-artifacts mirror the existing
// replayDesignTurn consumes. These hermetic tests drive recordTurn across
// simulated turns and assert the timeline, the delta, the mirror, the ordered
// index, and a record -> replay round-trip.

import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordTurn, labelForAction, seedRecorderBaseline } from "../../scripts/sftdd/turn-recorder.js";
import { replayDesignTurn } from "../../scripts/sftdd/replay-artifacts.js";
import type { WorkflowAction } from "../../scripts/sftdd/orchestrator-drive.js";

const tmpDirs: string[] = [];
function mkProject(): { proj: string; tdd: string; record: string } {
  const proj = mkdtempSync(join(tmpdir(), "turn-rec-proj-"));
  tmpDirs.push(proj);
  const tdd = join(proj, ".tdd");
  mkdirSync(tdd, { recursive: true });
  const record = mkdtempSync(join(tmpdir(), "turn-rec-out-"));
  tmpDirs.push(record);
  return { proj, tdd, record };
}
const act = (o: Record<string, unknown>): WorkflowAction => o as unknown as WorkflowAction;
function writeTdd(tdd: string, rel: string, body: string): void {
  const f = join(tdd, rel);
  mkdirSync(join(f, ".."), { recursive: true });
  writeFileSync(f, body);
}
const readJson = (f: string) => JSON.parse(readFileSync(f, "utf8"));

afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d) try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe("labelForAction", () => {
  it("labels role turns by role (+ mode when present)", () => {
    expect(labelForAction(act({ kind: "invoke-role", role: "spec-author", mode: "propose" }))).toBe("spec-author-propose");
    expect(labelForAction(act({ kind: "invoke-role", role: "ux-designer" }))).toBe("ux-designer");
    expect(labelForAction(act({ kind: "invoke-role", role: "driver", buildMode: "green" }))).toBe("driver-green");
  });
  it("labels gates + falls back to kind", () => {
    expect(labelForAction(act({ kind: "approve-plan-gate" }))).toBe("gate-plan");
    expect(labelForAction(act({ kind: "approve-gate", story: "S1" }))).toBe("gate-spec");
    expect(labelForAction(act({ kind: "approve-deploy-gate" }))).toBe("gate-deploy");
    expect(labelForAction(act({ kind: "approve-promote-gate" }))).toBe("gate-promote");
    expect(labelForAction(act({ kind: "cut-experiment", story: "S1" }))).toBe("cut-experiment");
    expect(labelForAction(act({ kind: "prepare-pr" }))).toBe("prepare-pr");
  });
});

describe("recordTurn: per-turn timeline + cumulative .tdd mirror", () => {
  it("records each turn's delta, mirrors .tdd, and keeps an ordered index", () => {
    const { proj, tdd, record } = mkProject();

    // Turn 0 , a design turn writes a feature spec under .tdd.
    writeTdd(tdd, "features/F1/feature-spec.json", JSON.stringify({ id: "F1" }));
    const t0 = recordTurn({ recordDir: record, projectDir: proj, sftddDir: tdd, step: 0, action: act({ kind: "invoke-role", role: "spec-author", mode: "breakdown", story: "S1" }) });
    expect(t0.ordinal).toBe(0);
    expect(t0.dir).toBe("0000-spec-author-breakdown");
    expect(t0.produced).toContain(".tdd/features/F1/feature-spec.json");
    // manifest + delta copy + cumulative mirror
    const m0 = readJson(join(record, "turns", t0.dir, "turn.json"));
    expect(m0.role).toBe("spec-author");
    expect(m0.story).toBe("S1");
    expect(existsSync(join(record, "turns", t0.dir, "files", ".tdd/features/F1/feature-spec.json"))).toBe(true);
    expect(existsSync(join(record, "recorded-artifacts", "features/F1/feature-spec.json"))).toBe(true);

    // Turn 1 , a build turn writes production code (NOT under .tdd).
    writeFileSync(join(proj, "main.py"), "x = 1\n");
    const t1 = recordTurn({ recordDir: record, projectDir: proj, sftddDir: tdd, step: 1, action: act({ kind: "invoke-role", role: "driver", buildMode: "green" }) });
    expect(t1.ordinal).toBe(1);
    expect(t1.produced).toContain("main.py");
    expect(existsSync(join(record, "turns", t1.dir, "files", "main.py"))).toBe(true);
    // code is NOT mirrored into recorded-artifacts (that is .tdd-only; code -> recorded-build)
    expect(existsSync(join(record, "recorded-artifacts", "main.py"))).toBe(false);

    // Turn 2 , modify an existing .tdd artifact: delta picks up only the change.
    writeTdd(tdd, "features/F1/feature-spec.json", JSON.stringify({ id: "F1", v: 2 }));
    const t2 = recordTurn({ recordDir: record, projectDir: proj, sftddDir: tdd, step: 2, action: act({ kind: "invoke-role", role: "architect-reviewer", story: "S1" }) });
    expect(t2.produced).toEqual([".tdd/features/F1/feature-spec.json"]);
    expect(readJson(join(record, "recorded-artifacts", "features/F1/feature-spec.json")).v).toBe(2);

    // Ordered index has all three turns.
    const index = readJson(join(record, "turns", "index.json")).turns;
    expect(index.map((t: { ordinal: number }) => t.ordinal)).toEqual([0, 1, 2]);
    expect(index.map((t: { label: string }) => t.label)).toEqual(["spec-author-breakdown", "driver-green", "architect-reviewer"]);
  });

  it("records deletions + removes them from the cumulative mirror", () => {
    const { proj, tdd, record } = mkProject();
    writeTdd(tdd, "features/F1/stories/S1/story.json", JSON.stringify({ id: "S1" }));
    recordTurn({ recordDir: record, projectDir: proj, sftddDir: tdd, step: 0, action: act({ kind: "invoke-role", role: "spec-author" }) });
    expect(existsSync(join(record, "recorded-artifacts", "features/F1/stories/S1/story.json"))).toBe(true);

    rmSync(join(tdd, "features/F1/stories/S1/story.json"));
    const t = recordTurn({ recordDir: record, projectDir: proj, sftddDir: tdd, step: 1, action: act({ kind: "invoke-role", role: "spec-author" }) });
    expect(t.deleted).toContain(".tdd/features/F1/stories/S1/story.json");
    expect(existsSync(join(record, "recorded-artifacts", "features/F1/stories/S1/story.json"))).toBe(false);
  });

  it("seedRecorderBaseline makes turn 0 report only what that turn produced (not pre-existing scaffold)", () => {
    const { proj, tdd, record } = mkProject();
    // Pre-existing scaffold + intake (present before any turn).
    writeTdd(tdd, "product-overview.md", "# overview");
    writeFileSync(join(proj, "pyproject.toml"), "[project]\n");
    // Seed the baseline (what withTurnRecording does at construction).
    expect(seedRecorderBaseline({ recordDir: record, projectDir: proj, sftddDir: tdd })).toBe(true);
    // Re-seed is a no-op once a baseline exists.
    expect(seedRecorderBaseline({ recordDir: record, projectDir: proj, sftddDir: tdd })).toBe(false);
    // Turn 0 produces ONE new artifact.
    writeTdd(tdd, "planning/feature-proposals.md", "# proposals");
    const t = recordTurn({ recordDir: record, projectDir: proj, sftddDir: tdd, step: 0, action: act({ kind: "invoke-role", role: "spec-author", mode: "propose" }) });
    expect(t.produced).toEqual([".tdd/planning/feature-proposals.md"]); // ONLY the new file
    expect(t.produced).not.toContain(".tdd/product-overview.md"); // pre-existing, not attributed
  });

  it("does not record the append-only agent-log as a produced artifact", () => {
    const { proj, tdd, record } = mkProject();
    writeFileSync(join(tdd, "agent-log.jsonl"), '{"e":1}\n');
    writeTdd(tdd, "design/design-guide.json", "{}");
    const t = recordTurn({ recordDir: record, projectDir: proj, sftddDir: tdd, step: 0, action: act({ kind: "invoke-role", role: "ux-designer" }) });
    expect(t.produced).toContain(".tdd/design/design-guide.json");
    expect(t.produced).not.toContain(".tdd/agent-log.jsonl");
  });
});

describe("record -> replay round-trip", () => {
  it("recorded-artifacts produced by the recorder is consumable by replayDesignTurn", () => {
    const { proj, tdd, record } = mkProject();
    // Record a ux-designer turn that produced the design guide + ia.
    writeTdd(tdd, "design/design-guide.json", JSON.stringify({ tokens: { color: "#111" } }));
    writeTdd(tdd, "design/design-guide.md", "# Guide\n");
    writeTdd(tdd, "design/ia.md", "# IA\n");
    recordTurn({ recordDir: record, projectDir: proj, sftddDir: tdd, step: 0, action: act({ kind: "invoke-role", role: "ux-designer" }) });

    // Replay that design turn into a FRESH project .tdd from the recorded-artifacts mirror.
    const fresh = mkdtempSync(join(tmpdir(), "turn-rec-replay-"));
    tmpDirs.push(fresh);
    const freshTdd = join(fresh, ".tdd");
    mkdirSync(freshTdd, { recursive: true });
    const ok = replayDesignTurn({
      turn: { role: "ux-designer" },
      replayDir: join(record, "recorded-artifacts"),
      sftddDir: freshTdd,
      featureId: "F1",
    });
    expect(ok).toBe(true);
    expect(existsSync(join(freshTdd, "design", "design-guide.json"))).toBe(true);
    expect(readJson(join(freshTdd, "design", "design-guide.json")).tokens.color).toBe("#111");
  });
});
