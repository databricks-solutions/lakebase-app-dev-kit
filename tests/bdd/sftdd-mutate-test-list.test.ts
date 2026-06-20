// substrate-enforced test-list immutability via mutateTestList.
//
// Exercises the four states the test_list gate can be in (open / approved
// / withdrawn / superseded) + the refusal contract + the atomic
// supersede + re-approve flow.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { approveGate } from "../../scripts/sftdd/approve-gate";
import { hashArtifact } from "../../scripts/sftdd/gate-hash";
import { defaultGatesState, readGates, writeGates } from "../../scripts/sftdd/gates";
import {
  isTestListProtected,
  mutateTestList,
  TestListImmutabilityError,
} from "../../scripts/sftdd/mutate-test-list";
import {
  readMasterTestList,
  writeMasterTestList,
  type TestList,
} from "../../scripts/sftdd/test-list";
import { verifyGateIntegrity } from "../../scripts/sftdd/verify-gate-integrity";

let tdd: string;
const FEATURE_ID = "F1-checkout";
const APPROVER = "po@example.com";
const ORIGINAL_APPROVER = "first.po@example.com";
const FIXED_NOW = () => new Date("2026-05-31T20:00:00Z");
const RE_APPROVE_NOW = () => new Date("2026-06-01T10:00:00Z");

const BASE_LIST: TestList = {
  feature_id: FEATURE_ID,
  ordered_for: "design-momentum",
  items: [
    { id: "T1", description: "POST /orders returns 201 on valid cart", ac_id: "AC1", status: "pending" },
    { id: "T2", description: "POST /orders rejects empty cart with 400", ac_id: "AC1", status: "pending" },
  ],
};

function makeFeatureDir(): string {
  const dir = join(tdd, "features", FEATURE_ID);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function approveTestListGate(list: TestList): void {
  const content = JSON.stringify(list, null, 2) + "\n";
  approveGate({
    featureId: FEATURE_ID,
    gate: "test_list",
    approver: ORIGINAL_APPROVER,
    hitlApproved: true,
    artifactInputs: { "test-list.json": content },
    tddDir: tdd,
    now: FIXED_NOW,
    writeSelectionLog: false,
  });
}

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-mutate-tl-"));
});

afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

describe("mutateTestList: argument validation", () => {
  it("rejects empty approver", () => {
    makeFeatureDir();
    expect(() =>
      mutateTestList({
        featureId: FEATURE_ID,
        newTestList: BASE_LIST,
        approver: "",
        hitlReapproved: false,
        tddDir: tdd,
      })
    ).toThrow(/approver/);
  });

  it("rejects featureId mismatch", () => {
    makeFeatureDir();
    expect(() =>
      mutateTestList({
        featureId: FEATURE_ID,
        newTestList: { ...BASE_LIST, feature_id: "F-OTHER" },
        approver: APPROVER,
        hitlReapproved: false,
        tddDir: tdd,
      })
    ).toThrow(/featureId mismatch/);
  });
});

describe("mutateTestList: unprotected states (write goes through)", () => {
  it("open gate: writes without re-approval, returns reapproved=false", () => {
    makeFeatureDir();
    const result = mutateTestList({
      featureId: FEATURE_ID,
      newTestList: BASE_LIST,
      approver: APPROVER,
      hitlReapproved: false,
      tddDir: tdd,
    });
    expect(result.reapproved).toBe(false);
    const back = readMasterTestList(tdd, FEATURE_ID);
    expect(back.items).toHaveLength(2);
  });

  it("withdrawn gate: writes without re-approval", () => {
    makeFeatureDir();
    const state = defaultGatesState(FEATURE_ID);
    state.gates.test_list = { status: "withdrawn", history: [] };
    writeGates(state, { tddDir: tdd });
    const result = mutateTestList({
      featureId: FEATURE_ID,
      newTestList: BASE_LIST,
      approver: APPROVER,
      hitlReapproved: false,
      tddDir: tdd,
    });
    expect(result.reapproved).toBe(false);
  });

  it("superseded gate: writes without re-approval", () => {
    makeFeatureDir();
    const state = defaultGatesState(FEATURE_ID);
    state.gates.test_list = { status: "superseded", history: [] };
    writeGates(state, { tddDir: tdd });
    const result = mutateTestList({
      featureId: FEATURE_ID,
      newTestList: BASE_LIST,
      approver: APPROVER,
      hitlReapproved: false,
      tddDir: tdd,
    });
    expect(result.reapproved).toBe(false);
  });
});

