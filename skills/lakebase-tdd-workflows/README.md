# lakebase-tdd-workflows

Substrate for test-driven development on paired Lakebase branches. Canonical Beck-style RED → GREEN → REFACTOR composed with paired-branch primitives (cheap experiments, parent-aware schema diff, real per-branch databases) and HITL gates at every phase boundary.

This README is the human-facing overview. The agent's operating contract – hard rules, function names, code patterns – lives in [`SKILL.md`](SKILL.md).

## When to use

- A new feature needs a spec authored, architected, and test-listed.
- A feature needs cutting, running, and tearing down on a paired branch.
- A TDD cycle (RED → GREEN → REFACTOR) needs running against a per-branch Lakebase DB.
- Multiple parallel experiments need comparing and a winner promoted or synthesized.
- Bad smells (test list drift, cycle stall, fragility) need detecting and surfacing to a Product Owner.

## Lexicon

| Term | Definition |
|---|---|
| **Feature** | A user-facing capability. Decomposes into stories with ACs. The durable unit: one feature branch is claimed / PR'd / merged-to-trunk / tier-promoted / deployed-per-sprint. |
| **Story** | A slice of a feature with its own ACs. The unit of the streaming design->build pipeline, and the scope an experiment is built at. |
| **AC** | Acceptance Criterion. One observable behavior. Tagged `[API]` / `[E2E]` / `[Infra]`. |
| **Test list** | Beck's planning artifact. Ordered list of behavioral scenarios that define done. Feature-level master, scoped per story for the build lane. |
| **Cycle** | One RED → GREEN → REFACTOR pass for a single test list item. |
| **Spike** | Throwaway exploration on a Lakebase branch. No test list, no rigor. Goal: learn. Code is never merged, only the learning carries forward. Attaches to a feature OR a story. |
| **Experiment** | A rigorous, isolated TDD branch (test list, cycles, working code + tests) forked from feature-branch HEAD, scoped to a **story**. N=1 (default) = the story's one isolated build; N>=2 = competing strategies for that story. The PO reviews it as working software, then accepts (merge), discards, or sends back to revise. |
| **N=1 (the default)** | One experiment per story, iterative refinement. No promote/synthesize ceremony, no compare report. What most stories look like. |
| **N≥2 (parallel experiments)** | Deliberate race between competing strategies for a story. Used when the design-spec gate finds opinion gaps the team wants to resolve by trying them. HITL chooses promote vs synthesize among that story's experiments. |
| **merge** | (PO accept) Take a story's experiment into the feature branch: a real git-merge of its code PLUS running its migrations against the feature branch's Lakebase DB. Then the experiment branch is torn down. Distinct from the SCM feature->trunk merge. |
| **discard / revise** | (PO reject) Tear down the experiment with no trace: `discard` drops the story from the sprint; `revise` sends it back to designing for a re-spec. |
| **Promote** | (N≥2 only) Take one of a story's competing experiments as-is; the losers are archived. The winner then merges into the feature. |
| **Synthesize** | (N≥2 only) PO menu-picks capabilities across a story's experiments; spec is renegotiated; a fresh experiment produces the final code. |
| **Bad smell** | A pattern the orchestrator detects that signals the workflow is sliding. Surfaces a proposed remediation to the HITL. |
| **Adapter** | Pluggable component that syncs the spec format to/from an external tracker (JIRA, Linear, GitHub Issues, plain markdown). |

The substrate API keeps "experiment" as the noun for the rigorous TDD branch; it is scoped to a story (N=1 is one experiment per story, N>=2 races several). The feature branch is the durable integration unit each accepted experiment merges into.

## Roles

