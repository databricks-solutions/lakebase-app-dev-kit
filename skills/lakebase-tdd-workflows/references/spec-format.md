# Spec format

The on-disk `.tdd/` layout that the lakebase-tdd-workflows substrate reads and writes. Portable, tool-agnostic. Every structured element has both a markdown narrative (for humans) and a JSON contract (for agents, validation, and adapter sync).

## Directory layout

```
.tdd/
  spec.json                          ← top-level index (optional)
  spec.md                            ← top-level overview narrative (optional)
  workflow-state.json                ← current phase + locus (feature/story/ac/cycle/experiment)
  features/
    F1-partner-submits-assets/
      feature.md                     ← human-narrated description, design intent
      feature.json                   ← machine contract (see schemas/feature.schema.json)
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
      exp-1-postgres-arrays/
        notes.md                     ← strategy summary, learning
        branch.txt                   ← Lakebase branch id
        outcomes.json                ← {tests_passed, schema_diff_summary, code_diff_lines, status}
        timeline.json                ← cycles + smell triggers + HITL interventions
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

## The markdown ↔ JSON contract

**JSON is the source of truth for structured data**: ids, statuses, layer assignments, NFRs, links between features/stories/ACs.

**Markdown is the source of truth for narrative**: design intent, rationale, edge-case discussions, decision logs.

`scripts/tdd/spec-sync.ts` validates the pair:

- Schema: every `.json` is validated against its schema in `scripts/tdd/schemas/`. A schema failure is a hard error reported as a `DriftReport` of kind `schema`.
- Pair completeness: each `feature.json`, `story.json`, and `ac.json` must have a sibling `.md`. Missing narrative is reported as `pair-missing`. Empty narrative is reported as `narrative-empty` (size < 20 bytes).
- ID consistency: the directory name must start with the `id` field from the JSON. Mismatches are reported as `id-mismatch`.
- Drift is **warn-only**. The CLI exits 0 with reports printed. Auto-correction is intentionally not done – narrative changes are too easy to silently overwrite.

## Schemas (machine contract)

| Schema | Captures |
|---|---|
| `feature.schema.json` | id, name, status, tdd_mode, nfrs, success_metrics, stories, owner, external_ref |
| `story.schema.json` | id, asA, iWantTo, soThat, nfrs, acs, feature_id, external_ref |
| `ac.schema.json` | id, layer (API/E2E/Infra), given/when/then, scenarios, nfrs, architectural_notes, status, story_id, external_ref |
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

Schemas live at `scripts/tdd/schemas/`. The substrate consumes them via Ajv in `spec-sync.ts`.

## Adapter sync

The on-disk format is canonical. Adapters (markdown, jira, github-issues, etc.) implement `SpecAdapter` from `scripts/tdd/adapters/types.ts` to mirror state to an external system. The `external_ref` field on every entity carries `{adapter, external_id}` once an adapter has pushed.

- **`markdown.ts`** – no-op (the spec IS the tracking). Default when no adapter is configured.
- **`jira.ts`** – stub at M1.5; full implementation deferred. When wired, will push features as Stories under an Epic, ACs as Sub-tasks, status as JIRA transitions.

## Read / write helpers

The substrate ships these helpers in `scripts/tdd/spec-sync.ts`:

- `readFeature(tddDir, featureId): Feature`
- `writeFeature(tddDir, feature): void`
- `readWorkflowState(tddDir): WorkflowState | null`
- `writeWorkflowState(tddDir, state): void`
- `validateSpec(tddDir): DriftReport[]`

CLI: `node scripts/tdd/spec-sync.ts <tddDir>` walks the tree and prints drift reports.

## Artifact conformance (the format contract per role)

Every artifact a role produces has a declared format, derived from that role's
contract in `agents/*.md`. A gate approves an artifact only when it both EXISTS
(Layer 1) and CONFORMS to its format (Layer 2). Conformance is enforced by
`scripts/tdd/artifact-conformance.ts` (`checkArtifactConformance(name, content)`)
and re-checked at approval time by the mock approver / orchestrator. JSON
schema failures and missing required narrative sections both hard-block the gate.

| Artifact | Producing role | Required format |
|---|---|---|
| `feature.json` / `story.json` / `ac.json` | Spec Author | JSON Schema (`scripts/tdd/schemas/`) |
| `test-list.json` | Test Strategist | `test-list.schema.json` |
| `plan.json` | Architect / Orchestrator | `plan.schema.json` |
| `architecture.json` | Architect Reviewer | `architecture.schema.json` (carries `nfrs[]`, HIL-adjudicated at Gate 2). NFRs live here, NOT on the spec-gated `feature.json`/`story.json`. |
| `workflow-state.json` | Orchestrator | `workflow-state.schema.json` |
| `spec.md` | Product Owner | H1 + non-empty body (open-ended intent; not gate-locked) |
| `feature.md` | Spec Author | H1 + **Summary**, **Stories**, **Out of scope**, **Open questions** |
| `architecture.md` | Architect Reviewer | H1 + **Architectural Concerns Mapping**, **Pattern proposals**, **Risks**, **Decisions**, **Sign-off** |
| `test-list.md` | Test Strategist | Rendered from JSON: H1 + `Ordered for:` + an AC reference on every item + a **Deferred / skipped** section |
| `design-brief.md` | Product Owner / HIL (UI projects) | H1 + **References** (the reference sites + what to take from each; the design analogue of `spec.md`) |
| `design-guide.json` | UX Designer (UI projects) | `design-guide.schema.json` (typography + colors + spacing tokens) |
| `design-guide.md` | UX Designer (UI projects) | H1 + **Design Philosophy**, **Typography**, **Color Palette**, **Spacing**, **Components**, **User Feedback Principles** |
| `ia.md` | UX Designer (UI projects) | H1 + **Screens**, **Navigation**, **User flows** |

`spec.md` is intentionally loose: it is the Product Owner's living, plain-English
statement of intent, refined across sprints. The structured deliverables the
Spec Author composes from it (feature/story/AC) carry the strong contracts.

CLI: `lakebase-tdd-gate-conformance --feature <id>` scans a feature's artifacts
and reports any that do not conform. Exit 1 if any artifact is non-conformant.

## Where this format does NOT go

- It does **not** carry execution telemetry. That lives in `cycles/<F>/<S>/<AC>/cycle-NNN.json` (per-cycle artifacts), `experiments/<F>/<exp>/timeline.json` (per-experiment), and `smells.json`.
- It does **not** carry CI / release state. That belongs to `lakebase-release-workflows`.
- It does **not** carry code or test source. Those live in the project tree, on the experiment branch.

The spec is what the workflow agrees on. The execution telemetry is what actually happened. Both matter; they live in different files for a reason.
