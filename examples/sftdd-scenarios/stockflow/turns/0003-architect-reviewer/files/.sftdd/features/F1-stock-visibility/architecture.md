# Architecture , F1 Record and view stock by SKU and location

`service_backed: true`. The feature persists a domain entity (Stock) with a
migration and carries business logic (create-or-update on the (sku, location)
key, non-negative invariant). This is the FIRST feature: the role -> module
layout declared here becomes the project-wide convention every later feature
inherits.

## Canonical layering (project convention)

Inward dependency direction; the boundary never imports the DB session, business
logic never lives in the boundary or templates (defended by
`tests/architecture/test_layering.py`).

| role | module | may import |
|------|--------|------------|
| boundary | `app/routes/` | service |
| service | `app/services/` | repository, models |
| repository (only ORM/session layer) | `app/repositories/` | models |
| models (package, one module per entity) | `app/models/` (e.g. `app/models/stock.py`) | , |

`app/models/` is a PACKAGE with one module per domain object (`app/models/stock.py`),
never a flat `app/models.py`.

## Layer assignments (S1-record-stock)

- AC1 form-displays , **E2E** (UI render, no DB state)
- AC2 record-created-on-submission , **E2E** (full write path, asserts DB state)
- AC3 confirmation-shown , **E2E** (post-save UI feedback)
- AC4 collision-handled-via-update , **E2E** (R3 upsert end to end + no UI error)
- AC5 tracking-code-persisted , **API** (persistence round-trip contract, no UI claim)

All are real integration tests against the paired Lakebase branch.

## Layer assignments (S3-sku-detail-view)

Read-only story; no new persistence, no migration, no Infra AC. service_backed
stays `true` (inherited convention); the same boundary/service/repository/models
layout is reused, only a read path is added.

- AC1 detail-view-displays-sku-distribution , **E2E** (route -> query service -> repository read -> model; UI render asserted against real branch state)
- AC2 tracking-code-displayed , **E2E** (persisted tracking code surfaced per location row)
- AC3 optional-fields-show-not-tracked , **E2E** (nullable optional fields render explicit "not tracked", NFR-F1-6)

## Architectural Concerns Mapping

| Concern | Owner layer / module | Notes |
|---------|---------------------|-------|
| Input validation | boundary (`app/routes/`) | field-named inline errors (preference) |
| Business rules (create-or-update, non-negative) | service (`app/services/`) | never in boundary or model |
| (sku, location) uniqueness | repository + DB unique constraint | upsert at write time (R3) |
| Persistence / ORM access | repository (`app/repositories/`) | the ONLY ORM layer |
| Transaction boundary | service | never the domain/model |
| Audit (created_at, actor) | service sets, model stores immutably | R1 |
| Config (DB host/name) | env (`DB_NAME`/`PGDATABASE=stockflow`) | twelve-factor; not databricks_postgres |
| Logging / observability | substrate invariant (agent log) | not a feature NFR |
| AuthN / AuthZ | none for V1 | explicitly out of bounds |

## Pattern proposals

- Repository pattern isolates SQLAlchemy in `app/repositories/`; service depends
  on the repository interface (Data Intelligence Platform).
- Service-level upsert (`get_by_sku_location` -> update | insert) backed by a DB
  unique constraint on (sku, location) so R3 holds even under a race.
- Stock model as a single-responsibility aggregate in `app/models/stock.py`.

## Risks

- Upsert-on-collision (AC4) is a deliberate semantic: a re-record OVERWRITES
  quantity rather than adjusting it. If the PO later wants record-vs-adjust to
  differ, this boundary will need revisiting (adjustment is already a separate
  feature, F2).
- Optional fields (par level, batch, serial) default to "not tracked"; schema
  must allow nullable columns so the additive-migration preference (R1) holds.
- Implicit vs explicit location creation (open question) affects the write path
  and the unique constraint scope.

## Decisions (for PO at Gate 2)

1. **Navigation home -> SKU detail** , recommend: both (click SKU name + direct URL).
2. **Form validation rules** , recommend: SKU + location + quantity required;
   quantity a non-negative integer; inventory_code free text with a stored max
   length (matched by AC5 no-truncation test).
3. **Recording stock at an unknown location** , recommend: create implicitly
   (warehouse-floor speed), revisit if location master data is later introduced.
4. **Confirmation content** , recommend: confirmation names what was saved
   (SKU, location, quantity), satisfying the no-silent-failure brief.

## Test strategy

Real-DB integration tests against the paired Lakebase branch (`stockflow`), never
mocked/stubbed/in-memory. Python pytest-bdd: Gherkin `.feature` +
`tests/step_defs/test_*.py` + `tests/conftest.py`; Alembic migrations applied to
the branch first; FK-aware targeted-DELETE cleanup. AC1-AC4 verified through the
E2E/UI flow against the branch; AC5 verified at the write-API/repository boundary
against the branch. S3 AC1-AC3 verified through the detail-view E2E flow against
the branch (seeded multi-location rows, NFR-F1-7 read-consistency assertion).
Layering and config-in-env enforced by the architecture fitness tests.

## Sign-off

Recommendation: **proceed**. service_backed=true with the four-layer canonical
layout; all four Required NFRs (R1-R4) carried into `architecture.json` plus
config-in-env and usability NFRs proposed for PO adjudication at Gate 2.

, Architect Reviewer (role 2 of 6)
