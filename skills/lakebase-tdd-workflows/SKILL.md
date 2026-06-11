---
name: lakebase-tdd-workflows
description: "Test-driven development against paired Lakebase branches. Canonical Beck-style RED-GREEN-REFACTOR composed with paired-branch primitives (cheap experiments, parent-aware schema diff, real per-branch databases). Use when planning a new feature, running design-spec gates, running TDD cycles, comparing parallel experiments, or detecting workflow bad smells. Imports software-design-principles canon. Builds on lakebase-scm-workflows + lakebase-release-workflows."
user-invocable: true
---

# lakebase-tdd-workflows – agent contract

Agent-facing contract: hard rules, phase flow, agent prompt index, and concrete code patterns for the substrate primitives.

For the human-facing overview (lexicon, roles narrative, how-to-use prompts, project entry points) see [`README.md`](README.md).

## Hard rules

The contract every agent (Navigator, Driver, Orchestrator) and every human collaborator must honor.

1. Tests are immutable until the test list itself is renegotiated through the PO. Never delete or weaken a test to make it pass.
2. "Minimal code" means minimal *honest* code that satisfies the current test list, not just the current test. Use the test list as your horizon.
3. After every GREEN, ask: "would a fresh reader infer the right concept from this API now?" If no, request REFACTOR before the next test.
4. Test at the outermost public boundary that maps to the AC. Inner-loop unit tests are reserved for pure logic that can't be exercised through the outer boundary.
5. A correct refactor should not change the outer-boundary tests. A refactor that requires editing tests is suspect.
6. Never make a private method public to test it.
7. Test count is a lagging indicator. The leading indicator is "how cheap is the next test?" Rising cost = design problem.
8. Spike code is throwaway. Promote nothing from a spike branch into a TDD branch except notes.
9. Experiments are scoped to a story (the branch forks from feature HEAD). N=1 is one experiment per story (iterative refinement, no promote/synthesize ceremony); N>=2 races competing strategies for that story. The PO accepts a story's experiment by **merge** (git-merge + run its migrations against the feature branch DB), or discards/revises it.

See [`agents/navigator.md`](agents/navigator.md) and [`agents/driver.md`](agents/driver.md) for per-role specializations.

## Phases and gates

Gates are keyed (not numbered): `spec` / `plan` / `test_list` / `promote` / `deploy`. The design lane runs PER STORY (it streams), and experiments + plans are per-story.

| Step (per story unless noted) | Output | HITL gate |
|---|---|---|
| Spec drafting | `feature-spec.{md,json}` (feature) + per-story `story.{md,json}` + `acs/<AC>.{md,json}` | **`spec` gate** |
| Architectural review | `layer` + `architectural_notes` on each AC; `architecture.{md,json}` (holds the NFRs) | folds into the `spec` gate |
| Test-list construction | per-story `test-list-per-story.json` (scoped from the feature `test-list.{md,json}`) | **`test_list` gate** |
| Build (per AC) | cut a per-story experiment; RED -> GREEN -> REVIEW -> REFACTOR cycles producing tests + code | Continuous: smells; per story: **accept (merge) / discard / revise** |
| Deploy | working software on the experiment branch (reachable + verify) | **`deploy` gate** |

Sprint planning has its own **`plan` gate**. For N>=2 experiments within a story, the menu-pick promote/synthesize decision is recorded under `synthesis/<F>/`. Refuse to transition if prior-step artifacts are missing or invalid.

The phases + gates above are the PER-FEATURE pipeline that `/design` (phases 0 to 2 + gates 1 to 4) and `/build` (phase 4) run. They sit inside a larger orchestrated loop:

## Orchestrated commands (the dev loop)

Every command is a thin invocation of the deterministic orchestrator driver (`lakebase-tdd-drive`), scoped to a phase range. The driver sequences the work and spawns each role as a subagent (`claude -p --agent <role>`); routing is code, not an LLM. Gates always pause for a human decision: `--gates interactive` (the default for the live slash commands) stops at each gate so the human answers; `--gates proxy` (headless / CI) has the Human Proxy answer.

```
Tier 1:  /sprint  = plan ─> [PLAN GATE] ─> per feature: /design ─> /build ─> /deploy
            ▲                                                                   │
            └──────────────────── working software feeds back ─────────────────┘
Tier 2:  /plan  /design  /build  /deploy   (run ONE phase, then stop + suggest next)
         /spike                            (throwaway exploration, outside the loop)
```

