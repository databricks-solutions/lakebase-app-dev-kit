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
- [x] T11: the SKU detail JSON boundary (app/routes) returns batch_number and serial_number as two separate fields for a stock row with both populated, sourced via stock-service -> stock-repository against the branch DB  (AC1-batch-and-serial-shown-as-distinct-fields)
- [x] T12: the SKU detail screen renders the returned batch_number and serial_number values as two separately labelled fields in place of the retired combined-code region  (AC1-batch-and-serial-shown-as-distinct-fields)
- [x] T13: the SKU detail JSON boundary's response for a stock row contains no inventory_code key, confirming the boundary no longer exposes the retired combined code  (AC2-combined-code-no-longer-shown)
- [x] T14: the SKU detail screen renders no combined-code element anywhere on the page, only the distinct batch and serial fields  (AC2-combined-code-no-longer-shown)
- [x] T15: the SKU detail JSON boundary for a stock row with NULL batch_number returns JSON null for batch while serial_number passes through unaffected  (AC3-null-batch-shows-none)
- [x] T16: the SKU detail screen's batch field shows an explicit 'none' state when the batch value is JSON null, leaving the serial field unaffected  (AC3-null-batch-shows-none)
- [x] T17: the SKU detail JSON boundary for a stock row with NULL serial_number returns JSON null for serial while batch_number passes through unaffected  (AC4-null-serial-shows-none)
- [x] T18: the SKU detail screen's serial field shows an explicit 'none' state when the serial value is JSON null, leaving the batch field unaffected  (AC4-null-serial-shows-none)

## Deferred / skipped
- (none)
