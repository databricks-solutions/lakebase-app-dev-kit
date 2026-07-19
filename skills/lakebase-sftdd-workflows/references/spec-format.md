# Spec format

The on-disk `.sftdd/` layout that the lakebase-sftdd-workflows substrate reads and writes. Portable, tool-agnostic. Every structured element has both a markdown narrative (for humans) and a JSON contract (for agents, validation, and adapter sync).

This `.sftdd/` tree is the artifact of **Spec Driven Development (SDD)**: the design lane (`/design`) writes the feature spec, stories, ACs, architecture, and ordered test list here, and freezes them at the `spec` + `test_list` gates. The **Test Driven Development (TDD)** build lane (`/build`) then reads this tree as its source of truth, never the other way around: the spec drives the code.

## Directory layout

```
.sftdd/
  product-overview.md                ← Product Owner's project-level overview (open-ended; software is a product)
  nfrs.md                            ← non-functional-requirements brief; the Architect's intake (project-level)
  workflow-state.json                ← current phase + locus (feature/story/ac/cycle/experiment)
  planning/
    feature-proposals.md             ← Spec Author's sprint-planning proposal (/plan): candidate feature breakdown, the PO's INPUT
  features/
    F1-partner-submits-assets/
      feature-request.md                  ← Feature Requester's original ask (Spec Author's INPUT; never overwritten)
      feature-spec.md                     ← Spec Author's narrative draft-spec (Summary, Stories, Out of scope, Open questions)
      feature-spec.json                   ← Spec Author's machine contract (see schemas/feature.schema.json)
      architecture.md                ← Architect Reviewer's layering + concerns summary (phase 1 output)
      test-list.md                   ← Beck-style ordered test list, human view
      test-list.json                 ← Beck-style ordered test list, machine contract
      stories/
        S1-submit-form/
          story.md                   ← user story prose
          story.json                 ← machine contract
          acs/
            AC1.md                   ← human-narrated AC
            AC1.json                 ← machine contract
            AC2.md
            AC2.json
          scenarios/
            s-1.feature              ← Gherkin (frontmatter ties to AC)
            s-1.test.ts              ← or runtime test stub
            s-2.feature
          test-list-per-ac.json      ← generated transform from feature test-list.json
  experiments/
    F1-partner-submits-assets/
      S1-submit-form/                ← story scope (experiments are story-scoped)
        exp-1-postgres-arrays/
          notes.md                   ← strategy summary, learning
          branch.txt                 ← Lakebase branch id
          outcomes.json              ← {tests_passed, schema_diff_summary, code_diff_lines, status}
          timeline.json              ← cycles + smell triggers + HITL interventions
        exp-2-json-blob/
          ...
  spikes/
    F1-explore-storage/
      notes.md
      branch.txt
  synthesis/
    F1-partner-submits-assets/
      synthesis-2026-05-26.md        ← menu-pick decision + integration rules
      synthesized-spec/              ← renegotiated spec ready for fresh cycle (mirrors features/ shape)
  cycles/
    F1/S1/AC1/
      cycle-001.json                 ← {test, gate_check, navigator_verdict, driver_changes, timestamp}
      cycle-002.json
  selection-log.md                   ← append-only HITL gate decisions + rationale
  smells.json                        ← detected smells + resolutions
  adapters/
    jira.json                        ← optional per-adapter config
    markdown.json                    ← optional (markdown adapter is the default)
```

## Artifact → author

Who owns each artifact. "spec" is reserved for the Spec Author; the Feature
Requester's original ask is `feature-request.md` and is never overwritten.

| Artifact | Author | Scope |
|---|---|---|
| `product-overview.md` | Product Owner | Project-level (`.sftdd/` root). Open-ended intent; not part of the per-feature spec gate. |
| `nfrs.md` | Product Owner / HIL | Non-functional-requirements brief; the Architect's intake. Project-level (`.sftdd/nfrs.md`) + optional per-feature (`.sftdd/features/<F>/nfrs.md`). Each Required item has an `R<n>` id the Architect covers via `brief_ref`. |
| `feature-proposals.md` | Spec Author | Project-level (`.sftdd/planning/`). The Spec Author's sprint-planning proposal of how to divide the work into features (`/plan` phase 1), the PO's INPUT. Not a per-feature spec-gate deliverable. |
| `feature-request.md` | Product Owner (as Feature Requester) | Per-feature. The PO's prioritized ask, authored at `/plan` (sprint planning) from the Spec Author's proposal; the Spec Author's `/design` INPUT, read but never overwritten. |
| `feature-spec.md` | Spec Author | Per-feature narrative draft-spec (Summary, Stories, Out of scope, Open questions). |
| `feature-spec.json` | Spec Author | Per-feature machine contract (validated against `feature.schema.json`). |
| `story.md` / `story.json` | Spec Author | Per-story narrative + machine contract. |
| `ac.md` / `ac.json` | Spec Author | Per-AC narrative + machine contract. Architect later adds `layer` + `architectural_notes`. |
| `architecture.md` / `architecture.json` | Architect Reviewer | Layering + concerns. NFRs live in `architecture.json` (HIL-adjudicated at Gate 2). |
| `test-list.md` / `test-list.json` | Test Strategist | Beck-style ordered test list. |
| `plan.json` | Architect / Orchestrator | Experiment plan, written at the design-spec gate. |