| Role | Responsibility | Agent prompt |
|---|---|---|
| **Feature Requester** | Writes `feature-request.md`, the original ask. The Spec Author's INPUT; read but never overwritten. | The human (or upstream PM). |
| **Spec Author** | Reads the Feature Requester's `feature-request.md` and the PO's `product-overview.md`, and turns them into the structured draft spec (`feature-spec.{md,json}`, stories, ACs). | [`agents/spec-author.md`](agents/spec-author.md) (first phase of `/design`). |
| **UX Designer** | The experience lens (UI projects only). Owns the design guide + information architecture and ensures downstream UI adheres to them. | [`agents/ux-designer.md`](agents/ux-designer.md) |
| **Architect Reviewer** | Applies layering lens; populates `layer` and `architectural_notes` per AC; imports `software-design-principles`. | [`agents/architect-reviewer.md`](agents/architect-reviewer.md) |
| **Test Strategist** | Converts annotated ACs into a Beck-style ordered test list; emits per-AC views. | [`agents/test-strategist.md`](agents/test-strategist.md) |
| **Orchestrator** | The deterministic driver (`lakebase-tdd-drive`), not an agent. Routes over `workflow-state.json`: runs the design-spec gate; spawns experiments to budget; runs cycles; watches smells; presents outcomes to HITL. | `lakebase-tdd-drive` (code, not an agent def). |
| **Navigator** | PLAN, RED (writes failing tests), REVIEW. Never weakens an assertion. | [`agents/navigator.md`](agents/navigator.md) |
| **Driver** | GREEN (minimal honest code), REFACTOR. Never deletes or weakens a test. | [`agents/driver.md`](agents/driver.md) |
| **Product Owner / HITL** | Owns the project-level `product-overview.md` (open-ended intent; software is a product), ACs, test list ordering. Decides promote vs synthesize. Owns every gate. | The human. |

## Phases and gates

| Phase | Output | HITL gate |
|---|---|---|
| 0 Discovery | Draft `feature-spec.{md,json}` + `story.{md,json}` + `ac.{md,json}` per AC | **Gate 1 – Draft spec** |
| 1 Architectural review | Layer + architectural_notes populated; `architecture.md` summary | **Gate 2 – Architectural lens** |
| 2 Test-list construction | Ordered `test-list.{md,json}` at feature level | **Gate 3 – Test list ordering** |
| 3 Design-spec gate | Experiment plan in `selection-log.md` (N, strategies, budget) | **Gate 4 – Experiment plan** |
| 4 Implementation | Per-experiment cycles producing tests + code | Continuous: smells; final: promote / synthesize choice |

Each phase has a defined predecessor + artifact contract. The orchestrator refuses to transition if prior artifacts are missing or invalid.

## Operations

What the substrate does on your behalf, in user-journey order. You don't invoke these directly – the agent does, in response to the prompts in [How to use](#how-to-use).

### 1. Design-spec gate

Once the test list is approved (Gate 3), the agent runs the design-spec gate analyzer – phase 3. It scans the list for opinion-gap signals (keywords like "either", "consider", "alternatively", "decide", "TBD") and proposes either N=1 (iterative refinement) or N≥2 (parallel race), with strategies and a resource budget (concurrent branches, wall-clock minutes, agent-pair count).

The proposal is conservative by design: the analyzer's job is to surface the choice to the PO, not to decide. The PO signs off at Gate 4. The plan and the decision are persisted here:

```
.tdd/
  features/
    F1-checkout/
      plan.json                  ← { feature_id, N, mode, strategies[], budget, rationale }
  selection-log.md               ← append-only HITL decision record (every gate)
```

### 2. Experiment

With a story's plan approved, the agent cuts branches per the plan – one for N=1, multiple for N≥2 – forked from feature HEAD, and runs cycles against them in phase 4 (Implementation). Experiments are scoped to the story: `experiments/<feature>/<story>/<slug>/`.

```
.tdd/
  experiments/
    F1-checkout/
      S1-submit/                 ← the story
        s1-submit/               ← single experiment (N=1) – the story's build
          branch.txt             ← Lakebase branch id (forked from the feature branch)
          notes.md               ← strategy + learning notes
          outcomes.json          ← { status, tests_passed, tests_failed, schema_diff_summary, ... }
          timeline.json          ← per-cycle + smell history
        exp-postgres-arrays/     ← parallel experiment (N≥2) for this story
          ...
        exp-json-blob/
          ...
        _archive/                ← losers from a promote decision land here
          exp-json-blob/
```

Teardown is HITL-gated: the experiment record is preserved on disk by default even when the Lakebase branch is removed, so the learning survives. The orchestrator proposes deletions to the Product Owner; it never tears down unilaterally.

### 3. Spike

Side-mode for exploration that sits outside the main flow. No test list, no gates, no rigor. The agent runs this when you ask to "spike X" or "explore whether Y is possible" – typically before authoring a spec, to de-risk a choice you'll later put into the design-spec gate.

