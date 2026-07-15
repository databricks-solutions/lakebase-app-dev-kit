# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0-beta.16] - 2026-07-15

### Fixed

- **Interactive `--plan-only` no longer misreports a PO pause as an approved plan
  (FEIP-8001).** In interactive mode (the default), `lakebase-sftdd-drive --sprint
  <s> --plan-only` correctly stops after the Architect's estimate at the Product
  Owner's `author-requests` (the human must write the feature-request(s)). But
  that stop is a human-INPUT action, not an approval gate, and the completion
  handlers only inspected the approval-gate stop , so the run printed
  `planning complete (plan gate approved)` and exited 0 despite producing nothing
  (no `backlog.json` / `gates.json` / `feature-request.md`, workflow-state still
  at `discovery`). A caller would advance on an empty backlog. The human-input
  stop is now carried distinctly (`pendingInput`): `runSprint` halts on it instead
  of falling through to an empty backlog, and the CLI reports a clear
  `PAUSED , the PO must author feature-request(s), then re-run. Nothing was
  approved or produced` and exits NON-ZERO in the `--plan-only`, sprint, and
  `--feature` bound paths (the postcondition , an approved plan , is not met). A
  genuine approval gate still exits 0 (work produced, awaiting approval).

## [0.3.0-beta.15] - 2026-07-14

Hardening from field feedback against beta.14, plus a consumer-facing packaging
fix. The through-line: a replay is a RECORDING. It now fails loud on a missing
corpus artifact instead of silently spawning a live agent, the shipped scenario
corpus is guarded complete, and the declared gate policy is human-in-the-loop by
default. Validated by a full live stockflow F1+F6 replay (design through promote,
zero agent-takeovers) on top of the hermetic suite.

### Added

- **Replay-corpus completeness guard.** The scenario-corpus integrity test was
  broadened from "every test-list `ac_id` resolves to a tracked ac file" to the
  FULL set of artifacts the driver restores on replay: per-feature
  `feature-spec.json` / `architecture.json` / `test-list.json`, per-story
  `story.json` / `reflect-verdict.json` / at least one ac, the uiTrack
  `design-guide.json`, and the per-story `recorded-build` turns. It keys off what
  the corpus SHIPS (tracked `story.json` / feature dir), so it cannot false-fail
  on an optional feature. A dropped artifact now fails hermetically in CI naming
  the exact file, long before it could surface as a live-replay hard-fail.

### Changed

- **HITL-first gate policy (field feedback).** The declared project gate policy
  (`project.gates`) now defaults to `interactive` (a human approves each gate).
  `proxy` (headless, Human Proxy approves) is a deliberate opt-in. A run-scoped
  `--gates` flag no longer persists into `sftdd-config.json` (a single headless
  `--gates proxy` invocation could permanently flip an interactive project); the
  drive resolves the effective mode per run as `--gates ?? project.gates` and
  records it run-scoped only. `proxy` with no non-interactive signal
  (`AUTO_CONTINUE` / CI) now refuses rather than silently auto-continuing.

### Fixed

- **Consumer installs missing every `scripts/sftdd` bin (FEIP-7989, GH #168).**
  The shipped `dist` was incomplete, so a `github:...#tag` consumer install
  received a partial CLI set. The release now ships a complete `dist` and guards
  it: `prepare.mjs` verifies every bin is present on a consumer install, the
  scaffolded `scripts/lk` warm-check refuses an incomplete kit, and a
  `dist-bins-shipped` test asserts parity.
- **Replay fell through to a live agent on a corpus miss.** When a replay lane
  was told to reproduce a turn the corpus lacked, the driver printed a note and
  SPAWNED THE REAL AGENT, letting an agent "take over" a deterministic run and
  masking an incomplete corpus. All three fall-throughs (design turn, build turn,
  reflect verdict) now throw `ReplayCorpusMissError`, failing loud (exit 2) and
  naming the missing artifact. No agent is ever spawned in a replay lane.
- **`.gitignore` silently dropped shipped files.** An org-init `*conf*.json`
  glob matched any tracked file whose name contains "conf", so several shipped
  artifacts were never committed and a consumer never received them: scenario ac
  data (`*-confirmed.json`, `*-nonconforming-*.json`), a dropped corpus ac
  (`AC3-confirmation-shown.json`), and, most impactfully, the React client
  template's **`tsconfig.json`** (its `build`/`typecheck` scripts are
  `tsc --noEmit && vite build`, so a scaffolded client could not typecheck or
  build without it). The ignore is now anchored to the actual runtime file
  (`run-config.json`) by exact basename, and every dropped shipped file is
  restored. Non-shipped local scenario recordings (`stockflow-live/`,
  `stockflow-s3-selfheal-verify/`, no tracked `scenario.json`) that the removal
  un-hid are kept out via exact directory paths (never a glob).
