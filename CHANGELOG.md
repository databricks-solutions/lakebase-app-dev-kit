# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
