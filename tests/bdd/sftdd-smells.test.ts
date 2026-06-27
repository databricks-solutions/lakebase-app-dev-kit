import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  SMELL_CATALOG,
  detectAll,
  detectCycleStall,
  detectFragilityRatio,
  detectTestCostSpiral,
  detectTestDeletionAttempt,
  detectBoundaryViolation,
  detectTestListDrift,
  detectApiCoherenceDrift,
  detectCrossExperimentDivergence,
  detectDeadRequirementSignal,
  writeSmellsLog,
  readSmellsLog,
} from "../../scripts/sftdd/smells";
import type { CycleArtifact, CycleScope } from "../../scripts/sftdd/run-cycle";

let tdd: string;
const scope: CycleScope = { tddDir: "", feature_id: "F1", story_id: "S1", ac_id: "AC1" };

function artifact(overrides: Partial<CycleArtifact>): CycleArtifact {
  return {
    cycle_id: "cycle-001",
    feature_id: "F1",
    story_id: "S1",
    ac_id: "AC1",
    test_id: "T1",
    test_description: "x",
    ...overrides,
  };
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-smells-"));
});

afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

describe("smells catalog", () => {
  it("ships the canonical smell entries from the spec plus the per-tag E2E detector", () => {
    const names = SMELL_CATALOG.map((s) => s.name).sort();
    expect(names).toEqual(
      [
        "ac-overlap",
        "api-coherence-drift",
        "boundary-violation",
        "contract-incompleteness",
        "cross-experiment-divergence",
        "cycle-stall",
        "dead-requirement-signal",
        "e2e-inline-regex-flag",
        "e2e-row-perma-red",
        "fragility-ratio",
        "import-time-build-coupling",
        "layering-violation",
        "scaffold-defect",
        "superseded-tests",
        "test-cost-spiral",
        "test-deletion-attempt",
        "test-list-drift",
        "ux-adherence",
      ].sort()
    );
  });

  it("every catalog entry has a description and a proposed remediation", () => {
    for (const entry of SMELL_CATALOG) {
      expect(entry.description.length).toBeGreaterThan(10);
      expect(entry.proposed_remediation.length).toBeGreaterThan(10);
    }
  });
});

