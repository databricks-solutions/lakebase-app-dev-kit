// FEIP-7508: the mock HITL approver must NOT fabricate approvals, and must
// NOT approve a gate whose artifacts exist but do not conform to their
// declared format.
//
// Layer 1 (existence): regression for the 002 gate-integrity finding, the mock
// previously approved plan / test_list / promote at claim time (all four gates
// default to "open") by hashing a placeholder "MOCK_APPROVED" for the missing
// files, nullifying the gate. It must SKIP gates whose artifacts are absent.
//
// Layer 2 (conformance): a gate whose artifact exists but is malformed (JSON
// that fails its schema, narrative MD missing required sections) must also be
// SKIPPED, with the violations as the reason, never approved.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { mockApproveOpenGates } from "../../scripts/tdd/mock-approver";
import { readGates } from "../../scripts/tdd/gates";
import { hashArtifact } from "../../scripts/tdd/gate-hash";
import { readAgentLog } from "../../scripts/tdd/agent-log";

const FEATURE_ID = "F1-initial-domain";
const PLACEHOLDER_HASH = hashArtifact("MOCK_APPROVED");

// Conformant fixtures (schema-valid JSON; section-complete narrative).
const FEATURE_JSON = JSON.stringify({
  id: "F1-initial-domain",
  name: "Initial Domain",
  status: "draft",
  tdd_mode: "N=1",
});
const FEATURE_MD = [
  "# v1: Initial Domain",
  "## Summary",
  "A bug tracker.",
  "## Stories",
  "S1 file a bug.",
  "## Out of scope",
  "Auth.",
  "## Open questions",
  "Q1 status graph?",
  "",
].join("\n");
const TEST_LIST_JSON = JSON.stringify({
  feature_id: "F1-initial-domain",
  items: [{ id: "T1", description: "files a bug", ac_id: "AC1", status: "pending" }],
});

let tdd: string;
let fdir: string;

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "tdd-mock-approver-"));
  fdir = join(tdd, "features", FEATURE_ID);
  mkdirSync(fdir, { recursive: true });
});
afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

/** Assert no gate record was bound to the fabricated placeholder hash. */
function assertNoFabricatedHashes(tddDir: string): void {
  const state = readGates(FEATURE_ID, { tddDir });
  for (const gate of Object.values(state.gates)) {
    for (const h of Object.values(gate.artifact_hashes ?? {})) {
      expect(h).not.toBe(PLACEHOLDER_HASH);
    }
  }
}

describe("mockApproveOpenGates: never fabricates (Layer 1, FEIP-7508)", () => {
  it("approves ONLY spec when the structured draft spec exists; skips the rest", () => {
    writeFileSync(join(fdir, "feature.json"), FEATURE_JSON);
    writeFileSync(join(fdir, "feature.md"), FEATURE_MD);

    const result = mockApproveOpenGates({ featureId: FEATURE_ID, tddDir: tdd });

    expect(result.approved).toEqual(["spec"]);
    const skippedGates = result.skipped.map((s) => s.gate).sort();
    expect(skippedGates).toEqual(["plan", "promote", "test_list"]);
    expect(result.skipped.find((s) => s.gate === "plan")?.reason).toMatch(/plan\.json/);
    expect(result.skipped.find((s) => s.gate === "test_list")?.reason).toMatch(/test-list/);
    expect(result.skipped.find((s) => s.gate === "promote")?.reason).toMatch(/promote_ref/);

    const state = readGates(FEATURE_ID, { tddDir: tdd });
    expect(state.gates.spec.status).toBe("approved");
    expect(state.gates.plan.status).toBe("open");
    expect(state.gates.test_list.status).toBe("open");
    expect(state.gates.promote.status).toBe("open");
    assertNoFabricatedHashes(tdd);
  });

  it("does NOT bind any gate to the placeholder hash even when all artifacts are absent", () => {
    const result = mockApproveOpenGates({ featureId: FEATURE_ID, tddDir: tdd });
    expect(result.approved).toEqual([]);
    expect(result.skipped).toHaveLength(4);
    assertNoFabricatedHashes(tdd);
  });

  it("skips spec when feature.md is absent (structured draft spec incomplete)", () => {
    writeFileSync(join(fdir, "feature.json"), FEATURE_JSON);
    const result = mockApproveOpenGates({ featureId: FEATURE_ID, tddDir: tdd });
    expect(result.approved).not.toContain("spec");
    expect(result.skipped.find((s) => s.gate === "spec")?.reason).toMatch(/feature\.md/);
    assertNoFabricatedHashes(tdd);
  });
});

