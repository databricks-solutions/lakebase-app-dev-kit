# Orchestrator as a deterministic driver

## Problem

The scrum-master orchestrator is an LLM (`claude -p --agent scrum-master`) that
coordinates the TDD workflow: it sequences phases (plan, design, build, deploy),
streams the per-story design pipeline, surfaces + records gates, drives the
single build lane, cuts/merges experiments, and emits the relay log.

But its routing is deterministic. Given the recorded state, the next action is a
pure function of priors:

- `workflow-state.json`: the current phase.
- `pipeline.json` (`scripts/tdd/story-pipeline.ts`): each story's status
  (`designing | awaiting-gate | ready | building | awaiting-acceptance | done |
  discarded`), the FIFO `build_queue`, the single `build_active`, the per-story
  spec gate, the experiment + acceptance records.
- `gates.json`: structured HITL gate state.

The LLM was only narrating a state machine that already exists in the substrate.
Making it an LLM cost us three things, all observed live in the FEIP-7422 smoke:

1. Latency. The orchestrator is the busiest actor (every handoff, gate, log).
   Its first turn ran ~99s on the inherited opus model; even sonnet/haiku pay
   per-turn model latency on routing that should be instant.
2. Observability. Its `phase.start` / `handoff` / `phase.end` events are
   prose-instructed `lakebase-tdd-log` calls, which haiku drops entirely (a
   whole `/plan` produced one `phase.end`) and sonnet does only because it
   happens to follow instructions. These events are NOT artifact-backed, so the
   reconcile backstop cannot reconstruct them.
3. A false model tradeoff. We spent effort tuning the orchestrator's model
   (opus, then sonnet, then haiku, then back to sonnet) trading speed against
   logging fidelity, a tradeoff that only exists because routing is an LLM turn
   at all.

## Design

Reimplement the orchestrator as a deterministic driver: a kit TS loop
(`lakebase-tdd-drive`) that owns sequencing, and uses the LLM ONLY for the role
work where judgment is genuinely required.

```
drive(feature):
  loop:
    state  = readState(workflow-state, pipeline, gates)   # in-process, instant
    action = nextTransition(state)                         # PURE, deterministic, tested
    emit(action.event)                                     # phase.start/handoff/phase.end as CODE
    switch action.kind:
      INVOKE_ROLE   -> claude -p --agent <role>            # the only LLM call
      SURFACE_GATE  -> lakebase-tdd-pipeline surface       # Human Proxy approves headless
      APPROVE_GATE  -> lakebase-tdd-pipeline approve-gate
      DISPATCH      -> lakebase-tdd-pipeline dispatch + regenerate per-story test list
      EXPERIMENT    -> lakebase-tdd-experiment cut/merge/discard
      DEPLOY        -> lakebase-tdd-deploy
      DONE          -> return
    record(action.result)
```

The heart is `nextTransition(state): Action`, a pure function over the existing
state types. It is exhaustively unit-testable (no LLM, no I/O): feed it a
pipeline state, assert the action. This is where the per-story streaming
invariant, the single-build-lane serialization, the gate ordering, and the
experiment lifecycle live as code.

### Topology

The driver is the main loop (a TS process, run by the smoke / a kit bin / a
`/tdd` command). It shells out to `claude -p --agent <role>` for each role turn
(spec-author, ux-designer, architect-reviewer, test-strategist, navigator,
driver, product-owner, release-engineer) and to the substrate CLIs/functions for
gates, experiments, deploy. Role subagents stay LLMs; the driver is code.

This also resolves the Claude Code "subagents cannot spawn subagents" constraint
cleanly: the driver (not an agent) is the spawner.

### Two runtimes, one pure core

Because routing is now code, the orchestration does not need to be a separate
`claude -p --agent scrum-master` process. The pure `nextTransition` core is
runtime-agnostic; only the EFFECTS differ. Phase 2's effect seams must abstract
`invoke-role`, `surface-gate`, and `log` so the same transition logic plugs into
either runtime:

| Effect       | Headless (smoke / CI)              | In-session (interactive, with the human) |
|--------------|------------------------------------|------------------------------------------|
| invoke-role  | shell `claude -p --agent <role>`   | spawn via the session's Agent tool (warm) |
| surface-gate | Human Proxy auto-approves          | ask the human in the conversation (real HITL) |
| log          | `lakebase-tdd-log` (code)          | same (code)                              |

The interactive runtime is the important unlock: the human's OWN Claude Code
session becomes the driver's runtime. The session calls `nextTransition`, spawns
the indicated role as a subagent (the session is the spawner, so the no-nesting
constraint never bites), surfaces gates to the human live, and loops. No
separate orchestrator process, no headless-vs-interactive split for routing, and
the whole run is observable because the human is inside it. The LLM
scrum-master agent doc is then unnecessary even for interactive use: the
deterministic core plus the session-as-runtime replaces it.

## Entry-point model (confirmed): `/sprint` + Tier-2 phase commands, no scrum-master agent

The scrum-master is removed entirely, as an agent and as a concept the human
invokes. There is no `claude --agent scrum-master`, no `agents/scrum-master.md`
scaffolded into projects, and nothing that spawns it. The orchestrator is the
deterministic driver binary; the human's control surface is a two-tier set of
slash commands, each a thin invocation of `lakebase-tdd-drive` scoped to a phase
range. Role subagents and the Human Proxy are unchanged.

