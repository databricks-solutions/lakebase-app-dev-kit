// Full driver loop, hermetic e2e (deterministic-driver phase 3b hardening).
//
// Drives a whole feature through runDriver with REPLAY effects: perform(action)
// plays each role by writing the artifact it would produce + drives the REAL
// pipeline state transitions (surface/approve/dispatch/await/accept/complete +
// cut experiment), stubbing only the Lakebase/external bits (experiment branch
// ops, deploy). readState is the real deriveDriveState + diskArtifactProbe +
// readDriveContext. This catches stalls / ordering / state-derivation gaps in
// the loop deterministically, with no claude calls or live Lakebase.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runDriver, type DriveEffects } from "../../scripts/tdd/orchestrator-run";
import { deriveDriveState } from "../../scripts/tdd/orchestrator-derive";
import { diskArtifactProbe, readDriveContext } from "../../scripts/tdd/orchestrator-probe";
import type { WorkflowAction } from "../../scripts/tdd/orchestrator-drive";
import { writeCycleArtifact } from "../../scripts/tdd/run-cycle";
import { acReviewJson } from "../../scripts/tdd/tdd-paths";
import {
  readPipeline,
  writePipeline,
  surfaceForGate,
  approveStoryGate,
  dispatchNext,
  awaitAcceptance,
  acceptStory,
  completeActive,
  cutStoryExperiment,
  syncBreakdownToPipeline,
} from "../../scripts/tdd/story-pipeline";

const AT = "2026-06-07T00:00:00.000Z";

let tddDir: string;
beforeEach(() => {
  tddDir = mkdtempSync(join(tmpdir(), "drive-e2e-"));
});
afterEach(() => {
  rmSync(tddDir, { recursive: true, force: true });
});

function featureDir(feature: string): string {
  return join(tddDir, "features", feature);
}
function storyDir(feature: string, story: string): string {
  return join(featureDir(feature), "stories", story);
}
function writeJson(file: string, data: unknown): void {
  writeFileSync(file, JSON.stringify(data));
}
function setPhase(phase: string): void {
  writeJson(join(tddDir, "workflow-state.json"), { phase });
}
function ac(story: string): string {
  return `${story}-AC1`;
}

/** Seed a feature in the FEATURE phase with a feature-request, empty pipeline. */
function seedFeature(feature: string): void {
  mkdirSync(featureDir(feature), { recursive: true });
  writeFileSync(join(featureDir(feature), "feature-request.md"), "# request\n");
  writePipeline(tddDir, { version: 1, feature_id: feature, stories: {}, build_queue: [], build_active: null });
  setPhase("implementation"); // -> driver "feature" phase
}