```
.tdd/
  spikes/
    explore-cart-storage/
      branch.txt                 ← Lakebase branch id (often deleted shortly after)
      notes.md                   ← learning that carries forward; survives branch teardown
```

The branch is deleted by default after notes are captured. **Spike code is never promoted into a TDD branch** – only the learning carries over.

**Spike → design-spec carry-forward.** Tag a spike with the feature it informs (either YAML frontmatter `for_feature: F1-checkout` or a body line `For feature: F1-checkout`, with `feature:`, `feature_id:`, and `for_feature:` all accepted, tolerant of markdown bold). When that feature later goes through `analyzeForGate`, the analyzer's `proposed_plan.spike_inputs[]` automatically lists every matching spike with a short notes preview. The orchestrator surfaces these to the PO at Gate 4 and `attachSpikeInputs` persists the kept ones onto `plan.json` so the experiment record always carries the rationale.

Before cutting any new experiment, the orchestrator checks the budget – at the concurrent-branch or wall-clock limit, it asks the PO to extend or stop, rather than cutting anyway. The plan also carries a `budget.per_experiment` cap (default 30 cycles + 60 minutes wall-clock) so one runaway experiment cannot starve its siblings: `checkPerExperimentCap` fires when an experiment crosses its cycle or wall-clock threshold, `recordExperimentCap` writes a `capped: { reason, at_cycle, ... }` record onto `outcomes.json`, and the comparison report tags the experiment with a `capped` signal and prompts the PO to `extend`, `abandon`, or `continue-suite`.

### 4. Cycle (RED / GREEN / REFACTOR)

Inside an experiment branch the orchestrator advances one test-list item at a time through a Beck-style cycle. Each cycle is persisted as a JSON artifact under `.tdd/experiments/<feature>/<slug>/cycles/<cycleId>.json`, with stage transitions (`PLAN` → `RED` → `GREEN` → `REFACTOR`), the verdict (`passed | failed | skipped`), runner output, and any smells flagged during the cycle. The cycle primitives (`beginCycle`, `recordRunnerOutcome`, `markGreen`, `markRefactored`, `flagSmells`) are the only sanctioned way to write that history – the agent never edits cycle JSON by hand.

### 5. Smells

After every cycle, and at each gate transition, the orchestrator runs the detector catalog (`detectAll`) over the feature state and writes any hits to `.tdd/features/<feature>/smells.json`. A hit surfaces a proposed remediation to the HITL – the orchestrator does not auto-fix. The catalog covers: cycle stall, fragility ratio, test cost spiral, test deletion attempts, boundary violations, test-list drift, API coherence drift, cross-experiment divergence, dead-requirement signal, and E2E-row perma-red.

### 6. Comparison, promote, synthesize (N≥2)

At convergence of a parallel race, the orchestrator builds a `ComparisonReport` (`compareExperiments`) – one row per experiment with tag-matrix outcomes, plus a Markdown render written next to the feature. The PO then chooses:

- **Promote** (`promoteExperiment`) – one experiment becomes the feature PR; losers are moved to `_archive/`.
- **Synthesize** (`synthesizeExperiments`) – PO picks capabilities across experiments; the spec is renegotiated and a fresh branch runs the next cycle.
- **Archive** (`archiveExperiment`) – move an experiment record into `_archive/` without promoting.

Both promote and synthesize require `hitlApproved: true` at the function boundary; the gate cannot be skipped programmatically.

Experiments that hit a per-experiment cap (`max_cycles` or `max_wall_clock_minutes`) appear in the report with signal `capped` and a new `Cap` column showing the reason. The HITL decision block then lists capped experiments separately and prompts the PO to choose `extend` (raise the cap and resume via `clearExperimentCap`), `abandon` (archive this experiment, let siblings continue), or `continue-suite` (leave it capped and decide at end).

### 7. Gates and integrity

Every HITL decision is recorded in `.tdd/features/<feature>/gates.json` via `approveGate` / `withdrawGate`. `verifyGateIntegrity` hashes the artifacts referenced by an approved gate (`hashArtifact`, `normalizeForHash`) and reports drift if the underlying files have changed since approval. `withGatesLock` serializes concurrent writes to the gates file so two agents (e.g. Navigator + Driver running in parallel) cannot corrupt state. `migrateGatesFromSelectionLog` upgrades legacy projects that pre-date the gates schema.

## How to use

