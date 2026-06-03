# Bug Tracker (FEIP-7422 smoke domain)

A small bug-tracking app, used as the test subject for the kit's
end-to-end SCM-workflow smoke. The domain is intentionally simple so
the smoke proves the **kit + extension workflow**, not the cleverness
of the app being built.

## What the app does

A web app where a team files bugs, transitions them through a
status workflow, and views the open queue.

## Stack

| Layer | Choice |
|-------|--------|
| Language | Python 3.10+ |
| Web | FastAPI |
| ORM | SQLAlchemy |
| Migrations | Alembic |
| Test framework | pytest + httpx |
| Frontend | Server-rendered HTML (Jinja2) for v5's list view |
| E2E | Playwright (project-root config, FEIP-7094 wire-up) |

## Why bug-tracker

The domain naturally evolves: a flat list of bugs grows into a
relational model with owners, statuses, and a split entity. Each
iteration has a credible motivation that maps to a real refactor
pattern. The smoke can therefore exercise the SCM workflow across
five distinct schema-modifying PRs without contrived scope changes.

## Iteration arc (5 PRs)

| Iter | Branch | Headline change | Refactor type |
|------|--------|-----------------|---------------|
| v1 | `feature/initial-domain` | Bug CRUD baseline | Greenfield |
| v2 | `feature/add-owners` | Users entity + FK from bugs | FK introduction |
| v3 | `feature/status-table` | Promote status enum to its own table | Enum to table + data backfill |
| v4 | `feature/split-bug-entity` | Extract BugDetails from Bug | Split-entity refactor |
| v5 | `feature/list-view` | HTML list view + `[E2E]` AC | Frontend + Playwright |

Each iteration is a separate feature branch that gets a paired
Lakebase branch via the kit's `post-checkout` hook, drives `/design`
+ `/build` skills to produce the code + migration + tests, opens a
PR (in `--standard` or `--full` modes), waits for CI green, and
merges.

## Final state after v5

Tables on `production`:

- `users` (id, email, display_name)
- `statuses` (id, name, sort_order)
- `bugs` (id, title, status_id FK, owner_id FK)
- `bug_details` (bug_id PK+FK, description, repro_steps)
- `alembic_version` (Alembic bookkeeping)

Endpoints:

- `POST /bugs` create
- `GET /bugs/{id}` read
- `GET /bugs` HTML list view (v5)
- `PATCH /bugs/{id}` update (status transition, owner reassignment)
- `POST /users` + `GET /users` (v2+)
- `GET /statuses` (v3+)

## What the smoke proves (per mode)

- `--fast`: scaffold + skill loop works end-to-end (no PR, no CI).
- `--standard`: SCM + CI + FEIP-7423 wiring work at least once
  (only iteration 5 exercises the full PR + CI + merge cycle).
- `--full`: every iteration's PR + CI + merge cycle is green,
  and v5's Playwright `[E2E]` step hits the paired-branch deployment
  via the kit's `LAKEBASE_APP_ENDPOINT` export (FEIP-7423).

## Non-goals

- The app is not production-quality. Authentication, authorization,
  pagination, soft-delete: all out of scope.
- The Playwright `[E2E]` AC asserts non-5xx + a renderable list; it
  does not exercise auth flows or full DOM correctness.
- The smoke does not attempt to validate `/design`'s output quality.
  That's the agent-eval pyramid's job (FEIP-7343).