describe("mutateTestList: approved gate refusal + re-approval", () => {
  it("throws TestListImmutabilityError when gate is approved + hitlReapproved=false", () => {
    makeFeatureDir();
    writeMasterTestList(tdd, BASE_LIST);
    approveTestListGate(BASE_LIST);

    const mutated: TestList = { ...BASE_LIST, items: BASE_LIST.items.slice(0, 1) };
    expect(() =>
      mutateTestList({
        featureId: FEATURE_ID,
        newTestList: mutated,
        approver: APPROVER,
        hitlReapproved: false,
        tddDir: tdd,
      })
    ).toThrow(TestListImmutabilityError);
  });

  it("does NOT mutate on-disk test-list.json on refusal", () => {
    makeFeatureDir();
    writeMasterTestList(tdd, BASE_LIST);
    approveTestListGate(BASE_LIST);
    const before = readFileSync(join(tdd, "features", FEATURE_ID, "test-list.json"), "utf8");

    try {
      mutateTestList({
        featureId: FEATURE_ID,
        newTestList: { ...BASE_LIST, items: [] },
        approver: APPROVER,
        hitlReapproved: false,
        tddDir: tdd,
      });
    } catch {
      // expected
    }

    const after = readFileSync(join(tdd, "features", FEATURE_ID, "test-list.json"), "utf8");
    expect(after).toBe(before);
  });

  it("supersedes + re-approves atomically when hitlReapproved=true", () => {
    makeFeatureDir();
    writeMasterTestList(tdd, BASE_LIST);
    approveTestListGate(BASE_LIST);

    const mutated: TestList = {
      ...BASE_LIST,
      items: [
        ...BASE_LIST.items,
        { id: "T3", description: "POST /orders handles concurrent submits", ac_id: "AC1", status: "pending" },
      ],
    };

    const result = mutateTestList({
      featureId: FEATURE_ID,
      newTestList: mutated,
      approver: APPROVER,
      hitlReapproved: true,
      tddDir: tdd,
      now: RE_APPROVE_NOW,
    });

    expect(result.reapproved).toBe(true);
    const expectedHash = hashArtifact(JSON.stringify(mutated, null, 2) + "\n");
    expect(result.capturedHash).toBe(expectedHash);

    const back = readGates(FEATURE_ID, { tddDir: tdd });
    expect(back.gates.test_list.status).toBe("approved");
    expect(back.gates.test_list.approver).toBe(APPROVER);
    expect(back.gates.test_list.approved_at).toBe("2026-06-01T10:00:00.000Z");
    expect(back.gates.test_list.artifact_hashes?.["test-list.json"]).toBe(expectedHash);
  });

  it("history accumulates: prior approval + superseded + new approval (3 entries)", () => {
    makeFeatureDir();
    writeMasterTestList(tdd, BASE_LIST);
    approveTestListGate(BASE_LIST);

    mutateTestList({
      featureId: FEATURE_ID,
      newTestList: { ...BASE_LIST, items: BASE_LIST.items.slice(0, 1) },
      approver: APPROVER,
      hitlReapproved: true,
      tddDir: tdd,
      now: RE_APPROVE_NOW,
    });

    const back = readGates(FEATURE_ID, { tddDir: tdd });
    const history = back.gates.test_list.history;
    expect(history).toHaveLength(3);
    expect(history[0].action).toBe("approved");
    expect(history[0].approver).toBe(ORIGINAL_APPROVER);
    expect(history[1].action).toBe("superseded");
    expect(history[1].approver).toBe(APPROVER);
    expect(history[1].reason).toMatch(/mutation/);
    expect(history[2].action).toBe("approved");
    expect(history[2].approver).toBe(APPROVER);
  });

  it("verifyGateIntegrity reports ok after re-approval (the new content matches the new hash)", () => {
    makeFeatureDir();
    writeMasterTestList(tdd, BASE_LIST);
    approveTestListGate(BASE_LIST);

    const mutated: TestList = {
      ...BASE_LIST,
      items: [...BASE_LIST.items, { id: "T3", description: "added", ac_id: "AC1", status: "pending" }],
    };
    mutateTestList({
      featureId: FEATURE_ID,
      newTestList: mutated,
      approver: APPROVER,
      hitlReapproved: true,
      tddDir: tdd,
      now: RE_APPROVE_NOW,
    });

    // Re-read the file from disk + verify integrity.
    const currentContent = readFileSync(
      join(tdd, "features", FEATURE_ID, "test-list.json"),
      "utf8"
    );
    const v = verifyGateIntegrity({
      featureId: FEATURE_ID,
      gate: "test_list",
      currentInputs: { "test-list.json": currentContent },
      tddDir: tdd,
    });
    expect(v.status).toBe("ok");
  });
});

describe("mutateTestList: isTestListProtected predicate", () => {
  it("returns false when the feature does not exist", () => {
    expect(isTestListProtected(FEATURE_ID, { tddDir: tdd })).toBe(false);
  });

  it("returns false when the gate is open", () => {
    makeFeatureDir();
    expect(isTestListProtected(FEATURE_ID, { tddDir: tdd })).toBe(false);
  });

  it("returns true when the gate is approved", () => {
    makeFeatureDir();
    writeMasterTestList(tdd, BASE_LIST);
    approveTestListGate(BASE_LIST);
    expect(isTestListProtected(FEATURE_ID, { tddDir: tdd })).toBe(true);
  });

  it("returns false when the gate is withdrawn", () => {
    makeFeatureDir();
    const state = defaultGatesState(FEATURE_ID);
    state.gates.test_list = { status: "withdrawn", history: [] };
    writeGates(state, { tddDir: tdd });
    expect(isTestListProtected(FEATURE_ID, { tddDir: tdd })).toBe(false);
  });
});
