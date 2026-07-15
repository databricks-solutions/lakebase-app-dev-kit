// Sprint mode: the Tier-1 /sprint orchestrator. runSprint is pure
// over SprintEffects (order assertions); the backlog manifest + sprint planning
// readState are the I/O helpers the CLI uses to build the real effects.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  runSprint,
  readSprintBacklog,
  writeSprintBacklog,
  syncBacklog,
  deriveSprintPlanningState,
  type SprintEffects,
} from "../../scripts/sftdd/orchestrator-sprint";
import { writeEstimates } from "../../scripts/sftdd/sftdd-paths";
import { writeSprintGates } from "../../scripts/sftdd/sprint-gates";

const SPRINT = "sprint-1";

let tdd: string;
beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "sprint-"));
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

describe("sprint backlog manifest", () => {
  it("round-trips features; empty when absent", () => {
    expect(readSprintBacklog(tdd, SPRINT)).toEqual({ sprint: SPRINT, features: [] });
    writeSprintBacklog(tdd, { sprint: SPRINT, features: [{ id: "F1-a", size: "M" }, { id: "F2-b" }] });
    expect(readSprintBacklog(tdd, SPRINT).features).toEqual([{ id: "F1-a", size: "M" }, { id: "F2-b" }]);
  });

  it("tolerates the legacy bare-string-id backlog form", () => {
    // Old artifacts wrote features: ["F1", ...]; readBacklog normalizes to {id}.
    mkdirSync(join(tdd, "sprints", SPRINT), { recursive: true });
    writeFileSync(
      join(tdd, "sprints", SPRINT, "backlog.json"),
      JSON.stringify({ sprint: SPRINT, features: ["F1-a", "F2-b"] }),
    );
    expect(readSprintBacklog(tdd, SPRINT).features).toEqual([{ id: "F1-a" }, { id: "F2-b" }]);
  });
});

describe("deriveSprintPlanningState", () => {
  function sprintDir(): string {
    return join(tdd, "sprints", SPRINT);
  }
  function writeProposal(): void {
    // Canonical proposal location (project-level planning/), per sftdd-paths.
    const dir = join(tdd, "planning");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "feature-proposals.md"), "# Backlog\n\n## Features\n- F1\n");
  }
  function writeRequest(feature: string): void {
    const fdir = join(tdd, "features", feature);
    mkdirSync(fdir, { recursive: true });
    writeFileSync(join(fdir, "feature-request.md"), "# request\n");
  }

  it("nothing on disk => all planning flags false", () => {
    const s = deriveSprintPlanningState(tdd, SPRINT);
    expect(s.phase).toBe("planning");
    expect(s.planning).toEqual({ proposed: false, estimated: false, requestsAuthored: false, gateApproved: false, skipSizing: false });
  });

  it("estimated when the Architect wrote planning/estimates.json", () => {
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.estimated).toBe(false);
    writeEstimates(tdd, [{ feature_id: "F1-a", size: "M" }]);
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.estimated).toBe(true);
  });

  it("proposed when feature-proposals.md exists", () => {
    writeProposal();
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.proposed).toBe(true);
  });

  it("proposed when the proposal is at .tdd/planning/ (the Spec Author's path)", () => {
    // Disk-truth: the role writes .tdd/planning/feature-proposals.md, not the
    // sprint-scoped copy. Reading only the sprint dir left proposed=false, so
    // the driver re-issued `propose` forever and stalled.
    const planning = join(tdd, "planning");
    mkdirSync(planning, { recursive: true });
    writeFileSync(join(planning, "feature-proposals.md"), "# Backlog\n\n## Features\n- F1\n");
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.proposed).toBe(true);
  });

  it("requestsAuthored only when the backlog is non-empty AND every feature has a request", () => {
    writeProposal();
    writeSprintBacklog(tdd, { sprint: SPRINT, features: [{ id: "F1-a" }, { id: "F2-b" }] });
    writeRequest("F1-a"); // only one of two
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.requestsAuthored).toBe(false);
    writeRequest("F2-b");
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.requestsAuthored).toBe(true);
  });

  it("syncBacklog projects the backlog from committed requests + Architect sizes", () => {
    // The deterministic sync-backlog step: backlog = features that have a
    // feature-request.md (the PO's commitment), enriched with t-shirt sizes.
    writeRequest("F1-a");
    writeRequest("F2-b");
    writeEstimates(tdd, [
      { feature_id: "F1-a", size: "M" },
      { feature_id: "F2-b", size: "S" },
      { feature_id: "F3-uncommitted", size: "L" }, // estimated but no request -> not in backlog
    ]);
    const backlog = syncBacklog(tdd, SPRINT);
    expect(backlog.features).toEqual([{ id: "F1-a", size: "M" }, { id: "F2-b", size: "S" }]);
    // Persisted + read back identically; requestsAuthored now true.
    expect(readSprintBacklog(tdd, SPRINT).features).toEqual([{ id: "F1-a", size: "M" }, { id: "F2-b", size: "S" }]);
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.requestsAuthored).toBe(true);
  });

  it("syncBacklog SCOPES to the sprint's requested.json (a later sprint excludes an earlier sprint's built feature)", () => {
    // Multi-sprint regression: F1 was built in sprint 1 and its feature-request.md
    // stays on disk. Sprint 2 supplied only F6, recorded in sprints/<S>/requested.json.
    // syncBacklog must project ONLY F6 for sprint 2 (not re-drive F1).
    writeRequest("F1-stock");
    writeRequest("F6-split");
    mkdirSync(join(tdd, "sprints", SPRINT), { recursive: true });
    writeFileSync(join(tdd, "sprints", SPRINT, "requested.json"), JSON.stringify(["F6-split"]));
    expect(syncBacklog(tdd, SPRINT).features).toEqual([{ id: "F6-split" }]);
  });

  it("gateApproved when the sprint plan gate is approved", () => {
    writeSprintGates({ sprint: SPRINT, schema_version: 1, gates: { plan: { status: "approved", history: [] } } }, { sftddDir: tdd });
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.gateApproved).toBe(true);
  });

  it("threads skipSizing onto the planning state, DEFAULT FALSE (sizing is ON, --no-sizing opts out)", () => {
    // The policy is carried on PlanningState (not derived from disk) so
    // nextTransition can route proposed -> author-requests with no estimate.
    // Sizing is ON by default; a caller opts OUT with skipSizing: true (--no-sizing).
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.skipSizing).toBe(false);
    expect(deriveSprintPlanningState(tdd, SPRINT, { skipSizing: true }).planning?.skipSizing).toBe(true);
  });
});