- **Replay/capture smoke harness gate policy.** The harness is headless by
  construction (it exports `LAKEBASE_SFTDD_HUMAN_PROXY=1`), but it only passed
  `--gates proxy` on the capture path, relying on the old global `proxy` default
  for replay. With the HITL-first flip that default is gone, so a pure replay
  blocked at the first per-story spec gate. The harness now declares
  `--gates proxy` in both directions.

## [0.3.0-beta.14] - 2026-07-11

A deploy-verify failure caused by a shared-state-fragile prior test can now
self-heal instead of dead-ending at the human gate. Surfaced by the live
stockflow capture (F6/S3): three integrity-probe tests written for an earlier
story asserted an absolute whole-table aggregate, so they passed on their own
isolated build branch but failed the full-feature deploy-verify once later
stories' rows shared the table. That is a fragile test, not broken software, but
the only route was the terminal HIL, and re-driving just re-failed the same
unscoped test.

### Added

- **Deploy-verify self-heal routing (FEIP-7916).** When a per-story
  deploy-verify fails, the deploy step re-runs the failing tests in ISOLATION on
  a fresh child branch. If they all pass alone, the failure is shared-state
  contamination, so instead of the terminal escalation the orchestrator records
  a one-shot marker and routes a story-level **Navigator ASSESS-DEPLOY** turn
  (confirm the fragile set, prescribe how to scope each to own its rows) then a
  **Driver SCOPE-DEPLOY** turn (refactor only those tests), and re-deploys to
  re-verify. A passing re-verify clears the marker and the story proceeds to
  acceptance. The self-heal is bounded to a single attempt: if the re-deploy
  still fails, the one shot is spent and it raises to the human, so a fragile
  test can never spin. A genuine regression (any failing test that still fails in
  isolation) takes the terminal gate exactly as before. Validated live end to
  end on the stockflow F6/S3 capture.

### Fixed

- **`capture-scenario.sh` relative `--inputs-from`.** The path was consumed after
  the script `cd`s into the freshly created project, so a relative `--inputs-from`
  resolved against the project dir and the recorded intake vanished (the
  human-proxy "recorded source not found: .../intake/product-overview.md"
  refusal). It is now absolutized up front, and fails loud if the directory is
  missing.
- **Deterministic sprint-planning PROPOSE.** The propose directive named its
  artifact only in passing, so the Spec Author (an LLM) could invent candidates in
  its reply, write no file, then on a re-dispatch claim it "already exists" , the
  handoff guard then aborted the run on the empty artifact. The directive is now
  explicit (WRITE `planning/feature-proposals.md`, author it fresh), and in
  capture/replay (recorded feature-requests present) the propose step is
  DETERMINISTIC: a new `lakebase-sftdd-human-proxy supply-proposals` projects a
  conforming `feature-proposals.md` from the recorded requests instead of spawning
  the LLM. Interactive users keep the live propose turn.

## [0.3.0-beta.13] - 2026-07-09

Hardening surfaced by a live React-SPA capture: the SFTDD build now has a
first-class client test lane, a SPA's e2e no longer collides with the backend's
in CI, and the scaffolded full run can no longer green client code whose tests
never ran. Plus a downstream-migrate matching fix.

### Added

- **Client test lane for SFTDD (FEIP-7915).** The test-list gains a `client`
  kind: the test-strategist routes client-verified ACs to it, the navigator
  authors them under `client/tests/`, and the driver dispatches them to the
  client's Vitest/Playwright runners. The reflect gate is aware of the lane, so
  a client-verified AC can no longer be silently proven by a backend test.

### Fixed

- **A React SPA owns its e2e lane (FEIP-7916).** A SPA was scaffolded with two
  e2e harnesses , the `client/` Playwright suite and the backend's
  server-rendered Python `tests/e2e` live_server , both binding the backend
  port, which collided in CI (`reuseExistingServer:false`) with
  "http://localhost:8000/health is already used". `create-project` /
  `enable-e2e` now make the client Playwright suite the sole e2e for a SPA (no
  Python `tests/e2e`, no root `playwright.config` on a Node backend).
