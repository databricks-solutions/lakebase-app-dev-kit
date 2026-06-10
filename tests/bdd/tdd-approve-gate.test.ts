// G3: approveGate primitive.
//
// Covers ADR-0004 test plan scenarios S2 (spec approve), S3 (plan approve),
// S4 (test_list approve), plus promote-gate approval, HITL refusal,
// re-approval rejection, and selection-log narrative dual-write.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { approveGate, GateAlreadyClosedError } from "../../scripts/tdd/approve-gate";
import { defaultGatesState, readGates, writeGates } from "../../scripts/tdd/gates";
import { hashArtifact } from "../../scripts/tdd/gate-hash";

let tdd: string;
const FEATURE_ID = "F1-checkout";
const APPROVER = "kevin.hartman@databricks.com";
const FIXED_NOW = () => new Date("2026-05-31T20:00:00Z");

function makeFeatureDir(): string {
  const dir = join(tdd, "features", FEATURE_ID);
  mkdirSync(dir, { recursive: true });
  return dir;
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-approve-gate-"));
});

afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

describe("approveGate: HITL gate enforcement", () => {
  it("refuses to run without hitlApproved: true", () => {
    makeFeatureDir();
    expect(() =>
      approveGate({
        featureId: FEATURE_ID,
        gate: "spec",
        approver: APPROVER,
        hitlApproved: false,
        artifactInputs: { "feature-spec.md": "x" },
        tddDir: tdd,
      })
    ).toThrow(/hitlApproved/);
  });

  it("rejects an empty approver", () => {
    makeFeatureDir();
    expect(() =>
      approveGate({
        featureId: FEATURE_ID,
        gate: "spec",
        approver: "",
        hitlApproved: true,
        artifactInputs: { "feature-spec.md": "x" },
        tddDir: tdd,
      })
    ).toThrow(/approver/);
  });

  it("rejects empty artifactInputs", () => {
    makeFeatureDir();
    expect(() =>
      approveGate({
        featureId: FEATURE_ID,
        gate: "spec",
        approver: APPROVER,
        hitlApproved: true,
        artifactInputs: {},
        tddDir: tdd,
      })
    ).toThrow(/at least one artifact/);
  });
});

describe("approveGate: S2 spec gate approval", () => {
  it("approves spec from default-open and captures both artifact hashes", () => {
    makeFeatureDir();
    const specMd = "# Feature spec\n\nbody\n";
    const featureJson = '{"id":"F1","name":"Checkout"}';
    const result = approveGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      hitlApproved: true,
      artifactInputs: { "feature-spec.md": specMd, "feature-spec.json": featureJson },
      tddDir: tdd,
      now: FIXED_NOW,
    });

    expect(result.state.gates.spec.status).toBe("approved");
    expect(result.state.gates.spec.approver).toBe(APPROVER);
    expect(result.state.gates.spec.approved_at).toBe("2026-05-31T20:00:00.000Z");
    expect(result.capturedHashes["feature-spec.md"]).toBe(hashArtifact(specMd));
    expect(result.capturedHashes["feature-spec.json"]).toBe(hashArtifact(featureJson));
    expect(result.state.gates.spec.artifact_hashes).toEqual(result.capturedHashes);
    expect(result.state.gates.spec.history).toHaveLength(1);
    expect(result.state.gates.spec.history[0].action).toBe("approved");
  });

  it("persists the new state: subsequent readGates returns approved spec", () => {
    makeFeatureDir();
    approveGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      hitlApproved: true,
      artifactInputs: { "feature-spec.md": "x", "feature-spec.json": "{}" },
      tddDir: tdd,
      now: FIXED_NOW,
    });
    const back = readGates(FEATURE_ID, { tddDir: tdd });
    expect(back.gates.spec.status).toBe("approved");
    expect(back.gates.plan.status).toBe("open");
    expect(back.gates.test_list.status).toBe("open");
    expect(back.gates.promote.status).toBe("open");
  });
});

describe("approveGate: S3 plan gate approval", () => {
  it("approves plan with a single plan.json input", () => {
    makeFeatureDir();
    const planJson = '{"feature_id":"F1","N":1}';
    const result = approveGate({
      featureId: FEATURE_ID,
      gate: "plan",
      approver: APPROVER,
      hitlApproved: true,
      artifactInputs: { "plan.json": planJson },
      tddDir: tdd,
      now: FIXED_NOW,
    });
    expect(result.state.gates.plan.status).toBe("approved");
    expect(result.capturedHashes["plan.json"]).toBe(hashArtifact(planJson));
    expect(Object.keys(result.capturedHashes)).toEqual(["plan.json"]);
  });
});

describe("approveGate: S4 test_list gate approval", () => {
  it("approves test_list with test-list.json input", () => {
    makeFeatureDir();
    const testList = '{"feature_id":"F1","items":[]}';
    const result = approveGate({
      featureId: FEATURE_ID,
      gate: "test_list",
      approver: APPROVER,
      hitlApproved: true,
      artifactInputs: { "test-list.json": testList },
      tddDir: tdd,
      now: FIXED_NOW,
    });
    expect(result.state.gates.test_list.status).toBe("approved");
    expect(result.capturedHashes["test-list.json"]).toBe(hashArtifact(testList));
  });
});

