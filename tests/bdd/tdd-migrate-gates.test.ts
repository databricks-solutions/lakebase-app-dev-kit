// G6 (FEIP-7363): migration backfill from selection-log.
//
// Covers ADR-0004 test plan scenario S7 (migrate existing feature with
// full selection-log) plus partial-approval, refusal-when-gates-exists,
// missing-log, and current-input-hashing edge cases.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { migrateGatesFromSelectionLog } from "../../scripts/tdd/migrate-gates";
import { readGates, writeGates, defaultGatesState } from "../../scripts/tdd/gates";
import { hashArtifact } from "../../scripts/tdd/gate-hash";
import { verifyGateIntegrity } from "../../scripts/tdd/verify-gate-integrity";

let tdd: string;
const FEATURE_ID = "F1-checkout";
const APPROVER = "kevin.hartman@databricks.com";

function makeFeatureDir(): string {
  const dir = join(tdd, "features", FEATURE_ID);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeLog(text: string): void {
  writeFileSync(join(tdd, "selection-log.md"), text);
}

const FULL_APPROVAL_LOG = `# Selection log

## 2026-05-01T10:00:00.000Z – Approve spec for ${FEATURE_ID}
- **Approved by:** ${APPROVER}
- **Artifact hashes:**
  - \`feature-spec.md\`: \`sha256:legacy-spec-hash\`

## 2026-05-02T10:00:00.000Z – Approve plan for ${FEATURE_ID}
- **Approved by:** ${APPROVER}
- **Artifact hashes:**
  - \`plan.json\`: \`sha256:legacy-plan-hash\`

## 2026-05-03T10:00:00.000Z – Approve test_list for ${FEATURE_ID}
- **Approved by:** ${APPROVER}
- **Artifact hashes:**
  - \`test-list.json\`: \`sha256:legacy-tl-hash\`
`;

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-migrate-gates-"));
});

afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

describe("migrateGatesFromSelectionLog: S7 full backfill", () => {
  it("synthesizes gates.json from a complete approval log", () => {
    makeFeatureDir();
    writeLog(FULL_APPROVAL_LOG);
    const result = migrateGatesFromSelectionLog({ featureId: FEATURE_ID, tddDir: tdd });

    expect(result.migrated).toBe(true);
    expect(result.entry_counts.spec).toBe(1);
    expect(result.entry_counts.plan).toBe(1);
    expect(result.entry_counts.test_list).toBe(1);
    expect(result.entry_counts.promote).toBe(0);
    expect(result.state.gates.spec.status).toBe("approved");
    expect(result.state.gates.plan.status).toBe("approved");
    expect(result.state.gates.test_list.status).toBe("approved");
    expect(result.state.gates.promote.status).toBe("open");
  });

  it("records the original approver + timestamp from the log heading", () => {
    makeFeatureDir();
    writeLog(FULL_APPROVAL_LOG);
    const result = migrateGatesFromSelectionLog({ featureId: FEATURE_ID, tddDir: tdd });
    expect(result.state.gates.spec.approver).toBe(APPROVER);
    expect(result.state.gates.spec.approved_at).toBe("2026-05-01T10:00:00.000Z");
    expect(result.state.gates.plan.approved_at).toBe("2026-05-02T10:00:00.000Z");
  });

  it("flags every synthesized history entry as migrated", () => {
    makeFeatureDir();
    writeLog(FULL_APPROVAL_LOG);
    const result = migrateGatesFromSelectionLog({ featureId: FEATURE_ID, tddDir: tdd });
    expect(result.state.gates.spec.history).toHaveLength(1);
    expect(result.state.gates.spec.history[0].migrated).toBe(true);
    expect(result.state.gates.spec.history[0].action).toBe("migrated");
  });

  it("persists the synthesized state: subsequent readGates returns the same shape", () => {
    makeFeatureDir();
    writeLog(FULL_APPROVAL_LOG);
    migrateGatesFromSelectionLog({ featureId: FEATURE_ID, tddDir: tdd });
    const back = readGates(FEATURE_ID, { tddDir: tdd });
    expect(back.gates.spec.status).toBe("approved");
    expect(back.gates.plan.status).toBe("approved");
    expect(back.gates.test_list.status).toBe("approved");
  });
});

describe("migrateGatesFromSelectionLog: partial-approval logs", () => {
  it("only backfills the gates actually approved in the log", () => {
    makeFeatureDir();
    writeLog(`# Log

## 2026-05-01T10:00:00.000Z – Approve spec for ${FEATURE_ID}
- **Approved by:** ${APPROVER}
`);
    const result = migrateGatesFromSelectionLog({ featureId: FEATURE_ID, tddDir: tdd });
    expect(result.state.gates.spec.status).toBe("approved");
    expect(result.state.gates.plan.status).toBe("open");
    expect(result.state.gates.test_list.status).toBe("open");
    expect(result.state.gates.promote.status).toBe("open");
  });

  it("respects Withdraw entries: gate ends withdrawn after later withdraw", () => {
    makeFeatureDir();
    writeLog(`# Log

## 2026-05-01T10:00:00.000Z – Approve spec for ${FEATURE_ID}
- **Approved by:** ${APPROVER}

## 2026-05-05T10:00:00.000Z – Withdraw spec for ${FEATURE_ID}
- **Withdrawn by:** ${APPROVER}
- **Reason:** rescope
- **Cascade:** none
`);
    const result = migrateGatesFromSelectionLog({ featureId: FEATURE_ID, tddDir: tdd });
    expect(result.state.gates.spec.status).toBe("withdrawn");
    expect(result.state.gates.spec.history).toHaveLength(2);
  });
});