describe("smells detectors", () => {
  it("detectCycleStall flags 3 consecutive cycles with no GREEN", () => {
    const cycles = [
      artifact({ cycle_id: "cycle-001" }),
      artifact({ cycle_id: "cycle-002" }),
      artifact({ cycle_id: "cycle-003" }),
    ];
    const hits = detectCycleStall({ scope, cycles });
    expect(hits.length).toBe(1);
    expect(hits[0].smell).toBe("cycle-stall");
  });

  it("detectCycleStall does not fire when at least one recent cycle is GREEN", () => {
    const cycles = [
      artifact({ cycle_id: "cycle-001" }),
      artifact({ cycle_id: "cycle-002", green_at: new Date().toISOString() }),
      artifact({ cycle_id: "cycle-003" }),
    ];
    expect(detectCycleStall({ scope, cycles })).toEqual([]);
  });

  it("detectFragilityRatio flags Navigator-flagged cycles", () => {
    const cycles = [artifact({ smell_flags: ["fragility-ratio"] })];
    const hits = detectFragilityRatio({ scope, cycles });
    expect(hits.length).toBe(1);
    expect(hits[0].smell).toBe("fragility-ratio");
  });

  it("detectTestCostSpiral flags >2x growth in driver_changes char count", () => {
    const cycles = [
      artifact({ cycle_id: "cycle-001", driver_changes: "a".repeat(50) }),
      artifact({ cycle_id: "cycle-002", driver_changes: "a".repeat(150) }),
    ];
    const hits = detectTestCostSpiral({ scope, cycles });
    expect(hits.length).toBe(1);
    expect(hits[0].smell).toBe("test-cost-spiral");
  });

  it("detectTestDeletionAttempt + detectBoundaryViolation pass through Navigator flags", () => {
    const cycles = [
      artifact({ cycle_id: "cycle-001", smell_flags: ["test-deletion-attempt", "boundary-violation"] }),
    ];
    expect(detectTestDeletionAttempt({ scope, cycles })[0]?.smell).toBe("test-deletion-attempt");
    expect(detectBoundaryViolation({ scope, cycles })[0]?.smell).toBe("boundary-violation");
  });

  it("detectTestListDrift flags >25% growth", () => {
    const hits = detectTestListDrift({
      scope,
      cycles: [],
      test_list_size_at_start: 4,
      test_list_size_now: 6,
    });
    expect(hits.length).toBe(1);
    expect(hits[0].smell).toBe("test-list-drift");
  });

  it("detectTestListDrift does not fire under 25% growth", () => {
    expect(
      detectTestListDrift({
        scope,
        cycles: [],
        test_list_size_at_start: 10,
        test_list_size_now: 12,
      })
    ).toEqual([]);
  });

  it("detectAll aggregates hits from every individual detector", () => {
    const cycles = [
      artifact({ cycle_id: "cycle-001", driver_changes: "x".repeat(10), smell_flags: ["fragility-ratio"] }),
      artifact({ cycle_id: "cycle-002", driver_changes: "x".repeat(30) }),
      artifact({ cycle_id: "cycle-003", smell_flags: ["boundary-violation"] }),
      artifact({ cycle_id: "cycle-004" }),
      artifact({ cycle_id: "cycle-005" }),
    ];
    const hits = detectAll({ scope, cycles });
    const smellNames = new Set(hits.map((h) => h.smell));
    expect(smellNames.has("fragility-ratio")).toBe(true);
    expect(smellNames.has("boundary-violation")).toBe(true);
    expect(smellNames.has("test-cost-spiral")).toBe(true);
    expect(smellNames.has("cycle-stall")).toBe(true);
  });

  it("writeSmellsLog persists detected hits and readSmellsLog reads them back", () => {
    const hits = [{ smell: "cycle-stall" as const, cycle_ids: ["cycle-001"], detail: "x" }];
    writeSmellsLog(tdd, hits);
    expect(existsSync(join(tdd, "smells.json"))).toBe(true);
    const log = readSmellsLog(tdd);
    expect(log.detected.length).toBe(1);
    expect(log.detected[0].smell).toBe("cycle-stall");
    expect(log.detected[0].detected_at).toBeTruthy();
  });

  it("readSmellsLog returns empty when no log exists", () => {
    expect(readSmellsLog(tdd)).toEqual({ detected: [] });
  });

  // ---- the 3 detectors that were catalog-only before ----

  it("detectApiCoherenceDrift passes through Navigator's flag", () => {
    const cycles = [
      artifact({ cycle_id: "cycle-001", smell_flags: ["api-coherence-drift"] }),
    ];
    const hits = detectApiCoherenceDrift({ scope, cycles });
    expect(hits.length).toBe(1);
    expect(hits[0].smell).toBe("api-coherence-drift");
    expect(hits[0].cycle_ids).toEqual(["cycle-001"]);
  });

  it("detectApiCoherenceDrift returns [] when no cycle has the flag", () => {
    const cycles = [
      artifact({ cycle_id: "cycle-001" }),
      artifact({ cycle_id: "cycle-002", smell_flags: ["fragility-ratio"] }),
    ];
    expect(detectApiCoherenceDrift({ scope, cycles })).toEqual([]);
  });

  it("detectCrossExperimentDivergence passes through Navigator's flag", () => {
    const cycles = [
      artifact({ cycle_id: "cycle-001", smell_flags: ["cross-experiment-divergence"] }),
    ];
    const hits = detectCrossExperimentDivergence({ scope, cycles });
    expect(hits.length).toBe(1);
    expect(hits[0].smell).toBe("cross-experiment-divergence");
  });

  it("detectDeadRequirementSignal flags an AC with 0 cycles when siblings have matured", () => {
    const hits = detectDeadRequirementSignal({
      scope,
      cycles: [],
      sibling_ac_cycle_counts: { AC2: 4, AC3: 5 },
    });
    expect(hits.length).toBe(1);
    expect(hits[0].smell).toBe("dead-requirement-signal");
    expect(hits[0].detail).toMatch(/AC2=4, AC3=5/);
  });

  it("detectDeadRequirementSignal does NOT fire when this AC has cycles", () => {
    const cycles = [artifact({ cycle_id: "cycle-001" })];
    expect(
      detectDeadRequirementSignal({
        scope,
        cycles,
        sibling_ac_cycle_counts: { AC2: 10 },
      })
    ).toEqual([]);
  });

  it("detectDeadRequirementSignal does NOT fire when siblings are also early", () => {
    expect(
      detectDeadRequirementSignal({
        scope,
        cycles: [],
        sibling_ac_cycle_counts: { AC2: 1, AC3: 2 },
      })
    ).toEqual([]);
  });

  it("detectDeadRequirementSignal returns [] when sibling_ac_cycle_counts is absent", () => {
    expect(detectDeadRequirementSignal({ scope, cycles: [] })).toEqual([]);
  });

  it("detectAll includes the 3 new detectors", () => {
    const cycles = [
      artifact({
        cycle_id: "cycle-001",
        smell_flags: ["api-coherence-drift", "cross-experiment-divergence"],
      }),
    ];
    const hits = detectAll({
      scope,
      cycles,
      sibling_ac_cycle_counts: { AC2: 5 },
    });
    const smells = new Set(hits.map((h) => h.smell));
    expect(smells.has("api-coherence-drift")).toBe(true);
    expect(smells.has("cross-experiment-divergence")).toBe(true);
    // dead-requirement-signal does NOT fire here because cycles.length > 0
    expect(smells.has("dead-requirement-signal")).toBe(false);
  });

  it("detectAll fires dead-requirement-signal when this AC has 0 cycles + sibling counts are passed", () => {
    const hits = detectAll({
      scope,
      cycles: [],
      sibling_ac_cycle_counts: { AC2: 4 },
    });
    const smells = new Set(hits.map((h) => h.smell));
    expect(smells.has("dead-requirement-signal")).toBe(true);
  });
});