/** Replay effects: perform(action) plays roles + drives real pipeline state. */
function replayEffects(feature: string, stories: string[]) {
  const log: WorkflowAction[] = [];
  const eff: DriveEffects = {
    async readState() {
      return deriveDriveState(
        readPipeline(tddDir, feature),
        diskArtifactProbe(tddDir, feature),
        readDriveContext(tddDir, feature),
      );
    },
    onAction(a) {
      log.push(a);
    },
    async perform(action) {
      const p = () => readPipeline(tddDir, feature);
      const save = (pl: ReturnType<typeof p>) => writePipeline(tddDir, pl);
      switch (action.kind) {
        case "invoke-role": {
          if ("mode" in action) {
            if (action.role === "spec-author" && action.mode === "breakdown") {
              for (const s of stories) {
                mkdirSync(storyDir(feature, s), { recursive: true });
                writeJson(join(storyDir(feature, s), "story.json"), { id: s, acs: [] });
              }
              syncBreakdownToPipeline(tddDir, feature);
            }
            // propose / author-requests: planning, not exercised here
            return;
          }
          // ux-designer (UI track) has no story; not exercised in this e2e.
          if (action.role === "ux-designer") return;
          const s = action.story;
          if (action.role === "spec-author") {
            // draft ACs (story.json acs + the AC file, no layer yet)
            writeJson(join(storyDir(feature, s), "story.json"), { id: s, acs: [ac(s)] });
            mkdirSync(join(storyDir(feature, s), "acs"), { recursive: true });
            writeJson(join(storyDir(feature, s), "acs", `${ac(s)}.json`), { id: ac(s) });
          } else if (action.role === "architect-reviewer") {
            writeJson(join(storyDir(feature, s), "acs", `${ac(s)}.json`), { id: ac(s), layer: "API" });
          } else if (action.role === "test-strategist") {
            // The real flow: the role writes the feature master, then the
            // driver's deterministic scope step produces the canonical per-story
            // list (storyTestListJson = test-list-per-story.json, field `items`)
            // the testListReady probe reads. Replay the net artifact directly.
            writeJson(join(storyDir(feature, s), "test-list-per-story.json"), {
              feature_id: feature,
              story_id: s,
              items: [{ id: "T1", description: "t", ac_id: ac(s), status: "pending" }],
            });
          } else if (action.role === "navigator") {
            if (action.buildMode === "review") {
              // Per-AC REVIEW: simulate "looks good" (no refactor requested).
              writeJson(acReviewJson(tddDir, feature, s, ac(s)), { reviewed_at: AT, refactor_requested: false });
            } else {
              writeCycleArtifact(
                { tddDir, feature_id: feature, story_id: s, ac_id: ac(s) },
                { cycle_id: "cycle-001", feature_id: feature, story_id: s, ac_id: ac(s), test_id: "T1", test_description: "t", red_at: AT },
              );
            }
          } else if (action.role === "driver") {
            if (action.buildMode === "refactor") {
              writeJson(acReviewJson(tddDir, feature, s, ac(s)), { reviewed_at: AT, refactor_requested: true, refactored_at: AT });
            } else {
              writeCycleArtifact(
                { tddDir, feature_id: feature, story_id: s, ac_id: ac(s) },
                { cycle_id: "cycle-001", feature_id: feature, story_id: s, ac_id: ac(s), test_id: "T1", test_description: "t", red_at: AT, green_at: AT },
              );
            }
          }
          return;
        }
        case "surface-gate": {
          const pl = p();
          surfaceForGate(pl, action.story);
          save(pl);
          return;
        }
        case "approve-gate": {
          const pl = p();
          approveStoryGate(pl, action.story, { approver: "human-proxy", at: AT });
          save(pl);
          return;
        }
        case "dispatch": {
          const pl = p();
          dispatchNext(pl);
          save(pl);
          return;
        }
        case "cut-experiment": {
          const pl = p();
          cutStoryExperiment(pl, action.story, {
            slug: `${action.story}-exp`,
            branch: `exp/${action.story}`,
            parent: `feature/${feature}`,
          });
          save(pl);
          return;
        }
        case "await-acceptance": {
          // The story deploy (release-engineer) wrote passing STORY-scoped
          // deploy-evidence (reachable + verify), the teeth the driver requires
          // before accept; then the pipeline marks it awaiting.
          writeJson(join(storyDir(feature, action.story), "deploy-evidence.json"), {
            schema_version: 1,
            feature_id: feature,
            story_id: action.story,
            target: "local",
            url: "http://localhost:8000/",
            reachable: true,
            verify: { passed: true },
            deployed_at: AT,
          });
          const pl = p();
          awaitAcceptance(pl, action.story);
          save(pl);
          return;
        }
        case "accept": {
          const pl = p();
          acceptStory(pl, action.story, { approver: "human-proxy", at: AT });
          save(pl);
          return;
        }
        case "complete": {
          const pl = p();
          completeActive(pl);
          save(pl);
          return;
        }
        case "planning-complete":
          setPhase("discovery");
          return;
        case "feature-complete":
          setPhase("deploy");
          return;
        case "deploy":
          // The Release Engineer's deploy produces deploy-evidence.json
          // (reachable + verify passed); the probe keys `deployed` off it.
          writeJson(join(featureDir(feature), "deploy-evidence.json"), {
            schema_version: 1,
            feature_id: feature,
            target: "local",
            url: "http://localhost:8000/",
            reachable: true,
            verify: { passed: true },
            deployed_at: AT,
          });
          return;
        case "approve-deploy-gate":
          // A full, schema-valid gates.json so the probe's strict readGates
          // sees the deploy gate approved.
          writeJson(join(featureDir(feature), "gates.json"), {
            feature_id: feature,
            schema_version: 1,
            gates: {
              spec: { status: "open", history: [] },
              plan: { status: "open", history: [] },
              test_list: { status: "open", history: [] },
              promote: { status: "open", history: [] },
              deploy: { status: "approved", history: [] },
            },
          });
          return;
        case "done":
          setPhase("shipped");
          return;
        case "design-complete":
          return;
      }
    },
  };
  return { eff, log };
}

describe("driver full loop (hermetic, replay roles + real pipeline state)", () => {
  it("drives a 2-story feature from breakdown through accept + deploy to the promote boundary", async () => {
    const feature = "F1";
    seedFeature(feature);
    const { eff, log } = replayEffects(feature, ["S1", "S2"]);

    // Stop the moment the feature enters the promote phase: that phase drives the
    // SCM workflow (prepare-pr / wait-ci / merge), which needs a real git remote +
    // PR and is covered by the fake-world full-loop test + scm-workflow-e2e-live.
    // This e2e's value is the REAL pipeline/probe through the TDD + deploy loop.
    const result = await runDriver(eff, { stopWhen: (a) => a.kind === "deploy-complete" });

    // Reached the promote boundary cleanly (no stall): the TDD loop + deploy ran.
    expect(result.stoppedAtBound).toBe(true);
    expect(result.iterations).toBeGreaterThan(0);
    const finalPipeline = readPipeline(tddDir, feature);
    // Both stories built + accepted (done), lane idle.
    for (const s of ["S1", "S2"]) {
      expect(finalPipeline.stories[s].status, `${s} status`).toBe("done");
      expect(finalPipeline.stories[s].acceptance?.decision, `${s} accepted`).toBe("accepted");
      expect(finalPipeline.stories[s].experiment?.status, `${s} experiment merged`).toBe("merged");
    }
    expect(finalPipeline.build_active).toBeNull();

    // Streaming: S1 enters the build lane before S2 finishes designing.
    const s1Cut = log.findIndex((a) => a.kind === "cut-experiment" && a.story === "S1");
    const s2Approved = log.findIndex((a) => a.kind === "approve-gate" && a.story === "S2");
    expect(s1Cut).toBeGreaterThanOrEqual(0);
    expect(s2Approved).toBeGreaterThan(s1Cut);

    // Serialized: S1 leaves the lane (accept) before S2 is cut.
    const s1Accept = log.findIndex((a) => a.kind === "accept" && a.story === "S1");
    const s2Cut = log.findIndex((a) => a.kind === "cut-experiment" && a.story === "S2");
    expect(s1Accept).toBeGreaterThanOrEqual(0);
    expect(s2Cut).toBeGreaterThan(s1Accept);
  });
});