describe("migrateGatesFromSelectionLog: artifact hashing via currentInputsByGate", () => {
  it("hashes current artifact content for the gates the caller provides", () => {
    makeFeatureDir();
    writeLog(FULL_APPROVAL_LOG);
    const specMd = "# spec\n\nbody\n";
    const featureJson = '{"id":"F1"}';
    const planJson = '{"feature_id":"F1"}';
    const testList = '{"items":[]}';
    const result = migrateGatesFromSelectionLog({
      featureId: FEATURE_ID,
      tddDir: tdd,
      currentInputsByGate: {
        spec: { "feature-spec.md": specMd, "feature-spec.json": featureJson },
        plan: { "plan.json": planJson },
        test_list: { "test-list.json": testList },
      },
    });
    expect(result.state.gates.spec.artifact_hashes?.["feature-spec.md"]).toBe(hashArtifact(specMd));
    expect(result.state.gates.plan.artifact_hashes?.["plan.json"]).toBe(hashArtifact(planJson));
  });

  it("verifyGateIntegrity returns ok against current content after backfill", () => {
    makeFeatureDir();
    writeLog(FULL_APPROVAL_LOG);
    const specMd = "# spec\n\nbody\n";
    const featureJson = '{"id":"F1"}';
    migrateGatesFromSelectionLog({
      featureId: FEATURE_ID,
      tddDir: tdd,
      currentInputsByGate: {
        spec: { "feature-spec.md": specMd, "feature-spec.json": featureJson },
      },
    });
    const v = verifyGateIntegrity({
      featureId: FEATURE_ID,
      gate: "spec",
      currentInputs: { "feature-spec.md": specMd, "feature-spec.json": featureJson },
      tddDir: tdd,
    });
    expect(v.status).toBe("ok");
  });

  it("leaves artifact_hashes undefined when the caller does not provide inputs", () => {
    makeFeatureDir();
    writeLog(FULL_APPROVAL_LOG);
    const result = migrateGatesFromSelectionLog({ featureId: FEATURE_ID, tddDir: tdd });
    expect(result.state.gates.spec.artifact_hashes).toBeUndefined();
    expect(result.state.gates.plan.artifact_hashes).toBeUndefined();
  });
});

describe("migrateGatesFromSelectionLog: refusal cases", () => {
  it("refuses when gates.json already exists (force=false default)", () => {
    makeFeatureDir();
    writeGates(defaultGatesState(FEATURE_ID), { tddDir: tdd });
    writeLog(FULL_APPROVAL_LOG);
    const result = migrateGatesFromSelectionLog({ featureId: FEATURE_ID, tddDir: tdd });
    expect(result.migrated).toBe(false);
    expect(result.reason).toBe("gates-json-exists");
  });

  it("overwrites when force: true", () => {
    makeFeatureDir();
    writeGates(defaultGatesState(FEATURE_ID), { tddDir: tdd });
    writeLog(FULL_APPROVAL_LOG);
    const result = migrateGatesFromSelectionLog({
      featureId: FEATURE_ID,
      tddDir: tdd,
      force: true,
    });
    expect(result.migrated).toBe(true);
    expect(result.state.gates.spec.status).toBe("approved");
  });

  it("returns reason=selection-log-absent when there is no log", () => {
    makeFeatureDir();
    const result = migrateGatesFromSelectionLog({ featureId: FEATURE_ID, tddDir: tdd });
    expect(result.migrated).toBe(false);
    expect(result.reason).toBe("selection-log-absent");
  });

  it("returns reason=no-entries-found when log has no Approve headers for this feature", () => {
    makeFeatureDir();
    writeLog("# Log\n\n## 2026-05-01T10:00:00.000Z – Approve spec for OTHER-FEATURE\n- **Approved by:** anyone\n");
    const result = migrateGatesFromSelectionLog({ featureId: FEATURE_ID, tddDir: tdd });
    expect(result.migrated).toBe(false);
    expect(result.reason).toBe("no-entries-found");
  });
});

describe("migrateGatesFromSelectionLog: feature-id matching", () => {
  it("matches a slug-prefix feature id (e.g. F1 in log vs F1-checkout in caller)", () => {
    makeFeatureDir();
    writeLog(`## 2026-05-01T10:00:00.000Z – Approve spec for F1
- **Approved by:** ${APPROVER}
`);
    const result = migrateGatesFromSelectionLog({ featureId: FEATURE_ID, tddDir: tdd });
    expect(result.migrated).toBe(true);
    expect(result.state.gates.spec.status).toBe("approved");
  });
});
