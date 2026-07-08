// Architect-canon-gap reactive self-heal (FEIP-7902 phase 4): the projection
// FAILS TOWARD PROJECTION, but when the canon does not cover a story it raises the
// architect-canon-gap smell instead of writing a blind note. That smell is
// spec-level + architect-owned, so the existing revise-routing sends it to the
// architect (re-annotate + amend the canon), bounded to one revise then HITL.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { deriveCanon, writeCanon, evaluateStoryCanon } from "../../scripts/sftdd/architecture-canon.js";
import {
  specLevelSmell,
  writeSmellsLog,
  priorReviseCount,
  markSmellResolved,
} from "../../scripts/sftdd/smells.js";
import { BLOCKING_SMELLS, escalationsFromSmells } from "../../scripts/sftdd/escalation.js";
import { diskArtifactProbe } from "../../scripts/sftdd/orchestrator-probe.js";
import { staleStoryArtifactsForRevise, applyReviseSelfHeal } from "../../scripts/sftdd/revise.js";
import { writePipeline, type StoryPipeline } from "../../scripts/sftdd/story-pipeline.js";

const NOW = () => new Date("2026-07-08T00:00:00.000Z");
const F = "F2-later";
let tdd: string;

const ARCH = JSON.stringify({
  feature_id: "F1-stock-visibility",
  service_backed: true,
  nfrs: [{ category: "performance", requirement: "list endpoints paginate" }],
  persistence_invariants: [{ id: "PI1", type: "unique", table: "stock", brief: "unique" }],
});

