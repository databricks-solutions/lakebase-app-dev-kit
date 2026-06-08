// Real DriveEffects (deterministic-driver phase 3b: the act half).
//
// Maps each WorkflowAction to the concrete commands that carry it out, behind a
// CommandRunner seam so the mapping (commandsForAction) is pure + hermetically
// testable while the execution is injected. The driver loop (runDriver) calls
// perform(action); perform asks commandsForAction for the command list and runs
// each through the runner. readState rebuilds a DriveState from disk via
// deriveDriveState + diskArtifactProbe + readDriveContext.
//
// Command kinds (the runner interprets each):
//   - "claude":    claude -p "<task>" --agent <role> --model <m> --strict-mcp-config
//   - "cli":       a kit CLI invocation (lakebase-tdd-pipeline / -experiment / etc.)
//   - "set-phase": write workflow-state.json `phase` (no CLI owns the coarse phase)
//
// The live runner (in the lakebase-tdd-drive CLI) spawns these; the migration
// create + head-collapse + per-story experiment effects all surface here, in
// code, plus deterministic per-action logging via the loop's onAction hook.

import * as fs from "node:fs";
import { nextTransition, type WorkflowAction } from "./orchestrator-drive.js";
import type { DriveEffects } from "./orchestrator-run.js";
import { deriveDriveState } from "./orchestrator-derive.js";
import { diskArtifactProbe, readDriveContext } from "./orchestrator-probe.js";
import { readPipeline } from "./story-pipeline.js";
import { storyJson } from "./tdd-paths.js";

export type DriveCommand =
  // resumeKey: when set, the runner resumes this role's Claude session across
  // its invocations (warm context + prompt cache) instead of a cold respawn.
  // Keyed by role, scoped to one feature drive (the runner's lifetime).
  | { kind: "claude"; role: string; model: string; task: string; resumeKey?: string }
  | { kind: "cli"; bin: string; args: string[] }
  | { kind: "set-phase"; phase: string }
  // Deterministic sprint-backlog projection (the ONE writer): after the PO
  // commits its requests, project backlog.json from the on-disk feature-request
  // set + the Architect's estimates. Handled in-process by the runner (no CLI),
  // mirroring set-phase. See syncBacklog in tdd-paths.
  | { kind: "sync-backlog"; sprint: string };

export interface CommandRunner {
  run(cmd: DriveCommand): Promise<void>;
}

export interface DriveEffectsConfig {
  projectDir: string;
  tddDir: string;
  featureId: string;
  runner: CommandRunner;
  /** Resolve a role's model (per-project override -> recommended -> inherit). */
  modelForRole(role: string): string;
  /** Approver name for headless gate approvals (the Human Proxy). */
  approver?: string;
  /** Sprint name, threaded to the sprint plan gate in the planning phase. */
  sprintName?: string;
  /** Deploy target for the deploy action (e.g. "local"). */
  deployTarget?: string;
  /** Lakebase instance id, threaded to the experiment branch ops. */
  instance?: string;
  /** UI track on (LAKEBASE_TDD_UI=1 / a design-brief.md is part of intake): the
   *  Spec Author must treat user-facing capabilities as E2E (browser/screen)
   *  stories, not API-only, when proposing + breaking down. */
  uiTrack?: boolean;
  onAction?(action: WorkflowAction, iteration: number): void;
}

/** Appended to the Spec Author's propose/breakdown tasks when the UI track is
 *  on, so the proposal + story breakdown account for user-facing E2E stories
 *  (the design lane's `layer: "E2E"` work), not just API surface. */
const UI_TRACK_PROPOSE = ` UI track is ON: this product has a user-facing UI (a design-brief.md is part of intake), so every user-facing capability must be deliverable end to end as an E2E story , a real browser/screen interaction a user performs, not merely an API. Frame each candidate as a user-facing increment and note which need an E2E (UI) story.`;
const UI_TRACK_BREAKDOWN = ` UI track is ON: decompose into stories that include the E2E (UI) story for each user-facing capability (a screen the user interacts with), not API-only stories.`;

/**
 * The target story's stub (asA/iWantTo/soThat) as one inline sentence, to scope
 * the Spec Author's per-story draft prompt to exactly that story (FEIP-7461: an
 * agent can only batch stories it is handed; we hand it just this one). Returns
 * "" when the stub is absent/unreadable, the directive alone still scopes it.
 */