- **CI e2e port resiliency (FEIP-7916).** `port_in_use` + `free_port` are
  factored into a shared `scripts/port-utils.sh` (run-dev.sh sources it);
  `client/playwright.config.ts` takes `E2E_BACKEND_PORT` / `E2E_CLIENT_PORT`
  (defaults 8000/5173) threaded into the uvicorn command, the `/health` poll,
  and the Vite proxy; and `pr.yml` gains an "Allocate free E2E ports" preflight
  that moves off a stale port instead of hard-failing (multi-tenant safe).
- **The full run can no longer false-GREEN client code (FEIP-7915).**
  `run-tests.sh` installs client deps and runs the client suite instead of
  silently skipping when `client/node_modules` is absent, so a broken client
  test fails in-build, not at the deploy gate.
- **`discard --revise` resets the story's build state (FEIP-7915).**
  Reviving a story now clears its cycle records + test-list statuses so the
  build lane genuinely re-drives instead of reading the stale build as allGreen.
- **`scm-merge --wait-migrate` matches the downstream run by merge-commit SHA**
  instead of a `mergedAt` time window, ending the false "(no matching run)"
  timeout when `mergedAt` reflected a post-cleanup local clock.
- **Claiming resumes an in-flight feature instead of refusing (FEIP-7916).**
  The sprint driver re-claims each backlog feature right before driving it, so
  resuming a sprint whose feature was mid-promote (`pr-ready` / `ci-green`)
  failed with "Cannot claim feature branch from state pr-ready". The idempotent
  same-feature no-op now covers all in-flight claimed states, so a re-claim
  hands back the existing claim and the drive resumes where it stopped; a
  different feature in one of those states is still `already-claimed-other`.
- **Whole-table aggregate tests must own their state (FEIP-7916).** A test that
  asserts an absolute table-wide aggregate (an integrity probe / global
  `COUNT`/`SUM`) passed on the isolated per-cycle build branch but failed the
  full-feature deploy-verify once other stories' rows shared the table. The
  test-strategist + navigator canon now requires scoping the seed AND the
  assertion to the test's own rows (or a delta), never a global total, enforced
  by a new spec-level `shared-state-aggregate-assertion` smell the reflect critic
  surfaces at design time.

## [0.3.0-beta.12] - 2026-07-09

A first-class React SPA client scaffold (a single-page app is now the path of
least resistance for a UI project, not a build-from-scratch fight), plus two
scaffold-hygiene fixes that every Databricks-internal adopter was hitting.

### Added

- **First-class React SPA client scaffold (FEIP-7910).** `templates/project/
  client/` ships a React 18 + TypeScript + Vite single-page app, layered into
  `api/` (the only `fetch` layer), `hooks/`, `components/`, `pages/`, and
  `styles/` (Databricks design tokens as CSS custom properties), with Vitest +
  Testing Library (jsdom) unit tests and a Playwright e2e example. A new
  `clientFramework` knob (`create-project --client react|none`) defaults to
  `react` for a `--ui-track` project and `none` otherwise, and is persisted to
  `sftdd-config.json` (`project.clientFramework`). The Python backend serves the
  built client from `client/dist` in production (single-process deploy), the
  client's Vitest suite runs in CI (`pr.yml`) and `run-tests.sh`, and the
  Architect and Driver now treat the React SPA as a first-class `renders_via`
  path, defaulting to it when a client was scaffolded. The dev/CI/hook plumbing
  keyed on `client/package.json` (Vite boot, client build + Playwright, npm
  install) now has a real scaffold to find.

### Fixed

- **scm-doctor no longer reports permanent false workflow drift (FEIP-7911).**
  `detectWorkflowDrift` now substitutes `{{LAKEBASE_KIT_VERSION}}` in the
  template before comparing (the same substitution the writer and the command
  drift detector already applied), so a correctly version-pinned project reads
  as `unchanged` instead of standing drift.
- **get-connection reference no longer trips the secret scanner (FEIP-7912).**
  The example DSN's fake `eyJ...` JWT is replaced with a `<jwt-token>`
  placeholder, so the doc no longer blocks commits behind a Databricks
  secret-scan pre-commit hook.

## [0.3.0-beta.11] - 2026-07-09

Architect-canon design-lane optimization (FEIP-7902) plus a cluster of live-capture
hardening fixes surfaced by a full stockflow F1+F6 sprint run.

### Added

