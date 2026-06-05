// G4 (FEIP-7361): verifyGateIntegrity primitive.
//
// Covers ADR-0004 test plan scenarios S5 (no-drift after prettier run on
// test-list.json) + S5b (drift detected on semantic AC text change), plus
// the open/withdrawn/superseded gate-not-approved cases and the artifact
// name mismatch refusal.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { approveGate } from "../../scripts/tdd/approve-gate";
import { defaultGatesState, writeGates } from "../../scripts/tdd/gates";
import { verifyGateIntegrity } from "../../scripts/tdd/verify-gate-integrity";

let tdd: string;
const FEATURE_ID = "F1-checkout";
const APPROVER = "kevin.hartman@databricks.com";
const FIXED_NOW = () => new Date("2026-05-31T20:00:00Z");

function makeFeatureDir(): string {
  const dir = join(tdd, "features", FEATURE_ID);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function approveSpec(specMd: string, featureJson: string): void {
  approveGate({
    featureId: FEATURE_ID,
    gate: "spec",
    approver: APPROVER,
    hitlApproved: true,
    artifactInputs: { "feature-spec.md": specMd, "feature-spec.json": featureJson },
    tddDir: tdd,
    now: FIXED_NOW,
  });
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-verify-gate-"));
});

afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

describe("verifyGateIntegrity: S5 no-drift after formatter-equivalent reformat", () => {
  it("returns ok when current content is identical to approval-time content", () => {
    makeFeatureDir();
    approveSpec("# spec\n\nbody\n", '{"id":"F1"}');
    const result = verifyGateIntegrity({
      featureId: FEATURE_ID,
      gate: "spec",
      currentInputs: { "feature-spec.md": "# spec\n\nbody\n", "feature-spec.json": '{"id":"F1"}' },
      tddDir: tdd,
    });
    expect(result.status).toBe("ok");
  });

  it("returns ok after a prettier-equivalent reformat (whitespace + line-ending normalization)", () => {
    makeFeatureDir();
    approveSpec("# spec\n\nbody\n", '{"id":"F1"}');
    const result = verifyGateIntegrity({
      featureId: FEATURE_ID,
      gate: "spec",
      currentInputs: {
        // Same content as approved, but with CRLF + trailing spaces + extra blank lines
        "feature-spec.md": "# spec   \r\n\r\n\r\nbody  \r\n",
        "feature-spec.json": '{"id":"F1"}',
      },
      tddDir: tdd,
    });
    expect(result.status).toBe("ok");
  });
});

describe("verifyGateIntegrity: S5b drift on semantic edits", () => {
  it("returns drift when a single artifact's content has changed semantically", () => {
    makeFeatureDir();
    approveSpec("# spec\n\nbody\n", '{"id":"F1"}');
    const result = verifyGateIntegrity({
      featureId: FEATURE_ID,
      gate: "spec",
      currentInputs: { "feature-spec.md": "# spec\n\nDIFFERENT body\n", "feature-spec.json": '{"id":"F1"}' },
      tddDir: tdd,
    });
    expect(result.status).toBe("drift");
    if (result.status !== "drift") return;
    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0].artifact).toBe("feature-spec.md");
    expect(result.drifts[0].expected).not.toBe(result.drifts[0].actual);
  });

  it("returns drift with every changed artifact listed when multiple changed", () => {
    makeFeatureDir();
    approveSpec("# spec\n\nbody\n", '{"id":"F1"}');
    const result = verifyGateIntegrity({
      featureId: FEATURE_ID,
      gate: "spec",
      currentInputs: { "feature-spec.md": "# SPEC\n\nbody\n", "feature-spec.json": '{"id":"F2"}' },
      tddDir: tdd,
    });
    expect(result.status).toBe("drift");
    if (result.status !== "drift") return;
    const names = result.drifts.map((d) => d.artifact).sort();
    expect(names).toEqual(["feature-spec.json", "feature-spec.md"]);
  });

  it("returns drift only for the artifact that changed when others are unchanged", () => {
    makeFeatureDir();
    approveSpec("# spec\n\nbody\n", '{"id":"F1"}');
    const result = verifyGateIntegrity({
      featureId: FEATURE_ID,
      gate: "spec",
      currentInputs: { "feature-spec.md": "# spec\n\nbody\n", "feature-spec.json": '{"id":"DIFFERENT"}' },
      tddDir: tdd,
    });
    expect(result.status).toBe("drift");
    if (result.status !== "drift") return;
    expect(result.drifts.map((d) => d.artifact)).toEqual(["feature-spec.json"]);
  });
});

