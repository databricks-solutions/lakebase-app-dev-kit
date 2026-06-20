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
//   - "cli":       a kit CLI invocation (lakebase-sftdd-pipeline / -experiment / etc.)
//   - "set-phase": write workflow-state.json `phase` (no CLI owns the coarse phase)
//
// The live runner (in the lakebase-sftdd-drive CLI) spawns these; the migration
// create + head-collapse + per-story experiment effects all surface here, in
// code, plus deterministic per-action logging via the loop's onAction hook.

import * as fs from "node:fs";
import { dirname } from "node:path";
import { nextTransition, type WorkflowAction } from "./orchestrator-drive.js";
import type { DriveEffects } from "./orchestrator-run.js";
import { deriveDriveState } from "./orchestrator-derive.js";
import { diskArtifactProbe, readDriveContext } from "./orchestrator-probe.js";
import { readPipeline } from "./story-pipeline.js";
import { storyJson, designGuideJson, handbackFile, storyAcIds, architectureJson, readAcLayer } from "./tdd-paths.js";
import { storyTestProgress, nextPendingBatch, DEFAULT_BATCH_CAP } from "./cycle-record.js";
import { readSupersededTests, readGreenFailure } from "./supersession.js";
import { readConventions } from "./architecture-conventions.js";
import { sanitizeBranchName } from "../util/sanitize-branch-name.js";

export type DriveCommand =
  // resumeKey: when set, the runner resumes this role's Claude session across
  // its invocations (warm context + prompt cache) instead of a cold respawn.
  // Keyed by role, scoped to one feature drive (the runner's lifetime).
  // `replay` carries the turn identity (sprint mode / story) so the runner can,
  // in fast-forward replay mode, copy this design turn's recorded artifact
  // instead of spawning the model. Ignored by the normal (live) runner.
  // `effort` (P6): the `claude -p --effort <level>` knob for THIS turn. Set on the
  // judgment turns (REVIEW) to run them fast (low reasoning effort), the headless
  // realization of "fast mode", since `claude -p` has no `--fast` flag. Omitted =>
  // the model's default effort.
  | { kind: "claude"; role: string; model: string; task: string; resumeKey?: string; effort?: string; fallbackModel?: string; maxBudgetUsd?: number; replay?: { mode?: string; story?: string } }
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
  /** Lakebase instance id (the Lakebase project id), threaded to the experiment
   *  branch ops. The experiment CLI requires it; resolved from SCM state. */
  instance?: string;
  /** The feature's git + Lakebase branch (the PARENT a per-story experiment is
   *  cut off, and merged back into). Resolved from SCM state at drive start. */
  featureBranch?: string;
  /** The feature's PARENT TIER (the branch the feature PR merges up into, e.g.
   *  staging). Resolved from SCM state at drive start. The feature wrap-up
   *  switches the working tree back to it as the last step, so the next feature
   *  forks from a clean parent (and a human/the smoke is not left on the merged,
   *  soon-deleted feature branch). */
  parentBranch?: string;
  /** UI track on (LAKEBASE_TDD_UI=1 / a design-brief.md is part of intake): the
   *  Spec Author must treat user-facing capabilities as E2E (browser/screen)
   *  stories, not API-only, when proposing + breaking down. */
  uiTrack?: boolean;
  /** P5: build-session scope for the Navigator/Driver. "story" (default) resumes
   *  their `claude -p` session across a story's cycles (warm context + prompt
   *  cache) and starts FRESH at each new story, so context growth is bounded to
   *  one story. "cycle" cold-spawns every RED/GREEN/REVIEW/REFACTOR (the prior
   *  behavior), the safety valve if a long story overflows the window. */
  buildSessionScope?: "cycle" | "story";
  /** P6: `--effort` level for the Navigator's REVIEW turn (judgment, not code
   *  authoring), so it runs fast. Default "low"; set "" / undefined-via-env to
   *  use the model default. Superseded by effortForTurn when that is provided
   *  (kept as the fallback so older callers / tests still resolve review effort). */
  reviewEffort?: string;
  /** Unified config: resolve `--effort` for ANY role+turn ("" / "default" => omit
   *  the flag). When set it governs every turn; absent, the review-only
   *  reviewEffort fallback applies. (tdd-config.json, file -> env -> default.) */
  effortForTurn?(role: string, turn?: "red" | "green" | "review" | "refactor"): string;
  /** Unified config: a role's `--fallback-model` (auto-failover), or undefined. */
  fallbackModelForRole?(role: string): string | undefined;
  /** Unified config: a role's `--max-budget-usd` per-invocation cap, or undefined. */
  maxBudgetUsdForRole?(role: string): number | undefined;
  /** P8b: build loop granularity. "ac" (default) writes + greens one test at a
   *  time (strict per-AC TDD). "hybrid-a" batches RED+GREEN by layer (the
   *  Navigator writes a layer's failing tests in one turn, the Driver greens them
   *  together), keeping the per-AC REVIEW. Cuts turn count on multi-AC same-layer
   *  stories; gated so a rigorous run keeps strict per-AC. */
  loopGranularity?: "ac" | "hybrid-a";
  /** P8b: max test-list items per layer-batch (hybrid-a). Default 3. */
  batchCap?: number;
  onAction?(action: WorkflowAction, iteration: number): void;
}

/** Appended to the Spec Author's propose/breakdown tasks when the UI track is
 *  on, so the proposal + story breakdown account for user-facing E2E stories
 *  (the design lane's `layer: "E2E"` work), not just API surface. */
const UI_TRACK_PROPOSE = ` UI track is ON: this product has a user-facing UI (a design-brief.md is part of intake), so every user-facing capability must be deliverable end to end as an E2E story, a real browser/screen interaction a user performs, not merely an API. Frame each candidate as a user-facing increment and note which need an E2E (UI) story.`;
const UI_TRACK_BREAKDOWN = ` UI track is ON: decompose into stories that include the E2E (UI) story for each user-facing capability (a screen the user interacts with), not API-only stories.`;
const UI_TRACK_BUILD = ` UI track is ON: the UI must adhere to the project design guide at .tdd/design/design-guide.md (+ the design-guide.json tokens). Build to it.`;