- **Architecture canon (FEIP-7902).** The architect's cross-cutting standing
  decisions (NFR posture, AC layer placement, persistence-invariant patterns) are
  established once into a project-level `architecture/canon.json` (twin of
  `conventions.json`). Per-story architectural notes are then PROJECTED
  deterministically with no live architect turn in the common case; a live turn
  fires only when a story is novel, recovered through the existing revise-routing
  self-heal (`architect-canon-gap` smell, owning role architect-reviewer). The
  establishing feature is exempt from gap-checking its own stories.
- **Durable per-turn timing.** `lakebase-sftdd-timing` now rolls up the driver's
  measured `turn.usage` durations by role and role/model (with cost), independent
  of stdout capture, plus a `--skip-planning` flag. The old inter-event gap
  rollups remain for orchestration-overhead analysis.
- **Multi-sprint capture.** `capture-scenario.sh` accepts repeatable `--sprint`
  groups driven sequentially on one project; the backlog is scoped per sprint
  (`sprints/<sprint>/requested.json`), so a later sprint no longer re-drives an
  earlier sprint's feature.

### Changed

- **Apps mint their Lakebase DB credential at RUNTIME; no token is stored in
  `.env`.** Scaffolded Python and Node apps (and all-language migrations) build
  from connection metadata and mint a short-lived Postgres token on demand via the
  databricks CLI; `.env` carries metadata only. An explicit `DATABASE_URL` still
  overrides (CI/Docker). This fixes deployed apps and long runs failing once the
  old baked-in token expired. (Java/Kotlin Spring app-runtime minting is tracked
  separately as a follow-up.)

### Fixed

- **The sprint halts on a raise-to-HIL instead of advancing.** A feature that
  escalates (e.g. a failed deploy-verify) now stops the sprint and exits non-zero,
  rather than being counted "complete", which previously advanced to the next
  sprint and crashed the next feature's claim with `already-claimed-other`.
- **`story.json` field drift no longer hard-fails the feature-complete gate.** The
  reconcile seam normalizes a stray `feature` to `feature_id` and strips non-spec
  keys (e.g. `status`) into `story.schema` conformance.
- **Capture reconstitute only runs when a design-lane log exists.** A fully-live
  capture (which designs straight into the project agent-log) no longer prints a
  spurious "requires --design-log" error.

## [0.3.0-beta.10] - 2026-07-07

Design-lane hardening surfaced by the live SFTDD capture (a fresh run that reached
feature-complete but flagged two design defects along the way).

### Added

- **A persistence invariant belongs to exactly one story (no cross-story
  re-test).** A declared `persistence_invariant` is realized once by the feature's
  schema, so its fitness test belongs to the one story whose migration realizes it.
  A later story re-emitting a fitness item for an invariant an earlier story already
  covers is a redundant re-test that drifts (one copy asserts the field-named
  validation message, the other only the raw rejection) and dead-locks the reflect
  gate. New `checkInvariantCoverageDistinct`, wired into the test_list gate
  (`gate-conformance-guard`), hard-blocks Gate 3 on the duplicate. The reflect critic
  caught only the one duplicate phrased weaker; the deterministic gate catches all.
  Types `invariant_id` on `TestListItem` and adds the rule to the Test Strategist
  canon.

### Fixed

- **The UX Designer's `design-guide.json` conforms at the source, and the design
  lane gates on it.** The UX Designer (told never to read the schema) drifted on
  shape (camelCase keys, a nested `spacing.scale`, extra typography props) and, since
  the guide was gated only on existence, the non-conformant file rode all the way to
  the final feature drain. The `typography` schema is expanded to hold the tokens the
  model legitimately produces (`line_heights`, `font_weights`; the numeric font uses
  the existing `font_mono`), mapped to `--line-height-*` / `--font-weight-*` in
  `design-adherence`. The UX Designer now gets the exact JSON shape inline in its
  prompt plus a response-formatter self-check, and `designGuideReady` requires the
  guide to EXIST and CONFORM (one shared `designGuideConformance` helper backs both
  the self-check and the gate), so a malformed guide keeps the role pending instead
  of surfacing at the drain.

## [0.3.0-beta.9] - 2026-07-07

Follow-on to beta.8, surfaced by the live SFTDD capture at an S2 REFACTOR that
dead-locked.

### Fixed