- **`/sprint [name]`** (Tier 1, the top-level orchestrator): runs the whole sprint as one continuous flow, plan to the plan gate, then claim + drive each backlog feature `design` -> `build` -> `deploy`. Re-invoked per cycle; resumable (halts at the next HITL gate for the human, continues on re-run). `lakebase-tdd-drive --sprint <name>`.
- **`/plan [name]`** (Tier 2, sprint planning, ABOVE the per-feature loop): the **Spec Author** proposes the candidate breakdown (`.tdd/planning/feature-proposals.md`); the **Architect** t-shirt-sizes the candidates (`.tdd/planning/estimates.json`, XS/S/M/L/XL); the **Product Owner** commits the backlog by authoring a `feature-request.md` per feature that fits sprint capacity; the deterministic `sync-backlog` step projects `.tdd/sprints/<name>/backlog.json` (committed ids + sizes); the **sprint plan gate** is the HITL checkpoint. Stops there (does not flow into design). Requires project intake (`product-overview.md` + `nfrs.md`, +`design-brief.md` for UI) as a precondition. `--sprint <name> --plan-only`.
- **`/design <feature-id>`**: claims the paired branch (Step 0), enforces the feature's `feature-request.md` + project intake (Step 0.5, a precondition, NOT a gate), then drives the per-story design lane to the spec gates. `--only design`.
- **`/build <feature-id>`**: the TDD cycles + per-story acceptance, to ready-for-review (requires design done). `--only build`.
- **`/deploy <feature-id> [--target local] [--story <s>]`**: deploys the merged feature (or one story's branch) + verifies reachable + feature-verify; the **deploy gate** is the working-software review the PO signs off (the local target is the only one implemented; remote release is the scaffolded `merge.yml`). `--only deploy`.
- **`/spike <slug> [--for <feature>]`**: throwaway exploration on its own paired branch, OUTSIDE the workflow (no gates). Notes carry forward into a feature's design-spec gate; code is never promoted. `lakebase-tdd-spike`.

The same orchestrated path runs for real and headless; headless, the Human Proxy stands in for the human at every supply + gate (below).

## Headless / Human Proxy mode

By default every gate is HITL (the workflow halts for the Product Owner). When `LAKEBASE_TDD_HUMAN_PROXY=1` (set by CI and the smoke), the approver role is **performed by** the `human-proxy` identity, a diligent stand-in, not a rubber stamp. It approves a `gates.json` gate (`spec`/`plan`/`test_list`/`promote`) and emits `gate.approved` only when both hold:
- **Given the artifacts:** the gate's expected artifacts EXIST (a missing one is refused).
- **Format-conformant:** each validates against its declared format (JSON against its schema; narrative MD against its required sections, see `references/spec-format.md` + `lakebase-tdd-gate-conformance`). A malformed artifact, or one missing a required section, is refused.

So the producing role's job here is to HAND the approver complete, conformant artifacts, recording its recommended resolutions (decisions, NFR acceptances, orderings) INSIDE them rather than leaving open questions for a human reply. A gate advances because real well-formed work was verified, never because it was skipped; a missing/malformed artifact hard-blocks in CI exactly as for a human.

Beyond the gates, the Human Proxy stands in wherever the path needs human input (`lakebase-tdd-human-proxy` has two subcommands, `supply` and `approve`; both validate-then-place, neither fabricates or skips):
- **Project intake** (precondition of `/plan` + `/design`): `supply`s `product-overview.md` / `nfrs.md` / `design-brief.md` from `$LAKEBASE_TDD_RECORDED_INTAKE_DIR`; `lakebase-tdd-intake` then passes because they're present + conformant.
- **`/plan` backlog:** the Architect sizes the candidates live; the Proxy `supply`s the recorded `feature-request.md` files (the PO's groomed sprint). `sync-backlog` projects `backlog.json` (committed ids + sizes).
- **`/deploy` gate:** confirms the app came up reachable AND the verify passed, then records `gate.approved`; never approves a non-reachable or failed-verify deploy.

Check the mode with `[ "$LAKEBASE_TDD_HUMAN_PROXY" = "1" ]`. Absent/unset = normal HITL.

## Agent roles (the per-role agent runtime)

Each role is a separate agent definition under [`agents/`](agents/) with frontmatter (`name`, a `description` that is the auto-selection criteria, least-privilege `tools`, a strongly-recommended `model`, `memory: project`, `color`) and a body that is its system prompt. The roles communicate only through the artifacts on disk, the artifact is the inter-agent API.

- [`agents/product-owner.md`](agents/product-owner.md) – the PO's facilitator: runs the intake interviews + drafts `product-overview.md` / `nfrs.md` / `design-brief.md`, authors the sprint's `feature-request.md` files at `/plan`, and is the approver at every HITL gate. Headless, the Human Proxy plays the PO.
- [`agents/spec-author.md`](agents/spec-author.md) – the Spec Author (BA). At `/plan`, proposes the feature breakdown from `product-overview.md` + `nfrs.md` (`feature-proposals.md`, the PO's input). At `/design` phase 0, turns one feature's `feature-request.md` into the structured draft spec (`feature-spec.{md,json}` + stories + ACs).
- [`agents/ux-designer.md`](agents/ux-designer.md) – between phase 0 and 1, **UI projects only**: owns `design-guide.{md,json}` + `ia.md` and the UX adherence gate. Skipped for API/CLI/Infra-only features.
- [`agents/architect-reviewer.md`](agents/architect-reviewer.md) – phase 1, populates `layer` and `architectural_notes`, covers every `nfrs.md` Required item via `architecture.json` `brief_ref`, imports `software-design-principles`.
- [`agents/test-strategist.md`](agents/test-strategist.md) – phase 2, builds the Beck-style ordered test list.
- [`agents/navigator.md`](agents/navigator.md) – phase 4 PLAN + RED + REVIEW.
- [`agents/driver.md`](agents/driver.md) – phase 4 GREEN + REFACTOR.
- [`agents/release-engineer.md`](agents/release-engineer.md) – `/deploy`: deploys the built increment to its target, polls reachable, runs the feature verify, hands the evidence to the PO for the deploy gate. Composes on `lakebase-release-workflows` for remote/release-on-merge.
The **orchestrator** is the deterministic driver (`lakebase-tdd-drive`), **not an LLM agent**: it routes over `workflow-state.json`, hands each phase to the right role agent above, carries artifacts forward, and surfaces every gate to the PO. It writes no spec/code/test/deploy.

**How the orchestrator runs them.** The role defs are scaffolded into the project's `.claude/agents/` (so Claude Code can discover + spawn them; the skill copy is the source). The driver computes the next action as a pure function of the recorded state, then spawns the role for that phase via `claude -p --agent <role>`. Routing is code, not a model: there is no LLM orchestrator session. Before spawning a role, the driver resolves the model from the project's `.lakebase/agent-config.json`: `lakebase-tdd-agent-model --role <role>` returns `override ?? recommended ?? inherit` (the HIL sets per-project overrides at `lakebase-create-project`; each role's recommended model lives in its definition's `model:`).

## References

- [`references/spec-format.md`](references/spec-format.md) – full `.tdd/` directory layout + markdown ↔ JSON contract.
- [`references/agent-logging.md`](references/agent-logging.md) – structured agent log format + per-role emit points. Every role emits what it is doing via `lakebase-tdd-log` (debug = reasoning, info = outputs) to the centralized `.tdd/agent-log.jsonl`.
- `scripts/tdd/schemas/` – JSON Schemas validated by `spec-sync.ts`.
- [`../software-design-principles/SKILL.md`](../software-design-principles/SKILL.md) – engineering canon (SOLID, DRY, clean code, layered architecture, cross-cutting concerns, NFRs). Required reading for Architect Reviewer and Navigator.

## tag → runner map

Every AC declares a `layer` ("API" / "E2E" / "Infra" in `ac.schema.json`). The Driver dispatches to the runner that matches the current cycle's layer, not a single uniform `npm test`. The substrate enforces this: `markGreen` refuses to advance a layer-tagged cycle until `recordRunnerOutcome` has logged at least one run for the matching tag.

| AC.layer | tag | Default runner | Notes |
|---|---|---|---|
| `API` | `api` | `npm test` (Node), `./mvnw test` (Java/Kotlin), `uv run pytest` (Python) | The project's primary test runner. Driver runs it as-is. |
| `E2E` | `e2e` | `npm run test:e2e` (alias for `playwright test`) | Wired by `lakebase-create-project --enable-e2e`. Driver must export `BASE_URL` pointing at the paired-branch app endpoint before invoking. |
| `Infra` | `infra` | `npm run test:infra` (alias for `lakebase-infra-runner`) | Wired by `lakebase-create-project --enable-infra`. Ships three substrate-side checks: migrations-clean, schema-diff-computable, connection-reachable. JUnit XML output via `--junit-output` matches vitest's reporter shape. When no runner is wired, the Driver flags the cycle and surfaces to PO; do not silent-skip. |

Each cycle records its runner outcome via `recordRunnerOutcome({ scope, cycleId, experimentSlug, layer, passed })`. The substrate uses these counts for `outcomes.by_tag`, the `e2e-row-perma-red` smell detector, and the design-spec gate guard.

```ts
import { recordRunnerOutcome, markGreen } from "@databricks-solutions/lakebase-app-dev-kit/tdd/run-cycle";

// Run the runner mapped to the current cycle's layer, then:
recordRunnerOutcome({ scope, cycleId: c1.cycle_id, experimentSlug: "checkout", passed: true });

// markGreen now sees at least one run for the layer's tag and allows the cycle to advance.
markGreen(scope, c1.cycle_id, "added POST handler + repository write");
```

## Operations

Concrete invocations of the substrate primitives.

### Design-spec gate (phase 3)

```ts
import { analyzeForGate, recordPlan, writePlan } from "@databricks-solutions/lakebase-app-dev-kit/tdd/design-spec-gate";
import { canCutAnotherExperiment } from "@databricks-solutions/lakebase-app-dev-kit/tdd/budget";
import { attachSpikeInputs } from "@databricks-solutions/lakebase-app-dev-kit/tdd/spike-carryforward";

const analysis = analyzeForGate(".tdd", "F1");
// analysis.opinion_gaps[]            – items the analyzer flagged as opinion gaps
// analysis.proposed_plan              – { mode: "N=1" | "N>=2", N, strategies[], budget, rationale }
// analysis.proposed_plan.budget.per_experiment
//                                     – default cap { max_cycles: 30, max_wall_clock_minutes: 60 }
//                                       the orchestrator can override before writePlan
// analysis.proposed_plan.spike_inputs – auto-populated from `.tdd/spikes/<slug>/notes.md`
//                                       entries tagged with `for_feature: F1` (frontmatter
//                                       or body line). Surface to PO at Gate 4; pass the
//                                       kept slugs to attachSpikeInputs.

// Surface to PO. On Gate 4 approval, persist:
recordPlan(".tdd", analysis.proposed_plan, "kevin@example.com");
writePlan(".tdd", analysis.proposed_plan);
attachSpikeInputs({ tddDir: ".tdd", featureId: "F1", slugs: ["explore-cart-storage"] });

// Before cutting any experiment, check the budget:
const ok = canCutAnotherExperiment(".tdd", "F1");
if (!ok.ok) throw new Error(`budget: ${ok.reason}`);
```

### Experiment (phase 4)

```ts
import { cutExperiment, listExperiments, readOutcomes, writeOutcomes, deleteExperiment }
  from "@databricks-solutions/lakebase-app-dev-kit/tdd/experiment";

// N=1 – one experiment for story S1, forked from the feature branch.
const exp = await cutExperiment({
  instance: "proj-checkout",
  tddDir: ".tdd",
  featureId: "F1",
  storyId: "S1-submit",
  experimentSlug: "s1-submit",
  branch: "exp/F1/S1-submit",
  parentBranch: "feature/F1",       // forks from feature HEAD, not staging
});
// exp.dir === ".tdd/experiments/F1/S1-submit/s1-submit"
// Writes branch.txt, notes.md, outcomes.json (status: "running"), timeline.json.

writeOutcomes(".tdd", "F1", "S1-submit", "s1-submit", { status: "succeeded", tests_passed: 2 });

// Teardown is HITL-gated. deleteBranchToo defaults to false – record survives.
// (The lakebase-tdd-experiment CLI's merge/discard drive this for the PO.)
await deleteExperiment({
  instance: "proj-checkout",
  tddDir: ".tdd",
  featureId: "F1",
  storyId: "S1-submit",
  experimentSlug: "s1-submit",
  deleteBranchToo: false,
});
```

### Spike (side-mode)

```ts
import { cutSpike, listSpikes, deleteSpike }
  from "@databricks-solutions/lakebase-app-dev-kit/tdd/spike";
import { collectSpikeInputs, attachSpikeInputs }
  from "@databricks-solutions/lakebase-app-dev-kit/tdd/spike-carryforward";

await cutSpike({
  instance: "proj-checkout",
  tddDir: ".tdd",
  spikeSlug: "explore-cart-storage",
  branch: "spike-explore-cart-storage",
  parentBranch: "staging",
  // Tag the notes so future design-spec gates pick it up:
  notes: "---\nfor_feature: F1-checkout\n---\n\n# explore-cart-storage\n\nTried postgres arrays. Worked.\n",
});

// Notes captured, branch deleted by default (throwaway).
await deleteSpike({
  instance: "proj-checkout",
  tddDir: ".tdd",
  spikeSlug: "explore-cart-storage",
});
// Notes preserved at .tdd/spikes/explore-cart-storage/notes.md.

// When the related feature shows up at the design-spec gate, surface
// the spike's learning to the PO:
const inputs = collectSpikeInputs({ tddDir: ".tdd", featureId: "F1-checkout" });
// inputs[].slug, .notes_path, .preview (capped at ~200 chars), .matched_marker
// Accepts YAML frontmatter (for_feature / feature_id / feature) and body lines
// (`For feature:`, `feature:`, `feature_id:`, `for_feature:`, tolerant of
// markdown bold like `**For feature:**`). Feature id is matched verbatim, no
// prefix match.

// On PO approval, persist the kept slugs onto plan.json:
attachSpikeInputs({ tddDir: ".tdd", featureId: "F1-checkout", slugs: ["explore-cart-storage"] });
```

### Cycle (RED → GREEN → REFACTOR)

```ts
import { beginCycle, markGreen, markRefactored, flagSmells, listCycles, openBranchDsn }
  from "@databricks-solutions/lakebase-app-dev-kit/tdd/run-cycle";

const scope = {
  tddDir: ".tdd",
  feature_id: "F1",
  story_id: "S1",
  ac_id: "AC1",
  experiment_slug: "checkout",
  branch_id: "checkout",
};

// Open a DSN against the experiment's branch DB (no mocks).
const dsn = await openBranchDsn({ instance: "proj-checkout", branch_id: "checkout" });

// RED – Navigator writes a failing test, persists the cycle artifact.
const c1 = beginCycle({
  ...scope,
  test_id: "T1",
  test_description: "POST /orders returns 201 on valid cart",
  navigator_plan: "force the public boundary to accept a Cart payload",
});

// GREEN – Driver returns and Navigator reviews.
markGreen(scope, c1.cycle_id, "added POST handler + repository write");

// Optional REFACTOR – Navigator requests, Driver applies, no outer-boundary test changes.
markRefactored(scope, c1.cycle_id, "extracted CartRepository");

// Navigator-flagged smells (Hard Rule 1, 4 violations).
flagSmells(scope, c1.cycle_id, ["test-deletion-attempt"]);
```

### Smells (after every cycle)

```ts
import { runDetectorsForScope, writeSmellsLog, readSmellsLog, SMELL_CATALOG }
  from "@databricks-solutions/lakebase-app-dev-kit/tdd/smells";

const hits = runDetectorsForScope(".tdd", scope);
if (hits.length) {
  writeSmellsLog(".tdd", hits);
  // Surface each hit + the SMELL_CATALOG remediation to the PO.
  // Never auto-apply remediations.
}
```

### Per-experiment cap (every cycle, N≥2)

```ts
import { checkPerExperimentCap, recordExperimentCap, clearExperimentCap }
  from "@databricks-solutions/lakebase-app-dev-kit/tdd/experiment-cap";
import { readPlan } from "@databricks-solutions/lakebase-app-dev-kit/tdd/design-spec-gate";

// Each cycle, after recording the runner outcome and before queuing
// the next one, ask the substrate if this experiment is over its cap.
const plan = readPlan(".tdd", "F1");
const check = checkPerExperimentCap({
  tddDir: ".tdd",
  featureId: "F1",
  experimentSlug: "exp-postgres-arrays",
  cap: plan?.budget.per_experiment,
  cycleCount: listCycles(scope).length,
  // now: optional override for the BDD harness.
});
if (check.capped) {
  recordExperimentCap({
    tddDir: ".tdd",
    featureId: "F1",
    experimentSlug: "exp-postgres-arrays",
    hit: check.hit!,
  });
  // outcomes.json now carries { capped: { reason, at_cycle, cap_value, at_minutes? } }.
  // Surface to PO with the three reply options:
  //   extend         – raise the cap on plan.json and call clearExperimentCap()
  //   abandon        – archiveExperiment + let siblings continue
  //   continue-suite – leave capped on disk, decide at end-of-race
}

// On the PO's "extend" reply, raise the cap and clear the capped record:
clearExperimentCap({
  tddDir: ".tdd",
  featureId: "F1",
  experimentSlug: "exp-postgres-arrays",
});
```

The default cap (30 cycles, 60 minutes wall-clock) is seeded by `analyzeForGate`. Cycle cap is evaluated before wall-clock cap so a cycle-bound experiment that is also slow returns the `max_cycles` reason deterministically.

### Compare (N≥2 convergence)

```ts
import { compareExperiments }
  from "@databricks-solutions/lakebase-app-dev-kit/tdd/compare-experiments";
import { renderComparisonReport, writeComparisonReport }
  from "@databricks-solutions/lakebase-app-dev-kit/tdd/comparison-report";

const report = compareExperiments(".tdd", "F1");
// report.rows[].signal       – "winning" | "stalled" | "abandoned" | "running"
//                              | "capped" | "unknown"
// report.rows[].capped       – populated when a per-experiment cap fired:
//                              { reason: "max_cycles" | "max_wall_clock_minutes",
//                                at_cycle, cap_value, at_minutes? }
// report.recommendation      – "promote" | "synthesize" | "continue" | "abandon-all"
// report.rationale           – short explanation surfaced to the PO

// Render to markdown and persist next to the feature so the PO reads one
// file end-to-end (the HITL decision block lists any capped experiments
// with the extend / abandon / continue-suite reply options inline).
const md = renderComparisonReport(report);
writeComparisonReport({ tddDir: ".tdd", featureId: "F1", report });
```

### Promote (N≥2, single winner)

```ts
import { promoteExperiment }
  from "@databricks-solutions/lakebase-app-dev-kit/tdd/promote-experiment";

// Refuses to run without hitlApproved: true (PO gate enforced at the function boundary).
const result = promoteExperiment({
  tddDir: ".tdd",
  featureId: "F1",
  winnerSlug: "exp-postgres-arrays",
  hitlApproved: true,
  approverEmail: "kevin@example.com",
});
// Winner outcome: status "succeeded". Losers: outcome "abandoned", dirs moved to _archive/.
// feature-spec.json transitions to "ready-for-review". Appends to selection-log.md.
```

### Synthesize (N≥2, menu-pick)

```ts
import { synthesizeExperiments }
  from "@databricks-solutions/lakebase-app-dev-kit/tdd/synthesis";

// Refuses to run without hitlApproved: true.
const result = await synthesizeExperiments({
  instance: "proj-checkout",
  tddDir: ".tdd",
  featureId: "F1",
  picks: [
    { source_slug: "exp-postgres-arrays", capability: "storage schema" },
    { source_slug: "exp-json-blob",       capability: "API surface" },
  ],
  synthesizedSlug: "exp-synth",
  branch: "checkout-synth",
  parentBranch: "staging",
  hitlApproved: true,
  approverEmail: "kevin@example.com",
});
// Writes synthesis/<F>/synthesis-<date>.md decision record + synthesized-spec/ subtree.
// Cuts the synthesized branch. Appends to selection-log.md.
```

### Spec sync (drift detection)

```ts
import { validateSpec, readFeature, writeFeature, readWorkflowState, writeWorkflowState }
  from "@databricks-solutions/lakebase-app-dev-kit/tdd/spec-sync";

const drift = validateSpec(".tdd");
// drift[].kind – "schema" | "pair-missing" | "narrative-empty" | "id-mismatch"
// Warn-only; do not auto-correct narrative drift.
```

### Test list transformation

```ts
import { readMasterTestList, writeMasterTestList, viewByAc, viewsForAllAcs, writePerAcViews }
  from "@databricks-solutions/lakebase-app-dev-kit/tdd/test-list";

const list = readMasterTestList(".tdd", "F1");
writePerAcViews(".tdd", "F1", list);
// Emits .tdd/features/<F>/stories/<S>/test-list-per-ac.json under each story dir.
```

### Gates state machine (structured HITL approvals)

Design: [ADR-0004](../../../docs/adr/ADR-0004-tdd-gates-state-machine.md).

`.tdd/features/<F>/gates.json` is the substrate's authoritative gate state. `selection-log.md` stays as the human-readable narrative-of-record; the substrate dual-writes it at every state change. **Agents read `gates.json`; humans read the log.** Never regex-scan the log for state.

Named gates: `spec` / `plan` / `test_list` / `promote`. Statuses: `open` / `approved` / `superseded` / `withdrawn`. Each gate's record carries the approver, timestamp, captured artifact hashes (sha256 of normalized content), and a `history[]` log of every action.

```ts
import {
  readGates,
  writeGates,
  defaultGatesState,
} from "@databricks-solutions/lakebase-app-dev-kit/tdd/gates";
import { approveGate } from "@databricks-solutions/lakebase-app-dev-kit/tdd/approve-gate";
import { verifyGateIntegrity } from "@databricks-solutions/lakebase-app-dev-kit/tdd/verify-gate-integrity";
import { withdrawGate } from "@databricks-solutions/lakebase-app-dev-kit/tdd/withdraw-gate";

// Read current state (returns default-open shape when gates.json absent).
const state = readGates("F1", { tddDir: ".tdd" });

// Approve a gate (HITL-gated at the function boundary).
approveGate({
  featureId: "F1",
  gate: "spec",
  approver: "po@example.com",
  hitlApproved: true,
  artifactInputs: { "feature-spec.md": specContent, "feature-spec.json": featureJsonContent },
  tddDir: ".tdd",
});

// Verify integrity: did the artifact change since approval?
const v = verifyGateIntegrity({
  featureId: "F1",
  gate: "spec",
  currentInputs: { "feature-spec.md": currentSpec, "feature-spec.json": currentFeatureJson },
  tddDir: ".tdd",
});
// v.status: "ok" | "drift" | "gate-not-approved"
// Hash normalization survives CRLF/LF + trailing-whitespace + blank-line edits;
// semantic edits flip the verdict to "drift".

// Withdraw with cascade: spec withdraw -> plan + test_list also withdrawn.
withdrawGate({
  featureId: "F1",
  gate: "spec",
  approver: "po@example.com",
  reason: "scope rewrite",
  tddDir: ".tdd",
});
```

**Per-gate artifact scope (convention enforced at the orchestrator call site, not in the substrate):**

| Gate | artifactInputs keys |
|---|---|
| `spec` | `feature-spec.md`, `feature-spec.json` |
| `plan` | `plan.json` |
| `test_list` | `test-list.json` |
| `promote` | `promote_ref` (synthesized string: `<winner-slug>:<branch_id>`) |

**Concurrent-safe:** `approveGate` and `withdrawGate` serialize through a `.gates.lock` file (`fs.openSync` with `wx` flag). Two callers cannot lose either approval. Override: `HUSKY=0` not applicable here; the lock is mandatory.

#### Brownfield adoption

For features that pre-date the gates state machine (approvals only in `selection-log.md`):

```ts
import { migrateGatesFromSelectionLog } from "@databricks-solutions/lakebase-app-dev-kit/tdd/migrate-gates";

migrateGatesFromSelectionLog({
  featureId: "F1",
  tddDir: ".tdd",
  // Optional: pass current artifact content so the synthesized state has
  // hashes that future verifyGateIntegrity() calls can match against.
  currentInputsByGate: {
    spec: { "feature-spec.md": readFileSync("...feature-spec.md", "utf8"), "feature-spec.json": readFileSync("...feature-spec.json", "utf8") },
    plan: { "plan.json": readFileSync("...plan.json", "utf8") },
    test_list: { "test-list.json": readFileSync("...test-list.json", "utf8") },
  },
});
// History entries flagged migrated: true so auditors can tell synthesized
// entries apart from native ones. Refuses if gates.json already exists
// unless force: true.
```

#### Feature-status integration

`feature-status` surfaces the compact gates view via the `gates` field of `FeatureStatusSnapshot`. See [`references/feature-status-schema.md`](references/feature-status-schema.md). For full state including history + artifact_hashes, call `readGates()` directly.

## Flow patterns

End-to-end orchestrator patterns the deterministic driver runs in response to `/design` and `/build`. Each flow is what the driver assembles from the primitives above; the human-facing prompts that trigger each flow live in [`README.md`](README.md).

### Author + validate spec (response to `/design`)

```ts
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { validateSpec } from "@databricks-solutions/lakebase-app-dev-kit/tdd/spec-sync";

const tdd = ".tdd";
const fdir = join(tdd, "features", "F1-checkout");
const sdir = join(fdir, "stories", "S1-place-order");
mkdirSync(join(sdir, "acs"), { recursive: true });

writeFileSync(join(fdir, "feature-spec.json"), JSON.stringify({
  id: "F1", name: "Checkout flow", status: "draft", tdd_mode: "N=1", stories: ["S1"],
}));
writeFileSync(join(fdir, "feature-spec.md"), "# Checkout flow\n\nDesign intent.\n");

writeFileSync(join(sdir, "story.json"), JSON.stringify({
  id: "S1", asA: "shopper", iWantTo: "place an order",
  soThat: "I receive the goods", feature_id: "F1",
}));
writeFileSync(join(sdir, "story.md"), "# Place order\n\nNarrative.\n");

writeFileSync(join(sdir, "acs", "AC1.json"), JSON.stringify({
  id: "AC1", layer: "API", given: "valid cart", when: "POST /orders",
  then: "201 with order id", status: "draft", story_id: "S1",
}));
writeFileSync(join(sdir, "acs", "AC1.md"), "# AC1\n\nAC narrative.\n");

const drift = validateSpec(tdd);
if (drift.length) console.warn(drift);
```

### N=1 cycle end-to-end (response to `/build`, simple case)

```ts
import { writeMasterTestList } from "@databricks-solutions/lakebase-app-dev-kit/tdd/test-list";
import { analyzeForGate, writePlan, recordPlan } from "@databricks-solutions/lakebase-app-dev-kit/tdd/design-spec-gate";
import { cutExperiment, writeOutcomes } from "@databricks-solutions/lakebase-app-dev-kit/tdd/experiment";
import { beginCycle, markGreen } from "@databricks-solutions/lakebase-app-dev-kit/tdd/run-cycle";
import { runDetectorsForScope, writeSmellsLog } from "@databricks-solutions/lakebase-app-dev-kit/tdd/smells";

const tdd = ".tdd"; const featureId = "F1"; const storyId = "S1-submit";

writeMasterTestList(tdd, { feature_id: featureId, ordered_for: "design-momentum", items: [
  { id: "T1", description: "POST /orders returns 201 on valid cart", ac_id: "AC1", status: "pending" },
  { id: "T2", description: "POST /orders rejects empty cart with 400", ac_id: "AC1", status: "pending" },
]});

const analysis = analyzeForGate(tdd, featureId, storyId);   // scoped to the story -> { mode: "N=1", N: 1, ... }
recordPlan(tdd, analysis.proposed_plan, "kevin@example.com");
writePlan(tdd, analysis.proposed_plan);

const exp = await cutExperiment({
  instance: "proj-checkout", tddDir: tdd,
  featureId, storyId, experimentSlug: "s1-submit", branch: "exp/F1/S1-submit", parentBranch: "feature/F1",
});

const scope = { tddDir: tdd, feature_id: featureId, story_id: storyId, ac_id: "AC1",
                experiment_slug: exp.experiment_slug, branch_id: exp.branch_id };

const c1 = beginCycle({ ...scope, test_id: "T1",
  test_description: "POST /orders returns 201 on valid cart",
  navigator_plan: "force the public boundary to accept a Cart payload" });
markGreen(scope, c1.cycle_id, "added POST handler + repository write");

const hits = runDetectorsForScope(tdd, scope);
if (hits.length) writeSmellsLog(tdd, hits);

writeOutcomes(tdd, featureId, storyId, exp.experiment_slug, { status: "succeeded", tests_passed: 2 });
```

### N≥2 race + promote/synthesize

```ts
import { cutExperiment, writeOutcomes } from "@databricks-solutions/lakebase-app-dev-kit/tdd/experiment";
import { compareExperiments } from "@databricks-solutions/lakebase-app-dev-kit/tdd/compare-experiments";
import { promoteExperiment } from "@databricks-solutions/lakebase-app-dev-kit/tdd/promote-experiment";
import { synthesizeExperiments } from "@databricks-solutions/lakebase-app-dev-kit/tdd/synthesis";

const tdd = ".tdd"; const featureId = "F1";

await cutExperiment({ instance: "proj-checkout", tddDir: tdd, featureId,
  experimentSlug: "exp-postgres-arrays", branch: "checkout-pg-arrays", parentBranch: "staging" });
await cutExperiment({ instance: "proj-checkout", tddDir: tdd, featureId,
  experimentSlug: "exp-json-blob", branch: "checkout-json-blob", parentBranch: "staging" });

// ... cycles run on each branch via beginCycle/markGreen ...

writeOutcomes(tdd, featureId, "exp-postgres-arrays", { status: "succeeded", tests_passed: 5 });
writeOutcomes(tdd, featureId, "exp-json-blob",       { status: "succeeded", tests_passed: 5 });

const report = compareExperiments(tdd, featureId);

if (report.recommendation === "promote") {
  const winner = report.rows.find((r) => r.signal === "winning")!;
  promoteExperiment({ tddDir: tdd, featureId, winnerSlug: winner.experiment_slug,
                      hitlApproved: true, approverEmail: "kevin@example.com" });
} else if (report.recommendation === "synthesize") {
  await synthesizeExperiments({
    instance: "proj-checkout", tddDir: tdd, featureId,
    picks: [
      { source_slug: "exp-postgres-arrays", capability: "storage schema" },
      { source_slug: "exp-json-blob",       capability: "API surface" },
    ],
    synthesizedSlug: "exp-synth", branch: "checkout-synth",
    hitlApproved: true, approverEmail: "kevin@example.com",
  });
}
```

## Adapters

Bundled: `markdown.ts` (no-op default – the spec IS the tracking), `jira.ts` (stub). Project skills wire in the adapter they want via `.tdd/adapters/<name>.json` config.

The `SpecAdapter` interface extends `SyncEventHooks` – implementations may opt into `onPhaseTransition`, `onCycleComplete`, `onSmellDetected` hooks for status-mirroring to external trackers. Adapter failures must degrade gracefully – the on-disk spec is the source of truth.

## CLI bins

For non-agent invocation (debugging, CI introspection):

| Command | Purpose |
|---|---|
| `lakebase-feature-status <featureId> [--tdd <dir>] [--json]` | One-screen snapshot of a feature's TDD workflow state. Use `--json` for machine-readable payload. |
| `node dist/scripts/tdd/spec-sync.cli.js <tddDir>` | Walk the `.tdd/` tree and print drift reports. Exits 0 even when reports exist (warn-only). |
| `node dist/scripts/tdd/test-list.cli.js <tddDir> <featureId> [storyId]` | Regenerate per-AC views from the feature-level master test list. With a `storyId`, instead write that story's scoped per-story test list (`stories/<story>/test-list-per-story.json`), the streaming build lane's per-story input. |
