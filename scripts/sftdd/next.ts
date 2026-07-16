// lakebase-sftdd-next: the authoritative, strictly READ-ONLY "what next" surface
// (FEIP-8017).
//
// The deterministic drive knows exactly where the workflow is and what it would
// do next, but only WHILE it runs. Every time it stops (a HITL gate, a raised
// escalation, feature-complete, a transient error, a killed run) an orchestrating
// agent otherwise has to reverse-engineer the next move from source and drifts
// into freeform (improvised CLIs, manual git, manual state edits). This module
// answers, from the SAME engine the drive uses (nextTransition over the derived
// DriveState), four questions with no model in the loop:
//   - where am I?            -> the reconciled state (coarse + derived phase,
//                               per-story statuses, open gates, blockers)
//   - what can I do next?    -> the decision MENU (not just the one next action):
//                               at a gate, the real HIL choices, each with its
//                               correct enact CLI + a hil_prompt to pose
//   - how do I enact each?   -> the exact { bin, args } per option
//   - how do I frame it?     -> hil_prompt per option
//
// It is PURE over an injected DriveState + context: no I/O, no model spawn, no
// writes to workflow artifacts. The CLI (next.cli.ts) reads the state from disk
// and the drive (drive.cli.ts) auto-emits this snapshot to .sftdd/next.json on
// every stop, so the agent's contract is simply: on any stop, read next.json,
// present its options to the human, enact the chosen one.

import * as fs from "node:fs";
import * as path from "node:path";
import type { DriveState, WorkflowAction } from "./orchestrator-drive.js";
import { nextTransition } from "./orchestrator-drive.js";
import { describeAction, gateEnactCommand, type EnactCommand } from "./orchestrator-logging.js";
import { deriveFeaturePhase, summarizeStories, type StoryStatusEntry } from "./feature-status.js";
import { readDriveStateFromDisk } from "./orchestrator-effects.js";

/** One choice on the decision menu the human (or the agent, on their behalf)
 *  picks between at a stop. `enact` is the exact command that carries it out;
 *  null for a manual/no-command choice (hold, or a step with no dedicated CLI). */
export interface NextOption {
  /** Stable dotted id, e.g. "acceptance.accept" / "spec.approve" / "resume". */
  id: string;
  /** Short human label for the choice. */
  title: string;
  /** The question to pose to the human, so the agent proposes rather than guesses. */
  hil_prompt: string;
  /** action = runs substrate that advances the workflow; gate = a HITL approval;
   *  noop = hold/checkpoint (no command); manual = needs human work, no single CLI. */
  kind: "action" | "gate" | "noop" | "manual";
  /** The exact command to enact this option, or null (noop/manual). */
  enact: EnactCommand | null;
  /** True when enacting reaches outside the local project (opens a PR, merges,
   *  deletes a branch): the agent should confirm with the human before enacting. */
  outward_facing?: boolean;
  /** Extra guidance for a manual choice (no dedicated CLI). */
  note?: string;
}

/** A thing blocking forward progress: an unresolved escalation, with the exact
 *  resolver command when one is known (else a hint). */
export interface NextBlocker {
  source: string;
  reason: string;
  story?: string;
  /** The command that clears this blocker, when deterministic; else null. */
  resolver: EnactCommand | null;
  /** Free-text guidance when there is no single resolver command. */
  resolver_hint?: string;
}

/** The reconciled state summary: the truth the engine acts on, not the stale
 *  coarse workflow phase. */
export interface NextState {
  /** The driver's coarse phase (planning | feature | deploy | promote | done). */
  coarse_phase: string;
  /** The feature phase DERIVED from the per-story pipeline (complete | build |
   *  design), or null when no stories are tracked / sprint scope (FEIP-8016). */
  derived_phase: string | null;
  /** Per-story statuses (story id -> status), feature scope only. */
  stories: Record<string, string>;
  /** The HITL gates currently open (awaiting a human decision). */
  open_gates: string[];
  /** What is blocking progress right now (empty when nothing is). */
  blockers: NextBlocker[];
}