- **A UI test that asserts the implementation instead of the seam no longer
  dead-locks the REFACTOR.** The Test Strategist authored a test that grepped the
  page source for an inline `style=` (e.g. `text-align: right`); the design lane then
  refactored that inline style into a token-driven class, so the test could never
  stay green and the REFACTOR halted. New `ui-style-implementation-test` smell
  (spec-level, owned by the Test Strategist, re-gates `test_list`) plus a reflect
  critic directive that flags a styling test asserting raw inline CSS in the page
  source rather than the rendered seam (a design-guide class / `data-testid`) or the
  design-adherence gate. The Test Strategist guidance now directs, for a
  design-guide-governed visual property, asserting the seam and leaving the rendered
  property to the design-adherence gate. This is a design-lane guard: it prevents the
  test from being authored, it does not retroactively rewrite a frozen test list.

## [0.3.0-beta.8] - 2026-07-07

Follow-on to beta.7, surfaced by the live SFTDD capture at the S1 experiment cut.

### Fixed

- **Stray agent-created junk no longer blocks the experiment cut, and never rides a
  commit.** A design-lane agent wrote a mis-quoted file (named `"`) to the project
  root; the fork guard refused the cut because the build commit ran `git add -A` and
  would have committed that junk onto the experiment branch. `commitExperimentCode`
  now allow-lists what it stages (every tracked change anywhere, plus new untracked
  files only under the source/test/migration roots or with a recognized source
  extension, so root-level `app.py` is still committed), and `assertCleanForFork`
  ignores untracked files (uncommitted edits to tracked source still refuse). Adds an
  `untracked` toggle to `isDirty` and an `untrackedAllow` option to
  `commitAllIfChanged`.

## [0.3.0-beta.7] - 2026-07-07

Resilience hardening surfaced by a live SFTDD capture run (paired-branch build +
deploy + PR/CI).

### Fixed

- **alembic subcommands can import app code (PYTHONPATH parity).** `alembic upgrade`
  runs `env.py` (which prepends the project root to `sys.path`), but `alembic
  history`/`heads` do not, yet still import every migration module to build the
  revision map. A data migration importing app code then failed
  `ModuleNotFoundError` under the migration-lineage check while working under
  upgrade. `spawnAlembic` now puts the project root on `PYTHONPATH` for every
  subcommand, and the scaffolded `alembic.ini` gains the idiomatic `prepend_sys_path
  = .`.
- **Ephemeral-verify branch create tolerates a silent client flake.** A
  `create-branch` that exits non-zero yet lands the branch server-side no longer
  aborts: `createBranch` re-checks and adopts the landed branch. `classifyDatabricksError`
  folds stdout + the exit code into the message when stderr is empty, so a silent
  failure is legible.
- **Ephemeral-verify child name capped at the 63-char Lakebase limit.** An over-limit
  name was truncated on create but looked up untruncated ("branch id not found"); the
  name now truncates the descriptive prefix and preserves the unique `-vrfy-<nonce>`
  suffix.
- **Pre-build reflection turn is guarded.** A reflect turn that produces no readable
  `reflect-verdict.json` now escalates to the human instead of the driver silently
  re-invoking it into a stall.

### Added

- **`migration-app-coupling` smell + `lakebase-sftdd-migration-clean` gate.** A
  deterministic check (mirroring contract-clean) that fails a build cycle when a
  migration imports app code at module scope, routing a repair to make the migration
  self-contained before it reaches CI.

## [0.3.0-beta.6] - 2026-06-30

EMU / CI robustness, surfaced by a partner project on an Enterprise Managed Users
org.

### Fixed

- **Host-aliased git remotes resolve to the correct owner/repo.** `getGitHubUrl`
  only normalized a literal `git@github.com:` remote, so an SSH host-alias remote
  (common for EMU, e.g. `org-140212977@github-emu:databricks-field-eng/partner-
  asset-tracker.git`) was mis-parsed into a garbage owner and every owner/repo API
  call 404'd , Create PR and self-hosted runner setup both failed with "Not
  Found". The normalizer now extracts owner/repo after any host (SCP, `ssh://`,
  `https://`, with or without a user) and re-homes it on github.com.

### Added

- **`getActionsEnabled(ownerRepo)`** , reports whether GitHub Actions is enabled
  for a repo (returns `undefined` when undeterminable, so a missing token never
  false-alarms). Used by the new scm-doctor check + the extension's Health Check.
- **scm-doctor `github-actions-disabled` finding** , when Actions is off (commonly
  an org policy on EMU repos a repo admin cannot override), the kit's CI workflows
  (pr.yml / merge.yml) silently never run; the doctor now surfaces this explicitly
  with remediation instead of leaving "CI never happened" unexplained.

## [0.3.0-beta.5] - 2026-06-29