// Appended to every role spawn: the artifacts ARE the deliverable; free-text
// response tokens are pure latency. Keep the model from narrating a plan,
// summarizing what it did, or printing tables/rationale to stdout (all of that
// is wasted output, the slowest part of each turn). Structured logging still
// goes through the lakebase-sftdd-log CLI, not stdout prose.
const AGENT_TERSE_SUFFIX =
  ` Be terse: produce ONLY the required artifact file(s) on disk, then stop with at most a one-line confirmation.` +
  ` Do NOT print a plan, a summary of what you did, rationale, tables, or restate the artifacts to stdout, that` +
  ` output is wasted latency. The files on disk are the deliverable, not your prose.`;

/**
 * The target story's stub (asA/iWantTo/soThat) as one inline sentence, to scope
 * the Spec Author's per-story draft prompt to exactly that story (an
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

/**
 * P2: a compact, AC-scoped REVIEW rubric the orchestrator extracts ONCE from the
 * design artifacts and passes inline, so the Navigator's review turn does not
 * reload `architecture.md` + `nfrs.md` + `design-guide.md` IN FULL for every AC
 * (the same 3 files, re-read 6x across a 6-AC story). Same data, pre-extracted:
 *   - the AC's `layer` (boundary the diff must respect),
 *   - the NFRs that apply to this story or feature-wide (id + brief), from
 *     architecture.json (the canonical NFR home), and
 *   - for a UI (E2E) AC, the design-token groups to check, from design-guide.json.
 * Best-effort: any unreadable / absent source is simply omitted (the review
 * prompt still names the full files for when more detail than the rubric is
 * needed). Returns "" when nothing could be extracted.
 */
function reviewRubric(tddDir: string, featureId: string, story: string, ac: string): string {
  const parts: string[] = [];
  const layer = readAcLayer(tddDir, featureId, ac);
  if (layer) parts.push(`layer=${layer}`);

  // NFRs scoped to this story or applied feature-wide (applies_to === featureId).
  try {
    const arch = JSON.parse(fs.readFileSync(architectureJson(tddDir, featureId), "utf8")) as {
      nfrs?: Array<{ id?: string; brief?: string; applies_to?: string }>;
    };
    const nfrs = (arch.nfrs ?? []).filter(
      (n) => n && typeof n.id === "string" && (n.applies_to === story || n.applies_to === featureId),
    );
    if (nfrs.length) {
      parts.push(`required NFRs, ${nfrs.map((n) => `${n.id}${n.brief ? ` (${n.brief})` : ""}`).join("; ")}`);
    }
  } catch {
    /* no architecture.json -> omit; prompt still names nfrs.md */
  }

  // Design-token groups to check, for a UI (E2E) AC only, the non-UI majority
  // need NO design-guide read at all.
  if (layer === "E2E") {
    try {
      const dg = JSON.parse(fs.readFileSync(designGuideJson(tddDir), "utf8")) as {
        tokens?: Record<string, unknown>;
      };
      const groups = Object.keys(dg.tokens ?? (dg as Record<string, unknown>));
      if (groups.length) parts.push(`design-token groups, ${groups.join(", ")}`);
    } catch {
      /* omit */
    }
  }

  return parts.length ? ` RUBRIC (pre-extracted; judge against THIS) :: ${parts.join(" | ")}.` : "";
}

/** Short task directive handed to a role subagent for an invoke-role action. */
/**
 * Pin the Navigator to the EXACT next-pending test, the same item the cycle
 * stamp (beginNextPendingCycle -> storyTestProgress.pending[0]) will record. The
 * Navigator must write THAT test, not pick its own: when the prompt only said
 * "write the next test", the model wandered (authored a later AC's test) while
 * the substrate stamped pending[0], so the recorded cycle test_id diverged from
 * the test actually written. Naming the test makes the agent obey the order.
 */
function nextPendingTestDirective(
  tddDir: string,
  featureId: string,
  story: string,
  loop?: "ac" | "hybrid-a",
  cap?: number,
): string {
  // P8b (hybrid-a): the Navigator writes the first pending LAYER's tests in ONE
  // turn (a layer-batch), matching the batch RED cycle the orchestration stamps
  // for those exact ids. Same single source (nextPendingBatch) the begin reads,
  // so the tests written and the stamped test_ids cannot drift.
  if (loop === "hybrid-a") {
    let batch: { id: string; ac_id: string; description: string }[] = [];
    try {
      batch = nextPendingBatch(tddDir, featureId, story, cap ?? DEFAULT_BATCH_CAP);
    } catch {
      batch = [];
    }
    if (batch.length === 0) {
      return `Write the next failing tests (RED) for story ${story}: the next un-cycled layer-batch in the test list.`;
    }
    const list = batch.map((b) => `${b.id} [ac ${b.ac_id}]: "${b.description}"`).join("; ");
    return (
      `Write the failing tests (RED) for story ${story}'s next layer-batch, EXACTLY these ${batch.length} item(s),` +
      ` in order: ${list}. Write ALL of them this turn and ONLY these (they share one layer/runner); do NOT skip ahead to` +
      ` another layer, do NOT add or drop items, the orchestration stamps ONE batch RED cycle for exactly these ids,` +
      ` and any mismatch is a defect.`
    );
  }
  let next: { id: string; ac_id: string; description: string } | undefined;
  try {
    next = storyTestProgress(tddDir, featureId, story).pending[0];
  } catch {
    next = undefined;
  }
  if (!next) {
    return `Write the next failing test (RED) for story ${story}: the next un-cycled item in the test list.`;
  }
  return (
    `Write EXACTLY ONE failing test (RED) for story ${story}: the next test in order, ${next.id} [ac ${next.ac_id}]: "${next.description}".` +
    ` Write ONLY this test. Do NOT skip ahead, do NOT combine tests, do NOT pick a different item, the orchestration stamps the RED cycle for ${next.id},` +
    ` and a mismatch between the test you write and ${next.id} is a defect.`
  );
}

