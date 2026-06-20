// Sprint plan gate: sprint-scoped HITL gate that locks the backlog
// (feature-proposals.md) before the per-feature work. Mirrors the per-feature
// gate model with teeth: approves only when the proposal exists + conforms.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  readSprintGates,
  approveSprintPlanGate,
  defaultSprintGatesState,
  sprintDir,
  PLAN_GATE_ARTIFACT,
} from "../../scripts/sftdd/sprint-gates";

const SPRINT = "sprint-1";
const PROPOSAL = ["# Sprint 1 backlog", "", "## Proposed features", "- v1 initial domain", ""].join("\n");

let tdd: string;
beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "sprint-gates-"));
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

function writeProposal(content = PROPOSAL): void {
  // The proposal's ONE canonical location (project-level planning/), per tdd-paths.
  const dir = join(tdd, "planning");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "feature-proposals.md"), content);
}

describe("readSprintGates", () => {
  it("returns the default (plan open) when no gates.json exists", () => {
    expect(readSprintGates(SPRINT, { tddDir: tdd })).toEqual(defaultSprintGatesState(SPRINT));
    expect(readSprintGates(SPRINT, { tddDir: tdd }).gates.plan.status).toBe("open");
  });
});

describe("approveSprintPlanGate (teeth)", () => {
  it("approves when feature-proposals.md exists + conforms", () => {
    writeProposal();
    const res = approveSprintPlanGate({ sprint: SPRINT, approver: "human-proxy", hitlApproved: true, tddDir: tdd });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.alreadyApproved).toBe(false);
    expect(readSprintGates(SPRINT, { tddDir: tdd }).gates.plan.status).toBe("approved");
  });

  it("approves when the proposal is at .tdd/planning/ (where the Spec Author writes it)", () => {
    // Disk-truth fallback: the role writes .tdd/planning/feature-proposals.md and
    // does not always create the sprint-scoped copy. The gate must still find it,
    // otherwise planning stalls on `propose` re-issued forever.
    const planning = join(tdd, "planning");
    mkdirSync(planning, { recursive: true });
    writeFileSync(join(planning, PLAN_GATE_ARTIFACT), PROPOSAL);
    const res = approveSprintPlanGate({ sprint: SPRINT, approver: "human-proxy", hitlApproved: true, tddDir: tdd });
    expect(res.ok).toBe(true);
    expect(readSprintGates(SPRINT, { tddDir: tdd }).gates.plan.status).toBe("approved");
  });

  it("REFUSES when the proposal is absent (no plan to review)", () => {
    const res = approveSprintPlanGate({ sprint: SPRINT, approver: "human-proxy", hitlApproved: true, tddDir: tdd });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/not found/);
    expect(readSprintGates(SPRINT, { tddDir: tdd }).gates.plan.status).toBe("open");
  });

  it("REFUSES when the proposal is non-conformant (no H1 / empty body)", () => {
    writeProposal("no heading, just prose");
    const res = approveSprintPlanGate({ sprint: SPRINT, approver: "human-proxy", hitlApproved: true, tddDir: tdd });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/not conformant/);
  });

  it("REFUSES without hitlApproved (the gate is HITL)", () => {
    writeProposal();
    const res = approveSprintPlanGate({ sprint: SPRINT, approver: "human-proxy", hitlApproved: false, tddDir: tdd });
    expect(res.ok).toBe(false);
  });

  it("is idempotent: a second approve is a no-op (alreadyApproved)", () => {
    writeProposal();
    approveSprintPlanGate({ sprint: SPRINT, approver: "human-proxy", hitlApproved: true, tddDir: tdd });
    const again = approveSprintPlanGate({ sprint: SPRINT, approver: "human-proxy", hitlApproved: true, tddDir: tdd });
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.alreadyApproved).toBe(true);
  });
});