Greenfield hardening: scaffolded-project fixes surfaced by a hands-on evaluation
of a freshly created project. All changes are additive and validated live on a
real workspace (project provision + Flyway migrate + multi-schema diff + a full
create-project run with a GitHub repo).

### Added

- **Monorepo-aware migration-layout resolver (single source of truth).**
  `scripts/lakebase/migration-layout.ts` owns language detection and the
  migration path / pattern / glob conventions (`detectLanguageAt`,
  `resolveMigrationLanguage`, `resolveMigrationLayout`, `compileMigrationPattern`);
  `schema-migrate` delegates to it, and the VS Code extension consumes it so a
  subdir app (e.g. `recipe-app/migrations`) is detected correctly instead of
  assuming a repo-root Flyway layout.
- **Multi-schema schema diff (`--schema`).** `branch-schema.ts` now owns one
  shared `buildSchemaQuery` / `schemaObjectName` / `isAllSchemas`; both
  `queryBranchSchema` and `getSchemaDiff` consume it and accept a `schema`
  argument (default `public`, a named schema, or `all` / `*` which qualifies
  names as `schema.table`). `lakebase-schema-diff` gains `--schema <name|all>`.
  Objects outside `public` are no longer silently invisible to the diff. The
  schema name is bound, never interpolated.
- **Create-project preflight + cleanup (`scripts/lakebase/create-preflight.ts`).**
  - `checkDatabricksAuth` runs as create Step 0: a missing/stale token fails with
    an actionable `databricks auth login --host <host>` message up front, before
    any GitHub repo or Lakebase project is created.
  - `warmAndVerifyKit` warms AND verifies the fast-CLI cache at create time and
    surfaces a specific warning if it fails (a silent warm failure used to
    surface later as a mysterious commit hang).
  - `withLakebaseRollback` wraps the post-create steps so a failure deletes the
    just-created Lakebase project, leaving no orphaned slug to block a same-name
    retry.

### Fixed

- **Flyway baseline trap.** The java + kotlin fallback `pom.xml` and the dynamic
  `pom-patch.ts` now pin `<baselineVersion>0</baselineVersion>` alongside
  `baselineOnMigrate=true`, so `mvn flyway:migrate` applies `V1` on a fresh
  database instead of consuming it as the baseline (parity with the kit's
  Flyway runner, which already passed `-baselineVersion=0`).
- **`pre-push` no longer blocks a push on a stale Databricks token.** A failed
  OAuth token refresh now warns and lets the push proceed (the token only
  affects the downstream CI secret sync); it no longer `exit 1`s.
- **Commit-time schema diff can no longer stall a commit.** `lk` honors
  `LK_NO_INSTALL` so a cold kit cache skips the synchronous `npm install` (the
  ~70s stall) and exits 97; `prepare-schema-diff.sh` sets it and wraps the diff
  in a portable hard timeout (`LAKEBASE_SCHEMA_DIFF_TIMEOUT`, default 10s). A
  cold cache or slow Lakebase yields a commit without the diff, never a blocked
  commit.

## [0.3.0-beta.4] - 2026-06-27

### Added

- **Artifact-root resolution + auto-migration.** The on-disk artifact/log directory
  name now lives in one place (`scripts/sftdd/sftdd-paths.ts`: `ARTIFACT_ROOT`,
  `resolveTddDir`) instead of being a `"./.tdd"` default copy-pasted across ~20 call
  sites. `resolveTddDir` is dual-read: it prefers `.sftdd`, falls back to a legacy
  `.tdd` when that is what exists, and defaults a fresh project to `.sftdd`. The
  orchestrator (`lakebase-sftdd-drive`) auto-migrates a legacy `.tdd` to `.sftdd` on
  its next run (`git mv` to preserve history when possible, else a filesystem
  rename), and rewrites the project `.gitignore` entries to match.
- **Per-story build granularity: contract/cleanup stories auto-drop to `ac`.** A
  story that drops, removes, or renames an existing shape (a column / endpoint /
  field, detected from the story id verb) now builds one verifiable increment per
  AC regardless of the run default, since its lockstep DB+code change is too heavy
  for one story-level GREEN turn (`effectiveLoopForStory` in `orchestrator-derive.ts`,
  applied in both the routing and the RED/GREEN/REFACTOR prompt builder).
- **Reactive supersession self-heal.** When greening an AC breaks PRIOR-story tests,
  a failed honest-GREEN verify routes a Navigator ASSESS turn that classifies each
  failure as supersession (the latest AC intentionally changed that behavior) or a
  genuine regression. Superseded tests are flagged for permissive Driver refactor; a
  regression routes one bounded Driver repair. A MIXED verdict (some superseded plus a
  regression) is served in a single repair turn (the repair directive now carries the
  superseded-tests allowlist).
