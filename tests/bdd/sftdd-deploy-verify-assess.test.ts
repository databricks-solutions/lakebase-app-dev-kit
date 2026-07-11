import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseFailedNodeIds,
  classifyDeployVerifyFailure,
  writeDeployVerifyAssessMarker,
  readDeployVerifyAssessMarker,
  markDeployVerifyAssessed,
  markDeployVerifyRefactored,
  deployVerifyRefactorPending,
  clearDeployVerifyAssessMarker,
  deployVerifyNeedsAssess,
} from "../../scripts/sftdd/deploy-verify-assess";

const FEATURE = "F6-split-tracking-code";
const STORY = "S3-view-batch-and-serial";
let sftddDir: string;

beforeEach(() => {
  sftddDir = mkdtempSync(join(tmpdir(), "dv-assess-"));
  // findFeatureDir resolves by prefix under <sftddDir>/features.
  mkdirSync(join(sftddDir, "features", FEATURE, "stories", STORY), { recursive: true });
});
afterEach(() => rmSync(sftddDir, { recursive: true, force: true }));

describe("parseFailedNodeIds", () => {
  it("pulls the pytest FAILED/ERROR node-ids from the short summary", () => {
    const out = [
      "=========================== short test summary info ============================",
      "FAILED tests/step_defs/test_S2_integrity_probe.py::test_reports_zero",
      "FAILED tests/step_defs/test_S2_integrity_probe.py::test_counts_two",
      "ERROR tests/step_defs/test_S2_integrity_probe.py::test_partial",
      "============ 3 failed, 41 passed in 94s ============",
    ].join("\n");
    expect(parseFailedNodeIds(out)).toEqual([
      "tests/step_defs/test_S2_integrity_probe.py::test_reports_zero",
      "tests/step_defs/test_S2_integrity_probe.py::test_counts_two",
      "tests/step_defs/test_S2_integrity_probe.py::test_partial",
    ]);
  });

  it("dedupes and returns [] when there is no summary", () => {
    expect(parseFailedNodeIds("all good, 44 passed")).toEqual([]);
    const dup = "FAILED a.py::t\nFAILED a.py::t";
    expect(parseFailedNodeIds(dup)).toEqual(["a.py::t"]);
  });
});

describe("classifyDeployVerifyFailure", () => {
  it("pass-in-isolation => contamination (self-healable)", async () => {
    const verdict = await classifyDeployVerifyFailure(["a.py::t"], async () => true);
    expect(verdict).toBe("contamination");
  });
  it("still-fails-in-isolation => genuine (terminal HIL)", async () => {
    const verdict = await classifyDeployVerifyFailure(["a.py::t"], async () => false);
    expect(verdict).toBe("genuine");
  });
  it("no parseable node-ids => genuine (nothing to isolate)", async () => {
    let called = false;
    const verdict = await classifyDeployVerifyFailure([], async () => {
      called = true;
      return true;
    });
    expect(verdict).toBe("genuine");
    expect(called).toBe(false);
  });
});

describe("deploy-verify-assess marker lifecycle (one-shot bound)", () => {
  it("write -> assess-eligible -> markAssessed spends the shot -> not eligible", () => {
    const ids = ["tests/step_defs/test_S2_integrity_probe.py::test_reports_zero"];
    writeDeployVerifyAssessMarker(sftddDir, FEATURE, STORY, ids);

    const m = readDeployVerifyAssessMarker(sftddDir, FEATURE, STORY);
    expect(m?.failing_node_ids).toEqual(ids);
    expect(m?.assessed).toBe(false);
    expect(m?.attempts).toBe(0);
    expect(deployVerifyNeedsAssess(sftddDir, FEATURE, STORY)).toBe(true);

    markDeployVerifyAssessed(sftddDir, FEATURE, STORY);
    const m2 = readDeployVerifyAssessMarker(sftddDir, FEATURE, STORY);
    expect(m2?.assessed).toBe(true);
    expect(m2?.attempts).toBe(1);
    // The one shot is spent: a repeat deploy-verify failure now takes the HIL.
    expect(deployVerifyNeedsAssess(sftddDir, FEATURE, STORY)).toBe(false);
  });

  it("re-detecting the same failure preserves spent attempts (bound not reset)", () => {
    writeDeployVerifyAssessMarker(sftddDir, FEATURE, STORY, ["a.py::t"]);
    markDeployVerifyAssessed(sftddDir, FEATURE, STORY); // attempts -> 1
    // A second deploy re-detects contamination and rewrites the marker.
    writeDeployVerifyAssessMarker(sftddDir, FEATURE, STORY, ["a.py::t"]);
    const m = readDeployVerifyAssessMarker(sftddDir, FEATURE, STORY);
    expect(m?.attempts).toBe(1); // preserved, so still NOT eligible
    expect(deployVerifyNeedsAssess(sftddDir, FEATURE, STORY)).toBe(false);
  });

  it("clear removes the marker (the scope worked, re-verify passed)", () => {
    writeDeployVerifyAssessMarker(sftddDir, FEATURE, STORY, ["a.py::t"]);
    clearDeployVerifyAssessMarker(sftddDir, FEATURE, STORY);
    expect(readDeployVerifyAssessMarker(sftddDir, FEATURE, STORY)).toBeUndefined();
    expect(deployVerifyNeedsAssess(sftddDir, FEATURE, STORY)).toBe(false);
  });
});

describe("deploy-verify SCOPE routing (assess -> driver scope -> re-deploy)", () => {
  const IDS = ["a.py::t1", "a.py::t2"];

  it("assess with a scope set -> refactor-pending; refactor -> not pending", () => {
    writeDeployVerifyAssessMarker(sftddDir, FEATURE, STORY, IDS);
    // No scope set yet: assessed:false, so nothing to refactor.
    expect(deployVerifyRefactorPending(sftddDir, FEATURE, STORY)).toBe(false);

    // The Navigator confirmed the scope set: assessed + flagged_tests recorded.
    markDeployVerifyAssessed(sftddDir, FEATURE, STORY, IDS);
    const m = readDeployVerifyAssessMarker(sftddDir, FEATURE, STORY);
    expect(m?.assessed).toBe(true);
    expect(m?.flagged_tests).toEqual(IDS);
    // Eligible for the Driver SCOPE turn, and no longer for a fresh assess.
    expect(deployVerifyRefactorPending(sftddDir, FEATURE, STORY)).toBe(true);
    expect(deployVerifyNeedsAssess(sftddDir, FEATURE, STORY)).toBe(false);

    // The Driver scoped the tests: no longer refactor-pending (the one re-deploy runs).
    markDeployVerifyRefactored(sftddDir, FEATURE, STORY);
    expect(readDeployVerifyAssessMarker(sftddDir, FEATURE, STORY)?.refactored).toBe(true);
    expect(deployVerifyRefactorPending(sftddDir, FEATURE, STORY)).toBe(false);
  });

  it("assess with NO scope set (Navigator veto) -> never refactor-pending (routes HIL)", () => {
    writeDeployVerifyAssessMarker(sftddDir, FEATURE, STORY, IDS);
    markDeployVerifyAssessed(sftddDir, FEATURE, STORY); // no flagged_tests
    const m = readDeployVerifyAssessMarker(sftddDir, FEATURE, STORY);
    expect(m?.assessed).toBe(true);
    expect(m?.flagged_tests).toBeUndefined();
    expect(deployVerifyRefactorPending(sftddDir, FEATURE, STORY)).toBe(false);
    expect(deployVerifyNeedsAssess(sftddDir, FEATURE, STORY)).toBe(false);
  });
});