describe("verifyGateIntegrity: gate-not-approved verdicts", () => {
  it("returns gate-not-approved when the gate is open", () => {
    makeFeatureDir();
    const result = verifyGateIntegrity({
      featureId: FEATURE_ID,
      gate: "plan",
      currentInputs: { "plan.json": "{}" },
      tddDir: tdd,
    });
    expect(result.status).toBe("gate-not-approved");
    if (result.status !== "gate-not-approved") return;
    expect(result.current_status).toBe("open");
  });

  it("returns gate-not-approved when the gate is withdrawn", () => {
    makeFeatureDir();
    const state = defaultGatesState(FEATURE_ID);
    state.gates.plan = { status: "withdrawn", history: [] };
    writeGates(state, { tddDir: tdd });
    const result = verifyGateIntegrity({
      featureId: FEATURE_ID,
      gate: "plan",
      currentInputs: { "plan.json": "{}" },
      tddDir: tdd,
    });
    expect(result.status).toBe("gate-not-approved");
    if (result.status !== "gate-not-approved") return;
    expect(result.current_status).toBe("withdrawn");
  });

  it("returns gate-not-approved when the gate is superseded", () => {
    makeFeatureDir();
    const state = defaultGatesState(FEATURE_ID);
    state.gates.spec = { status: "superseded", history: [] };
    writeGates(state, { tddDir: tdd });
    const result = verifyGateIntegrity({
      featureId: FEATURE_ID,
      gate: "spec",
      currentInputs: { "feature-spec.md": "x", "feature-spec.json": "{}" },
      tddDir: tdd,
    });
    expect(result.status).toBe("gate-not-approved");
  });
});

describe("verifyGateIntegrity: artifact name mismatch refusal", () => {
  it("throws when currentInputs is missing an artifact that was captured", () => {
    makeFeatureDir();
    approveSpec("# spec\n", '{"id":"F1"}');
    expect(() =>
      verifyGateIntegrity({
        featureId: FEATURE_ID,
        gate: "spec",
        currentInputs: { "feature-spec.md": "# spec\n" },
        tddDir: tdd,
      })
    ).toThrow(/missing: feature-spec\.json/);
  });

  it("throws when currentInputs contains an artifact that was NOT captured", () => {
    makeFeatureDir();
    approveSpec("# spec\n", '{"id":"F1"}');
    expect(() =>
      verifyGateIntegrity({
        featureId: FEATURE_ID,
        gate: "spec",
        currentInputs: {
          "feature-spec.md": "# spec\n",
          "feature-spec.json": '{"id":"F1"}',
          "extra.txt": "uninvited",
        },
        tddDir: tdd,
      })
    ).toThrow(/unexpected: extra\.txt/);
  });
});

describe("verifyGateIntegrity: pure-read invariant", () => {
  it("does NOT modify gates.json on an ok verification", () => {
    const dir = makeFeatureDir();
    approveSpec("# spec\n", '{"id":"F1"}');
    const gatesPath = join(dir, "gates.json");
    const before = readFileSync(gatesPath, "utf8");
    const mtimeBefore = statSync(gatesPath).mtimeMs;
    verifyGateIntegrity({
      featureId: FEATURE_ID,
      gate: "spec",
      currentInputs: { "feature-spec.md": "# spec\n", "feature-spec.json": '{"id":"F1"}' },
      tddDir: tdd,
    });
    const after = readFileSync(gatesPath, "utf8");
    expect(after).toBe(before);
    expect(statSync(gatesPath).mtimeMs).toBe(mtimeBefore);
  });

  it("does NOT modify gates.json on a drift verdict", () => {
    const dir = makeFeatureDir();
    approveSpec("# spec\n", '{"id":"F1"}');
    const gatesPath = join(dir, "gates.json");
    const before = readFileSync(gatesPath, "utf8");
    verifyGateIntegrity({
      featureId: FEATURE_ID,
      gate: "spec",
      currentInputs: { "feature-spec.md": "# CHANGED\n", "feature-spec.json": '{"id":"F1"}' },
      tddDir: tdd,
    });
    expect(readFileSync(gatesPath, "utf8")).toBe(before);
  });
});
