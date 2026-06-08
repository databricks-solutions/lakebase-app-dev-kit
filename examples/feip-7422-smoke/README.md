# FEIP-7422: End-to-End TDD Workflow Smoke

Drives a real bug-tracker project through 2 evolution iterations (v1..v2),
grouped into two sprints, to exercise the kit's TDD workflow end to end:
`/plan` -> `/design` -> `/build` -> `/deploy`, with every HITL gate stood in
for by the Human Proxy so the smoke runs headless. Closes FEIP-7422 ("Kit:
end-to-end [E2E] cycle smoke against a scaffolded project").

This directory ships with the kit so the smoke is versioned alongside the code
it tests. The actual scaffold lives outside the kit repo (default:
`~/code/feip-7422-smoke/bug-tracker/`).

**Scope.** This smoke validates the TDD workflow. The SCM workflow CLIs
(`lakebase-scm-prepare-pr` / `wait-ci` / `merge --wait-migrate`) are tested
separately by `tests/integration/scm-workflow-e2e-live.test.ts` (discovered by
`scripts/run-all-live-tests.sh`). Iterations stay local (never merged to main);
the next iteration abandons the prior feature so the SCM state machine allows a
fresh claim. The legacy `--fast` / `--standard` / `--full` flags are
accepted-but-ignored.

## What this proves

The orchestrated path runs headless, identical to a real run except the Human
Proxy stands in for the human:

- **`/plan` per sprint** (run once, above the per-feature loop): the Human Proxy
  supplies the sprint's `feature-request.md` files from the recorded backlog
  (the PO's groomed sprint), after the project-intake precondition passes. The
  backlog is committed to trunk so each feature branch inherits its request.
- **`/design` per feature**: claims the paired Lakebase + git branch via the
  substrate (Step 0), enforces the intake precondition (Step 0.5), runs the
  Spec Author -> Architect -> Test Strategist phases; gates approved by the
  Human Proxy.
- **`/build` per feature**: the TDD cycles to green; promote gate approved by
  the Human Proxy.
- **`/deploy --target local` per feature**: runs the app locally and polls until
  reachable, the per-sprint "working software" check; the Human Proxy approves
  the deploy gate only after reachability, then the app is torn down.

### Two sprints (the `/plan` feedback loop)

| Sprint | Iterations | Planned |
|--------|------------|---------|
| sprint-1 | v1 | up front |
| sprint-2 | v2 | after sprint-1 ships working software |

sprint-2 is planned only after sprint-1's features have passed their `/deploy`
gates, modeling the Product Owner folding what they saw into the next sprint's
requests. The sprints are slices of the canonical `ITERATIONS=(...)` list in
`run-smoke.sh` (DRY: order lives in one place).

## Domain: bug-tracker

A small bug-tracking app (Python + FastAPI + SQLAlchemy + Alembic +
Playwright) that evolves across 2 browser-facing iterations:

| Iter | Headline | What the user does |
|------|----------|--------------------|
| v1 | File a bug in the browser | Fill a create form, submit, land on `/bugs/{id}` (the bug starts `open`) |
| v2 | Move a bug through its states | Change status on the detail page; unrecognized values are rejected at save |

These seed feature-requests are what the Spec Author proposed from
`product-overview.md` + `nfrs.md` alone (the closed-loop smoke: the workflow's
own proposal becomes the deterministic seed). Both are user-facing, so each
ships an E2E (browser) story under the UI track.

Product Owner overview: [`orchestrator/product-overview.md`](orchestrator/product-overview.md).
NFR brief (the Architect's intake): [`orchestrator/nfrs.md`](orchestrator/nfrs.md).
UX design brief (UI track): [`orchestrator/design-brief.md`](orchestrator/design-brief.md).
The sprint's feature requests (authored by the PO at `/plan`):
[`orchestrator/feature-requests/`](orchestrator/feature-requests/).

This is a UI project (`LAKEBASE_TDD_UI=1`), so the UX Designer phase runs and
`design-brief.md` is required at intake; the UX track (design-guide + ia +
token adherence) is exercised.

### Tier topology: 2-tier (prod + staging)

This smoke is opinionated: the bug-tracker project is **2-tier**. The kit counts
long-running tiers only, NOT feature branches:

| `--tiers` | Long-running tiers | Where features fork from |
|-----------|--------------------|--------------------------|
| 1 | prod | prod |
| 2 | prod + staging | staging |
| 3 | prod + staging + dev | dev |

Features fork from `staging`, so the project must be 2-tier. `run-smoke.sh`
enforces `--tiers 2`; 1 or 3 are rejected.

### Final state after v2

Tables: `bugs` (id, title, description, status), `alembic_version`. The exact
columns + how status is modeled are the Architect's / implementation's concern,
derived from the feature-requests, not the Product Owner's `product-overview.md`.

Endpoints + screens: a create form, the bug detail page at `/bugs/{id}` (showing
title / description / status / identifier), and a status control on the detail
page. The precise routes are the Architect's call; the generic deploy-gate
verify (`assertions/verify-deploy-gate.sh`) asserts the net effect rather than a
hand-coded endpoint list.

## How to run

### Prerequisites

- `git`, `npx`, `jq` on PATH
- `claude` CLI on PATH (drives the `/design` + `/build` skills)
- `DATABRICKS_HOST` + `DATABRICKS_TOKEN` env vars OR `~/.databrickscfg`
- `GITHUB_OWNER` env var (for the scaffold's repo creation)
- A workspace where you can create Lakebase projects + branches

### Run

```bash
bash examples/feip-7422-smoke/orchestrator/run-smoke.sh --tiers 2
```

Scaffolds the project, stages project intake, then runs sprint-1 (`/plan` + v1)
and sprint-2 (`/plan` + v2). Headless throughout
(`LAKEBASE_TDD_HUMAN_PROXY=1`, set by the script).

### Resume

If an iteration fails and you've fixed it:

```bash
bash examples/feip-7422-smoke/orchestrator/run-smoke.sh --resume v2 --skip-scaffold
```

Re-plans each sprint (idempotent) and starts the per-feature loop at v2.

### The scripts (one job each)

`orchestrator/` holds exactly four runnable scripts (plus sourced helpers
`_replay-smoke.sh` and `assertions/_*.sh`). All resolve the kit through the
committed `lk` resolver, and the three smokes default to THIS checkout's built
`dist/` (deterministic + offline) unless you pass `--kit-ref`:

| Script | What it does |
|--------|--------------|
| `run-smoke.sh` | Full end-to-end: scaffold → plan → design → build → deploy, live, nothing replayed. |
| `run-to-navigator.sh` | Replays the design lane, then STOPS just before the Navigator build handoff. A launch pad to inspect/take over the build. |
| `run-to-release-engineer.sh` | Replays design + restores the recorded build, then STOPS just before the Release Engineer deploy handoff. |
| `rebuild-push-warm.sh` | Publishes the current branch: rebuild + commit `dist/` + push + warm the lk cache. Run it when you want the pushed/published bits; the smokes don't need it. |

`run-to-*` resume from where they stopped: `cd <project> && ./scripts/lk
lakebase-tdd-drive --feature F1-file-bug`.

### Other useful flags

| Flag | Meaning |
|------|---------|
| `--kit-ref <ref>` | Pull the kit from a branch / tag / sha (validate an unreleased build) |
| `--project-dir <dir>` | Override the scaffold target directory |
| `--skip-scaffold` | Reuse an existing scaffold instead of running `lakebase-create-project` |
| `--no-keep-on-failure` | Clean up Lakebase branches + project dir on failure (default: keep) |

## What the smoke does NOT prove

- Quality of `/design` + `/build` output (that's the agent-eval pyramid, FEIP-7343).
- The SCM workflow PR + CI + merge cycle (tested separately, see Scope above).
- Remote deploy targets (only `local` is implemented; remote release is `merge.yml`).
- Multi-user / auth flows; visual regression past structural assertions; performance.

## Maintaining the smoke

The smoke's structure is guarded by `tests/bdd/feip-7422-smoke.test.ts`, which
asserts (among others):

- `product-overview.md` (Product Owner voice), `nfrs.md`, and `design-brief.md`
  exist and carry their required sections.
- A `feature-requests/` subdir holds one request per iteration, each in
  feature-request voice (no SQL / HTTP verbs / table names / file paths, no
  Acceptance Criteria tables, no operational metadata).
- The orchestrator runs two sprints sliced from `ITERATIONS=(...)` (sprint-1 =
  v1, sprint-2 = v2), supplies each sprint's requests via the Human Proxy at
  `/plan`, enforces the intake precondition, and commits the backlog to trunk.
- `/deploy --target local` runs per iteration and records the deploy gate.
- `claude` is a required-on-PATH check; the SCM PR/CI CLIs are NOT invoked.
- Every iteration is verified by the single generic
  `assertions/verify-deploy-gate.sh` (migration + routes + tests + an E2E AC +
  the approved PO deploy gate); there are no bespoke per-iteration scripts.

To add a new iteration: append the feature request under `feature-requests/`,
extend the `ITERATIONS=(...)` line in `run-smoke.sh` (and the `SPRINT*_ITERS`
slices), and update the BDD test's `ITERATIONS` constant + the sprint-slice
assertions. The generic deploy-gate verify needs no per-iteration change.

## Status

FEIP-7422 closed by the PR that lands this directory. The smoke is run manually
for now; nightly CI invocation can be wired later as a separate ticket.
