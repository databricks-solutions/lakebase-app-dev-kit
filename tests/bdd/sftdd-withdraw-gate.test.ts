// G5: withdrawGate + cascade-on-withdrawal.
//
// Covers ADR-0004 test plan scenarios S6 (cascade on spec withdraw) +
// S6b (cascade on plan withdraw), plus the leaf-gate (test_list, promote)
// + idempotent-no-op + history + selection-log behaviors.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { approveGate } from "../../scripts/sftdd/approve-gate";
import { withdrawGate } from "../../scripts/sftdd/withdraw-gate";
import { defaultGatesState, readGates, writeGates, type GateName } from "../../scripts/sftdd/gates";

let tdd: string;
const FEATURE_ID = "F1-checkout";
const APPROVER = "kevin.hartman@databricks.com";
const FIXED_NOW = () => new Date("2026-05-31T20:00:00Z");

function makeFeatureDir(): string {
  const dir = join(tdd, "features", FEATURE_ID);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function approve(gate: GateName, inputs: Record<string, string>): void {
  approveGate({
    featureId: FEATURE_ID,
    gate,
    approver: APPROVER,
    hitlApproved: true,
    artifactInputs: inputs,
    tddDir: tdd,
    now: FIXED_NOW,
    writeSelectionLog: false,
  });
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-withdraw-gate-"));
});

afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

describe("withdrawGate: argument validation", () => {
  it("throws on empty approver", () => {
    makeFeatureDir();
    expect(() =>
      withdrawGate({
        featureId: FEATURE_ID,
        gate: "spec",
        approver: "",
        reason: "test",
        tddDir: tdd,
      })
    ).toThrow(/approver/);
  });

  it("throws on empty reason", () => {
    makeFeatureDir();
    expect(() =>
      withdrawGate({
        featureId: FEATURE_ID,
        gate: "spec",
        approver: APPROVER,
        reason: "",
        tddDir: tdd,
      })
    ).toThrow(/reason/);
  });
});

describe("withdrawGate: S6 spec withdraw cascades to plan + test_list", () => {
  it("withdraws all three when spec, plan, test_list are all approved", () => {
    makeFeatureDir();
    approve("spec", { "feature-spec.md": "x", "feature-spec.json": "{}" });
    approve("plan", { "plan.json": "{}" });
    approve("test_list", { "test-list.json": "{}" });

    const result = withdrawGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      reason: "scope rewrite",
      tddDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });

    expect(result.noop).toBe(false);
    expect(result.withdrawn_gates.sort()).toEqual(["plan", "spec", "test_list"]);
    expect(result.state.gates.spec.status).toBe("withdrawn");
    expect(result.state.gates.plan.status).toBe("withdrawn");
    expect(result.state.gates.test_list.status).toBe("withdrawn");
  });

  it("does NOT cascade to a gate that was never approved", () => {
    makeFeatureDir();
    approve("spec", { "feature-spec.md": "x", "feature-spec.json": "{}" });
    // plan + test_list left open

    const result = withdrawGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      reason: "scope rewrite",
      tddDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });

    expect(result.withdrawn_gates).toEqual(["spec"]);
    expect(result.state.gates.plan.status).toBe("open");
    expect(result.state.gates.test_list.status).toBe("open");
  });

  it("cascaded gates record withdrawal_reason = 'cascade:<source>'", () => {
    makeFeatureDir();
    approve("spec", { "feature-spec.md": "x", "feature-spec.json": "{}" });
    approve("plan", { "plan.json": "{}" });
    approve("test_list", { "test-list.json": "{}" });

    const result = withdrawGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      reason: "rescope",
      tddDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });

    expect(result.state.gates.spec.withdrawal_reason).toBe("rescope");
    expect(result.state.gates.plan.withdrawal_reason).toBe("cascade:spec");
    expect(result.state.gates.test_list.withdrawal_reason).toBe("cascade:spec");
  });

  it("history records cascade-withdrawn action on cascaded gates", () => {
    makeFeatureDir();
    approve("spec", { "feature-spec.md": "x", "feature-spec.json": "{}" });
    approve("plan", { "plan.json": "{}" });

    const result = withdrawGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      reason: "rescope",
      tddDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });

    const specHistory = result.state.gates.spec.history;
    const planHistory = result.state.gates.plan.history;
    expect(specHistory[specHistory.length - 1].action).toBe("withdrawn");
    expect(planHistory[planHistory.length - 1].action).toBe("cascade-withdrawn");
  });

  it("preserves the prior approver + approved_at + artifact_hashes on withdrawn gates", () => {
    makeFeatureDir();
    approve("spec", { "feature-spec.md": "x", "feature-spec.json": "{}" });
    const beforeApprover = readGates(FEATURE_ID, { tddDir: tdd }).gates.spec.approver;
    const beforeHashes = readGates(FEATURE_ID, { tddDir: tdd }).gates.spec.artifact_hashes;

    withdrawGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      reason: "rescope",
      tddDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });

    const after = readGates(FEATURE_ID, { tddDir: tdd }).gates.spec;
    expect(after.approver).toBe(beforeApprover);
    expect(after.artifact_hashes).toEqual(beforeHashes);
  });
});