/**
 * The permissive-refactor directive for the Driver's GREEN turn when the
 * Navigator has flagged PRIOR tests as superseded by the AC being greened. The
 * latest AC wins: the Driver may refactor ONLY the flagged tests (alongside the
 * code) so the honest-GREEN verify holds, and must leave every other test
 * untouched (an unflagged regression must stay failing and escalate). Empty when
 * no allowlist exists for the open AC, so a normal GREEN turn is unaffected.
 */
function supersededTestsDirective(tddDir: string, featureId: string, story: string): string {
  let acId: string | undefined;
  try {
    const prog = storyTestProgress(tddDir, featureId, story);
    acId = (prog.openRed[0] ?? prog.pending[0])?.ac_id;
  } catch {
    acId = undefined;
  }
  if (!acId) return "";
  const sup = readSupersededTests(tddDir, featureId, story, acId);
  if (!sup) return "";
  const list = sup.tests.map((t) => `  - ${t}`).join("\n");
  return (
    `\n\nSUPERSEDED TESTS: this AC (${acId}) supersedes behavior encoded in PRIOR tests the Navigator flagged` +
    ` (${sup.reason}). The latest AC wins. You MAY refactor ONLY these flagged tests to the new behavior` +
    ` (alongside the production code) so the honest-GREEN verify holds:\n${list}\n` +
    `Do NOT touch any other test; an UNflagged failing test is a genuine regression that must stay red and escalate.`
  );
}

/**
 * The Driver's REPAIR directive: the Navigator assessed the green-failure as a
 * driver-fixable regression and recorded a diagnosis + fix directive on the
 * green-failure marker. Inject both so the Driver fixes the ROOT CAUSE this turn
 * rather than re-running the same failing verify blind. Empty when the open AC
 * has no such marker.
 */
function regressionRepairDirective(tddDir: string, featureId: string, story: string): string {
  let acId: string | undefined;
  try {
    acId = storyTestProgress(tddDir, featureId, story).openRed[0]?.ac_id;
  } catch {
    acId = undefined;
  }
  if (!acId) return "";
  const gf = readGreenFailure(tddDir, featureId, story, acId);
  if (!gf?.fixDirective) return "";
  return (
    `REPAIR a driver-fixable regression in AC ${acId} (story ${story}). The honest-GREEN verify against the` +
    ` running app FAILED and the Navigator diagnosed it as a genuine regression in the code (NOT a superseded` +
    ` test):\n` +
    `  DIAGNOSIS: ${gf.diagnosis ?? gf.summary}\n` +
    `  FIX: ${gf.fixDirective}\n` +
    `Apply that fix to the PRODUCTION code (you may not edit prior tests, this is a regression, not a` +
    ` supersession). Keep the AC's own tests green. This is your ONE repair attempt: if the verify still fails` +
    ` after it, the orchestration escalates to a human with the diagnosis.`
  );
}

/**
 * Consume a pending hand-back note for this role's retry: read it, delete it
 * (consume-once), and return it as a prompt PREFIX. Empty when none is pending.
 * The orchestrator wrote it (via DriveEffects.onHandback) when the role's prior
 * turn failed its expectation contract, so the retry is informed, the role sees
 * exactly what it failed to return before it runs again.
 */
function consumeHandback(
  action: Extract<WorkflowAction, { kind: "invoke-role" }>,
  featureId: string,
  tddDir: string,
): string {
  const story = "story" in action ? action.story : undefined;
  const file = handbackFile(tddDir, featureId, action.role, story);
  if (!fs.existsSync(file)) return "";
  let note = "";
  try {
    note = fs.readFileSync(file, "utf8").trim();
    fs.rmSync(file, { force: true });
  } catch {
    return "";
  }
  return note ? `${note}\n\n` : "";
}

/** The role's task prompt, with any pending hand-back note prepended (the
 *  informed-retry feedback). */
interface BuildLoopOpts {
  loop?: "ac" | "hybrid-a";
  cap?: number;
}

function roleTask(
  action: Extract<WorkflowAction, { kind: "invoke-role" }>,
  featureId: string,
  uiTrack: boolean,
  tddDir: string,
  build?: BuildLoopOpts,
): string {
  return consumeHandback(action, featureId, tddDir) + roleTaskBody(action, featureId, uiTrack, tddDir, build);
}

/**
 * The architect's establish-vs-inherit directive for the project's architecture
 * conventions (the canonical role -> module layout). When a prior feature already
 * established them, this feature MUST reuse the same layout (the spec gate hard-
 * blocks a divergence); otherwise this feature's layout becomes the project canon
 * (the orchestrator persists it deterministically). Empty when no conventions
 * exist (the first feature simply establishes them by building normally).
 */
function architectConventionsDirective(tddDir: string): string {
  const conventions = readConventions(tddDir);
  if (!conventions) {
    return ` This is the first feature: the layered layout you declare in architecture.json (the role -> module` +
      ` paths) becomes the PROJECT-WIDE convention every later feature inherits, so choose the canonical layout deliberately.`;
  }
  const layout = conventions.layers
    .map((l) => `${l.role}=${l.module}${l.renders_via ? ` (${l.renders_via})` : ""}`)
    .join(", ");
  return ` REUSE the established project architecture conventions (set by ${conventions.established_by}): ${layout}.` +
    ` Declare the SAME role -> module paths in architecture.json, do NOT remap or rename an established layer; a` +
    ` divergent layout hard-blocks the spec gate and mismatches the inherited code.`;
}