## The markdown ↔ JSON contract

**JSON is the source of truth for structured data**: ids, statuses, layer assignments, NFRs, links between features/stories/ACs.

**Markdown is the source of truth for narrative**: design intent, rationale, edge-case discussions, decision logs.

`scripts/sftdd/spec-sync.ts` validates the pair:

- Schema: every `.json` is validated against its schema in `scripts/sftdd/schemas/`. A schema failure is a hard error reported as a `DriftReport` of kind `schema`.
- Pair completeness: each `feature-spec.json`, `story.json`, and `ac.json` must have a sibling `.md` (`feature-spec.md`, `story.md`, `ac.md`). Missing narrative is reported as `pair-missing`. Empty narrative is reported as `narrative-empty` (size < 20 bytes).
- ID consistency: the directory name must start with the `id` field from the JSON. Mismatches are reported as `id-mismatch`.
- Drift is **warn-only**. The CLI exits 0 with reports printed. Auto-correction is intentionally not done – narrative changes are too easy to silently overwrite.

## Schemas (machine contract)

| Schema | Captures |
|---|---|
| `feature.schema.json` | id, name, status, tdd_mode, success_metrics, stories, owner, external_ref (NO `nfrs` , NFRs live in `architecture.json`) |
| `story.schema.json` | id, asA, iWantTo, soThat, acs, feature_id, independence (`distinct_from_prior` + `rationale`; required on every story after the first, else the spec gate hard-blocks), external_ref (NO `nfrs`) |
| `ac.schema.json` | id, layer (API/E2E/Infra), given/when/then, scenarios, nfrs, architectural_notes, status, story_id, independence (`distinct_from_prior` + `rationale`; required on every AC after the first in a story, else the spec gate hard-blocks), external_ref |
| `test-list.schema.json` | feature_id, ordered_for, items (id, description, ac_id, status, scenario_file) |
| `workflow-state.schema.json` | phase, feature_id, story_id, ac_id, cycle_id, experiment_id, timestamps |

### AC layer semantics

The `layer` field on each AC drives the Driver's runner dispatch (the `tagToRunner` table in SKILL.md). Each layer has its own ownership boundary:

- **`API`**: behavior reachable through the project's primary public boundary (HTTP endpoint, exported library function, CLI invocation). Owned by the project's primary test runner (vitest, JUnit, pytest). The substrate does not run these; the project does.
- **`E2E`**: user-visible behavior driven through the deployed application stack (HTTP UI, browser flows, multi-service journeys). Runs via Playwright against the paired-branch app endpoint. The kit ships `playwright.config.ts` and a smoke fixture; the project owns the scenario specs under `tests/e2e/`.
- **`Infra`**: substrate-side invariants the kit promises on behalf of the project. The kit ships the runner (`lakebase-infra-runner`); v1 covers three checks:
  - **migrations-clean**: `schemaMigrationStatus` reports no pending migrations for the branch.
  - **schema-diff-computable**: `getSchemaDiff` against the parent branch returns a `SchemaDiffResult` without throwing (the introspection seam is healthy).
  - **connection-reachable**: `getConnection` mints a usable DSN against the branch (the credential mint path is healthy).

`[Infra]` rows therefore assert that the project's database substrate is operating correctly, not that the project's domain logic does anything specific. Use them sparingly: one per feature is usually enough; chasing every check at every cycle dilutes the signal.

Schemas live at `scripts/sftdd/schemas/`. The substrate consumes them via Ajv in `spec-sync.ts`.

## Adapter sync

The on-disk format is canonical. Adapters (markdown, jira, github-issues, etc.) implement `SpecAdapter` from `scripts/sftdd/adapters/types.ts` to mirror state to an external system. The `external_ref` field on every entity carries `{adapter, external_id}` once an adapter has pushed.

- **`markdown.ts`** – no-op (the spec IS the tracking). Default when no adapter is configured.
- **`jira.ts`** – stub at M1.5; full implementation deferred. When wired, will push features as Stories under an Epic, ACs as Sub-tasks, status as JIRA transitions.

## Read / write helpers

The substrate ships these helpers in `scripts/sftdd/spec-sync.ts`:

- `readFeature(tddDir, featureId): Feature`
- `writeFeature(tddDir, feature): void`
- `readWorkflowState(tddDir): WorkflowState | null`
- `writeWorkflowState(tddDir, state): void`
- `validateSpec(tddDir): DriftReport[]`

CLI: `node scripts/sftdd/spec-sync.ts <tddDir>` walks the tree and prints drift reports.

## Artifact conformance (the format contract per role)

Every artifact a role produces has a declared format, derived from that role's
contract in `agents/*.md`. A gate approves an artifact only when it both EXISTS
(Layer 1) and CONFORMS to its format (Layer 2). Conformance is enforced by
`scripts/sftdd/artifact-conformance.ts` (`checkArtifactConformance(name, content)`)
and re-checked at approval time by the Human Proxy / orchestrator. JSON
schema failures and missing required narrative sections both hard-block the gate.

| Artifact | Producing role | Required format |
|---|---|---|
| `feature-spec.json` / `story.json` / `ac.json` | Spec Author | JSON Schema (`scripts/sftdd/schemas/`) |
| `test-list.json` | Test Strategist | `test-list.schema.json` |
| `plan.json` | Architect / Orchestrator | `plan.schema.json` |
| `architecture.json` | Architect Reviewer | `architecture.schema.json` (carries `nfrs[]`, HIL-adjudicated at Gate 2; each NFR may carry `brief_ref` to the `nfrs.md` Required id it satisfies). NFRs live here, NOT on the spec-gated `feature-spec.json`/`story.json`. |
| `workflow-state.json` | Orchestrator | `workflow-state.schema.json` |
| `product-overview.md` | Product Owner | H1 + non-empty body (open-ended intent; project-level; not gate-locked) |
| `nfrs.md` | Product Owner / HIL | H1 + **Required**, **Preferences**, **Out of bounds**. Every Required item carries an `R<n>` id; the Architect must cover each via `architecture.json` `brief_ref` (`checkNfrCoverage` hard-blocks the architecture gate otherwise). |
| `feature-proposals.md` | Spec Author | H1 + non-empty body (sprint-planning proposal authored at `/plan`; the PO's INPUT; not gate-locked) |
| `feature-request.md` | Product Owner (as Feature Requester) | H1 + non-empty body (the PO's ask, authored at `/plan`; the Spec Author's `/design` INPUT, never overwritten) |
| `feature-spec.md` | Spec Author | H1 + **Summary**, **Stories**, **Out of scope**, **Open questions** |
| `architecture.md` | Architect Reviewer | H1 + **Architectural Concerns Mapping**, **Pattern proposals**, **Risks**, **Decisions**, **Sign-off** |
| `test-list.md` | Test Strategist | Rendered from JSON: H1 + `Ordered for:` + an AC reference on every item + a **Deferred / skipped** section |
| `design-brief.md` | Product Owner / HIL (UI projects) | H1 + **References** (the reference sites + what to take from each; the design analogue of `product-overview.md`) |
| `design-guide.json` | UX Designer (UI projects) | `design-guide.schema.json` (typography + colors + spacing tokens) |
| `design-guide.md` | UX Designer (UI projects) | H1 + **Design Philosophy**, **Typography**, **Color Palette**, **Spacing**, **Components**, **User Feedback Principles** |
| `ia.md` | UX Designer (UI projects) | H1 + **Screens**, **Navigation**, **User flows** |

`product-overview.md` is intentionally loose: it is the Product Owner's living,
project-level, plain-English statement of intent, refined across sprints. From it,
the per-feature `feature-request.md` is teased out during `/plan` (sprint planning):
the Spec Author proposes the feature breakdown (`feature-proposals.md`) and the
Product Owner prioritizes and authors the individual requests for the sprint. The
PO does not pre-author the whole backlog; they fold each sprint's working software
(the `/deploy` gate) back into the next round of requests. Each `feature-request.md`
is then the Spec Author's `/design` input; the structured deliverables the Spec
Author composes (feature-spec, story, AC) carry the strong contracts.

CLI: `lakebase-sftdd-gate-conformance --feature <id>` scans a feature's artifacts
and reports any that do not conform. Exit 1 if any artifact is non-conformant.

## Where this format does NOT go

- It does **not** carry execution telemetry. That lives in `cycles/<F>/<S>/<AC>/cycle-NNN.json` (per-cycle artifacts), `experiments/<F>/<exp>/timeline.json` (per-experiment), and `smells.json`.
- It does **not** carry CI / release state. That belongs to `lakebase-release-workflows`.
- It does **not** carry code or test source. Those live in the project tree, on the experiment branch.

The spec is what the workflow agrees on. The execution telemetry is what actually happened. Both matter; they live in different files for a reason.