function storyStubScope(tddDir: string, featureId: string, storyId: string): string {
  try {
    const stub = JSON.parse(fs.readFileSync(storyJson(tddDir, featureId, storyId), "utf8")) as {
      asA?: string;
      iWantTo?: string;
      soThat?: string;
    };
    const parts = [
      stub.asA ? `As a ${stub.asA}` : "",
      stub.iWantTo ? `I want to ${stub.iWantTo}` : "",
      stub.soThat ? `so that ${stub.soThat}` : "",
    ].filter(Boolean);
    return parts.length ? ` The story: ${parts.join(", ")}.` : "";
  } catch {
    return "";
  }
}

/** Short task directive handed to a role subagent for an invoke-role action. */
function roleTask(
  action: Extract<WorkflowAction, { kind: "invoke-role" }>,
  featureId: string,
  uiTrack: boolean,
  tddDir: string,
): string {
  if ("mode" in action) {
    switch (action.mode) {
      case "propose":
        return `Propose the sprint's candidate feature breakdown for planning (feature-proposals.md).${uiTrack ? UI_TRACK_PROPOSE : ""}`;
      case "estimate":
        return `Estimate each proposed candidate feature with a t-shirt size (XS/S/M/L/XL) and write planning/estimates.json, so the Product Owner can commit a backlog that fits sprint capacity.`;
      case "author-requests":
        // Unreachable: author-requests is a human-input step the Human Proxy
        // supplies (see commandsForAction); it never spawns a role agent.
        return `Provide the sprint's feature-requests.`;
      case "breakdown":
        return `Break feature ${featureId} down into its stories.${uiTrack ? UI_TRACK_BREAKDOWN : ""}`;
    }
  }
  const s = action.story;
  switch (action.role) {
    case "spec-author":
      // Scope the draft to ONE story, by handing it only this story's stub +
      // an explicit single-story directive. The design lane streams one story
      // at a time so the first story reaches its gate + build fast (the build
      // lane starts on it without waiting for the rest to be authored); drafting
      // siblings here delays that and is rejected at the per-story spec gate.
      return (
        `Draft the acceptance criteria for story ${s} and NOTHING else.${storyStubScope(tddDir, featureId, s)}` +
        ` Write only under story ${s}'s acs/ directory. Do not create, draft, or modify acceptance criteria for any` +
        ` other story in this feature, each other story is drafted in its own separate step that you are not` +
        ` performing now, and you will be invoked again, once per story, for the rest. Authoring more than ${s} here` +
        ` delays ${s} reaching its spec gate and build, and is rejected at the gate.`
      );
    case "architect-reviewer":
      return `Annotate AC layers and nfrs.md coverage for story ${s}.`;
    case "test-strategist":
      return `Produce the ordered test list for story ${s}.`;
    case "navigator":
      return `Write the next RED test for story ${s}.`;
    case "driver":
      return `Make the failing test for story ${s} GREEN (simplest honest code).`;
    default:
      return `Work story ${s}.`;
  }
}

const PIPELINE_BIN = "lakebase-tdd-pipeline";
const EXPERIMENT_BIN = "lakebase-tdd-experiment";
const HUMAN_PROXY_BIN = "lakebase-tdd-human-proxy";
const LOG_BIN = "lakebase-tdd-log";
const TEST_LIST_BIN = "lakebase-tdd-test-list";

/**
 * The concrete commands that carry out one action. Depends on the action +
 * config (and, for the Spec Author's per-story draft, reads that story's stub
 * from disk to scope the prompt; absent stub falls back to the directive alone).
 * Returns [] for the terminal `done` (after a final set-phase).
 * State transitions that no CLI owns (the coarse planning/feature/deploy phase)
 * are "set-phase" commands the runner applies to workflow-state.json.
 */