describe("runSprint (pure over SprintEffects)", () => {
  it("plans first, then claims + drives each backlog feature in order (proxy: no gate halts)", async () => {
    const calls: string[] = [];
    const effects: SprintEffects = {
      async drivePlanning() {
        calls.push("plan");
        return {};
      },
      async readBacklog() {
        return ["F1-a", "F2-b"];
      },
      async claimFeature(f) {
        calls.push(`claim:${f}`);
      },
      async driveFeature(f) {
        calls.push(`drive:${f}`);
        return {};
      },
    };
    const result = await runSprint(effects);
    expect(result.features).toEqual(["F1-a", "F2-b"]);
    expect(result.pendingGate).toBeUndefined();
    expect(calls).toEqual(["plan", "claim:F1-a", "drive:F1-a", "claim:F2-b", "drive:F2-b"]);
  });

  it("commits+pushes the authored requests AFTER planning and BEFORE any feature is claimed", async () => {
    // A feature forks from origin/<parent>, so the PO/proxy-authored requests must
    // be pushed to origin before the first claim or the fork inherits nothing.
    const calls: string[] = [];
    const result = await runSprint({
      async drivePlanning() { calls.push("plan"); return {}; },
      async commitAndPushRequests() { calls.push("push-requests"); },
      async readBacklog() { return ["F1-a", "F2-b"]; },
      async claimFeature(f) { calls.push(`claim:${f}`); },
      async driveFeature(f) { calls.push(`drive:${f}`); return {}; },
    });
    expect(result.features).toEqual(["F1-a", "F2-b"]);
    expect(calls).toEqual(["plan", "push-requests", "claim:F1-a", "drive:F1-a", "claim:F2-b", "drive:F2-b"]);
  });

  it("an empty backlog plans then does nothing", async () => {
    const calls: string[] = [];
    const result = await runSprint({
      async drivePlanning() { calls.push("plan"); return {}; },
      async readBacklog() { return []; },
      async claimFeature() { calls.push("claim"); },
      async driveFeature() { calls.push("drive"); return {}; },
    });
    expect(result.features).toEqual([]);
    expect(calls).toEqual(["plan"]);
  });

  it("interactive: halts at the plan gate before any feature work", async () => {
    const calls: string[] = [];
    const planGate = { kind: "approve-plan-gate" as const };
    const result = await runSprint({
      async drivePlanning() { calls.push("plan"); return { pendingGate: planGate }; },
      async commitAndPushRequests() { calls.push("push-requests"); },
      async readBacklog() { calls.push("backlog"); return ["F1-a"]; },
      async claimFeature() { calls.push("claim"); },
      async driveFeature() { calls.push("drive"); return {}; },
    });
    expect(result.pendingGate).toEqual(planGate);
    // Halted at the plan gate: no push (requests not yet approved), no backlog/feature work.
    expect(calls).toEqual(["plan"]);
  });

  it("interactive: halts (pendingInput) when planning pauses for the PO's author-requests", async () => {
    // Regression (Finding 5): the interactive stop after `estimate` is the PO's
    // author-requests (a human-INPUT action, not an approval gate). Before the fix
    // runSprint saw pendingGate undefined, fell through to readBacklog + the (empty)
    // feature loop, and reported a COMPLETE sprint despite producing nothing. It
    // must halt with pendingInput and touch neither push, backlog, nor features.
    const calls: string[] = [];
    const authorRequests = { kind: "invoke-role" as const, role: "product-owner" as const, mode: "author-requests" as const };
    const result = await runSprint({
      async drivePlanning() { calls.push("plan"); return { pendingInput: authorRequests }; },
      async commitAndPushRequests() { calls.push("push-requests"); },
      async readBacklog() { calls.push("backlog"); return ["F1-a"]; },
      async claimFeature() { calls.push("claim"); },
      async driveFeature() { calls.push("drive"); return {}; },
    });
    expect(result.pendingInput).toEqual(authorRequests);
    expect(result.pendingGate).toBeUndefined();
    expect(result.features).toEqual([]);
    expect(calls).toEqual(["plan"]);
  });

  it("halts (escalated) on the feature that RAISED TO HIL; never advances to the next", async () => {
    // Regression: a deploy-verify failure raises to HIL. driveFeature must report
    // escalated so the sprint STOPS on that feature. Before the fix it returned
    // "complete" (pendingGate undefined) and advanced, and the next feature's
    // claim tripped `already-claimed-other` on the still-open feature.
    const calls: string[] = [];
    const escalation = { kind: "raise-to-hil" as const, source: "deploy-verify", reason: "feature-verify FAILED" };
    const result = await runSprint({
      async drivePlanning() { return {}; },
      async readBacklog() { return ["F1-a", "F2-b"]; },
      async claimFeature(f) { calls.push(`claim:${f}`); },
      async driveFeature(f) {
        calls.push(`drive:${f}`);
        return f === "F1-a" ? { escalated: true, escalation } : {};
      },
    });
    expect(result.escalated).toBe(true);
    expect(result.escalation).toEqual(escalation);
    expect(result.pendingFeature).toBe("F1-a");
    // Stops on F1-a's escalation; F2-b is never claimed or driven.
    expect(calls).toEqual(["claim:F1-a", "drive:F1-a"]);
  });

  it("halts (escalated) when PLANNING raises to HIL, before any feature", async () => {
    const calls: string[] = [];
    const escalation = { kind: "raise-to-hil" as const, source: "planning", reason: "blocking smell" };
    const result = await runSprint({
      async drivePlanning() { calls.push("plan"); return { escalated: true, escalation }; },
      async commitAndPushRequests() { calls.push("push-requests"); },
      async readBacklog() { calls.push("backlog"); return ["F1-a"]; },
      async claimFeature() { calls.push("claim"); },
      async driveFeature() { calls.push("drive"); return {}; },
    });
    expect(result.escalated).toBe(true);
    expect(result.features).toEqual([]);
    // No push, no backlog, no feature work.
    expect(calls).toEqual(["plan"]);
  });

  it("interactive: halts on the feature whose gate is pending (resumable)", async () => {
    const calls: string[] = [];
    const gate = { kind: "accept" as const, story: "S1" };
    const result = await runSprint({
      async drivePlanning() { return {}; },
      async readBacklog() { return ["F1-a", "F2-b"]; },
      async claimFeature(f) { calls.push(`claim:${f}`); },
      async driveFeature(f) {
        calls.push(`drive:${f}`);
        return f === "F1-a" ? { pendingGate: gate } : {};
      },
    });
    expect(result.pendingGate).toEqual(gate);
    expect(result.pendingFeature).toBe("F1-a");
    // Stops on F1-a's gate; never advances to F2-b.
    expect(calls).toEqual(["claim:F1-a", "drive:F1-a"]);
  });
});