export interface NextSnapshot {
  scope: "feature" | "sprint";
  feature?: string;
  sprint?: string;
  state: NextState;
  /** The single next action the deterministic engine would take (nextTransition),
   *  as a stable kind + a one-line human description. The options[] below expand
   *  this into the full decision menu. */
  primary_action: { kind: string; describe: string };
  /** The decision menu: every valid next choice, each with its enact command +
   *  hil_prompt. Always includes a "hold" checkpoint option. */
  options: NextOption[];
  /** A plain-language summary of where things stand + what the human is being
   *  asked, for the agent to relay verbatim (truthful phase-complete messaging). */
  summary: string;
  /** The kit version this playbook was computed against. */
  authoritative_playbook_version: string;
  generated_at: string;
}

export interface NextContext {
  featureId?: string;
  sprint?: string;
  /** Approver to fill into gate enact commands (default `<you>` placeholder). */
  approver?: string;
  /** The feature's canonical branch, the promote gate's required `--promote-ref`
   *  (FEIP-8019). Falls back to the feature id when unknown. */
  featureBranch?: string;
  /** Kit version string for authoritative_playbook_version. */
  version?: string;
  /** ISO timestamp for generated_at (injectable for deterministic tests). */
  now?: string;
  /** Per-story derived rows (feature scope), for the reconciled state + phase.
   *  Reuses feature-status' summarizeStories so `next` and `feature-status` agree. */
  stories?: StoryStatusEntry[];
}

/** The universal "resume the drive to the next stop" enact for a scope. */
function resumeCommand(ctx: NextContext): EnactCommand {
  return ctx.sprint && !ctx.featureId
    ? { bin: "lakebase-sftdd-drive", args: ["--sprint", ctx.sprint] }
    : { bin: "lakebase-sftdd-drive", args: ["--feature", ctx.featureId ?? "<feature-id>"] };
}

/** The always-present "stop here / checkpoint" option. */
function holdOption(): NextOption {
  return {
    id: "hold",
    title: "Stop here (checkpoint)",
    hil_prompt: "Checkpoint and resume later?",
    kind: "noop",
    enact: null,
  };
}

/** The single feature/story a gate action targets, if any. */
function storyOf(action: WorkflowAction): string | undefined {
  return "story" in action ? (action as { story?: string }).story : undefined;
}

/**
 * Expand the engine's single next action into the full decision menu. The menu
 * is genuinely > 1 choice at the acceptance gate (accept / discard / revise are
 * three distinct, real pipeline CLIs the human chooses between); at the other
 * approval gates it is approve-or-hold; for a non-gate step it is resume-or-hold.
 * Every option carries its EXACT enact command (from the one gateEnactCommand
 * mapping, so it can never drift from the drive) + a hil_prompt.
 */