export function commandsForAction(action: WorkflowAction, cfg: DriveEffectsConfig): DriveCommand[] {
  const f = cfg.featureId;
  const tdd = ["--feature", f, "--tdd-dir", cfg.tddDir];
  const approver = cfg.approver ?? "human-proxy";

  switch (action.kind) {
    case "invoke-role": {
      // author-requests is a HUMAN-INPUT step, not an agent task: the state
      // machine asks for the PO's feature-request.md per committed feature. The
      // machine is identical for a human and the proxy , interactive, the driver
      // stops here and the human provides them (directly or via the agents);
      // headless, the Human Proxy supplies the recorded answers WHEN ASKED (and
      // logs each). Then sync-backlog (the one writer) projects backlog.json from
      // exactly what was supplied. No LLM is spawned to invent the requests.
      if ("mode" in action && action.role === "product-owner" && action.mode === "author-requests") {
        return [
          { kind: "cli", bin: HUMAN_PROXY_BIN, args: ["supply-requests", "--tdd-dir", cfg.tddDir, "--approver", approver] },
          { kind: "sync-backlog", sprint: cfg.sprintName ?? "sprint" },
        ];
      }
      const claude: DriveCommand = {
        kind: "claude",
        role: action.role,
        model: cfg.modelForRole(action.role),
        resumeKey: action.role,
        task: roleTask(action, f, cfg.uiTrack ?? false, cfg.tddDir),
      };
      const cmds: DriveCommand[] = [claude];
      // After the Spec Author breaks the feature down, seed the pipeline from
      // the stories/ dirs it produced so the streaming lanes have stories to
      // advance (breakdown writes files, not pipeline.json).
      if ("mode" in action && action.role === "spec-author" && action.mode === "breakdown") {
        cmds.push({ kind: "cli", bin: PIPELINE_BIN, args: ["sync-breakdown", ...tdd] });
      }
      // After the Test Strategist orders a story's tests, deterministically
      // scope the feature master to that story and write the canonical per-story
      // list (storyTestListJson) , the exact file + field the testListReady probe
      // reads. Code-emitting it (not relying on the role) is what keeps producer
      // + probe on the single source of truth, so the design lane cannot stall
      // waiting on a per-story list the role wrote under a different name/shape.
      if (!("mode" in action) && action.role === "test-strategist") {
        cmds.push({ kind: "cli", bin: TEST_LIST_BIN, args: [cfg.tddDir, f, action.story] });
      }
      // Code-emit artifact.written for whatever the role just wrote: reconcile
      // reads the artifacts on disk and logs any not already in the agent log,
      // so observability never depends on the role's model emitting it. Skipped
      // for the sprint-scoped planning modes (propose / estimate), which write no
      // feature artifacts to reconcile. (author-requests returned earlier.)
      const isPlanningMode = "mode" in action && (action.mode === "propose" || action.mode === "estimate");
      if (f && !isPlanningMode) cmds.push({ kind: "cli", bin: LOG_BIN, args: ["--reconcile", ...tdd] });
      return cmds;
    }

    case "surface-gate":
      return [{ kind: "cli", bin: PIPELINE_BIN, args: ["surface", "--story", action.story, ...tdd] }];

    case "approve-gate":
      // HITL: the Human Proxy approves in headless mode.
      return [
        { kind: "cli", bin: PIPELINE_BIN, args: ["approve-gate", "--story", action.story, "--approver", approver, ...tdd] },
      ];

    case "dispatch":
      return [{ kind: "cli", bin: PIPELINE_BIN, args: ["dispatch", ...tdd] }];

    case "cut-experiment":
      return [
        {
          kind: "cli",
          bin: EXPERIMENT_BIN,
          args: [
            "cut",
            "--story",
            action.story,
            "--feature",
            f,
            "--project-dir",
            cfg.projectDir,
            "--tdd-dir",
            cfg.tddDir,
            ...(cfg.instance ? ["--instance", cfg.instance] : []),
          ],
        },
      ];

    case "await-acceptance":
      // The Release Engineer deploys the story FROM its experiment branch so the
      // PO reviews RUNNING software, then we mark the pipeline awaiting. The
      // deploy must write the STORY-scoped deploy-evidence (reachable +
      // verify.passed) via `lakebase-tdd-deploy --feature ${f} --story
      // ${action.story}`: that is the teeth the driver requires before the story
      // can be accepted (a story that does not verify is never merged).
      return [
        {
          kind: "claude",
          role: "release-engineer",
          model: cfg.modelForRole("release-engineer"),
          resumeKey: "release-engineer",
          task: `Deploy story ${action.story} of feature ${f} from its experiment branch (target ${cfg.deployTarget ?? "local"}) by running lakebase-tdd-deploy --feature ${f} --story ${action.story}, so the Product Owner reviews running software and the story-scoped deploy-evidence (reachable + feature-verify) is recorded.`,
        },
        { kind: "cli", bin: PIPELINE_BIN, args: ["await-acceptance", "--story", action.story, ...tdd] },
      ];

    case "accept":
      // Merge the experiment into the feature branch (git + migrations), then
      // record the PO acceptance. collapseMigrationHeads runs at the later
      // feature->tier merge, not per-story.
      return [
        {
          kind: "cli",
          bin: EXPERIMENT_BIN,
          args: [
            "merge",
            "--story",
            action.story,
            "--feature",
            f,
            "--project-dir",
            cfg.projectDir,
            "--tdd-dir",
            cfg.tddDir,
            ...(cfg.instance ? ["--instance", cfg.instance] : []),
          ],
        },
        { kind: "cli", bin: PIPELINE_BIN, args: ["accept", "--story", action.story, "--approver", approver, ...tdd] },
      ];

    case "complete":
      return [{ kind: "cli", bin: PIPELINE_BIN, args: ["complete", ...tdd] }];

    case "approve-plan-gate":
      // HITL sprint plan gate: the Human Proxy approves it headless (teeth:
      // feature-proposals.md must exist + conform). Sprint-scoped, mirroring the
      // per-story spec gate's approve verb.
      return [
        {
          kind: "cli",
          bin: HUMAN_PROXY_BIN,
          args: ["--sprint", cfg.sprintName ?? "sprint", "--gate", "plan", "--approver", approver, "--tdd-dir", cfg.tddDir],
        },
      ];

    case "planning-complete":
      return [{ kind: "set-phase", phase: "discovery" }];

    case "feature-complete":
      return [{ kind: "set-phase", phase: "deploy" }];

    case "deploy":
      // The Release Engineer ships the merged feature: deploy + poll reachable
      // + run the feature verify against the running app + produce the deploy-
      // gate evidence. Invoked as a role (like every other role) so the driver
      // only routes; the role composes lakebase-tdd-deploy + the verify.
      return [
        {
          kind: "claude",
          role: "release-engineer",
          model: cfg.modelForRole("release-engineer"),
          resumeKey: "release-engineer",
          task: `Deploy feature ${f} to its target (${cfg.deployTarget ?? "local"}), prove it is reachable and the feature verify passes against the running app, and produce the deploy-gate evidence for the Product Owner.`,
        },
      ];

    case "approve-deploy-gate":
      return [
        { kind: "cli", bin: HUMAN_PROXY_BIN, args: ["--feature", f, "--gate", "deploy", "--approver", approver, "--tdd-dir", cfg.tddDir] },
      ];

    case "done":
      return [{ kind: "set-phase", phase: "shipped" }];

    case "design-complete":
      // In the union (from the design sub-machine) but never emitted by
      // nextTransition, which rewrites it to feature-complete. No-op defensively.
      return [];
  }
}

