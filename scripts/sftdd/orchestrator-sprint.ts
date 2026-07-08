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
} from "./sftdd-paths.js";
import * as fs from "node:fs";

// Sprint-backlog read/write + SprintBacklog live in sftdd-paths (single source of
// truth). Re-exported here for the existing public API (drive.cli, runSprint).
export {
  readBacklog as readSprintBacklog,
  writeBacklog as writeSprintBacklog,
  backlogFeatureIds,
  syncBacklog,
  type SprintBacklog,
  type BacklogFeature,
} from "./sftdd-paths.js";

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
 * All paths/accessors come from sftdd-paths so a producer cannot write where this
 * consumer does not look.
 *
 * `opts.skipSizing` is a POLICY threaded from the CLI, not a disk fact: it tells
 * the machine to route proposed -> author-requests with no estimate step. Carried
 * on PlanningState so nextTransition stays pure. DEFAULTS TO FALSE: t-shirt-sizing
 * is ON by default (the Architect sizes the candidates); a caller opts OUT with
 * `--no-sizing` to skip the Architect estimate turn.
 */
export function deriveSprintPlanningState(
  sftddDir: string,
  sprint: string,
  opts: { skipSizing?: boolean } = {},
): DriveState {
  const proposed = fs.existsSync(featureProposalsMd(sftddDir));
  const estimated = hasEstimates(sftddDir);
  const backlog = readBacklog(sftddDir, sprint).features;
  const requestsAuthored = backlog.length > 0 && backlog.every((f) => hasFeatureRequest(sftddDir, f.id));
  let gateApproved = false;
  try {
    gateApproved = readSprintGates(sprint, { sftddDir }).gates.plan.status === "approved";
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
  /** After planning (the plan gate is approved), commit the feature-requests the
   *  PO/proxy authored during planning and PUSH the entry tier to `origin`. A
   *  feature branch forks from `origin/<parent>` (paired-branch resolveForkPoint),
   *  so a request that only exists on the LOCAL entry tier would not be inherited
   *  by the fork and the Spec Author would refuse; this makes the just-authored
   *  requests reachable before any feature is claimed. Idempotent: a no-op when
   *  nothing changed / already pushed (e.g. the capture pre-seeded + pushed them).
   *  Optional: absent => the caller propagates request commits itself. */
  commitAndPushRequests?(): Promise<void>;
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

  // Planning authored the feature-requests on the LOCAL entry tier. Push them to
  // origin BEFORE any feature is claimed, because a feature branch forks from
  // origin/<parent>; without this the fork inherits no feature-request and the
  // Spec Author refuses. Runs only once planning is approved (past the gate), so
  // an interactive halt above returns first and the push fires on the resume.
  await effects.commitAndPushRequests?.();

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
