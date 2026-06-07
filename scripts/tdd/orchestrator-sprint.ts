// Sprint mode: the Tier-1 `/sprint` orchestrator (FEIP-7461).
//
// `lakebase-tdd-drive --sprint <name>` runs the whole sprint as one continuous
// flow: sprint planning (to the approved plan gate) -> read the backlog -> for
// each feature: claim its branch + drive it (design -> build -> deploy) to done.
// One process holds it all, so the per-story pipeline streams within each
// feature and control returns to the human only at the gates.
//
// runSprint is pure over a SprintEffects seam (hermetically testable); the real
// effects (drive planning via runDriver+the plan bound, claim via
// lakebase-scm-claim-feature-branch, drive each feature via runDriver) are wired
// in the lakebase-tdd-drive CLI. The sprint-level reads (backlog manifest,
// planning state) are the I/O helpers below, used to build those effects.

import * as fs from "node:fs";
import * as path from "node:path";

import type { DriveState } from "./orchestrator-drive.js";
import { readSprintGates, sprintDir, PLAN_GATE_ARTIFACT } from "./sprint-gates.js";

// --- Sprint backlog manifest -------------------------------------------------

export interface SprintBacklog {
  sprint: string;
  /** Feature ids in the sprint, in execution order. */
  features: string[];
}

function backlogFile(tddDir: string, sprint: string): string {
  return path.join(sprintDir(tddDir, sprint), "backlog.json");
}

/** Read the sprint backlog (feature ids). Returns an empty backlog when none
 *  exists yet. */
export function readSprintBacklog(tddDir: string, sprint: string): SprintBacklog {
  const file = backlogFile(tddDir, sprint);
  if (!fs.existsSync(file)) return { sprint, features: [] };
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as { features?: unknown };
    const features = Array.isArray(data.features)
      ? data.features.filter((f): f is string => typeof f === "string" && f.length > 0)
      : [];
    return { sprint, features };
  } catch {
    return { sprint, features: [] };
  }
}

/** Write the sprint backlog manifest. */
export function writeSprintBacklog(tddDir: string, backlog: SprintBacklog): void {
  const dir = sprintDir(tddDir, backlog.sprint);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(backlogFile(tddDir, backlog.sprint), JSON.stringify(backlog, null, 2) + "\n", "utf8");
}

/** Resolve a feature dir by id prefix under tddDir/features (mirrors gates.ts). */
function findFeatureDir(tddDir: string, featureId: string): string | undefined {
  const featuresDir = path.join(tddDir, "features");
  if (!fs.existsSync(featuresDir)) return undefined;
  const match = fs.readdirSync(featuresDir).find((d) => d.startsWith(featureId));
  return match ? path.join(featuresDir, match) : undefined;
}

// --- Sprint planning readState -----------------------------------------------

/**
 * Build the DriveState for the sprint PLANNING sub-machine from sprint-level
 * artifacts. proposed <- the Spec Author's feature-proposals.md exists;
 * requestsAuthored <- the backlog is non-empty AND every backlog feature has a
 * feature-request.md; gateApproved <- the sprint plan gate is approved. Phase is
 * always "planning" (the plan bound stops at planning-complete, so this static
 * read never needs to reflect a later phase).
 */
export function deriveSprintPlanningState(tddDir: string, sprint: string): DriveState {
  const proposed = fs.existsSync(path.join(sprintDir(tddDir, sprint), PLAN_GATE_ARTIFACT));
  const backlog = readSprintBacklog(tddDir, sprint).features;
  const requestsAuthored =
    backlog.length > 0 &&
    backlog.every((f) => {
      const fdir = findFeatureDir(tddDir, f);
      return fdir !== undefined && fs.existsSync(path.join(fdir, "feature-request.md"));
    });
  let gateApproved = false;
  try {
    gateApproved = readSprintGates(sprint, { tddDir }).gates.plan.status === "approved";
  } catch {
    gateApproved = false;
  }
  return {
    phase: "planning",
    planning: { proposed, requestsAuthored, gateApproved },
    breakdownDone: false,
    storyOrder: [],
    stories: {},
    buildActive: null,
  };
}

// --- The sprint orchestrator (pure over the effect seam) ---------------------

export interface SprintEffects {
  /** Drive sprint planning to the approved plan gate (the plan bound). */
  drivePlanning(): Promise<void>;
  /** The sprint's feature ids, in execution order. */
  readBacklog(): Promise<string[]>;
  /** Claim a feature's branch (the SCM /design Step 0 job the driver does not own). */
  claimFeature(featureId: string): Promise<void>;
  /** Drive one feature design -> build -> deploy to done. */
  driveFeature(featureId: string): Promise<void>;
  /** Optional progress hook fired before each feature is claimed. */
  onFeature?(featureId: string, index: number): void;
}

export interface RunSprintResult {
  /** Feature ids driven, in order. */
  features: string[];
}

/**
 * Run a whole sprint: plan (to the gate) -> for each backlog feature: claim +
 * drive to done. Pure over SprintEffects so it is hermetically testable; the
 * real effects compose runDriver + the claim CLI.
 */
export async function runSprint(effects: SprintEffects): Promise<RunSprintResult> {
  await effects.drivePlanning();
  const features = await effects.readBacklog();
  for (let i = 0; i < features.length; i++) {
    const featureId = features[i];
    effects.onFeature?.(featureId, i);
    await effects.claimFeature(featureId);
    await effects.driveFeature(featureId);
  }
  return { features };
}
