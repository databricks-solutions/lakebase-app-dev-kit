# Architecture: F6 - Split the combined tracking code into batch and serial columns

Service-backed. Reuses the project layer conventions established by
F1-stock-visibility (boundary `app/routes/` react, service `app/services/`,
repository `app/repositories/`, models `app/models/`). No layer is remapped
or renamed. S1 is an Infra-layer schema refactor (an Alembic revision plus a
read-only integrity probe); S2 is the E2E/UI change that exposes the split
fields.

## Layer assignment summary

Every S1 acceptance criterion lives at the **Infra** layer: they are
contracts on the shape and contents of `stock_records` on the paired
Lakebase branch after (and, for AC6, after reversing) the split migration.
The delimiter parse and backfill are one-off migration logic that lives in
the Alembic revision under `migrations/versions/`, never in the running
service or domain model. The `app/models/` stock model is updated to add
`batch_number` / `serial_number` and drop `inventory_code` so the ORM
mapping matches the migrated schema. AC5's nonconforming count is a
read-only diagnostic probe (a reporting/observability concern), not domain
logic.

## Architectural Concerns Mapping

| Concern | Owner layer / module | Notes |
| --- | --- | --- |
| Schema migration (add/backfill/drop columns) | Infra: Alembic revision `migrations/versions/` | AC1, AC2, AC3, AC4, AC6 |
| Delimiter parse / backfill logic | Infra: the migration script (one-off) | Not in `app/services` or `app/models`; kept out of the running domain |
| ORM mapping of new/removed columns | models: `app/models/` stock model | Reflects the migrated schema |
| Data durability / atomicity | Infra (transactional revision) + PI1/PI2 | R1: no loss, no half-migrated state |
| (sku, location) uniqueness | repository/schema constraint (PI3) | R3: unchanged by the split |
| Integrity-probe count reporting | Infra: probe query alongside the revision | AC5; observability/reporting concern |
| Config (DB connection) | env / twelve-factor | `DATABASE_URL` -> `databricks_postgres`, no hardcoded DSN |
| UI rendering of split fields (+ NULL state) | boundary `app/routes/` (JSON) + `client/` SPA | S2 / R5, PO null-render preference |

## Pattern proposals

- **Migration as the only backfill site (SRP).** Parsing and backfill are
  transient concerns; keeping them in the Alembic revision keeps the
  service and model free of one-off code and lets the down path own the
  inverse reconstruction.
- **Nullable columns as the "leave NULL" mechanism.** `batch_number` and
  `serial_number` are declared NULLABLE, so AC2 is enforced by the schema
  shape rather than by branching logic; no CHECK/NOT NULL is added on them.
- **location stays canonical.** The code's leading segment is not treated
  as authoritative for `location`; the composite key is untouched (PI3).
- **Read-only integrity probe.** AC5's count is a separate diagnostic query
  run for review, decoupled from the mutating migration.

## Risks

- The down path (AC6) reconstructs `inventory_code` from `location + batch +
  serial`; for rows whose batch/serial are NULL (nonconforming), the
  reconstructed code cannot be byte-identical to the original. The down
  path is defined as lossless only for conforming rows; nonconforming rows
  reverse to a best-effort code. Flagged for the Test Strategist to scope
  the round-trip assertion to conforming rows.
- The worked reference `.tdd/release/migration-examples/split_inventory_code.sql`
  must stay consistent with the Alembic revision; divergence would let the
  test pass against the wrong SQL.

## Decisions (for PO adjudication at Gate 2)

1. **Input form capture of batch/serial** (spec Open Q1). _Recommendation:
   out of scope this iteration; this feature changes display + migration
   only._
2. **Other surfaces showing the combined code** (spec Open Q2).
   _Recommendation: none; the SKU detail view is the only screen changed._
3. **Detail view rendering for NULL batch/serial** (spec Open Q3).
   _Recommendation: explicit "none" / not-tracked state (NFR-F6-null-field-clean-render);
   do not resurrect the dropped combined code in the UI._

## Test strategy

Real-DB integration tests against the paired Lakebase branch
(`databricks_postgres`), pytest-bdd, no mocks/stubs/in-memory. Alembic
migrations applied to the branch first; FK-aware targeted-DELETE cleanup.

- AC1 - seed conforming rows, run the revision, assert backfilled
  batch/serial values.
- AC2 - seed nonconforming codes, assert both columns left NULL.
- AC3 - snapshot seeded rows, assert every row survives with
  location/quantity unchanged.
- AC4 - parent-aware schema diff asserts `inventory_code` is absent
  post-migration.
- AC5 - seed a known conforming/nonconforming mix, assert the probe's
  reported count matches.
- AC6 - up/down round-trip asserts `inventory_code` restored for conforming
  rows.

S2's SKU detail view is covered by the `client/` Vitest + Playwright
harness plus the JSON boundary's branch integration tests.

## Sign-off

Recommendation: **proceed**. Layers reuse the established F1 conventions;
service_backed is true; persistence invariants and all Required NFRs
(R1-R5) are carried. Gate-2 decisions recorded above for Human Proxy
validation.

- Architect Reviewer