- **Ephemeral verify branch.** With `LAKEBASE_SFTDD_EPHEMERAL_VERIFY=1`, each GREEN /
  deploy verify runs its migrations + tests on a disposable child Lakebase branch
  forked off the story's experiment branch (then deleted), so a contract story's
  up/down migration fixtures cannot leave the shared DB half-migrated for the next
  run (`scripts/sftdd/ephemeral-verify.ts`).
- **Mid-turn context-overflow recovery.** A role turn that overflows the model window
  ("prompt is too long") is retried on a fresh session (bounded), continuing from the
  on-disk artifacts rather than failing the run (`scripts/sftdd/context-budget.ts`).
- **`sftddEnv` env accessor.** `scripts/sftdd/sftdd-env.ts` reads `LAKEBASE_SFTDD_*`
  with a fallback to the legacy `LAKEBASE_TDD_*` name, the read-side half of the
  env-prefix rename below.

### Changed

- **Config file + env prefix renamed `tdd` -> `sftdd` (back-compat).** The unified
  config is now `.lakebase/sftdd-config.json` and the runtime env knobs are
  `LAKEBASE_SFTDD_*`, matching the `lakebase-sftdd-workflows` skill, the `scripts/sftdd/`
  dir, and the `lakebase-sftdd-*` bins. Both are dual-read: `loadTddConfig` prefers
  `sftdd-config.json` and falls back to a legacy `tdd-config.json`; every env read goes
  through `sftddEnv`, which falls back to `LAKEBASE_TDD_*`. Existing projects / shells
  keep working with no manual change; new writes use the canonical names.
- **Supersession + contract-completeness canon (`software-design-principles`).** Hard
  rule 8 (a later AC can supersede earlier tests) now requires scanning for
  supersession COMPREHENSIVELY, including FITNESS / migration tests that assert a
  property of a dropped shape (reversibility, schema-shape), not only tests that name
  it. Hard rule 9 makes a schema-contract change update the data model AND the code
  (ORM / queries / serializers / views) in lockstep with the migration. The Navigator
  ASSESS and Driver REPAIR prompts enforce both.
- **Artifact directory renamed `.tdd` -> `.sftdd`.** New projects (and the
  `sftdd-bootstrap` template) scaffold a `.sftdd/` directory to match the
  `lakebase-sftdd-workflows` naming. Existing `.tdd` projects keep working (dual-read)
  and are auto-migrated on the next orchestrated run, so no manual action is required.
  The `tdd-paths.ts` module was renamed to `sftdd-paths.ts`.
- **Spec Driven Development (SDD) framing.** `lakebase-sftdd-workflows` docs now name
  the two lanes explicitly: the design lane (`/design`) is Spec Driven Development
  (SDD), which produces and freezes the executable spec at the `spec` + `test_list`
  gates; the build lane (`/build`) is Test Driven Development (TDD), which builds
  against that frozen spec. Narrative added to the skill README + SKILL, the
  spec-format reference, the design-lane agent prompts (spec-author,
  architect-reviewer, test-strategist), and the kit README + CLAUDE.

### Fixed

- **Deploy resilience on a port already in use.** Before refusing to deploy because a
  port is occupied, the deploy stops its OWN prior app instance and re-probes, so a
  re-run reclaims its own port instead of failing on a foreign-port refusal
  (`scripts/sftdd/deploy.ts`).

## [0.3.0-beta.1] - 2026-06-10

Second beta on the 0.3.0 line. Consume via
`npx github:databricks-solutions/lakebase-app-dev-kit#v0.3.0-beta.1`.

### Added

- **Promote phase.** After a feature is accepted, the deterministic driver runs a
  PR cycle (prepare-pr -> wait-ci -> HITL promote gate) then merges the feature up
  to its parent tier in git + Lakebase, so the next sprint forks from a populated
  parent.
- **Universal turn recorder.** `LAKEBASE_TDD_RECORD_DIR` makes the driver record
  every state-machine turn (design, build, gates, deploy, promote) as a replayable
  per-turn corpus: `turns/<NNNN>-<label>/` (manifest + the .tdd/code delta that
  turn produced) + `turns/index.json`, plus the cumulative `recorded-artifacts`
  and `recorded-build` mirrors the existing replay engine consumes.
