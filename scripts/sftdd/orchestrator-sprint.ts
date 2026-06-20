// Sprint mode: the Tier-1 `/sprint` orchestrator.
//
// `lakebase-sftdd-drive --sprint <name>` runs the whole sprint as one continuous
// flow: sprint planning (to the approved plan gate) -> read the backlog -> for
// each feature: claim its branch + drive it (design -> build -> deploy) to done.
// One process holds it all, so the per-story pipeline streams within each
// feature and control returns to the human only at the gates.
//
// runSprint is pure over a SprintEffects seam (hermetically testable); the real
// effects (drive planning via runDriver+the plan bound, claim via
// lakebase-scm-claim-feature-branch, drive each feature via runDriver) are wired
// in the lakebase-sftdd-drive CLI. The sprint-level reads (backlog manifest,
// planning state) are the I/O helpers below, used to build those effects.

import type { DriveState, WorkflowAction } from "./orchestrator-drive.js";
import { readSprintGates } from "./sprint-gates.js";
import {
  featureProposalsMd,
  hasFeatureRequest,
  hasEstimates,
  readBacklog,
} from "./tdd-paths.js";
import * as fs from "node:fs";

// Sprint-backlog read/write + SprintBacklog live in tdd-paths (single source of
// truth). Re-exported here for the existing public API (drive.cli, runSprint).
export {
  readBacklog as readSprintBacklog,
  writeBacklog as writeSprintBacklog,
  backlogFeatureIds,
  syncBacklog,
  type SprintBacklog,
  type BacklogFeature,
} from "./tdd-paths.js";

// --- Sprint planning readState -----------------------------------------------

/**
 * Build the DriveState for the sprint PLANNING sub-machine from sprint-level
 * artifacts. proposed <- the Spec Author's feature-proposals.md exists;
 * estimated <- the Architect's planning/estimates.json has at least one
 * t-shirt size; requestsAuthored <- the backlog is non-empty AND every backlog
 * feature has a feature-request.md (the backlog is the deterministic sync-backlog
 * projection of the PO's committed requests); gateApproved <- the sprint plan
 * gate is approved. Phase is always "planning" (the plan bound stops at
 * planning-complete, so this static read never needs to reflect a later phase).
 * All paths/accessors come from tdd-paths so a producer cannot write where this
 * consumer does not look.
 *
 * `opts.skipSizing` is a POLICY threaded from the CLI, not a disk fact: it tells
 * the machine to route proposed -> author-requests with no estimate step. Carried
 * on PlanningState so nextTransition stays pure. DEFAULTS TO FALSE: t-shirt-sizing
 * is ON by default (the Architect sizes the candidates); a caller opts OUT with
 * `--no-sizing` to skip the Architect estimate turn.
 */
export function deriveSprintPlanningState(
  tddDir: string,
  sprint: string,
  opts: { skipSizing?: boolean } = {},
): DriveState {
  const proposed = fs.existsSync(featureProposalsMd(tddDir));
  const estimated = hasEstimates(tddDir);
  const backlog = readBacklog(tddDir, sprint).features;
  const requestsAuthored = backlog.length > 0 && backlog.every((f) => hasFeatureRequest(tddDir, f.id));
  let gateApproved = false;
  try {
    gateApproved = readSprintGates(sprint, { tddDir }).gates.plan.status === "approved";
  } catch {
    gateApproved = false;
  }
  return {
    phase: "planning",
    planning: { proposed, estimated, requestsAuthored, gateApproved, skipSizing: opts.skipSizing ?? false },
    breakdownDone: false,
    storyOrder: [],
    stories: {},
    buildActive: null,
  };
}

// --- The sprint orchestrator (pure over the effect seam) ---------------------

/** A drive step's outcome: ran to its scope, or halted at a HITL gate awaiting
 *  the human (interactive mode). `pendingGate` set => the step did not finish. */
export interface DriveStepResult {
  pendingGate?: WorkflowAction;
}

export interface SprintEffects {
  /** Drive sprint planning to the approved plan gate (the plan bound). In
   *  interactive mode it halts at the plan gate (pendingGate set). */
  drivePlanning(): Promise<DriveStepResult>;
  /** The sprint's feature ids, in execution order. */
  readBacklog(): Promise<string[]>;
  /** Claim a feature's branch (idempotent; the SCM /design Step 0 the driver
   *  does not own). Re-claim on a resume is a no-op. */
  claimFeature(featureId: string): Promise<void>;
  /** Drive one feature design -> build -> deploy. In interactive mode it halts
   *  at the next HITL gate (pendingGate set); proxy mode drives it to done. */
  driveFeature(featureId: string): Promise<DriveStepResult>;
  /** Optional progress hook fired before each feature is claimed. */
  onFeature?(featureId: string, index: number): void;
}

export interface RunSprintResult {
  /** Feature ids the sprint covers (the backlog). */
  features: string[];
  /** The HITL gate the run halted at (interactive mode), awaiting the human. */
  pendingGate?: WorkflowAction;
  /** The feature whose gate the run halted at, if any. */
  pendingFeature?: string;
}

/**
 * Run a sprint: plan (to the gate) -> for each backlog feature: claim + drive.
 * RESUMABLE: in interactive mode a step halts at a HITL gate (pendingGate); the
 * whole run returns so the session can surface it. The human approves and
 * re-invokes; planning + the already-done features are idempotent no-ops, and
 * the in-progress feature resumes past the now-approved gate. In proxy mode
 * (headless) no step yields a pendingGate, so the sprint runs end to end.
 */
export async function runSprint(effects: SprintEffects): Promise<RunSprintResult> {
  const planning = await effects.drivePlanning();
  if (planning.pendingGate) return { features: [], pendingGate: planning.pendingGate };

  const features = await effects.readBacklog();
  for (let i = 0; i < features.length; i++) {
    const featureId = features[i];
    effects.onFeature?.(featureId, i);
    await effects.claimFeature(featureId);
    const driven = await effects.driveFeature(featureId);
    if (driven.pendingGate) {
      return { features, pendingGate: driven.pendingGate, pendingFeature: featureId };
    }
  }
  return { features };
}
