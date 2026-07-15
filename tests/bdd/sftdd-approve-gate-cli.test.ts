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
import { planningDir, acsDir } from "../../scripts/sftdd/sftdd-paths.js";
import { writePipeline, readPipeline, type StoryPipeline } from "../../scripts/sftdd/story-pipeline.js";

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

// FEIP-8008: the one human-facing door also approves the PER-STORY spec gate
// (the pipeline gate the design lane blocks on), via --feature --story , routing
// to the SAME shared helper the headless pipeline approve-gate uses. Before this,
// the drive told humans to approve the feature-level gates.json spec gate, which
// recorded the wrong gate and never advanced the per-story stop.
describe("per-story spec gate approval (--feature --story)", () => {
  const FEATURE = "F1";
  function seedGateReady(): void {
    mkdirSync(join(tdd, "features", FEATURE), { recursive: true });
    const pipeline: StoryPipeline = {
      version: 1,
      feature_id: FEATURE,
      build_queue: [],
      build_active: null,
      stories: { S1: { status: "awaiting-gate", gate: { status: "open", history: [] } } },
    } as StoryPipeline;
    writePipeline(tdd, pipeline);
  }

  it("approves the per-story pipeline gate + attributes the human + enqueues the story", () => {
    seedGateReady();
    const code = runApproveGateCli(["--feature", FEATURE, "--story", "S1", "--approver", "kevin.hartman", "--tdd-dir", tdd]);
    expect(code).toBe(0);
    const p = readPipeline(tdd, FEATURE);
    expect(p.stories.S1.gate?.status).toBe("approved");
    expect(p.stories.S1.gate?.approver).toBe("kevin.hartman");
    expect(p.build_queue).toContain("S1"); // approval authorized ready + queue
  });

  it("refuses (exit 2) when --story is given without --feature (per-story gate is feature-scoped)", () => {
    expect(runApproveGateCli(["--story", "S1", "--approver", "kevin.hartman", "--tdd-dir", tdd])).toBe(2);
  });

  it("refuses (exit 2) when --story is combined with --sprint (the plan gate has no story)", () => {
    expect(runApproveGateCli(["--sprint", SPRINT, "--story", "S1", "--approver", "kevin.hartman", "--tdd-dir", tdd])).toBe(2);
  });

  it("exits 3 (not 0) when the per-story draft invariant is violated (ACs batched ahead)", () => {
    seedGateReady();
    // A sibling story S2 has ACs on disk but is not gated -> the draft ran ahead.
    const s2acs = acsDir(tdd, FEATURE, "S2");
    mkdirSync(s2acs, { recursive: true });
    writeFileSync(join(s2acs, "AC1.json"), JSON.stringify({ id: "AC1", layer: "API" }));
    const code = runApproveGateCli(["--feature", FEATURE, "--story", "S1", "--approver", "kevin.hartman", "--tdd-dir", tdd]);
    expect(code).toBe(3);
    // The gate was NOT approved (the invariant blocks it).
    expect(readPipeline(tdd, FEATURE).stories.S1.gate?.status).toBe("open");
  });
});
