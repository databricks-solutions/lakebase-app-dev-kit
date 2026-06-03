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

Full domain spec: [`orchestrator/00-domain.md`](orchestrator/00-domain.md).
Per-iteration AC specs: [`orchestrator/iterations/`](orchestrator/iterations/).

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

- The 5 iteration specs exist and each declares Branch + Lakebase parent + Migration headers
- Each spec has a Acceptance Criteria table with >=3 ACs
- v5 carries an `[E2E]` tag
- The orchestrator references all 5 iterations in order
- All three modes are documented + implemented
- `claude` + `gh` (outside `--fast`) are required-on-PATH checks
- Each iteration has a matching `verify-v*.sh`

To add a new iteration: append the spec under `iterations/`, append a
`verify-v*.sh` under `assertions/`, extend the `ITERATIONS=(...)` line
in `run-smoke.sh`, and update the BDD test's `ITERATIONS` constant.

## Status

FEIP-7422 closed by the PR that lands this directory. The smoke itself
is run manually for now; nightly CI invocation can be wired later as a
separate ticket.