- **imports-clean gate** (`lakebase-sftdd-imports-clean`): the app entry must import
  without an optional build artifact (e.g. `client/dist`) present, catching
  import-time coupling before deploy. New `import-time-build-coupling` bad smell
  plus a dev/prod-parity rule in the `software-design-principles` canon.
- **Claude Code plugin.** The kit installs as a plugin: `claude plugin
  marketplace add databricks-solutions/lakebase-app-dev-kit` then `claude plugin
  install lakebase-app-dev-kit@lakebase-app-dev-kit`. Launch the workflow with
  `/lakebase-app-dev-kit:tdd` (resumes in a scaffolded project, guides creation
  elsewhere).
- **Per-role agent runtime.** Eight role agents (product-owner, spec-author,
  ux-designer, architect-reviewer, test-strategist, navigator, driver,
  release-engineer) scaffolded into a project's `.claude/agents/` and invoked by
  the driver as `claude --agent <role>`.
- **Per-story pipeline + experiments.** Stories stream through design -> build
  with a ready queue; each story builds on its own experiment branch
  (cut / accept=merge / discard), paired with a Lakebase branch.
- **Deterministic deploy + Release Engineer handoff** at story acceptance, with
  deploy-evidence as the backstop; **honest GREEN** (no GREEN without a passing
  runner outcome) + **escalate-to-HIL** on any agent-surfaced error.

### Changed

- **Build commits working software at each GREEN + REFACTOR** (code only, on the
  experiment branch), so accept's merge carries real commits to the feature branch
  and the promote phase opens a clean PR. CI now builds the client before tests
  (dev/CI parity).
- **Agent-loop performance (P0-P7).** Per-turn timing report
  (`lakebase-sftdd-timing`), a leaner pre-digested REVIEW rubric, a fresh-per-story
  build session, a low-effort REVIEW turn, and reduced inter-phase shell overhead.
- **Kit CLIs resolve through a project's `scripts/lk`** (ref-keyed cache or
  `LAKEBASE_KIT_DIR`) instead of per-call `npx` git resolution.
- The orchestrator is a **deterministic state-machine driver**
  (`lakebase-sftdd-drive`), not an LLM agent.

## [0.3.0-beta.0] - 2026-06-05

First beta on the 0.3.0 line, graduating from the alpha series. Consume via
`npx github:databricks-solutions/lakebase-app-dev-kit#v0.3.0-beta.0`.

### Added

- **Artifact-conformance gate.** Per-artifact format registry: JSON
  artifacts are validated against their schema and narrative markdown against its
  required sections. The mock HITL approver hard-blocks a gate whose artifact
  exists but is malformed, rather than approving it.
- New schemas shipped in `dist`: `agent-log-event`, `architecture`,
  `design-guide`, `plan`. Shared schema loader removes duplicated validation
  wiring.
- `lakebase-sftdd-gate-conformance` CLI to scan a feature's artifacts for
  conformance.
- **Structured agent logging.** JSON-lines events (role, timestamp, level,
  event) written to `.tdd/agent-log.jsonl`, with the `lakebase-sftdd-log` CLI.
  HITL decisions are recorded (the mock reviewer validates expected elements and
  the human response is captured).
- **Per-role-agent contracts.** Relay headers on every role agent; a
  new Spec Author (Business Analyst) role and a conditional UX Designer (UI-only)
  role with token-level design adherence enforced at the Playwright layer.
- `feature-request.md` artifact: the Feature Requester's original ask, the Spec
  Author's read-only input.

### Changed

- **Explicit artifact authorship.** `spec.md` renamed to `product-overview.md`
  (Product Owner, project-level), and `feature.{md,json}` renamed to
  `feature-spec.{md,json}` (Spec Author). "spec" is now reserved for the Spec
  Author.
- NFRs moved off the spec-gated `feature-spec.json` / `story.json` onto
  `architecture.json` (the architect proposes, the HIL adjudicates at Gate 2),
  removing spec-gate drift.
- SCM feature-branch naming now goes through the shared sanitizer as the single
  source of truth; claim preserves the canonical `feature_id` case and is
  idempotent.

### Fixed

- The Spec Author no longer overwrites the Feature Requester's original ask: the
  requester's document is preserved as `feature-request.md` and never
  overwritten.

[0.3.0-beta.1]: https://github.com/databricks-solutions/lakebase-app-dev-kit/releases/tag/v0.3.0-beta.1
[0.3.0-beta.0]: https://github.com/databricks-solutions/lakebase-app-dev-kit/releases/tag/v0.3.0-beta.0