Three flows – shown as what you'd prompt your agent to do, using a cart-checkout example throughout. The deterministic orchestrator (`lakebase-tdd-drive`) routes the work and spawns the role agents (Navigator, Driver, and the rest), which read their prompts and run the underlying substrate primitives on your behalf.

The project-level slash commands `/design` and `/build` are the canonical entry points. They're thin wrappers around this substrate, scaffolded into new projects by `lakebase-create-project` under `.claude/commands/` (opt-out via `--skip-commands`). Projects extend them with their own concerns (JIRA hierarchy, IDE branch suggestions, manual review gates) by dropping sibling `design.{pre,post}-hook.md` or `build.{pre,post}-hook.md` files next to the scaffolded command. If a slash command isn't installed in your project, just describe what you want to your agent directly; the prompts below work either way.

### 1. Author a feature spec

Just describe what you want to build. The design agent walks Spec Author → Architect Reviewer → Test Strategist and asks you to sign off at each HITL gate; you don't need to tell it about schemas, file layout, IDs, or which questions to ask – that's its job.

> `/design`

…or describe it freeform:

> "I want to build a checkout flow. A shopper should be able to submit their cart and get back an order id with a 201. Empty carts should be rejected with a 400. There'll be more behaviors later (inventory checks, payment) but start with just place-order. Walk me through drafting the spec."

When you're done, your `.tdd/features/F1-checkout/` tree has the feature, stories, ACs, architecture notes, and an ordered test list. If you'd rather author by hand, copy `templates/tdd-bootstrap/.tdd/` into your project and edit the files using [`references/spec-format.md`](references/spec-format.md) as the layout reference.

### 2. Build a feature end-to-end (the N=1 default)

The most common flow. One feature, one branch, iterative refinement. The branch IS the feature.

> `/build F1-checkout`

…or:

> "Build the checkout feature."

The orchestrator picks up the approved spec, runs the design-spec gate (which proposes N=1 for work without opinion gaps), waits for your sign-off, cuts the feature branch off staging, and alternates Navigator + Driver per test list item. After every cycle it runs the smell detectors and pauses to surface any remediation to you. When the list is exhausted, the feature branch goes straight to PR – no promote/synthesize step.

### 3. Race parallel experiments and either promote or synthesize (N≥2)

When the team has a real opinion gap and wants to resolve it by trying competing strategies. You name the strategies; the agent runs them in parallel.

> "Build the checkout feature, but I want to compare two ways of storing the cart – one as a Postgres array column on orders, one as a JSON blob on a separate carts table. Race them and let me pick a winner."

The orchestrator cuts a branch per strategy, runs the same test list through each, and at convergence presents the comparison report. It asks you to choose:

- **Promote** – one experiment is the clear winner; take it as-is into the feature PR.
- **Synthesize** – pick capabilities across the experiments (storage schema from one, API surface from the other), renegotiate the spec, and run a fresh cycle on a synthesized branch.
- **Continue** – let cycles finish.
- **Abandon all** – stalled population; re-run the design-spec gate.

The `hitlApproved` flag on the promote and synthesize primitives is enforced at the function boundary, so the agent cannot skip this gate.

### CLI cheat sheet

For when you want to run something directly without the agent. Most TDD work goes through `/design` and `/build`; these are useful for debugging or one-off introspection.

| Command | Purpose |
|---|---|
| `lakebase-feature-status <featureId> [--tdd <dir>] [--json]` | One-screen snapshot of a feature's TDD workflow state (phase, plan, test-list completion, experiments, recent decisions, open smells). |
| `lakebase-infra-runner [--instance <id>] [--branch <id>] [--project-dir <path>] [--comparison-branch <id>] [--junit-output <file>]` | Run the `[Infra]`-tag suite against a paired Lakebase branch. Backs the scaffolded `test:infra` script; reads `LAKEBASE_PROJECT_ID` / `LAKEBASE_BRANCH_ID` when flags are absent. Emits JUnit XML when `--junit-output` is set. |
| `node dist/scripts/tdd/spec-sync.cli.js <tddDir>` | Walk the `.tdd/` tree and print drift reports. Exit 0 even when reports exist (warn-only by design). |
| `node dist/scripts/tdd/test-list.cli.js <tddDir> <featureId> [storyId]` | Regenerate per-AC views from the feature-level master test list. With a `storyId`, instead write that story's scoped per-story test list (`stories/<story>/test-list-per-story.json`), the streaming build lane's per-story input. |
| `bash tests/run_all.sh` (per scaffolded project) | Run every `validate_*.sh` in the project's `tests/` directory (the project's full validation suite). |

