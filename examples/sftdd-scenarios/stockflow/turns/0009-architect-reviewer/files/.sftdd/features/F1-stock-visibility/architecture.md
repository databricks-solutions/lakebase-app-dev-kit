# Architecture , F1 Record and view stock by SKU and location

`service_backed: true`. The feature persists a domain entity (stock record) with
an Alembic migration and carries business logic (create-or-update on the
`(sku, location)` key, non-negative floor). This is the FIRST feature: the
role -> module layout declared in `architecture.json` becomes the project-wide
convention every later feature inherits.

## Canonical layering (project convention)

Inward dependency direction; the boundary never imports the DB session, and
business logic never lives in the boundary or the client. Defended by the
layering fitness test.

| role | module | may import |
|------|--------|------------|
| boundary (JSON API, `renders_via: react`) | `app/routes/` | service |
| service | `app/services/` | repository, models |
| repository (only ORM/session layer) | `app/repositories/` | models |
| models (package, one module per entity) | `app/models/` (e.g. `app/models/stock_record.py`) | , |

`app/models/` is a PACKAGE with one module per domain object
(`app/models/stock_record.py`), never a flat `app/models.py`. The scaffold ships
a placeholder `app/models.py`; the build lane replaces it with the package.

UI rendering: the project was scaffolded with a React client under `client/`
and R5 requires a single-page app, so the boundary returns JSON only
(`renders_via: react`) and the existing `client/` workspace (Vite + Vitest +
Playwright) renders it. No server-side templates.

## Layer assignments (S1-record-stock)

- AC1 record-form-displayed , **E2E** (SPA form page renders SKU / location / quantity / inventory_code fields + file control; client boundary only, no server round-trip)
- AC2 file-new-stock-confirmed , **E2E** (full write path SPA -> boundary -> service -> repository -> DB, durable persistence + confirmation echo)
- AC3 refile-updates-not-duplicates , **E2E** (write-time collision resolution: service upsert + DB composite unique constraint PI1, single row survives)
- AC4 refile-no-error-page , **E2E** (graceful outcome: refile resolves to a 2xx confirmation, never an error page)

All four are real integration tests against the paired Lakebase branch.

## Architectural Concerns Mapping

| Concern | Owner layer / module | Notes |
|---------|---------------------|-------|
| Input validation | boundary (`app/routes/`) | field-named inline errors (preference) |
| Business rules (create-or-update, non-negative) | service (`app/services/`) | never in boundary or model |
| (sku, location) uniqueness | service upsert + DB unique constraint (PI1) | resolved at write time (R3) |
| Persistence / ORM access | repository (`app/repositories/`) | the ONLY ORM/session layer |
| Transaction boundary | service | never the domain/model |
| Audit (created_at, actor) | service sets, model stores immutably | R1 |
| Config (DB connection) | env (`DATABASE_URL` -> `databricks_postgres`) | twelve-factor; do not rename the DB |
| UI rendering | React SPA (`client/`), JSON boundary | R5; `renders_via: react`, no full-page reloads |
| Logging / observability | substrate invariant (agent log) | not a feature NFR |
| AuthN / AuthZ | none for V1 | explicitly out of bounds |

## Pattern proposals

- Repository pattern isolates SQLAlchemy in `app/repositories/`; the service
  depends on the repository, keeping the ORM out of business logic (SOLID Data Intelligence Platform).
- Service-level upsert (`get_by_sku_location` -> update | insert) backed by a DB
  composite unique constraint on `(sku, location)` so R3 holds even under a race.
- Stock record modeled as a single-responsibility aggregate in
  `app/models/stock_record.py`; the combined `inventory_code` stored as one field
  for V1 (splitting into location/batch/serial is a later feature).

## Risks

- Upsert-on-collision (AC3/AC4) is a deliberate semantic: a refile OVERWRITES the
  stored quantity rather than adjusting it. If the PO later wants
  record-vs-adjust to differ, this write boundary needs revisiting (quantity
  adjustment is a separate feature, out of scope here).
- The scaffold ships a flat `app/models.py`; converting it to the `app/models/`
  package must happen in the first build cycle or later features inherit the
  wrong shape (module-placement fitness check).
- Recording stock at an unknown location is created implicitly for V1; if a
  location master is later introduced, the unique-constraint scope and write path
  change.

## Decisions (for PO at Gate 2)

1. **Refile semantics** (spec open question 3) , recommend last-write-wins upsert
   (overwrite quantity + inventory_code), matching AC3 (single row holds the new
   values) and AC4 (no error page). Record-vs-adjust distinction deferred to the
   adjustment feature.
2. **Location / SKU as free-text** (open questions 1, 2) , recommend free-text
   strings in V1 with no master data; location/SKU masters are later features.
   The unique constraint scopes to the free-text `(sku, location)` pair.
3. **inventory_code storage** , recommend a single stored free-text field with a
   bounded max length for V1; the split into location/batch/serial is a later
   feature (open question in the F6 scope).

## Test strategy

Real-DB integration tests against the paired Lakebase branch
(`databricks_postgres`), never mocked/stubbed/in-memory. Python pytest-bdd:
Gherkin `.feature` + `tests/step_defs/test_*.py` + `tests/conftest.py`; Alembic
migrations applied to the branch first; FK-aware targeted-DELETE cleanup. AC1-AC4
verified through the SPA/E2E flow against the branch (AC1 form fields displayed,
AC2 read-back persistence + confirmation, AC3 single-row upsert, AC4 graceful 2xx
confirmation). Each `persistence_invariant` (PI1 unique, PI2 NOT NULL, PI3 CHECK
quantity >= 0, PI4 migration reversibility) gets a real-branch test tied to the
schema's own contract. Layering, config-in-env, and the JSON/SPA boundary are
enforced by the architecture fitness tests.

## Sign-off

Recommendation: **proceed**. `service_backed: true` with the four-layer canonical
layout (boundary `app/routes/`, service `app/services/`, repository
`app/repositories/`, models package `app/models/`); all five Required NFRs
(R1-R5) carried into `architecture.json`, plus config-in-env and field-named
validation proposed for PO adjudication. Headless (Human Proxy) mode: recommended
resolutions to the Gate-2 decisions are recorded above and each proposed NFR is
set `hil_status: accepted` for the Human Proxy to validate and approve.

, Architect Reviewer (role 2 of 6)