function roleTaskBody(
  action: Extract<WorkflowAction, { kind: "invoke-role" }>,
  featureId: string,
  uiTrack: boolean,
  tddDir: string,
  build?: BuildLoopOpts,
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
  // UX Designer (UI track): translate the design brief into the project style
  // guide. Project-level, no story scope, so handle it before reading a story.
  if (action.role === "ux-designer") {
    return (
      `Translate the HIL design brief (.tdd/design/design-brief.md) into the project design system:` +
      ` write design-guide.md (visual + interaction standards), design-guide.json (the machine-checkable` +
      ` tokens: typography, colors, spacing, radius, shadows, breakpoints), and ia.md (the information` +
      ` architecture: screens, navigation, flows). This is the project-level style guide the Navigator` +
      ` and Driver build the UI against; author it once from the brief + product-overview.md.`
    );
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
        ` Write ONE file per AC as acs/<AC>.json (+ optional acs/<AC>.md), and put NOTHING else in acs/` +
        ` (no test lists, no -tests.json / -test-list.json, no scratch files, the spec gate validates every` +
        ` acs/*.json against the AC schema and rejects non-AC files).` +
        ` The AC id MUST match AC<n>-<slug>: AC1-create-form, AC2-form-accepts-input, ... (an "AC" prefix + a` +
        ` number, then a kebab slug). A bare slug id like "create-form-displays" FAILS the schema and hard-blocks` +
        ` the spec gate. The file's "id" field MUST equal its basename (acs/AC1-foo.json has {"id":"AC1-foo"}).` +
        ` Write only under story ${s}'s acs/ directory. Do not create, draft, or modify acceptance criteria for any` +
        ` other story in this feature, each other story is drafted in its own separate step that you are not` +
        ` performing now, and you will be invoked again, once per story, for the rest. Authoring more than ${s} here` +
        ` delays ${s} reaching its spec gate and build, and is rejected at the gate.`
      );
    case "architect-reviewer":
      return (
        `Annotate AC layers and nfrs.md coverage for story ${s}.` +
        ` In architecture.json, make an EXPLICIT service_backed call (required): set service_backed:true if the` +
        ` feature persists data (a DB table/migration) or carries business logic, and then you MUST declare boundary,` +
        ` service, and repository layers (plus a "models" PACKAGE app/models/ , one module per domain object, NOT a flat` +
        ` app/models.py , when it persists entities); set false ONLY for a trivial static/read-through endpoint. A not-service_backed` +
        ` declaration is cross-checked , an Infra-layer AC or a migration/schema/storage NFR while service_backed is` +
        ` false hard-blocks the gate.${architectConventionsDirective(tddDir)}`
      );
    case "test-strategist": {
      // Pass the story's AC ids INLINE so the strategist does not re-scan the
      // acs/ dir to re-derive them (a slow, error-prone step that, on a small
      // model, was the design lane's worst outlier, a single test-list took
      // ~200s of haiku thrashing on the structured output). The ids are the
      // EXACT contract the response-formatter + the per-story test-list scoping
      // enforce, so stating them up front both speeds convergence and pins the
      // ac_id mapping. Absent ids (no acs/ on disk yet) fall back to the bare
      // directive, the role still reads them from disk as before.
      const acIds = storyAcIds(tddDir, featureId, s);
      const acScope = acIds.length
        ? ` The story's ACs are: ${acIds.join(", ")}. Map every test's ac_id to one of these EXACT ids` +
          ` (verbatim, never a bare slug or an invented id), and cover each AC at least once.`
        : "";
      // Author the FEATURE MASTER (append this story; keep other stories' items).
      // The orchestration generates the per-story + per-AC views FROM the master
      // (lakebase-sftdd-test-list), so a per-story file the role writes is
      // regenerated, author the master, not the per-story file.
      return (
        `Produce story ${s}'s ordered tests and APPEND them to the feature master test list` +
        ` .tdd/features/${featureId}/test-list.json, keep every item already there for the other` +
        ` stories and add this story's. Do NOT author any test-list-per-story.json (the orchestration` +
        ` generates the per-story + per-AC views from the master).${acScope}`
      );
    }
    case "navigator":
      if (action.buildMode === "assess") {
        return (
          `ASSESS a failed honest-GREEN verify for AC ${action.ac} in story ${s}. The Driver made the current` +
          ` test pass, but the full-suite verify against the running app FAILED, some OTHER test(s) now fail.` +
          ` Inspect which tests fail and decide:\n` +
          `(a) If the current AC INTENTIONALLY supersedes behavior those failing tests encode (the latest AC` +
          ` wins; e.g. a prior feature's test asserts an outcome this AC deliberately changes), FLAG them so the` +
          ` Driver may permissively refactor ONLY those:\n` +
          `   lakebase-sftdd-cycle flag-superseded --feature ${featureId} --story ${s} --ac ${action.ac}` +
          ` --reason "<new AC + what changed>" --test <path_or_nodeid> [--test ...] --tdd-dir ${tddDir}\n` +
          `(b) If instead the failure is a GENUINE REGRESSION (the AC does NOT intend to change that behavior;` +
          ` the Driver's code is wrong), record your ROOT-CAUSE diagnosis so it travels to the Driver / the human` +
          ` instead of being lost. When the Driver can fix it, ALSO give a concrete repair directive (this routes a` +
          ` bounded Driver repair turn):\n` +
          `   lakebase-sftdd-cycle assess-regression --feature ${featureId} --story ${s} --ac ${action.ac}` +
          ` --diagnosis "<the WHY: which behavior broke + the root cause>" [--fix "<what the Driver should change>"]` +
          ` --tdd-dir ${tddDir}\n` +
          `   Include --fix ONLY when the fix is clear + within the Driver's reach (e.g. a wrong default, a missing` +
          ` filter, an off-by-one); OMIT --fix when it needs a human / a design or spec change (the orchestration` +
          ` then escalates carrying your diagnosis).\n` +
          `Flag ONLY tests the new AC truly supersedes; never flag a test just to make a red go away. For a` +
          ` regression, always write a diagnosis , never nothing.`
        );
      }
      if (action.buildMode === "review") {
        return (
          `REVIEW the implementation of AC ${action.ac} in story ${s} now that its tests are green.` +
          reviewRubric(tddDir, featureId, s, action.ac ?? "") +
          ` Judge the diff against the rubric: layer boundaries, naming, cross-cutting concerns, the required` +
          ` NFRs, and (for UI) design-token + IA adherence. The rubric above is pre-extracted from` +
          ` .tdd/features/${featureId}/architecture.md, .tdd/nfrs.md, and .tdd/design/design-guide.md, open` +
          ` those full files ONLY if you need more detail than it carries (do not re-read them by default).` +
          ` Write your verdict to` +
          ` .tdd/cycles/${featureId}/${s}/${action.ac}/review-verdict.json as {"refactor": <bool>, "notes": "<why>"}` +
          `, refactor:true only if a concrete improvement is warranted; otherwise refactor:false. Do NOT change tests.`
        );
      }
      return `${nextPendingTestDirective(tddDir, featureId, s, build?.loop, build?.cap)}${uiTrack ? UI_TRACK_BUILD : ""}`;
    case "driver":
      if (action.buildMode === "repair") {
        return regressionRepairDirective(tddDir, featureId, s);
      }
      if (action.buildMode === "refactor") {
        return (
          `REFACTOR AC ${action.ac} in story ${s} per the Navigator's review` +
          ` (.tdd/cycles/${featureId}/${s}/${action.ac}/review.json -> refactor_notes), guided by the architecture` +
          ` (.tdd/features/${featureId}/architecture.md), the NFRs (.tdd/nfrs.md), + design guide (.tdd/design/design-guide.md).` +
          ` If review.json has no refactor_notes, this refactor was queued by a BLOCKING build-quality gate (a layering /` +
          ` design-adherence / import-coupling smell in .tdd/smells.json): run that gate to see the violation` +
          ` (e.g. \`lakebase-sftdd-layering-clean --project-dir .\`) and fix exactly what it flags , typically extract the` +
          ` duplicated/misplaced code into one shared helper in its correct layer.` +
          ` Keep ALL tests green and do not change what the outer-boundary tests check, refactor only.`
        );
      }
      return (
        (build?.loop === "hybrid-a"
          ? `Make the failing tests for story ${s}'s current layer-batch ALL GREEN in one pass (simplest honest code); implement until every test in the open batch passes, then run that layer's runner once.`
          : `Make the failing test for story ${s} GREEN (simplest honest code).`) +
        (uiTrack ? UI_TRACK_BUILD : "") +
        supersededTestsDirective(tddDir, featureId, s)
      );
    default:
      return `Work story ${s}.`;
  }
}