describe("withdrawGate: S6b plan withdraw cascades to test_list only", () => {
  it("withdraws plan + test_list, leaves spec approved", () => {
    makeFeatureDir();
    approve("spec", { "feature-spec.md": "x", "feature-spec.json": "{}" });
    approve("plan", { "plan.json": "{}" });
    approve("test_list", { "test-list.json": "{}" });

    const result = withdrawGate({
      featureId: FEATURE_ID,
      gate: "plan",
      approver: APPROVER,
      reason: "plan rewrite",
      tddDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });

    expect(result.withdrawn_gates.sort()).toEqual(["plan", "test_list"]);
    expect(result.state.gates.spec.status).toBe("approved");
    expect(result.state.gates.plan.status).toBe("withdrawn");
    expect(result.state.gates.test_list.status).toBe("withdrawn");
    expect(result.state.gates.test_list.withdrawal_reason).toBe("cascade:plan");
  });
});

describe("withdrawGate: leaf gates do not cascade", () => {
  it("test_list withdraw does not affect any other gate", () => {
    makeFeatureDir();
    approve("spec", { "feature-spec.md": "x", "feature-spec.json": "{}" });
    approve("plan", { "plan.json": "{}" });
    approve("test_list", { "test-list.json": "{}" });

    const result = withdrawGate({
      featureId: FEATURE_ID,
      gate: "test_list",
      approver: APPROVER,
      reason: "test rewrite",
      tddDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });

    expect(result.withdrawn_gates).toEqual(["test_list"]);
    expect(result.state.gates.spec.status).toBe("approved");
    expect(result.state.gates.plan.status).toBe("approved");
  });

  it("promote withdraw is independent of all upstream gates", () => {
    makeFeatureDir();
    approve("spec", { "feature-spec.md": "x", "feature-spec.json": "{}" });
    approve("plan", { "plan.json": "{}" });
    approve("test_list", { "test-list.json": "{}" });
    approve("promote", { promote_ref: "exp-a:br-a" });

    const result = withdrawGate({
      featureId: FEATURE_ID,
      gate: "promote",
      approver: APPROVER,
      reason: "wrong winner picked",
      tddDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });

    expect(result.withdrawn_gates).toEqual(["promote"]);
    expect(result.state.gates.spec.status).toBe("approved");
    expect(result.state.gates.plan.status).toBe("approved");
    expect(result.state.gates.test_list.status).toBe("approved");
  });
});

describe("withdrawGate: idempotent no-op semantics", () => {
  it("returns noop=true when the source gate is open", () => {
    makeFeatureDir();
    const result = withdrawGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      reason: "test",
      tddDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });
    expect(result.noop).toBe(true);
    expect(result.withdrawn_gates).toEqual([]);
  });

  it("returns noop=true when the source gate is already withdrawn", () => {
    makeFeatureDir();
    approve("spec", { "feature-spec.md": "x", "feature-spec.json": "{}" });
    withdrawGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      reason: "first",
      tddDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });
    const second = withdrawGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      reason: "second",
      tddDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });
    expect(second.noop).toBe(true);
  });

  it("returns noop=true when the source gate is superseded", () => {
    makeFeatureDir();
    const state = defaultGatesState(FEATURE_ID);
    state.gates.spec = { status: "superseded", history: [] };
    writeGates(state, { tddDir: tdd });
    const result = withdrawGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      reason: "test",
      tddDir: tdd,
      now: FIXED_NOW,
      writeSelectionLog: false,
    });
    expect(result.noop).toBe(true);
  });
});

describe("withdrawGate: selection-log dual-write", () => {
  it("appends a narrative entry naming the source gate and cascaded targets", () => {
    makeFeatureDir();
    approve("spec", { "feature-spec.md": "x", "feature-spec.json": "{}" });
    approve("plan", { "plan.json": "{}" });

    withdrawGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      reason: "rescope",
      tddDir: tdd,
      now: FIXED_NOW,
    });

    const logPath = join(tdd, "selection-log.md");
    expect(existsSync(logPath)).toBe(true);
    const log = readFileSync(logPath, "utf8");
    expect(log).toContain(`## 2026-05-31T20:00:00.000Z – Withdraw spec for ${FEATURE_ID}`);
    expect(log).toContain("**Withdrawn by:**");
    expect(log).toContain("**Reason:** rescope");
    expect(log).toContain("**Cascade:** plan");
  });

  it("uses 'Cascade: none' wording for a leaf-gate withdraw", () => {
    makeFeatureDir();
    approve("spec", { "feature-spec.md": "x", "feature-spec.json": "{}" });
    approve("test_list", { "test-list.json": "{}" });

    withdrawGate({
      featureId: FEATURE_ID,
      gate: "test_list",
      approver: APPROVER,
      reason: "test rewrite",
      tddDir: tdd,
      now: FIXED_NOW,
    });

    const log = readFileSync(join(tdd, "selection-log.md"), "utf8");
    expect(log).toContain("**Cascade:** none");
  });

  it("does NOT write to selection-log on a noop call", () => {
    makeFeatureDir();
    withdrawGate({
      featureId: FEATURE_ID,
      gate: "spec",
      approver: APPROVER,
      reason: "test",
      tddDir: tdd,
      now: FIXED_NOW,
    });
    expect(existsSync(join(tdd, "selection-log.md"))).toBe(false);
  });
});
