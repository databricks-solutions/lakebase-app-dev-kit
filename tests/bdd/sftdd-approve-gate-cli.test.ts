// lakebase-sftdd-approve-gate CLI: the production, human-facing gate-approval
// command (FEIP-8005). Distinct from the headless Human Proxy: it REQUIRES an
// explicit --approver (no silent "human-proxy" default) and reuses the same
// approval substrate, so it records a genuine, attributed approval.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runApproveGateCli } from "../../scripts/sftdd/approve-gate.cli.js";
import { readSprintGates } from "../../scripts/sftdd/sprint-gates.js";
import { planningDir } from "../../scripts/sftdd/sftdd-paths.js";

const SPRINT = "s1";
const PROPOSAL = ["# Sprint 1 backlog", "", "## Proposed features", "- v1 initial domain", ""].join("\n");
let tdd: string;

beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "approvegate-cli-"));
});
afterEach(() => {
  rmSync(tdd, { recursive: true, force: true });
});

describe("required --approver (the production distinction from the Human Proxy)", () => {
  it("refuses (exit 2) when --approver is missing , no silent default identity", () => {
    expect(runApproveGateCli(["--sprint", SPRINT, "--tdd-dir", tdd])).toBe(2);
  });

  it("refuses (exit 2) when --approver is blank", () => {
    expect(runApproveGateCli(["--sprint", SPRINT, "--approver", "  ", "--tdd-dir", tdd])).toBe(2);
  });

  it("refuses (exit 2) when neither --sprint nor --feature is given", () => {
    expect(runApproveGateCli(["--approver", "kevin.hartman", "--tdd-dir", tdd])).toBe(2);
  });
});

describe("sprint plan gate approval records the named human", () => {
  it("approves + attributes the decision to --approver", () => {
    mkdirSync(planningDir(tdd), { recursive: true });
    writeFileSync(join(planningDir(tdd), "feature-proposals.md"), PROPOSAL);

    const code = runApproveGateCli(["--sprint", SPRINT, "--approver", "kevin.hartman", "--tdd-dir", tdd]);
    expect(code).toBe(0);

    const gates = readSprintGates(SPRINT, { sftddDir: tdd });
    expect(gates.gates.plan.status).toBe("approved");
    expect(gates.gates.plan.approver).toBe("kevin.hartman"); // NOT "human-proxy"
  });

  it("refuses (exit 2) when there is no conformant proposal to review", () => {
    // No feature-proposals.md => approveSprintPlanGate's teeth refuse => exit 2.
    expect(runApproveGateCli(["--sprint", SPRINT, "--approver", "kevin.hartman", "--tdd-dir", tdd])).toBe(2);
  });
});