const PIPELINE_BIN = "lakebase-sftdd-pipeline";
const EXPERIMENT_BIN = "lakebase-sftdd-experiment";
const CYCLE_BIN = "lakebase-sftdd-cycle";
const HUMAN_PROXY_BIN = "lakebase-sftdd-human-proxy";
const LOG_BIN = "lakebase-sftdd-log";
const TEST_LIST_BIN = "lakebase-sftdd-test-list";
const DEPLOY_BIN = "lakebase-sftdd-deploy";
// Promote phase, the SCM workflow CLIs (lakebase-scm-workflows). They read +
// advance the SCM ladder in .lakebase/workflow-state.json, so they take
// --project-dir (the project root), NOT --feature/--tdd-dir.
const SCM_PREPARE_PR_BIN = "lakebase-scm-prepare-pr";
const SCM_WAIT_CI_BIN = "lakebase-scm-wait-ci";
const SCM_MERGE_BIN = "lakebase-scm-merge";

// A story runs ONE experiment by default (N=1); these derive its slug + branch
// name. `cut` and `accept` (merge) BOTH compute them from here, so the branch
// cut and the branch merged back always agree. The experiment branch forks off
// (and merges into) the feature branch, which is cfg.featureBranch.
//
// The name is SANITIZED with the same helper the paired-branch substrate applies
// when it creates the branch (sanitizeBranchName: "/" -> "-", lowercase). Without
// this, cut created `experiment-s1-create-bug-exp1` (sanitized) but accept tried
// to `git merge experiment/S1-create-bug-exp1` (raw) and failed "not something we
// can merge". Sanitizing here is the single source of truth; it is idempotent on
// an already-sanitized name, so cut, accept, and replay all agree.
const EXPERIMENT_SLUG = "exp1";
const experimentBranchName = (storyId: string): string =>
  sanitizeBranchName(`experiment/${storyId}-${EXPERIMENT_SLUG}`);

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
  const deployTarget = cfg.deployTarget ?? "local";

  switch (action.kind) {
    case "invoke-role": {
      // author-requests is a HUMAN-INPUT step, not an agent task: the state
      // machine asks for the PO's feature-request.md per committed feature. The
      // machine is identical for a human and the proxy, interactive, the driver
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
      // Navigator + Driver are the BUILD roles, invoked in a tight RED/GREEN/
      // REVIEW/REFACTOR loop per AC; the artifact on disk is their only inter-role
      // channel, so correctness never depends on a retained session, only speed.
      // P5 (`buildSessionScope`): resume their `claude -p` session PER STORY by
      // default (`story`), warm context + prompt cache across a story's cycles,
      // and a FRESH session at each new story so growth is bounded to one story
      // (the per-story spec gate keeps stories small). `cycle` is the safety valve
      // (cold-spawn every turn, the prior behavior) if a long story ever overflows
      // the window ("Prompt is too long", the live smoke's S2 death). Other roles
      // resume across the whole feature (keyed by role); they are invoked a handful
      // of times so accumulation is bounded.
      const BUILD_ROLES = new Set(["navigator", "driver"]);
      const buildScope = cfg.buildSessionScope ?? "story";
      let resumeKey: string | undefined;
      if (BUILD_ROLES.has(action.role)) {
        if (buildScope === "story" && "story" in action && action.story) {
          resumeKey = `${action.role}:${action.story}`;
        } // else "cycle" -> undefined (cold per turn)
      } else {
        resumeKey = action.role;
      }
      // Per-role + per-turn `--effort` (unified config). Derive the build turn from
      // the action: navigator review|red, driver refactor|green; design roles have
      // no turn (scalar effort). When `effortForTurn` is provided (tdd-config.json)
      // it governs EVERY turn; absent, fall back to the review-only `reviewEffort`
      // (P6 default low on the navigator REVIEW, model-default elsewhere).
      const buildTurn: "red" | "green" | "review" | "refactor" | undefined =
        "buildMode" in action && action.buildMode === "review"
          ? "review"
          : "buildMode" in action && action.buildMode === "refactor"
            ? "refactor"
            : action.role === "navigator"
              ? "red"
              : action.role === "driver"
                ? "green"
                : undefined;
      const isReviewTurn = action.role === "navigator" && buildTurn === "review";
      const effort = cfg.effortForTurn
        ? cfg.effortForTurn(action.role, buildTurn)
        : isReviewTurn
          ? cfg.reviewEffort ?? "low"
          : "";
      const fallbackModel = cfg.fallbackModelForRole?.(action.role);
      const maxBudgetUsd = cfg.maxBudgetUsdForRole?.(action.role);
      const claude: DriveCommand = {
        kind: "claude",
        role: action.role,
        model: cfg.modelForRole(action.role),
        ...(resumeKey !== undefined ? { resumeKey } : {}),
        ...(effort && effort !== "default" ? { effort } : {}),
        ...(fallbackModel ? { fallbackModel } : {}),
        ...(typeof maxBudgetUsd === "number" ? { maxBudgetUsd } : {}),
        task:
          roleTask(action, f, cfg.uiTrack ?? false, cfg.tddDir, {
            loop: cfg.loopGranularity,
            cap: cfg.batchCap,
          }) + AGENT_TERSE_SUFFIX,
        replay: {
          mode: "mode" in action ? action.mode : undefined,
          story: "story" in action ? action.story : undefined,
        },
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
      // list (storyTestListJson), the exact file + field the testListReady probe
      // reads. Code-emitting it (not relying on the role) is what keeps producer
      // + probe on the single source of truth, so the design lane cannot stall
      // waiting on a per-story list the role wrote under a different name/shape.
      if (!("mode" in action) && action.role === "test-strategist") {
        cmds.push({ kind: "cli", bin: TEST_LIST_BIN, args: [cfg.tddDir, f, action.story] });
      }
      // Cycle recording is an ORCHESTRATION concern, not the role's: the
      // Navigator/Driver are pure (write the failing test / write the code +
      // run the project's tests) and never touch git or the cycle artifacts.
      // After the Navigator writes the next test, stamp the RED cycle; after
      // the Driver makes it pass, record the run + stamp GREEN. Code-emitting
      // this (vs the agent hand-writing cycle-NNN.json) is what keeps the
      // probe's red_at/green_at reading in lockstep with what was produced ,
      // the drift that stalled the live smoke.
      if (!("mode" in action) && action.role === "navigator" && "buildMode" in action && action.buildMode === "assess") {
        // After the Navigator assesses a failed GREEN verify, finalize it: mark
        // the green-failure assessed + (if the Navigator did NOT flag-supersede)
        // record the genuine-regression escalation. Whether a flag was made is
        // read from disk (superseded-tests.json), so the verdict is the role's.
        const acFlag = "ac" in action && action.ac ? ["--ac", action.ac] : [];
        cmds.push({ kind: "cli", bin: CYCLE_BIN, args: ["assess-green", "--feature", f, "--story", action.story, ...acFlag, "--tdd-dir", cfg.tddDir] });
      } else if (!("mode" in action) && action.role === "navigator") {
        const acFlag = "ac" in action && action.ac ? ["--ac", action.ac] : [];
        const verb = "buildMode" in action && action.buildMode === "review" ? "review" : "begin";
        // P8b: a `begin` (RED) under hybrid-a stamps a layer-batch cycle; pass the
        // mode + cap so the substrate batches exactly what the Navigator was told
        // to write. The review verb is unaffected (still per-AC).
        const loopFlag =
          verb === "begin" && cfg.loopGranularity === "hybrid-a"
            ? ["--loop", "hybrid-a", ...(cfg.batchCap ? ["--batch-cap", String(cfg.batchCap)] : [])]
            : [];
        cmds.push({ kind: "cli", bin: CYCLE_BIN, args: [verb, "--feature", f, "--story", action.story, ...acFlag, "--tdd-dir", cfg.tddDir, ...loopFlag] });
      }
      if (!("mode" in action) && action.role === "driver") {
        const acFlag = "ac" in action && action.ac ? ["--ac", action.ac] : [];
        const isRepair = "buildMode" in action && action.buildMode === "repair";
        const verb = "buildMode" in action && action.buildMode === "refactor" ? "refactor" : "green";
        // A repair turn re-verifies via GREEN, but with --repair so the substrate
        // consumes the one repair attempt (a still-failing verify then escalates
        // with the Navigator's diagnosis instead of routing another repair).
        const repairFlag = isRepair ? ["--repair"] : [];
        cmds.push({ kind: "cli", bin: CYCLE_BIN, args: [verb, "--feature", f, "--story", action.story, ...acFlag, "--tdd-dir", cfg.tddDir, ...repairFlag] });
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
      // `cut` requires the full set: feature + story + slug + instance, plus the
      // experiment branch to create (--branch) and the feature branch it forks
      // off (--parent). Emit them all; an unset featureBranch/instance surfaces
      // as a validation failure (see validateExperimentArgs), not a silent skip.
      return [
        {
          kind: "cli",
          bin: EXPERIMENT_BIN,
          args: [
            "cut",
            "--feature",
            f,
            "--story",
            action.story,
            "--slug",
            EXPERIMENT_SLUG,
            "--branch",
            experimentBranchName(action.story),
            "--parent",
            cfg.featureBranch ?? "",
            "--instance",
            cfg.instance ?? "",
            "--project-dir",
            cfg.projectDir,
            "--tdd-dir",
            cfg.tddDir,
          ],
        },
      ];

    case "await-acceptance": {
      // The Release Engineer (role) TAKES OVER here: it is dispatched to RUN the
      // deterministic deploy gate (`lakebase-sftdd-deploy --gate`), which starts the
      // app on the story's experiment branch, polls reachable, runs the project
      // verify, and writes the STORY-scoped deploy-evidence. So the RE is the
      // visible actor, but the deploy itself is the deterministic CLI, not the
      // model's word: if the RE narrates success without running it, no
      // deploy-evidence.json is written, deployVerified stays false, and the
      // driver does NOT accept (the honest-deploy backstop, a false narration
      // cannot pass). The CLI's --gate soft-fails (exit 0) on a real failure,
      // recording honest evidence + an escalation that the next readState routes
      // to a raise-to-hil halt. (Teardown first so a prior story's app frees the port.)
      const deployCmd =
        `./scripts/lk lakebase-sftdd-deploy --target ${deployTarget} --feature ${f} --story ${action.story}` +
        ` --lakebase-branch ${experimentBranchName(action.story)} --tdd-dir ${cfg.tddDir} --gate`;
      return [
        { kind: "cli", bin: DEPLOY_BIN, args: ["--target", deployTarget, "--project-dir", cfg.projectDir, "--stop"] },
        {
          kind: "claude",
          role: "release-engineer",
          model: cfg.modelForRole("release-engineer"),
          resumeKey: "release-engineer",
          task:
            `Take over as the Release Engineer for story ${action.story} of ${f}. Deploy it to the ${deployTarget}` +
            ` target and verify it actually serves: from the project root run exactly\n  ${deployCmd}\n` +
            `That command starts the app, polls it reachable, runs the verify suite, and writes the deploy-evidence` +
            ` the acceptance gate reads. Do NOT report success without running it, the orchestration checks the` +
            ` evidence on disk, not your word.` + AGENT_TERSE_SUFFIX,
        },
        { kind: "cli", bin: PIPELINE_BIN, args: ["await-acceptance", "--story", action.story, ...tdd] },
      ];
    }

    case "accept":
      // Merge the experiment into the feature branch (git + migrations), then
      // record the PO acceptance. collapseMigrationHeads runs at the later
      // feature->tier merge, not per-story. The experiment branch + slug match
      // what `cut` created (same experimentBranchName), and the feature branch is
      // the merge target. All `merge`-required args are emitted (validated).
      return [
        {
          kind: "cli",
          bin: EXPERIMENT_BIN,
          args: [
            "merge",
            "--feature",
            f,
            "--story",
            action.story,
            "--slug",
            EXPERIMENT_SLUG,
            "--experiment-branch",
            experimentBranchName(action.story),
            "--feature-branch",
            cfg.featureBranch ?? "",
            "--approver",
            approver,
            "--instance",
            cfg.instance ?? "",
            "--project-dir",
            cfg.projectDir,
            "--tdd-dir",
            cfg.tddDir,
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
      // Ship the merged feature, deterministically (same contract as the per-story
      // gate deploy above): the orchestration runs `lakebase-sftdd-deploy --gate`
      // for the feature (ambient feature-branch DB; no --story/--lakebase-branch),
      // which polls reachable, runs the feature verify, and writes the FEATURE-
      // scoped deploy-evidence the deploy gate reads. A failed/foreign deploy is
      // recorded as evidence + an escalation -> raise-to-hil, not an LLM claiming
      // success. (For remote targets, `lakebase-sftdd-deploy` refuses cleanly until
      // they land; that refusal surfaces as the escalation.) Teardown first.
      return [
        { kind: "cli", bin: DEPLOY_BIN, args: ["--target", deployTarget, "--project-dir", cfg.projectDir, "--stop"] },
        {
          kind: "cli",
          bin: DEPLOY_BIN,
          args: ["--target", deployTarget, "--feature", f, "--project-dir", cfg.projectDir, "--tdd-dir", cfg.tddDir, "--gate"],
        },
      ];

    case "approve-deploy-gate":
      return [
        { kind: "cli", bin: HUMAN_PROXY_BIN, args: ["--feature", f, "--gate", "deploy", "--approver", approver, "--tdd-dir", cfg.tddDir] },
      ];

    case "deploy-complete":
      // Local working-software check done -> enter the promote phase (PR review +
      // merge of the feature up to its parent tier).
      return [{ kind: "set-phase", phase: "promote" }];

    case "prepare-pr":
      // PR review step 1: push the feature branch + open the PR (SCM
      // feature-claimed -> pr-ready). The SCM CLIs operate on the SCM ladder in
      // .lakebase/workflow-state.json, so they take --project-dir, not the feature.
      return [{ kind: "cli", bin: SCM_PREPARE_PR_BIN, args: ["--project-dir", cfg.projectDir] }];

    case "wait-ci":
      // PR review step 2: wait for the PR's regression gate to go green (the
      // pr.yml ci-pr-branch check; SCM pr-ready -> ci-green).
      return [{ kind: "cli", bin: SCM_WAIT_CI_BIN, args: ["--project-dir", cfg.projectDir] }];

    case "approve-promote-gate": {
      // The HITL `promote` gate: the human/PO accepts promoting the feature to its
      // parent tier (the PR's base, e.g. staging). AFTER ci-green and BEFORE the
      // merge. The promote gate REQUIRES a non-empty promote_ref (what is being
      // promoted); the Human Proxy SKIPS the gate without one, so the orchestrator
      // must supply it, else the gate never approves and the driver loops on
      // approve-promote-gate forever (the promote-phase stall). The thing being
      // promoted is the feature's canonical branch (the merge then releases it into
      // the parent tier + runs the parent's migrations). Teeth remain the merge
      // precondition next (PR must exist + be ci-green).
      const promoteRef = cfg.featureBranch ?? f;
      return [
        {
          kind: "cli",
          bin: HUMAN_PROXY_BIN,
          args: ["--feature", f, "--gate", "promote", "--approver", approver, "--tdd-dir", cfg.tddDir, "--promote-ref", promoteRef],
        },
      ];
    }

    case "merge":
      // The promotion: merge the PR (release the feature into the parent tier) and
      // WAIT for the downstream migrate workflow to apply the migrations to the
      // parent's Lakebase branch (SCM ci-green -> merged). We wait so the merge
      // is not "done" until staging has both the code (PR merge) and the schema
      // (parent merge.yml migrate run), but with --migrate-timeout-nonfatal: the
      // GitHub merge + local fast-forward have already landed by the time the
      // poll runs, so a slow/absent downstream-migrate run is a WARNING, not a
      // 30-minute hang that fails the whole drive (a migrate run that COMPLETES
      // with failure is still fatal). Budget shortened to 10 min for the same
      // reason, the drive reaches `done` and the migrate confirms async.
      return [
        {
          kind: "cli",
          bin: SCM_MERGE_BIN,
          args: [
            "--project-dir",
            cfg.projectDir,
            "--wait-migrate",
            "--migrate-timeout-nonfatal",
            "--migrate-timeout-sec",
            "600",
          ],
        },
      ];

    case "done":
      // Feature wrap-up: switch the working tree back to the PARENT TIER as the
      // last step, so the run does not end on the just-merged (soon-deleted)
      // feature branch and the next feature forks from a clean parent. scm-merge
      // already attempts this on a clean merge, but only conditionally + it can be
      // skipped when the merge step warns/errors; this is the deterministic,
      // idempotent guarantee (a checkout to the branch you are already on is a
      // no-op). Only when the parent is known (SCM state present).
      return [
        // Force the checkout: at `done` the feature has merged and its code is
        // committed, but the per-run .tdd/.lakebase metadata (workflow-state.json,
        // selection-log.md) is dirty + tracked, so a plain `git checkout` aborts
        // ("local changes would be overwritten"). That churn is disposable here
        // (the feature is shipped), and landing on the parent is the whole point,
        // so -f discards it and switches. Mirrors the fork-guard ignoring the same
        // metadata. (scm-merge attempts this switch too but non-fatally; this is
        // the deterministic guarantee.)
        ...(cfg.parentBranch
          ? [{ kind: "cli" as const, bin: "git", args: ["checkout", "-f", cfg.parentBranch] }]
          : []),
        { kind: "set-phase", phase: "shipped" },
      ];

    case "revise-route": {
      // FEIP-7626: a SPEC-level smell the PO sends back to its owning author.
      // ONE in-process command does it atomically (no inter-command readState
      // window): record the PO's revise decision as gate events, reset the story
      // to `designing` (reviseStory: discard the experiment + reopen the gate +
      // free the lane), and resolve the smell (kind=revised, spending the
      // one-revise-per-(smell,story) budget). The standing design lane then
      // re-runs Gate 1->2->3 at the owning author and the build resumes.
      const smellName = action.source.startsWith("smell:")
        ? action.source.slice("smell:".length)
        : action.source;
      return [
        {
          kind: "cli",
          bin: HUMAN_PROXY_BIN,
          args: [
            "decide-escalation",
            "--feature",
            f,
            "--story",
            action.story,
            "--smell",
            smellName,
            "--routed-to",
            action.role,
            "--gate",
            action.gate,
            "--reason",
            action.reason,
            "--approver",
            approver,
            "--project-dir",
            cfg.projectDir,
            "--tdd-dir",
            cfg.tddDir,
          ],
        },
      ];
    }

    case "raise-to-hil":
      // Surface + halt: the escalation is already recorded under
      // .tdd/escalations/ (that is how it was detected). No CLI to run, the
      // onAction logging emits the loud "RAISED TO HIL" line + runDriver returns
      // escalated, and drive.cli exits non-zero. A no-op command list.
      return [];

    case "design-complete":
      // In the union (from the design sub-machine) but never emitted by
      // nextTransition, which rewrites it to feature-complete. No-op defensively.
      return [];
  }
}

/**
 * Compute the single next action + the commands that would carry it out,
 * without executing anything. Backs `lakebase-sftdd-drive --dry-run` ("what will
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
      // Thread the active build story so a smell-derived escalation with no story
      // scope still resolves to a story for revise-routing (FEIP-7626).
      const probe = diskArtifactProbe(cfg.tddDir, cfg.featureId, pipeline.build_active);
      const ctx = readDriveContext(cfg.tddDir, cfg.featureId, cfg.projectDir);
      const state = deriveDriveState(pipeline, probe, ctx);
      // UI track: gate the UX Designer step. uiTrack is config (env); the design
      // guide's existence is disk truth (project-level, authored once + reused).
      state.uiTrack = cfg.uiTrack ?? false;
      state.designGuideReady = fs.existsSync(designGuideJson(cfg.tddDir));
      return state;
    },
    async perform(action) {
      for (const cmd of commandsForAction(action, cfg)) {
        await cfg.runner.run(cmd);
      }
    },
    onAction: cfg.onAction,
    // Hand-back delivery: when a role's prior turn failed its expectation
    // contract, write the violation detail where THAT role's next prompt will
    // consume it (consumeHandback in roleTask), so the retry is informed.
    onHandback(handoff, detail) {
      const file = handbackFile(cfg.tddDir, cfg.featureId, handoff.responder, handoff.story);
      try {
        fs.mkdirSync(dirname(file), { recursive: true });
        fs.writeFileSync(file, `${detail}\n`, "utf8");
      } catch {
        /* best-effort: a failed hand-back just yields a blind retry, still bounded by the queue */
      }
    },
  };
}
