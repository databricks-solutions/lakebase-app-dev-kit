# Enforce layered architecture + architectural fitness functions + pytest-bdd (Python build quality)

Status: increments 1-6 + thread 2 LANDED (local, branch `docs/tighten-design-canon-drop-dtsttcpw`); live re-smoke pending. Owner: TDD substrate.

## Problem (confirmed from a live complete build, project bug-tracker-20260611-171519, kit 0df37f4)

The deterministic TDD orchestrator produced a *working* FastAPI app whose tests pass and that deploys, but it violates the kit's own canon on three axes. Behavioral correctness is airtight (honest RED/GREEN, deploy verify); structural/design quality is under-enforced because the tests are behavioral and the canon is advisory.

Confirmed evidence:
1. **No layered architecture.** `app/main.py` is a 63-line fat controller: route handlers call the ORM/session directly (`db.add/commit`, `db.query(...)`) and inline business logic (`_next_identifier`, status defaulting). No service module, no repository module, no router separation (no `APIRouter`). `architecture.json`'s only structural field is the per-AC `layer` tag (API/E2E/Infra), which is a TEST boundary, not a code-module prescription.
2. **No architectural fitness functions.** The canon (references/test-strategy.md) says "every cycle = behavior tests (BDD) PLUS architectural fitness tests," but the test-list had only behavior items and no fitness test was written.
3. **No pytest-bdd.** Canon authors each AC as a pytest-bdd Given/When/Then scenario; the build wrote plain `def test_x(page, live_server)` Playwright tests, and `pytest-bdd` was not even a dependency (the navigator could not `import pytest_bdd`).

Confirmed WORKING (must not regress): **design-guide adherence.** The ux-designer's `design-guide.json` tokens flow into a generated `app/static/theme.css` (every token as a CSS custom property) and the Jinja templates consume them via `var(--...)`. The chain design-guide.json -> theme.css -> templates is real. Keep `design-adherence.ts` + the UX artifacts + theme.css generation untouched.

## Enforcement philosophy (the session's repeatedly-confirmed lesson)

Only a **failing test** or a **hard gate** reliably changes LLM build output. Advisory prompt canon (which already says all the right things in test-strategy.md) did NOT prevent any of the three gaps. So every item below lands as a deterministic gate or a RED fitness test, with canon edits as the accompanying (not the enforcing) layer.

Three enforcement surfaces, increasing strength:
- prompt/canon (`agents/*.md`, `references/*.md`): weak, advisory.
- artifact-conformance gate (`scripts/sftdd/artifact-conformance.ts` -> `human-proxy.ts`): hard-blocks a HITL gate when an artifact's shape is wrong. Deterministic, fires before any code is built.
- fitness test / deterministic CI gate (a shipped RED test + an `imports-clean.ts`-style gate): a real failing test the Driver must satisfy. Strongest, model-independent.

## Key decisions

- **service_backed flag (YAGNI guard).** Layering is required only for a feature that persists/has business logic. The architect declares `service_backed: true|false` in `architecture.json`; the layering gate + fitness test fire only when `true`. A trivial read-only endpoint is not forced into a service+repository.
- **pytest-bdd for behavior (AC) scenarios only.** Fitness tests stay plain `def test_*`. Do not force Gherkin on every unit test.
- **Land in smallest safe increments**, each with hermetic tests + (where relevant) a live-smoke acceptance signal. Schemas are additive/optional so the ~2090 existing hermetic tests stay green. New conformance rules are scoped to "only when the constraint is declared" (exactly how `checkNfrCoverage` no-ops with no Required NFRs), so they never retroactively fail existing fixtures.

## Increments (with verification)

### Increment 1: pytest-bdd dependency (DONE, commit 1181436)
- Change: `pytest-bdd>=7.0.0` in `templates/project/python/pyproject.toml` dev extras; `ensurePythonBddDeps()` retrofit in `enable-e2e.ts` (DRY: shared `addPythonDevDep`); wired into `enableE2eForProject` Python branch.
- Verify (done): `tests/bdd/enable-e2e.test.ts` , ensurePythonBddDeps idempotent + sibling-preserving; the Python enableE2eForProject path declares both pytest-playwright and pytest-bdd. 18 tests green; full suite green.
- Live acceptance (pending a smoke): the scaffolded project's pyproject contains pytest-bdd; the navigator can author `.feature` scenarios.

