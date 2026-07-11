# Test list: F6-split-tracking-code
Ordered for: design-momentum

- [x] T1: seeding stock rows whose inventory_code parses as location-batch-serial (e.g. "A12-B7-S001"), running the split migration's up() backfills batch_number and serial_number with the parsed segments  (AC1-backfill-conforming-codes)
- [x] T2: seeding stock rows whose inventory_code lacks a batch or serial segment (e.g. "X-1", bare "c"), running the split migration's up() leaves batch_number and serial_number NULL on those rows  (AC2-nonconforming-left-null)
- [x] T3: the split migration's delimiter-parsing logic lives only in the Alembic revision under migrations/versions/, never in app/services or app/models (layering contract)  (AC1-backfill-conforming-codes)
- [x] T4: the Alembic env and app DB config resolve the connection from the injected DATABASE_URL against databricks_postgres on the paired branch, with no hardcoded DSN (config-in-env)  (AC4-combined-column-dropped)
- [x] T5: snapshotting all existing stock rows' location and quantity before the split migration, every row still exists afterward with its location and quantity unchanged  (AC3-every-row-survives-unchanged)
- [x] T6: forcing the backfill step to fail mid-migration leaves the branch with neither the new columns added nor inventory_code dropped, confirming the add-columns+backfill+drop-column sequence runs as a single atomic transaction and canonical location/quantity are never touched  (AC3-every-row-survives-unchanged)
- [x] T7: after the split migration, inserting a stock row with a (sku, location) pair duplicating an existing row still raises a unique-constraint IntegrityError against the branch DB, confirming UNIQUE(sku, location) survives the column split  (AC4-combined-column-dropped)
- [x] T8: after the split migration, the stock_records schema no longer has an inventory_code column, leaving batch_number and serial_number as the separately queryable fields  (AC4-combined-column-dropped)
- [x] T9: seeding a known set of stock rows with a marked subset of nonconforming inventory_codes, the integrity probe run for review reports a count matching exactly that marked nonconforming subset (scoped to this test's own seeded rows, not a whole-table total)  (AC5-nonconforming-count-reported)
- [x] T10: running the split migration's down() after up() on a conforming-code row reconstructs inventory_code from the canonical location plus batch_number and serial_number, matching the pre-migration value, via an isolated single-step downgrade -1 / upgrade head round-trip on its own ephemeral branch  (AC6-migration-reverses)

## Deferred / skipped
- (none)
