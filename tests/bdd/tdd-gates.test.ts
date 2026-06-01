// G1 (FEIP-7358): GatesState types + readGates / writeGates substrate.
//
// Covers the ADR-0004 test plan scenarios:
//   S1.1 readGates returns the default-open shape when gates.json is absent
//   S1.2 round-trip writeGates -> readGates
//   S1.3 malformed gates.json throws a clear error
//   S1.4 writeGates leaves no temp file behind on success (atomicity probe)
//
// approveGate / verifyGateIntegrity / withdrawGate / hash normalization /
// migration / concurrent-write atomicity live in G2 through G7; their
// scenarios are filed against their own sub-tasks.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  GATES_SCHEMA_VERSION,
  GATE_NAMES,
  defaultGatesState,
  readGates,
  writeGates,
  type GatesState,
} from "../../scripts/tdd/gates";

let tdd: string;
const FEATURE_ID = "F1-checkout";

function makeFeatureDir(): string {
  const dir = join(tdd, "features", FEATURE_ID);
  mkdirSync(dir, { recursive: true });
  return dir;
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-gates-"));
});

afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

describe("gates: defaultGatesState", () => {
  it("returns all four gates in the open state with empty history", () => {
    const state = defaultGatesState(FEATURE_ID);
    expect(state.feature_id).toBe(FEATURE_ID);
    expect(state.schema_version).toBe(GATES_SCHEMA_VERSION);
    for (const name of GATE_NAMES) {
      expect(state.gates[name].status).toBe("open");
      expect(state.gates[name].history).toEqual([]);
    }
  });
});

describe("gates: readGates (S1.1 default-open + S1.3 malformed)", () => {
  it("S1.1: returns default-open shape when gates.json is absent", () => {
    makeFeatureDir();
    const state = readGates(FEATURE_ID, { tddDir: tdd });
    expect(state).toEqual(defaultGatesState(FEATURE_ID));
  });

  it("S1.1: does NOT create gates.json on a default-open read", () => {
    const dir = makeFeatureDir();
    readGates(FEATURE_ID, { tddDir: tdd });
    expect(existsSync(join(dir, "gates.json"))).toBe(false);
  });

  it("throws when the feature directory does not exist", () => {
    expect(() => readGates(FEATURE_ID, { tddDir: tdd })).toThrow(
      /does not exist|not found/
    );
  });

  it("S1.3: throws a clear error on invalid JSON", () => {
    const dir = makeFeatureDir();
    writeFileSync(join(dir, "gates.json"), "{ not valid json");
    expect(() => readGates(FEATURE_ID, { tddDir: tdd })).toThrow(/not valid JSON/);
  });

  it("S1.3: throws when feature_id is missing", () => {
    const dir = makeFeatureDir();
    writeFileSync(
      join(dir, "gates.json"),
      JSON.stringify({ schema_version: 1, gates: {} })
    );
    expect(() => readGates(FEATURE_ID, { tddDir: tdd })).toThrow(/feature_id/);
  });

  it("S1.3: throws when a gate has an invalid status", () => {
    const dir = makeFeatureDir();
    const bad: unknown = {
      feature_id: FEATURE_ID,
      schema_version: 1,
      gates: {
        spec: { status: "bogus", history: [] },
        plan: { status: "open", history: [] },
        test_list: { status: "open", history: [] },
        promote: { status: "open", history: [] },
      },
    };
    writeFileSync(join(dir, "gates.json"), JSON.stringify(bad));
    expect(() => readGates(FEATURE_ID, { tddDir: tdd })).toThrow(/invalid status/);
  });
});

describe("gates: writeGates (S1.2 round-trip + S1.4 atomicity)", () => {
  it("S1.2: round-trip writeGates then readGates returns equivalent state", () => {
    makeFeatureDir();
    const state: GatesState = {
      feature_id: FEATURE_ID,
      schema_version: GATES_SCHEMA_VERSION,
      gates: {
        spec: {
          status: "approved",
          approver: "kevin.hartman@databricks.com",
          approved_at: "2026-05-31T20:00:00Z",
          artifact_hashes: { "spec.md": "sha256:abc", "feature.json": "sha256:def" },
          history: [
            {
              action: "approved",
              at: "2026-05-31T20:00:00Z",
              approver: "kevin.hartman@databricks.com",
              artifact_hashes: { "spec.md": "sha256:abc", "feature.json": "sha256:def" },
            },
          ],
        },
        plan: { status: "open", history: [] },
        test_list: { status: "open", history: [] },
        promote: { status: "open", history: [] },
      },
    };
    writeGates(state, { tddDir: tdd });
    const back = readGates(FEATURE_ID, { tddDir: tdd });
    expect(back).toEqual(state);
  });

  it("S1.2: overwrites a prior gates.json on subsequent writes", () => {
    makeFeatureDir();
    const first = defaultGatesState(FEATURE_ID);
    writeGates(first, { tddDir: tdd });
    const second: GatesState = {
      ...first,
      gates: {
        ...first.gates,
        spec: { status: "withdrawn", withdrawal_reason: "po retracted", history: [] },
      },
    };
    writeGates(second, { tddDir: tdd });
    const back = readGates(FEATURE_ID, { tddDir: tdd });
    expect(back.gates.spec.status).toBe("withdrawn");
    expect(back.gates.spec.withdrawal_reason).toBe("po retracted");
  });

  it("S1.4: leaves no temp file behind on a successful write", () => {
    const dir = makeFeatureDir();
    writeGates(defaultGatesState(FEATURE_ID), { tddDir: tdd });
    const stray = readdirSync(dir).filter((f) => f.includes(".tmp."));
    expect(stray).toEqual([]);
  });

  it("rejects an empty feature_id", () => {
    const bad: GatesState = { ...defaultGatesState(FEATURE_ID), feature_id: "" };
    expect(() => writeGates(bad, { tddDir: tdd })).toThrow(/feature_id/);
  });
});
