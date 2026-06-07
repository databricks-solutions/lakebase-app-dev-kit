// Sprint mode (FEIP-7461): the Tier-1 /sprint orchestrator. runSprint is pure
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
  deriveSprintPlanningState,
  type SprintEffects,
} from "../../scripts/tdd/orchestrator-sprint";
import { writeSprintGates } from "../../scripts/tdd/sprint-gates";

const SPRINT = "sprint-1";

let tdd: string;
beforeEach(() => {
  tdd = mkdtempSync(join(tmpdir(), "sprint-"));
});
afterEach(() => rmSync(tdd, { recursive: true, force: true }));

describe("sprint backlog manifest", () => {
  it("round-trips features; empty when absent", () => {
    expect(readSprintBacklog(tdd, SPRINT)).toEqual({ sprint: SPRINT, features: [] });
    writeSprintBacklog(tdd, { sprint: SPRINT, features: ["F1-a", "F2-b"] });
    expect(readSprintBacklog(tdd, SPRINT).features).toEqual(["F1-a", "F2-b"]);
  });
});

describe("deriveSprintPlanningState", () => {
  function sprintDir(): string {
    return join(tdd, "sprints", SPRINT);
  }
  function writeProposal(): void {
    mkdirSync(sprintDir(), { recursive: true });
    writeFileSync(join(sprintDir(), "feature-proposals.md"), "# Backlog\n\n## Features\n- F1\n");
  }
  function writeRequest(feature: string): void {
    const fdir = join(tdd, "features", feature);
    mkdirSync(fdir, { recursive: true });
    writeFileSync(join(fdir, "feature-request.md"), "# request\n");
  }

  it("nothing on disk => all planning flags false", () => {
    const s = deriveSprintPlanningState(tdd, SPRINT);
    expect(s.phase).toBe("planning");
    expect(s.planning).toEqual({ proposed: false, requestsAuthored: false, gateApproved: false });
  });

  it("proposed when feature-proposals.md exists", () => {
    writeProposal();
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.proposed).toBe(true);
  });

  it("requestsAuthored only when the backlog is non-empty AND every feature has a request", () => {
    writeProposal();
    writeSprintBacklog(tdd, { sprint: SPRINT, features: ["F1-a", "F2-b"] });
    writeRequest("F1-a"); // only one of two
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.requestsAuthored).toBe(false);
    writeRequest("F2-b");
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.requestsAuthored).toBe(true);
  });

  it("gateApproved when the sprint plan gate is approved", () => {
    writeSprintGates({ sprint: SPRINT, schema_version: 1, gates: { plan: { status: "approved", history: [] } } }, { tddDir: tdd });
    expect(deriveSprintPlanningState(tdd, SPRINT).planning?.gateApproved).toBe(true);
  });
});

describe("runSprint (pure over SprintEffects)", () => {
  it("plans first, then claims + drives each backlog feature in order", async () => {
    const calls: string[] = [];
    const effects: SprintEffects = {
      async drivePlanning() {
        calls.push("plan");
      },
      async readBacklog() {
        return ["F1-a", "F2-b"];
      },
      async claimFeature(f) {
        calls.push(`claim:${f}`);
      },
      async driveFeature(f) {
        calls.push(`drive:${f}`);
      },
    };
    const result = await runSprint(effects);
    expect(result.features).toEqual(["F1-a", "F2-b"]);
    // Planning precedes everything; each feature is claimed then driven, in order.
    expect(calls).toEqual([
      "plan",
      "claim:F1-a",
      "drive:F1-a",
      "claim:F2-b",
      "drive:F2-b",
    ]);
  });

  it("an empty backlog plans then does nothing", async () => {
    const calls: string[] = [];
    const result = await runSprint({
      async drivePlanning() { calls.push("plan"); },
      async readBacklog() { return []; },
      async claimFeature() { calls.push("claim"); },
      async driveFeature() { calls.push("drive"); },
    });
    expect(result.features).toEqual([]);
    expect(calls).toEqual(["plan"]);
  });
});