### Increment 2: canon (advisory layer, accompanies the gates)
- Change:
  - `architect-reviewer.md`: declare module layers in `architecture.json.layers` (boundary/service/repository/infrastructure) + set `service_backed`; cite `architectural-design-principles/layered-architecture.md` as mandatory for a service-backed feature.
  - `test-strategist.md`: after the behavior scenarios, emit >=1 `kind:"fitness"` test-list item per architectural constraint (layering, ORM-only, config-in-env, NFR budget); author AC behavior scenarios as pytest-bdd `tests/features/<story>.feature` + `tests/step_defs/test_<story>.py`. Make the test-list example include `kind`.
  - `navigator.md`: write AC behavior tests as pytest-bdd (.feature + step defs) for Python; write the fitness test the test-list names; build/verify against the layered modules.
  - `driver.md`: realize the layers , route handler delegates to a service; persistence only in a repository; no `db.*` in the boundary.
- Verify: no test asserts this prose (agent-def conformance checks frontmatter only). Confirm via the LIVE smoke that the build now produces .feature files + a service/repo + a fitness test. (Canon alone is insufficient; increments 3-5 are the teeth.)

### Increment 3: schemas (additive, optional)
- Change:
  - `scripts/sftdd/schemas/architecture.schema.json`: add optional `service_backed: boolean` + `layers: [{ name, role: boundary|service|repository|infrastructure|policy, module, may_import: [] }]`.
  - `scripts/sftdd/schemas/test-list.schema.json`: add optional `kind: "behavior" | "fitness"` (default behavior) to items; mirror in `TestListItem` (`scripts/sftdd/test-list.ts`).
- Verify: hermetic , a fixture architecture.json with `layers` + `service_backed` validates; a test-list with `kind` validates; existing fixtures (no layers / no kind) still validate (additive). `npm run typecheck` + the schema-loader/conformance tests green.

### Increment 4: hard conformance gates
- Change in `scripts/sftdd/artifact-conformance.ts` (mirror `checkNfrCoverage`):
  - `checkLayeringDeclared(architectureJson)`: if `service_backed === true`, `layers` must declare at least a boundary + service + repository; else a violation. Wire into `scanFeatureConformance` + `human-proxy.ts` `conformanceReason` so **Gate 2 (architecture/spec)** hard-blocks.
  - `checkFitnessCoverage(testListJson, architectureJson)`: if the architecture declares any constraint (service_backed or >=1 layer or an NFR), the test-list must contain >=1 `kind:"fitness"` item; else a violation. Wire so **Gate 3 (test_list)** hard-blocks.
- Verify: hermetic tests in `tests/bdd/` mirroring the existing artifact-conformance NFR-coverage test: (a) service_backed + no layers -> violation; service_backed + full layers -> ok; service_backed:false -> no-op. (b) constraint declared + no fitness item -> violation; with a fitness item -> ok; nothing declared -> no-op. Full suite green (the rules no-op on existing fixtures because none declare service_backed/layers).