export function buildNextOptions(action: WorkflowAction, ctx: NextContext): NextOption[] {
  const f = ctx.featureId ?? "<feature-id>";
  const you = ctx.approver ?? "<you>";
  const gateEnact = gateEnactCommand(action, {
    featureId: ctx.featureId,
    sprint: ctx.sprint,
    approver: ctx.approver,
    featureBranch: ctx.featureBranch,
  });

  switch (action.kind) {
    case "accept": {
      // The richest, highest-stakes menu: the PO's acceptance decision. accept
      // LANDS the story (git-merge experiment -> feature + migrate + teardown);
      // discard drops it out of the sprint; revise sends it back to designing.
      const story = storyOf(action) ?? "<story>";
      return [
        {
          id: "acceptance.accept",
          title: `Accept story ${story}`,
          hil_prompt: `Accept story ${story}? I will merge its experiment into the feature branch, run its migrations, and tear the experiment down.`,
          kind: "gate",
          enact: gateEnact, // lakebase-sftdd-pipeline accept ... (owns the merge)
        },
        {
          id: "acceptance.discard",
          title: `Discard story ${story}`,
          hil_prompt: `Discard story ${story}? Its experiment is torn down and it leaves the sprint; its code is NOT merged.`,
          kind: "action",
          enact: { bin: "lakebase-sftdd-pipeline", args: ["discard", "--feature", f, "--story", story, "--approver", you, "--reason", "<reason>"] },
        },
        {
          id: "acceptance.revise",
          title: `Revise story ${story}`,
          hil_prompt: `Send story ${story} back to designing? Its experiment is torn down and it re-enters the design lane; its code is NOT merged.`,
          kind: "action",
          enact: { bin: "lakebase-sftdd-pipeline", args: ["revise", "--feature", f, "--story", story, "--approver", you, "--reason", "<reason>"] },
        },
        holdOption(),
      ];
    }
    case "approve-plan-gate":
      return [
        {
          id: "plan.approve",
          title: "Approve the sprint plan",
          hil_prompt: "Approve the sprint plan and lock the backlog so execution can begin?",
          kind: "gate",
          enact: gateEnact,
        },
        holdOption(),
      ];
    case "approve-gate": // per-story spec gate
      return [
        {
          id: "spec.approve",
          title: `Approve story ${storyOf(action) ?? "<story>"}'s spec`,
          hil_prompt: `Approve story ${storyOf(action) ?? "<story>"}'s spec so its build can start? (To send it back, edit the spec and re-run the design lane.)`,
          kind: "gate",
          enact: gateEnact,
        },
        holdOption(),
      ];
    case "approve-deploy-gate":
      return [
        {
          id: "deploy.approve",
          title: "Approve the deploy gate",
          hil_prompt: "The feature deployed + verified locally. Approve the deploy gate to enter promotion?",
          kind: "gate",
          enact: gateEnact,
        },
        holdOption(),
      ];
    case "approve-promote-gate":
      return [
        {
          id: "promote.approve",
          title: "Approve the promote gate",
          hil_prompt: "CI is green on the promotion PR. Approve it so the feature can merge up to the parent tier?",
          kind: "gate",
          enact: gateEnact,
          outward_facing: true,
        },
        holdOption(),
      ];
    case "raise-to-hil":
      // A blocker pre-empted everything. The blocker (+ its resolver) is surfaced
      // in state.blockers; the only forward option is to resolve it, then resume.
      return [
        {
          id: "resume",
          title: "Resume the drive (after resolving the blocker below)",
          hil_prompt: "Once the blocker under `blockers` is resolved, resume the drive?",
          kind: "action",
          enact: resumeCommand(ctx),
          note: "Clear the escalation (and any blocking smell) named in blockers first; the drive will re-derive and retry.",
        },
        holdOption(),
      ];
    case "prepare-pr":
    case "wait-ci":
    case "merge":
      // Promote-phase substrate steps: resuming the drive performs the SCM ladder
      // step. merge/prepare-pr reach GitHub, so flag them outward-facing.
      return [
        {
          id: "resume",
          title: "Resume the drive (promotion)",
          hil_prompt: `Continue promotion (${describeAction(action, { featureId: ctx.featureId })})?`,
          kind: "action",
          enact: resumeCommand(ctx),
          outward_facing: true,
        },
        holdOption(),
      ];
    case "done":
      return [
        {
          id: "done",
          title: "Nothing to do (workflow complete)",
          hil_prompt: "This feature is fully shipped. Start a new feature or sprint?",
          kind: "noop",
          enact: null,
        },
      ];
    case "feature-complete":
      return [
        {
          id: "resume",
          title: "Deploy the feature",
          hil_prompt: "Every story is built + accepted. Deploy the feature (local working-software check) and enter promotion?",
          kind: "action",
          enact: resumeCommand(ctx),
        },
        holdOption(),
      ];
    default:
      // Any other step (design/build role turns, dispatch, cut-experiment, deploy):
      // resuming the drive carries it out. One resume option + hold.
      return [
        {
          id: "resume",
          title: "Resume the drive",
          hil_prompt: `Resume the drive to carry out: ${describeAction(action, { featureId: ctx.featureId })}?`,
          kind: "action",
          enact: resumeCommand(ctx),
        },
        holdOption(),
      ];
  }
}