## Project-level entry points

- **`/design`** – wraps Spec Author + Architect Reviewer + Test Strategist phases. Scaffolded into new projects by `lakebase-create-project`. Project-specific JIRA hierarchy creation lives in `design.pre-hook.md`.
- **`/build`** – wraps Orchestrator. Scaffolded into new projects by `lakebase-create-project`. Project-specific PR/merge ceremony lives in `build.post-hook.md`.
- **`/ship`** – lives in `lakebase-release-workflows`. Not part of this skill.

The substrate itself ships no installed slash commands; the scaffolder writes the command files into the project at `lakebase-create-project` time (templated, with a kit-version pin). The substrate's runtime surface stays skills + agents + scripts + CLI bins. The MCP server (`apps/mcp-server/`) exposes the tool surface for MCP-capable consumers.

## Agents

The role agents under [`agents/`](agents/) are invokable directly with `@lakebase-tdd-workflows/<agent-name>` in Claude Code, or spawned by the deterministic orchestrator (`lakebase-tdd-drive`) when it delegates a phase. Each agent file is a self-contained prompt; the orchestrator (code, not an agent) coordinates them.

| Agent | File | Invoked when |
|---|---|---|
| Architect Reviewer | [`agents/architect-reviewer.md`](agents/architect-reviewer.md) | Phase 1. Applies the layering lens to each AC and populates `layer` + `architectural_notes`. Imports `software-design-principles`. |
| Test Strategist | [`agents/test-strategist.md`](agents/test-strategist.md) | Phase 2. Converts annotated ACs into the ordered master test list and emits per-AC views. |
| Navigator | [`agents/navigator.md`](agents/navigator.md) | Each cycle, RED step. Writes the failing test for the current test-list item and reviews the Driver's GREEN code. Never weakens an assertion. |
| Driver | [`agents/driver.md`](agents/driver.md) | Each cycle, GREEN + REFACTOR steps. Writes the minimal honest code to make the failing test pass, then cleans up. Never deletes or weakens a test. |

## Under the covers (JS/TS primitives)

The substrate's behavior is exposed as a TypeScript surface under `scripts/tdd/`. The agents call these; you can also call them directly from a Node script or from your own tooling. Import paths shown are the in-repo source paths; published consumers import from the kit package.

```ts
import { cutExperiment, listExperiments, deleteExperiment } from "@databricks-solutions/lakebase-app-dev-kit/scripts/tdd/experiment.js";
```

### Experiments and spikes

| Primitive | Purpose |
|---|---|
| `cutExperiment(args)` | Cut a paired Lakebase branch for an experiment and write its record under `.tdd/experiments/<feature>/<slug>/`. |
| `listExperiments(tddDir, featureId)` | Enumerate experiment records for a feature. |
| `readOutcomes(tddDir, featureId, slug)` / `writeOutcomes(...)` | Read/write the per-experiment `outcomes.json` (tag matrix, tests passed/failed, schema diff summary). |
| `recordTagRun(outcomes, tag, verdict)` / `tagRunCount(outcomes, tag)` / `acLayerToTag(layer)` | Helpers for maintaining the tag-matrix bookkeeping on `outcomes.json`. |
| `deleteExperiment(args)` | Tear down a Lakebase branch and (optionally) the on-disk experiment record. HITL-gated. |
| `cutSpike(args)` / `listSpikes(tddDir)` / `deleteSpike(args)` | Same lifecycle for the spike side-mode under `.tdd/spikes/`. |
| `collectSpikeInputs({ tddDir, featureId })` / `attachSpikeInputs(args)` | Scan `.tdd/spikes/` for notes tagged with a feature id (via YAML frontmatter or body line) and persist the resolved inputs onto the feature's `plan.json`. |
| `archiveExperiment(args)` | Move an experiment record into `_archive/` without tearing down its branch. |
| `checkPerExperimentCap(args)` / `recordExperimentCap(args)` / `clearExperimentCap(args)` | Per-experiment cap helpers. `checkPerExperimentCap` is a pure read; `recordExperimentCap` writes `outcomes.capped`; `clearExperimentCap` removes it on the PO's `extend` reply. |