function writeAc(story: string, acId: string, extra: Record<string, unknown> = {}): void {
  const dir = join(tdd, "features", F, "stories", story, "acs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${acId}.json`), JSON.stringify({ id: acId, layer: "API", ...extra }));
}
function writeFeatureArch(content: Record<string, unknown> = { feature_id: F, service_backed: true, nfrs: [] }): void {
  const dir = join(tdd, "features", F);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "architecture.json"), JSON.stringify(content));
}
function establishCanon(): void {
  writeCanon(tdd, deriveCanon(ARCH, ["API", "Infra"], "F1-stock-visibility", NOW)!);
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-canon-gap-"));
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

describe("taxonomy: architect-canon-gap routes to the architect", () => {
  it("specLevelSmell routes it to architect-reviewer at the architecture gate", () => {
    expect(specLevelSmell("architect-canon-gap")).toEqual({
      owning_role: "architect-reviewer",
      gate_to_rerun: "architecture",
    });
  });

  it("is a BLOCKING smell (so it becomes an escalation)", () => {
    expect(BLOCKING_SMELLS.has("architect-canon-gap")).toBe(true);
  });
});

describe("evaluateStoryCanon: the projection's coverage recognizer", () => {
  it("OK when the story maps onto the canon (projection proceeds)", () => {
    establishCanon();
    writeFeatureArch();
    writeAc("S1", "AC1"); // API is a known layer
    expect(evaluateStoryCanon(tdd, F, "S1")).toEqual({ ok: true });
  });

  it("gap when the feature architecture.json introduces an invariant type the canon lacks", () => {
    establishCanon();
    writeFeatureArch({
      feature_id: F,
      service_backed: true,
      nfrs: [],
      persistence_invariants: [{ id: "PIx", type: "check", brief: "qty >= 0" }],
    });
    writeAc("S1", "AC1");
    const r = evaluateStoryCanon(tdd, F, "S1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.gaps.join(" ")).toMatch(/invariant.*"check"/);
  });

  it("OK when no canon exists yet (the architect path handles the first feature)", () => {
    writeFeatureArch();
    writeAc("S1", "AC1");
    expect(evaluateStoryCanon(tdd, F, "S1")).toEqual({ ok: true });
  });
});

describe("escalation + routable wiring", () => {
  it("an open architect-canon-gap smell becomes an escalation with the smell source", () => {
    writeSmellsLog(tdd, [
      { smell: "architect-canon-gap", cycle_ids: [], story_id: "S1", detail: "canon gap: invariant check" },
    ]);
    const escs = escalationsFromSmells(tdd, F);
    expect(escs.some((e) => e.source === "smell:architect-canon-gap")).toBe(true);
  });

  it("the probe routes the open gap smell to the architect (owning_role + architecture gate)", () => {
    writeSmellsLog(tdd, [
      { smell: "architect-canon-gap", cycle_ids: [], story_id: "S1", detail: "canon gap" },
    ]);
    const esc = diskArtifactProbe(tdd, F).pendingEscalation();
    expect(esc?.routable).toEqual({ story: "S1", owning_role: "architect-reviewer", gate: "architecture" });
  });
});

describe("revise: architecture-gate staling + non-hollow re-run + bounded", () => {
  it("staleStoryArtifactsForRevise('architecture') clears architectural_notes but KEEPS the ACs", () => {
    writeAc("S1", "AC1", { architectural_notes: "projected note to clear" });
    writeAc("S1", "AC2", { architectural_notes: "also cleared" });
    staleStoryArtifactsForRevise(tdd, F, "S1", "architecture");
    const acPath = (ac: string) => join(tdd, "features", F, "stories", "S1", "acs", `${ac}.json`);
    expect(existsSync(acPath("AC1"))).toBe(true); // AC kept (not a re-decomposition)
    expect(JSON.parse(readFileSync(acPath("AC1"), "utf8")).architectural_notes).toBeUndefined();
    expect(JSON.parse(readFileSync(acPath("AC2"), "utf8")).architectural_notes).toBeUndefined();
  });

  it("after one architect-canon-gap revise the story is NOT projectable (forces the architect)", () => {
    establishCanon();
    writeFeatureArch();
    writeAc("S1", "AC1"); // non-novel by layer, so normally projectable
    const probe = diskArtifactProbe(tdd, F);
    expect(probe.architectProjectable("S1")).toBe(true);
    // Simulate a spent revise on this (smell, story).
    writeSmellsLog(tdd, [{ smell: "architect-canon-gap", cycle_ids: [], story_id: "S1", detail: "gap" }]);
    // mark it revised (spends the budget)
    markSmellResolved(tdd, "architect-canon-gap", { story_id: "S1", kind: "revised" });
    expect(priorReviseCount(tdd, "architect-canon-gap", "S1")).toBe(1);
    expect(diskArtifactProbe(tdd, F).architectProjectable("S1")).toBe(false);
  });

  it("applyReviseSelfHeal(architecture) clears notes, marks revised, and is bounded to one", () => {
    // Minimal pipeline carrying the story (reviseStory requires it).
    const pipeline: StoryPipeline = {
      version: 1,
      feature_id: F,
      stories: { S1: { status: "building", gate: { status: "approved", history: [] } } },
      build_queue: [],
      build_active: "S1",
    };
    writePipeline(tdd, pipeline);
    writeAc("S1", "AC1", { architectural_notes: "blind projection" });
    writeSmellsLog(tdd, [{ smell: "architect-canon-gap", cycle_ids: [], story_id: "S1", detail: "gap" }]);

    const r = applyReviseSelfHeal({
      featureId: F,
      story: "S1",
      smell: "architect-canon-gap",
      routedTo: "architect-reviewer",
      gate: "architecture",
      reason: "canon gap: invariant check",
      sftddDir: tdd,
    });
    expect(r.decided).toBe("revise");
    expect(r.resolvedSmell).toBe(true);
    // Notes cleared (architect will re-annotate), smell spent.
    const ac1 = JSON.parse(readFileSync(join(tdd, "features", F, "stories", "S1", "acs", "AC1.json"), "utf8"));
    expect(ac1.architectural_notes).toBeUndefined();
    expect(priorReviseCount(tdd, "architect-canon-gap", "S1")).toBe(1);
    // A second escape of the SAME smell on the SAME story is beyond budget:
    // the probe no longer routes it (routable requires priorReviseCount < 1).
    writeSmellsLog(tdd, [{ smell: "architect-canon-gap", cycle_ids: [], story_id: "S1", detail: "gap again" }]);
    expect(diskArtifactProbe(tdd, F).pendingEscalation()?.routable).toBeUndefined();
  });
});

describe("the establishing feature is exempt (no self-thrash against its own canon)", () => {
  // The canon is established_by "F1-stock-visibility"; that feature's own stories
  // must never be gap-checked against, or projected from, the canon they build.
  const EST = "F1-stock-visibility";
  function writeEstAc(story: string, acId: string, extra: Record<string, unknown> = {}): void {
    const dir = join(tdd, "features", EST, "stories", story, "acs");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${acId}.json`), JSON.stringify({ id: acId, layer: "API", ...extra }));
  }

  it("evaluateStoryCanon is OK for the establishing feature even when it would otherwise gap", () => {
    establishCanon(); // established_by = F1-stock-visibility
    mkdirSync(join(tdd, "features", EST), { recursive: true });
    // A NOVEL invariant type the canon lacks: a later feature would gap here.
    writeFileSync(
      join(tdd, "features", EST, "architecture.json"),
      JSON.stringify({ feature_id: EST, service_backed: true, nfrs: [], persistence_invariants: [{ id: "PIx", type: "check", brief: "q>=0" }] }),
    );
    writeEstAc("S2", "AC1", { layer: "E2E" }); // E2E not in canon either
    expect(evaluateStoryCanon(tdd, EST, "S2")).toEqual({ ok: true });
  });

  it("architectProjectable is false for the establishing feature (it runs the architect, not projection)", () => {
    establishCanon();
    mkdirSync(join(tdd, "features", EST), { recursive: true });
    writeFileSync(join(tdd, "features", EST, "architecture.json"), JSON.stringify({ feature_id: EST, service_backed: true, nfrs: [] }));
    writeEstAc("S2", "AC1"); // clean layer , a LATER feature would be projectable, but the establisher is not
    expect(diskArtifactProbe(tdd, EST).architectProjectable("S2")).toBe(false);
  });
});