describe("mockApproveOpenGates: hard-blocks non-conformant artifacts (Layer 2)", () => {
  it("skips spec when feature.json fails its schema", () => {
    writeFileSync(join(fdir, "feature.json"), "{}"); // missing required fields
    writeFileSync(join(fdir, "feature.md"), FEATURE_MD);

    const result = mockApproveOpenGates({ featureId: FEATURE_ID, tddDir: tdd });

    expect(result.approved).not.toContain("spec");
    const reason = result.skipped.find((s) => s.gate === "spec")?.reason ?? "";
    expect(reason).toMatch(/conformance/i);
    expect(readGates(FEATURE_ID, { tddDir: tdd }).gates.spec.status).toBe("open");
    assertNoFabricatedHashes(tdd);
  });

  it("skips spec when feature.md is missing a required section", () => {
    const incomplete = FEATURE_MD.replace("## Open questions\nQ1 status graph?\n", "");
    writeFileSync(join(fdir, "feature.json"), FEATURE_JSON);
    writeFileSync(join(fdir, "feature.md"), incomplete);

    const result = mockApproveOpenGates({ featureId: FEATURE_ID, tddDir: tdd });

    expect(result.approved).not.toContain("spec");
    expect(result.skipped.find((s) => s.gate === "spec")?.reason).toMatch(/conformance|open question/i);
    assertNoFabricatedHashes(tdd);
  });

  it("approves test_list only with a schema-valid test-list.json", () => {
    writeFileSync(join(fdir, "feature.json"), FEATURE_JSON);
    writeFileSync(join(fdir, "feature.md"), FEATURE_MD);
    // malformed test list (empty items violates minItems) -> skipped
    writeFileSync(join(fdir, "test-list.json"), JSON.stringify({ feature_id: "F1", items: [] }));
    const bad = mockApproveOpenGates({ featureId: FEATURE_ID, tddDir: tdd });
    expect(bad.approved).not.toContain("test_list");

    // valid test list -> approved with the real hash
    writeFileSync(join(fdir, "test-list.json"), TEST_LIST_JSON);
    const good = mockApproveOpenGates({ featureId: FEATURE_ID, tddDir: tdd });
    expect(good.approved).toContain("test_list");
    const state = readGates(FEATURE_ID, { tddDir: tdd });
    expect(state.gates.test_list.artifact_hashes?.["test-list.json"]).toBe(hashArtifact(TEST_LIST_JSON));
    assertNoFabricatedHashes(tdd);
  });

  it("records the HITL decision: product-owner gate.approved when it validates + approves", () => {
    writeFileSync(join(fdir, "feature.json"), FEATURE_JSON);
    writeFileSync(join(fdir, "feature.md"), FEATURE_MD);
    mockApproveOpenGates({ featureId: FEATURE_ID, tddDir: tdd });

    const log = readAgentLog({ tddDir: tdd, role: "product-owner" });
    const approved = log.find((e) => e.event === "gate.approved" && (e.data as { gate?: string })?.gate === "spec");
    expect(approved).toBeDefined();
    expect((approved?.data as { validated?: boolean })?.validated).toBe(true);
    expect((approved?.data as { approver?: string })?.approver).toBe("ci-mock-approver");
  });

  it("records the HITL decision: product-owner gate.refused (warn) when an artifact is non-conformant", () => {
    writeFileSync(join(fdir, "feature.json"), "{}"); // schema-invalid
    writeFileSync(join(fdir, "feature.md"), FEATURE_MD);
    mockApproveOpenGates({ featureId: FEATURE_ID, tddDir: tdd });

    const refused = readAgentLog({ tddDir: tdd, role: "product-owner" }).find(
      (e) => e.event === "gate.refused" && (e.data as { gate?: string })?.gate === "spec",
    );
    expect(refused).toBeDefined();
    expect(refused?.level).toBe("warn");
  });

  it("approves promote only when a real promote_ref is supplied", () => {
    writeFileSync(join(fdir, "feature.json"), FEATURE_JSON);
    writeFileSync(join(fdir, "feature.md"), FEATURE_MD);
    const noRef = mockApproveOpenGates({ featureId: FEATURE_ID, tddDir: tdd });
    expect(noRef.approved).not.toContain("promote");

    const ref = "exp-1:br-bug-pg";
    const withRef = mockApproveOpenGates({ featureId: FEATURE_ID, tddDir: tdd, promoteRef: ref });
    expect(withRef.approved).toContain("promote");
    const state = readGates(FEATURE_ID, { tddDir: tdd });
    expect(state.gates.promote.artifact_hashes?.promote_ref).toBe(hashArtifact(ref));
    assertNoFabricatedHashes(tdd);
  });
});