### Increment 5: layering fitness test + smell (the real teeth on the BUILD)
- Change:
  - Ship a Python fitness-test template `tests/architecture/test_layering.py` (ast/import scan: the boundary/routes module must NOT import the SQLAlchemy session/`db`; a repository module must exist) , and/or a deterministic `scripts/sftdd/layering-clean.ts` + `layering-clean.cli.ts` mirroring `imports-clean.ts`.
  - Add a `layering-violation` smell to `smells.ts` SMELL_CATALOG (blocking), so the navigator REVIEW flags ORM access in a route handler (distinct from today's test-only `boundary-violation`).
  - test-strategist emits the layering fitness item; navigator writes the file; it goes RED (fat controller fails) then GREEN (Driver extracts service/repository).
- Verify: hermetic , `layering-clean` flags a fixture where a route module imports the session, passes a layered fixture; `smells.test.ts` lists `layering-violation`. LIVE , a service-backed feature build produces `app/services/*` + `app/repositories/*` (or equivalent), the route handler has no `db.*`, and `tests/architecture/test_layering.py` is GREEN.

## Thread 2 (after the layering work): scm-merge `--wait-migrate` timeout
- Symptom (project 171519): `scm-merge --wait-migrate` timed out after 1800s on "no matching run" for the staging downstream-migrate workflow. The prior run (163522) found it in 3 polls. The merge + local fast-forward already succeeded; only the downstream-migrate poll hung.
- Fix direction: (a) harden the run-matching in `scm-wait-ci.ts`/`scm-merge.ts` wait-migrate loop (match the merge.yml run by branch+sha+workflow more robustly; handle "run not yet created" vs "never triggered"); (b) make a wait-migrate timeout NON-FATAL (warn + record, since the merge + local sync already landed and the migrate can complete async) rather than failing the whole drive; (c) lower the default timeout from 1800s with clearer guidance. Decide gate-vs-warn: recommend warn-not-fail for the smoke, because the workflow is otherwise complete.
- Verify: hermetic test on the wait-migrate matcher; live , a smoke reaches `done` without a 30-min hang even if the migrate run is slow/absent.
- LANDED (option b, warn-not-fail): `mergeFeature` gains `migrateTimeoutFatal` (default true, preserves the standalone "confirm migrations" contract + the existing/live tests). The timeout branch, when fatal=false, records `migrate.timedOut` + a warning instead of throwing, because the GitHub merge + local fast-forward already landed and the state is already `merged`. A migrate run that COMPLETES with a failure conclusion is still fatal (a real migration failure, not a wait timeout). `scm-merge.cli.ts` exposes `--migrate-timeout-nonfatal` (exit 0 on a non-fatal timeout). The TDD orchestrator's `merge` action now passes `--migrate-timeout-nonfatal --migrate-timeout-sec 600`, so the drive reaches `done` after a bounded wait and the migrate confirms async. Hermetic tests: never-completing run -> warning + timedOut + state stays merged; completed-but-failed -> still migrate-failed.

## Increment 6: born-green fitness tests are regression guards, not a cycle-stall (the live blocker)

Symptom (live capture, S1): the navigator authored the ORM-only fitness
test `tests/architecture/test_orm_only.py`, but it was **born-green** , the app
already had zero raw SQL (the layering refactor in prior cycles removed it). With
no honest RED possible, the navigator (correctly refusing to fake a RED) flagged
`cycle-stall` (blocking) -> raised to HIL -> the smoke halted, never reaching `done`.

Root cause: the build state machine is strictly RED-first (each test-list item gets
a RED cycle via `beginNextPendingCycle`, then the Driver greens it). A fitness /
regression-guard test that PASSES on first run against already-correct architecture
has no RED phase. The honest-RED guard (no faked RED; no markGreen without a real
passing run) is right; the gap is that "no RED" was conflated with "stuck"
(`cycle-stall`). A born-green regression guard is legitimately green: it genuinely
passes now and defends against a future regression.

Design (deterministic, not advisory , per the "only a hard gate / deterministic
path reliably changes build output" lesson): for a pending `kind:"fitness"` item,
the orchestration RUNS the just-written test and decides:
- **born-green** (passes first run): record a regression-guard cycle (red_at +
  green_at stamped together, `born_green: true`, empty driver_changes , no code
  change, no Driver turn), advance. NOT a cycle-stall.
- **RED first run** (e.g. the layering fitness test against a fat controller):
  normal RED -> Driver GREEN.
A born-green cycle carries green_at, so `detectCycleStall` (3 cycles, no GREEN)
never fires on it; what remains is to stop the navigator FLAGGING cycle-stall for
the born-green case.

Mechanism (simpler than a new cycle type): the existing GREEN turn (`greenOpenCycle`)
already runs the REAL verify and greens a test that passes , so a born-green fitness
test, once WRITTEN, is greened by the normal `!codeWritten -> Driver GREEN` step. No
new born-green cycle primitive is needed. The only thing that halted the live run was
the navigator emitting `cycle-stall`. So the fix is guidance + a deterministic teeth
that a `cycle-stall` cannot halt a born-green fitness item.

Changes:
- `cycle-record.ts`: surface `kind?: "behavior" | "fitness"` on `StoryTestItem` (it
  is already in the per-story test-list JSON) + `pendingItemKind(tddDir, featureId,
  story)` = the `kind` of the first pending item.
- `escalation.ts` (deterministic teeth): a `cycle-stall` smell is NOT a blocking
  escalation when the story's first pending item is `kind:"fitness"` , a fitness
  test that "can't go RED" is born-green (a regression guard), not stuck; the GREEN
  run is the real arbiter (pass -> green; genuinely failing 3x -> still a stall for a
  behavior item). Suppressing the escalation lets the loop proceed to the GREEN turn,
  which greens the born-green test.
- `navigator.md` + `driver.md`: a born-green fitness test is a valid regression
  guard; write it, do NOT fake a RED, do NOT flag `cycle-stall` (the build runs it
  and records GREEN).
- Tests: hermetic , `pendingItemKind`; `escalationsFromSmells` drops a cycle-stall
  when the pending item is fitness, keeps it for a behavior item; the born-green
  fitness greens via the normal GREEN turn.
- Verify LIVE: the smoke passes S1's ORM-only (+ config-in-env) fitness
  items born-green and reaches `done`.

## Definition of done (the whole effort)
A live smoke on a service-backed feature produces, and a human can confirm:
1. AC behavior tests are pytest-bdd (`tests/features/*.feature` + step defs), not plain pytest.
2. >=1 architectural fitness test exists and is GREEN (e.g. `tests/architecture/test_layering.py`).
3. The app is layered: `app/services/*` + `app/repositories/*` (or equivalent), route handlers delegate (no `db.*` in the boundary). The layering fitness test + the Gate-2/Gate-3 conformance both pass.
4. design-guide adherence still works (theme.css carries the tokens; templates use var(--...)).
5. The run reaches `done` (merge + local sync) without the wait-migrate 30-min hang (thread 2).
6. Full hermetic vitest suite green; typecheck clean; each increment committed.
