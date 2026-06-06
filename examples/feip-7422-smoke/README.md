# FEIP-7422: End-to-End SCM Workflow Smoke

Drives a real bug-tracker project through 5 evolution iterations against
the kit's full SCM + (optionally) CI loop. Closes FEIP-7422 ("Kit:
end-to-end [E2E] cycle smoke against a scaffolded project").

This directory ships with the kit so the smoke is versioned alongside
the code it tests. The actual scaffold lives outside the kit repo
(default: `~/code/feip-7422-smoke/bug-tracker/`).

## What this proves

| Mode | Per-iteration depth | Wall-clock | What's verified |
|------|---------------------|-----------|-----------------|
| `--fast` | scaffold + `/design` + `/build` + local tests + local commit. No push, no PR, no CI. | ~5 min | Scaffold + skill loop works end-to-end |
| `--standard` (default) | Iterations v1-v4 are `--fast` semantics. Iteration v5 runs the FULL PR + CI green + merge + Playwright `[E2E]` cycle. | ~15 min | SCM + CI + FEIP-7423 wiring work at least once |
| `--full` | Every iteration is a real PR + CI green + merge. v5 also asserts Playwright `[E2E]` / `LAKEBASE_APP_ENDPOINT`. | ~45 min | Every iteration's CI passes |

## Domain: bug-tracker

A small bug-tracking app (Python + FastAPI + SQLAlchemy + Alembic +
Playwright) that evolves across 5 PRs:

| Iter | Headline | Refactor type |
|------|----------|---------------|
| v1 | Bug CRUD baseline | Greenfield |
| v2 | Users entity + FK from bugs | FK introduction |
| v3 | Promote status enum to its own table | Enum -> table + data backfill |
| v4 | Extract BugDetails from Bug | Split-entity refactor |
| v5 | HTML list view + `[E2E]` AC | Frontend + Playwright |

Product Owner requirements: [`orchestrator/product-overview.md`](orchestrator/product-overview.md).
Per-iteration feature requests (Feature Requester): [`orchestrator/feature-requests/`](orchestrator/feature-requests/).

### Tier topology: 2-tier (prod + staging)

This smoke is opinionated: the bug-tracker project is **2-tier**. The
kit counts long-running tiers only, NOT feature branches:

| `--tiers` | Long-running tiers | Where features fork from |
|-----------|--------------------|--------------------------|
| 1 | prod | prod |
| 2 | prod + staging | staging |
| 3 | prod + staging + dev | dev |

Every iteration forks from `staging`, so the project must be 2-tier.
`run-smoke.sh` enforces `--tiers 2`; 1 or 3 are rejected. For a different
topology, fork the feature requests and change where each forks from.

### Final state after v5

Tables on `production`: `users` (id, email, display_name), `statuses`
(id, name, sort_order), `bugs` (id, title, status_id FK, owner_id FK),
`bug_details` (bug_id PK+FK, description, repro_steps), `alembic_version`.

Endpoints: `POST /bugs`, `GET /bugs/{id}`, `GET /bugs` (HTML list, v5),
`PATCH /bugs/{id}`, `POST /users` + `GET /users` (v2+), `GET /statuses` (v3+).

These are the Architect's / implementation's concern, recorded here for
reference, not in the Product Owner's `product-overview.md`.

## How to run

### Prerequisites

- `git`, `npx`, `jq` on PATH
- `claude` CLI on PATH (drives the `/design` + `/build` skills)
- `gh` CLI authenticated (only required outside `--fast` mode)
- `DATABRICKS_HOST` + `DATABRICKS_TOKEN` env vars OR `~/.databrickscfg`
- A workspace where you can create Lakebase projects + branches

### Default (standard mode)

```bash
bash examples/feip-7422-smoke/orchestrator/run-smoke.sh
```

Drives all 5 iterations. v1-v4 commit locally; v5 opens a PR, waits for
CI, merges. ~15 min wall-clock.

### Fast mode

```bash
bash examples/feip-7422-smoke/orchestrator/run-smoke.sh --fast
```

No CI at all. Useful for proving the kit's `/design` + `/build` skill
loop works end-to-end on a fresh scaffold.

### Full mode

```bash
bash examples/feip-7422-smoke/orchestrator/run-smoke.sh --full
```

Every iteration is a real PR + CI + merge. ~45 min.

### Resume

If an iteration fails and you've fixed it:

```bash
bash examples/feip-7422-smoke/orchestrator/run-smoke.sh --resume v3
```

Skips v1-v2 and starts at v3.

### Other useful flags

| Flag | Meaning |
|------|---------|
| `--project-dir <dir>` | Override the scaffold target directory |
| `--skip-scaffold` | Reuse an existing scaffold instead of running `lakebase-create-project` |
| `--no-keep-on-failure` | Clean up Lakebase branches + project dir on failure (default: keep) |

## What the smoke does NOT prove

- Quality of `/design` + `/build` output (that's the agent-eval pyramid, FEIP-7343).
- Multi-user / auth flows.
- Visual regression / DOM correctness past structural assertions.
- Performance / load characteristics.

## Maintaining the smoke

The smoke's structure is guarded by `tests/bdd/feip-7422-smoke.test.ts`,
which asserts:

- The Product Owner requirements doc exists at `product-overview.md`
- A `feature-requests/` subdir holds the 5 per-iteration requests
- Each feature request is in Feature Requester voice: YAML frontmatter
  declaring `author: Feature Requester`, requester narrative describing
  WHAT the user wants, and NO implementation detail (no SQL, HTTP verbs,
  table names, or file paths), NO Acceptance Criteria tables, and NO
  operational metadata (branch, Lakebase parent, migration version are
  all derived by the orchestrator from convention)
- The orchestrator references all 5 iterations in order
- All three modes are documented + implemented
- `claude` + `gh` (outside `--fast`) are required-on-PATH checks
- Each iteration has a matching `verify-v*.sh`

To add a new iteration: append the feature request under `feature-requests/`, append a
`verify-v*.sh` under `assertions/`, extend the `ITERATIONS=(...)` line
in `run-smoke.sh`, and update the BDD test's `ITERATIONS` constant.

## Status

FEIP-7422 closed by the PR that lands this directory. The smoke itself
is run manually for now; nightly CI invocation can be wired later as a
separate ticket.