/**
 * Compute the single next action + the commands that would carry it out,
 * without executing anything. Backs `lakebase-tdd-drive --dry-run` ("what will
 * the driver do next?") and is the testable core of that CLI path.
 */
export async function planNextAction(
  cfg: DriveEffectsConfig,
  transition: (state: import("./orchestrator-drive.js").DriveState) => WorkflowAction = nextTransition,
): Promise<{ action: WorkflowAction; commands: DriveCommand[] }> {
  const state = await buildDriveEffects(cfg).readState();
  const action = transition(state);
  return { action, commands: commandsForAction(action, cfg) };
}

/** Build a DriveEffects bound to a project: readState from disk, perform via
 *  commandsForAction + the injected runner. */
export function buildDriveEffects(cfg: DriveEffectsConfig): DriveEffects {
  return {
    async readState() {
      const pipeline = readPipeline(cfg.tddDir, cfg.featureId);
      const probe = diskArtifactProbe(cfg.tddDir, cfg.featureId);
      const ctx = readDriveContext(cfg.tddDir, cfg.featureId);
      return deriveDriveState(pipeline, probe, ctx);
    },
    async perform(action) {
      for (const cmd of commandsForAction(action, cfg)) {
        await cfg.runner.run(cmd);
      }
    },
    onAction: cfg.onAction,
  };
}