/** The open HITL gates implied by the engine's next action (the one gate the
 *  drive would stop at). Empty for a non-gate action. */
function openGatesOf(action: WorkflowAction): string[] {
  switch (action.kind) {
    case "approve-plan-gate":
      return ["plan"];
    case "approve-gate":
      return ["spec"];
    case "accept":
      return ["acceptance"];
    case "approve-deploy-gate":
      return ["deploy"];
    case "approve-promote-gate":
      return ["promote"];
    default:
      return [];
  }
}

/** The blocker(s) implied by an escalation pre-empt. Kept honest: a generic
 *  escalation has no single deterministic resolver, so we surface the detail +
 *  a resume-after-you-resolve hint rather than fabricating a fix command. */
function blockersOf(state: DriveState): NextBlocker[] {
  if (!state.escalation) return [];
  const e = state.escalation;
  return [
    {
      source: e.source,
      reason: e.reason,
      ...(e.story_id ? { story: e.story_id } : {}),
      resolver: null,
      resolver_hint:
        "Resolve the underlying problem (clear the escalation file under .sftdd/escalations/ and any blocking smell in .sftdd/smells.json), then resume the drive.",
    },
  ];
}

/** A one-line, TRUTHFUL summary of where things stand (subsumes the misleading
 *  "deploy complete in 0 actions": a done feature reads as shipped, not a no-op). */
function summarize(scope: "feature" | "sprint", action: WorkflowAction, state: NextState, ctx: NextContext): string {
  const who = scope === "sprint" ? `sprint ${ctx.sprint}` : `feature ${ctx.featureId}`;
  if (action.kind === "done") {
    return `${who} is complete: every story was built, accepted, and deployed per story, and the feature is merged. Nothing left to do.`;
  }
  if (action.kind === "feature-complete") {
    return `${who}: every story is built + accepted. Next step is to deploy the feature (local working-software check) and enter promotion.`;
  }
  if (action.kind === "raise-to-hil") {
    return `${who} is BLOCKED and needs a human: ${state.blockers[0]?.reason ?? "an escalation was raised"}. See blockers; resolve it, then resume.`;
  }
  if (state.open_gates.length > 0) {
    return `${who} is at the ${state.open_gates[0]} gate, awaiting a human decision. See options for the choices and how to enact each.`;
  }
  return `${who} is mid-flight (${state.derived_phase ?? state.coarse_phase}). The next step is: ${describeAction(action, { featureId: ctx.featureId })}.`;
}

/**
 * Compute the authoritative snapshot from an injected DriveState (pure). The CLI
 * reads the state from disk and passes it here; tests pass a hand-built state.
 * The transition is the SAME nextTransition the drive uses, so `next` can never
 * disagree with what the drive would actually do.
 */
export function buildNextSnapshot(
  scope: "feature" | "sprint",
  state: DriveState,
  ctx: NextContext,
  transition: (s: DriveState) => WorkflowAction = nextTransition,
): NextSnapshot {
  const action = transition(state);
  const stories: Record<string, string> = {};
  for (const s of ctx.stories ?? []) stories[s.story_id] = s.status;
  const nextState: NextState = {
    coarse_phase: state.phase,
    derived_phase: scope === "feature" ? deriveFeaturePhase(ctx.stories ?? []) : null,
    stories,
    open_gates: openGatesOf(action),
    blockers: blockersOf(state),
  };
  const primary = { kind: action.kind, describe: describeAction(action, { featureId: ctx.featureId }) };
  return {
    scope,
    ...(ctx.featureId ? { feature: ctx.featureId } : {}),
    ...(ctx.sprint ? { sprint: ctx.sprint } : {}),
    state: nextState,
    primary_action: primary,
    options: buildNextOptions(action, ctx),
    summary: summarize(scope, action, nextState, ctx),
    authoritative_playbook_version: ctx.version ?? "unknown",
    generated_at: ctx.now ?? new Date().toISOString(),
  };
}