### Cycle and runner

| Primitive | Purpose |
|---|---|
| `beginCycle({ tddDir, featureId, slug, acId, stage })` | Start a new RED/GREEN/REFACTOR cycle and return the cycle artifact. |
| `nextCycleId(scope)` / `listCycles(scope)` | Cycle-id allocation and history walk. |
| `writeCycleArtifact(scope, artifact)` / `readCycleArtifact(scope, cycleId)` | Low-level cycle artifact IO; prefer `beginCycle` + the stage helpers. |
| `recordRunnerOutcome(args)` | Attach a test-runner outcome (pass/fail/skip + raw output) to a cycle. |
| `markGreen(scope, cycleId)` / `markRefactored(scope, cycleId, notes?)` / `flagSmells(scope, cycleId, smells)` | Stage transitions on an in-flight cycle. |
| `readAcLayer(tddDir, featureId, acId)` | Resolve the architect-assigned layer for an AC. |
| `openBranchDsn(args)` | Open a per-branch Postgres DSN for the cycle's runner (delegates to `lakebase-scm-workflows`). |

### Test list

| Primitive | Purpose |
|---|---|
| `readMasterTestList(tddDir, featureId)` / `writeMasterTestList(tddDir, list)` | Read/write the feature-level ordered test list. |
| `viewByAc(list, acId)` / `viewsForAllAcs(list)` | Build per-AC slices of the master list. |
| `writePerAcViews(tddDir, featureId, list)` | Regenerate the per-AC view files on disk (also what `test-list.cli.js` calls). |
| `mutateTestList(args)` | Authorized mutation path: enforces ordering invariants and rejects unsafe deletes. Throws `TestListImmutabilityError` when the list is gate-protected. |
| `isTestListProtected(featureId, opts?)` | True once Gate 3 has approved the list; further mutation requires explicit reopen. |

### Plan and design-spec gate

| Primitive | Purpose |
|---|---|
| `analyzeForGate(input, options?)` | The design-spec analyzer. Scans the approved test list for opinion-gap signals and returns an `ExperimentPlan` proposal (N, strategies, budget incl. `per_experiment` default cap, rationale, plus `spike_inputs[]` populated automatically from any tagged spike under `.tdd/spikes/`). |
| `recordPlan(tddDir, plan, deciderEmail?)` | Persist an approved plan to `plan.json` and append the decision to `selection-log.md`. |
| `readPlan(tddDir, featureId)` / `writePlan(tddDir, plan)` | Direct plan IO. |
| `checkE2eGate({ tddDir, featureId })` | Pre-merge guard: refuses to advance if any `[E2E]`-tagged AC is still red. |

### Gates and integrity

| Primitive | Purpose |
|---|---|
| `approveGate({ featureId, gate, decider, artifacts })` | Record HITL approval for one of `spec | plan | test_list | promote`. Throws `GateAlreadyClosedError` on double-approve. |
| `withdrawGate(args)` | Revoke a previously approved gate (e.g. after a smell flags drift). |
| `verifyGateIntegrity({ tddDir, featureId, gate })` | Re-hash referenced artifacts and report drift since approval. |
| `readGates(featureId, opts?)` / `writeGates(state, opts?)` / `defaultGatesState(featureId)` | Direct gate-state IO. |
| `withGatesLock(featureId, fn, opts?)` | Serialize concurrent writes; throws `GatesLockBusyError` if another process holds the lock. |
| `migrateGatesFromSelectionLog(args)` | One-shot migration for legacy projects that pre-date `gates.json`. |
| `hashArtifact(content)` / `normalizeForHash(content)` | Content-addressable hashing used by gate integrity checks. |

### Comparison, promote, synthesize

| Primitive | Purpose |
|---|---|
| `compareExperiments(tddDir, featureId)` | Build a `ComparisonReport` (rows + tag matrix) over a feature's experiments. |
| `writeComparisonReport(args)` / `renderComparisonReport(report)` | Persist and render the Markdown comparison artifact. |
| `promoteExperiment({ tddDir, featureId, slug, hitlApproved })` | Promote one experiment into the feature PR; archive the rest. `hitlApproved` is mandatory. |
| `synthesizeExperiments({ tddDir, featureId, picks, hitlApproved })` | Cut a fresh synthesis branch built from capabilities picked across experiments. `hitlApproved` is mandatory. |

