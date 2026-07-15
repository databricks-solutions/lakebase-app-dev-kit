// FEIP-8008: the interactive drive's GATE message must name the EXACT command
// that clears the stop it is blocked on. Each HITL gate is a different substrate;
// a single generic hint sent the human to the wrong door (the feature-level
// gates.json spec gate for a PER-STORY spec stop), which recorded the wrong gate
// and never advanced. approveHint maps each gate action to its correct command.

import { describe, it, expect } from "vitest";
import { approveHint } from "../../scripts/sftdd/orchestrator-logging.js";
import type { WorkflowAction } from "../../scripts/sftdd/orchestrator-drive.js";

describe("approveHint: the right approval command per gate kind", () => {
  it("per-story spec gate -> lakebase-sftdd-approve-gate --feature --story (NOT --gate spec)", () => {
    const hint = approveHint({ kind: "approve-gate", story: "S1" } as WorkflowAction, { featureId: "F1" });
    expect(hint).toContain("lakebase-sftdd-approve-gate");
    expect(hint).toContain("--feature F1");
    expect(hint).toContain("--story S1");
    // The bug was hinting the feature-level gates.json spec gate for a per-story stop.
    expect(hint).not.toContain("--gate spec");
  });

  it("plan gate -> --sprint (no story, no feature)", () => {
    const hint = approveHint({ kind: "approve-plan-gate" } as WorkflowAction, { sprint: "s1" });
    expect(hint).toContain("lakebase-sftdd-approve-gate --sprint s1");
    expect(hint).not.toContain("--story");
    expect(hint).not.toContain("--feature");
  });

  it("deploy / promote gates -> --feature --gate <name> (feature-level gates.json)", () => {
    expect(approveHint({ kind: "approve-deploy-gate" } as WorkflowAction, { featureId: "F1" })).toContain("--feature F1 --gate deploy");
    expect(approveHint({ kind: "approve-promote-gate" } as WorkflowAction, { featureId: "F1" })).toContain("--feature F1 --gate promote");
  });

  it("PO acceptance -> lakebase-sftdd-pipeline accept --feature --story (a pipeline action, not a gates.json gate)", () => {
    const hint = approveHint({ kind: "accept", story: "S1" } as WorkflowAction, { featureId: "F1" });
    expect(hint).toContain("lakebase-sftdd-pipeline accept");
    expect(hint).toContain("--feature F1");
    expect(hint).toContain("--story S1");
  });
});