/**
 * Build the feature-scope snapshot straight from disk (read-only): the drive's
 * auto-emit + the CLI share this so both reflect the exact on-disk state via the
 * same readDriveStateFromDisk + summarizeStories the engine uses. Impure (reads
 * disk); buildNextSnapshot itself stays pure.
 */
export function readFeatureNextSnapshot(
  sftddDir: string,
  featureId: string,
  projectDir: string,
  ctx: Omit<NextContext, "featureId" | "stories"> & { uiTrack?: boolean } = {},
): NextSnapshot {
  const state = readDriveStateFromDisk(sftddDir, featureId, projectDir, { uiTrack: ctx.uiTrack });
  return buildNextSnapshot("feature", state, {
    ...ctx,
    featureId,
    stories: summarizeStories(sftddDir, featureId),
  });
}

/**
 * Emit the authoritative feature snapshot to `<sftddDir>/next.json`. The drive
 * calls this on every stop (a gate, an escalation, feature-complete, an error,
 * a killed run), so an orchestrating agent's contract is simply: on any stop,
 * read next.json and present its options. Best-effort: an advisory artifact must
 * never break the run, so all failures are swallowed (FEIP-8017).
 */
export function emitNextJson(
  sftddDir: string,
  featureId: string,
  projectDir: string,
  ctx: Omit<NextContext, "featureId" | "stories"> & { uiTrack?: boolean } = {},
): void {
  try {
    const snap = readFeatureNextSnapshot(sftddDir, featureId, projectDir, ctx);
    fs.mkdirSync(sftddDir, { recursive: true });
    fs.writeFileSync(path.join(sftddDir, "next.json"), JSON.stringify(snap, null, 2) + "\n", "utf8");
  } catch {
    /* best-effort: next.json is advisory; never let it fail the run */
  }
}

/** Render a NextSnapshot as a compact human-readable block (the CLI's non-JSON
 *  output). Read-only presentation; the JSON is the machine contract. */
export function renderNextSnapshot(snap: NextSnapshot): string {
  const lines: string[] = [];
  const who = snap.scope === "sprint" ? `sprint ${snap.sprint}` : `feature ${snap.feature}`;
  lines.push(`Next for ${who}`);
  const phase = snap.state.derived_phase ?? snap.state.coarse_phase;
  const coarseLag =
    snap.state.derived_phase && snap.state.coarse_phase !== snap.state.derived_phase
      ? ` [coarse: ${snap.state.coarse_phase}]`
      : "";
  lines.push(`  Phase: ${phase}${coarseLag}`);
  if (Object.keys(snap.state.stories).length > 0) {
    const rows = Object.entries(snap.state.stories).map(([id, st]) => `${id}=${st}`);
    lines.push(`  Stories: ${rows.join(", ")}`);
  }
  if (snap.state.open_gates.length > 0) lines.push(`  Open gate: ${snap.state.open_gates.join(", ")}`);
  lines.push(``);
  lines.push(snap.summary);
  if (snap.state.blockers.length > 0) {
    lines.push(``);
    lines.push(`Blockers:`);
    for (const b of snap.state.blockers) {
      lines.push(`  - [${b.source}] ${b.reason}${b.story ? ` (story ${b.story})` : ""}`);
      if (b.resolver) lines.push(`      resolve: ${b.resolver.bin} ${b.resolver.args.join(" ")}`);
      else if (b.resolver_hint) lines.push(`      resolve: ${b.resolver_hint}`);
    }
  }
  lines.push(``);
  lines.push(`Options:`);
  for (const o of snap.options) {
    const tag = o.outward_facing ? " (outward-facing: confirm first)" : "";
    lines.push(`  - ${o.title}${tag}`);
    lines.push(`      ${o.hil_prompt}`);
    if (o.enact) lines.push(`      enact: ${o.enact.bin} ${o.enact.args.join(" ")}`);
    if (o.note) lines.push(`      note: ${o.note}`);
  }
  return lines.join("\n");
}