describe("approveGate: promote gate approval (string ref hashing)", () => {
  it("approves promote with a promote_ref string artifact", () => {
    makeFeatureDir();
    const promoteRef = "exp-postgres-arrays:br-checkout-pg-arrays";
    const result = approveGate({
      featureId: FEATURE_ID,
      gate: "promote",
      approver: APPROVER,
      hitlApproved: true,
      artifactInputs: { promote_ref: promoteRef },
      tddDir: tdd,
      now: FIXED_NOW,
    });
    expect(result.state.gates.promote.status).toBe("approved");
    expect(result.capturedHashes.promote_ref).toBe(hashArtifact(promoteRef));
  });
});

describe("approveGate: re-approval rejection", () => {
  it("throws GateAlreadyClosedError when the gate is already approved", () => {
    makeFeatureDir();
    approveGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      hitlApproved: true,
      artifactInputs: { "feature-spec.md": "x", "feature-spec.json": "{}" },
      tddDir: tdd,
      now: FIXED_NOW,
    });
    expect(() =>
      approveGate({
        featureId: FEATURE_ID,
        gate: "spec",
        approver: APPROVER,
        hitlApproved: true,
        artifactInputs: { "feature-spec.md": "y", "feature-spec.json": "{}" },
        tddDir: tdd,
        now: FIXED_NOW,
      })
    ).toThrow(GateAlreadyClosedError);
  });

  it("throws GateAlreadyClosedError on a withdrawn or superseded gate", () => {
    makeFeatureDir();
    const state = defaultGatesState(FEATURE_ID);
    state.gates.plan = { status: "withdrawn", history: [] };
    writeGates(state, { tddDir: tdd });
    expect(() =>
      approveGate({
        featureId: FEATURE_ID,
        gate: "plan",
        approver: APPROVER,
        hitlApproved: true,
        artifactInputs: { "plan.json": "{}" },
        tddDir: tdd,
        now: FIXED_NOW,
      })
    ).toThrow(GateAlreadyClosedError);
  });
});

describe("approveGate: history accumulation", () => {
  it("preserves prior history entries when transitioning back to approved (via writeGates)", () => {
    makeFeatureDir();
    const state = defaultGatesState(FEATURE_ID);
    state.gates.spec.history = [
      { action: "withdrawn", at: "2026-05-30T00:00:00.000Z", approver: APPROVER, reason: "first pass" },
    ];
    state.gates.spec.status = "open";
    writeGates(state, { tddDir: tdd });
    const result = approveGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      hitlApproved: true,
      artifactInputs: { "feature-spec.md": "x", "feature-spec.json": "{}" },
      tddDir: tdd,
      now: FIXED_NOW,
    });
    expect(result.state.gates.spec.history).toHaveLength(2);
    expect(result.state.gates.spec.history[0].action).toBe("withdrawn");
    expect(result.state.gates.spec.history[1].action).toBe("approved");
  });
});

describe("approveGate: selection-log dual-write", () => {
  it("appends a narrative entry on approval (default writeSelectionLog: true)", () => {
    makeFeatureDir();
    approveGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      hitlApproved: true,
      artifactInputs: { "feature-spec.md": "x", "feature-spec.json": "{}" },
      tddDir: tdd,
      now: FIXED_NOW,
    });
    const logPath = join(tdd, "selection-log.md");
    expect(existsSync(logPath)).toBe(true);
    const log = readFileSync(logPath, "utf8");
    expect(log).toContain(`## 2026-05-31T20:00:00.000Z – Approve spec for ${FEATURE_ID}`);
    expect(log).toContain(`**Approved by:** ${APPROVER}`);
    expect(log).toContain("feature-spec.md");
    expect(log).toContain("feature-spec.json");
    expect(log).toContain("sha256:");
  });

  it("appends to an existing selection-log without clobbering prior content", () => {
    makeFeatureDir();
    const logPath = join(tdd, "selection-log.md");
    writeFileSync(logPath, "# Prior entries\n\nold content\n");
    approveGate({
      featureId: FEATURE_ID,
      gate: "plan",
      approver: APPROVER,
      hitlApproved: true,
      artifactInputs: { "plan.json": "{}" },
      tddDir: tdd,
      now: FIXED_NOW,
    });
    const log = readFileSync(logPath, "utf8");
    expect(log.startsWith("# Prior entries\n\nold content\n")).toBe(true);
    expect(log).toContain("## 2026-05-31T20:00:00.000Z – Approve plan for");
  });

  it("skips the narrative entry when writeSelectionLog: false", () => {
    makeFeatureDir();
    approveGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      hitlApproved: true,
      artifactInputs: { "feature-spec.md": "x", "feature-spec.json": "{}" },
      tddDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });
    expect(existsSync(join(tdd, "selection-log.md"))).toBe(false);
  });
});