### Smells

| Primitive | Purpose |
|---|---|
| `detectAll(input)` | Run every detector in `SMELL_CATALOG` against the current feature state. |
| `detectCycleStall` / `detectFragilityRatio` / `detectTestCostSpiral` / `detectTestDeletionAttempt` / `detectBoundaryViolation` / `detectTestListDrift` / `detectApiCoherenceDrift` / `detectCrossExperimentDivergence` / `detectDeadRequirementSignal` / `detectE2eRowPermaRed` | Individual detectors; call directly when you want to bound the scope. |
| `runDetectorsForScope(scope, input)` | Run the subset of detectors appropriate to a given scope (cycle, gate, comparison). |
| `readSmellsLog(tddDir)` / `writeSmellsLog(tddDir, hits)` | Read/write the persisted smells log. |
| `SMELL_CATALOG` | The canonical catalog of detectors with id, description, and severity. |

### Budget

| Primitive | Purpose |
|---|---|
| `snapshotBudget(tddDir, featureId)` | Current usage (open experiment count, wall-clock minutes spent) against the approved plan budget. |
| `checkBudget(snapshot)` | Compute violations from a snapshot. |
| `canCutAnotherExperiment(tddDir, featureId)` | Pre-flight check used by the orchestrator before `cutExperiment`. |

### Spec IO and validation

| Primitive | Purpose |
|---|---|
| `readFeature(tddDir, featureId)` / `writeFeature(tddDir, feature)` | Read/write the feature record (`.tdd/features/<id>/feature-spec.json`). |
| `readWorkflowState(tddDir)` / `writeWorkflowState(tddDir, state)` | Cross-feature workflow pointer (which feature is "current", last gate, etc.). |
| `validateSpec(tddDir)` | Walk the `.tdd/` tree and return `DriftReport[]`. Backs `spec-sync.cli.js`. |
| `writeArtifact(args)` / `listArtifacts(tddDir, featureId, kind?)` / `readArtifact(args)` | Generic artifact IO under `.tdd/features/<id>/artifacts/`. |

### Status

| Primitive | Purpose |
|---|---|
| `getFeatureStatus(tddDir, featureId)` | Build a `FeatureStatusSnapshot` (phase, plan, test-list summary, experiments, recent decisions, open smells). |
| `renderFeatureStatus(snapshot)` | Pretty-print the snapshot for terminals. Backs `lakebase-feature-status`. |

### Parallel runner

| Primitive | Purpose |
|---|---|
| `runExperimentsInParallel<T>(args)` | Fan out a worker function across N experiments with concurrency + per-task timeout, collecting `ExperimentRunResult<T>` for each. Used by the orchestrator when racing strategies under N≥2. |

### Spec adapters

`SpecAdapter` is the pluggable surface that syncs `.tdd/` entities to/from an external tracker. The skill ships two implementations:

- `markdownAdapter` (instance) / `MarkdownAdapter` (class) – the default; treats the on-disk Markdown + JSON pair as the source of truth. `pushFeature` / `pushStory` / `pushAC` emit typed external_ids (`markdown:feature:<id>` / `markdown:story:<feature>:<id>` / `markdown:ac:_:<story>:<id>`). `pull(externalId, ctx)` resolves the matching entity from disk and also accepts the legacy `markdown:<id>` shape via a tree scan for backward compatibility.
- `JiraAdapter` (constructed with `JiraAdapterConfig`) – mirrors features/stories/ACs to JIRA hierarchy. Configured by the project's `design.pre-hook.md` in scaffolded projects.

Implement your own adapter against the `SpecAdapter` interface (with the `SyncEventHooks` lifecycle) to bridge to Linear, GitHub Issues, or any other tracker.

## Integration with sibling skills

- **[`lakebase-scm-workflows`](../lakebase-scm-workflows/README.md)** – `createFeatureBranch`, `deleteBranch`, `getSchemaDiff`, `getConnection`. Experiments and spikes are paired branches.
- **`lakebase-release-workflows`** – Tier model (feature → staging → production), TTL, "never delete production." TDD defers to release-workflows for everything past PR merge.
- **[`software-design-principles`](../software-design-principles/SKILL.md)** – Imported as canon by Architect Reviewer (layering + cross-cutting concerns) and Navigator (refactor heuristics).