A HITL gate ALWAYS pauses for a human decision (plan gate, per-story spec gate,
deploy gate). The only variable is who answers: the human live in the session,
or the Human Proxy from pre-recorded approvals headless (smoke / CI). No mode
skips a gate. "Flowing" means the run does not require the human to re-invoke a
command between phases; control still returns to the human at every gate.

### Tier 1, the sprint orchestrator: `/sprint [name]`

The top-level continuous run. It FLOWS forward: propose + author the backlog ->
[PLAN GATE] -> for each backlog feature: claim -> design -> [SPEC GATE per
story] -> build -> deploy -> [DEPLOY GATE] -> cycle ends. Re-invoked each cycle
for story refinement. Pauses at every gate (human live / Proxy headless), never
between phases. CLI scope: `lakebase-tdd-drive --sprint <name>` owns the
per-feature loop (claim + drive each feature) in one process.

### Tier 2, single-step control (run one phase, then stop + suggest next)

For when the human deliberately wants one phase, not the whole sprint. Each runs
the driver bounded to that phase, stops when the phase's gate is answered, and
PRINTS the suggested next command (no auto-advance, no proceed-prompt: the human
chose manual control by picking a Tier-2 command).

| Command | Driver scope | Stops at | Suggests |
|---------|--------------|----------|----------|
| `/plan [name]` | `--plan-only --sprint <name>` (planning sub-machine only) | plan gate | `/sprint` or `/design <feature>` |
| `/design <feature>` | `--feature <id> --only design` | design-complete (all spec gates) | `/build <feature>` |
| `/build <feature>` | `--feature <id> --only build` (requires design done) | feature built + accepted | `/deploy <feature>` |
| `/deploy <feature>` | `--feature <id> --only deploy` | deploy gate | (shipped) |
| `/spike <slug> [--for <feature>]` | not a driver phase: `lakebase-tdd-spike cut` | throwaway branch + carry-forward notes | `/design <feature>` |

`/plan` does NOT flow onward: it stops at the plan gate so the human reviews /
refines the backlog. `/sprint` is the only command that flows plan -> design ->
build -> deploy. Spikes are throwaway exploration outside the TDD loop; the new
`/spike` command + `lakebase-tdd-spike` CLI wrap the existing `spike.ts` +
`spike-carryforward.ts` substrate.

### Driver scopes (one binary)

- `--sprint <name>`: Tier 1, whole sprint (planning + per-feature loop).
- `--plan-only --sprint <name>`: planning sub-machine only (the `/plan` command).
- `--feature <id> --only <design|build|deploy>`: one phase of one feature (Tier 2).
- `--feature <id>` (unbounded): one whole feature design -> build -> deploy.

## What this subsumes / reconciles

- Subsumes the orchestrator `--model` pin (no orchestrator model at all) and the
  need to reconcile orchestrator events (the driver emits them as code).
- Keeps the role model tiering (haiku roles, artifact-backed by the reconciler)
  and the artifact reconciler (still the backstop for role artifacts).
- Complements the npx-tax fix: the driver's own state/log calls are in-process
  (0s); the ~3.5s `npx --package=github#branch` tax still applies to the role
  subagents' CLI calls and is worth fixing separately.
- Removes the LLM scrum-master agent entirely (def, scaffold, launcher, smoke,
  enum/log label, docs). The driver is the only orchestrator for both headless
  and interactive runs; the human's control surface is `/sprint` + the Tier-2
  phase commands above.

## Phases (each a commit, TDD, green suite)

1. Pure core. `scripts/tdd/orchestrator-drive.ts`: `nextTransition(state):
   Action` over workflow-state + pipeline + gates, with an `Action` union.
   Exhaustive unit tests for every state to action (planning, per-story design
   streaming, gate ordering, build-lane serialization, experiment lifecycle,
   deploy, done). No I/O.
2. Effect seams. Inject the effectful ops (invoke role, run gate CLI, cut/merge
   experiment, deploy, log) behind interfaces so the loop is testable with
   fakes; an integration test drives a whole feature with stubbed roles.
3. Real wiring + CLI. `lakebase-tdd-drive --feature <id>` wires the real effects
   (claude -p --agent, the kit CLIs). Deterministic logging built in.
4. Smoke adoption. The smoke drives via `lakebase-tdd-drive` instead of
   `claude -p --agent scrum-master`; measure latency + confirm full logging.
5. Docs. SKILL + command bodies describe the driver as the headless
   orchestrator; scrum-master.md reframed (interactive narrator; the driver is
   the deterministic path).

## Reuse (do not reinvent)

- `story-pipeline.ts` transitions (`setStoryStatus`, `surfaceForGate`,
  `approveStoryGate`, `enqueueReady`, `dispatchNext`, `completeActive`,
  `cutStoryExperiment`, `acceptStory`, `discardStory`, `reviseStory`,
  `findBatchedDraftStories`) are the state mutations; the driver decides WHEN to
  call them.
- `agent-log.ts` `emitAgentLogEvent` for deterministic phase/handoff logging.
- `agent-models.ts` `resolveModelForRole` to pick each role's `--model`.
- `log-reconcile.ts` stays as the role-artifact backstop.
