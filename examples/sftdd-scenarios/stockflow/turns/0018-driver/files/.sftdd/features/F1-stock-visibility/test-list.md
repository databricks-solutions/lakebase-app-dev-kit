# Test list: F1-stock-visibility
Ordered for: design-momentum

- [x] T1: the empty record-stock form renders its SKU, location, quantity, and inventory_code fields plus a file control, each with its data-testid seam (client component)  (AC1-record-form-displayed)
- [x] T2: the api boundary module for stock recording does not import the DB session; persistence is confined to the repository (layering contract)  (AC2-file-new-stock-confirmed)
- [x] T3: the app and its Alembic env resolve the DB connection from the injected DATABASE_URL env var, with no hardcoded DSN or app-specific DB name (config-in-env)  (AC2-file-new-stock-confirmed)
- [x] T4: filing a stock record returns a JSON response body, not server-rendered HTML, from the api boundary (SPA/JSON boundary contract)  (AC1-record-form-displayed)
- [x] T5: filing a new (sku, location) with a quantity and inventory_code persists a stock record with those values and returns a save confirmation (real-branch integration)  (AC2-file-new-stock-confirmed)
- [x] T6: inserting a stock_records row with a NULL sku, location, quantity, or inventory_code is rejected by the migration's NOT NULL constraints (real branch)  (AC2-file-new-stock-confirmed)
- [x] T7: inserting a stock_records row with a negative quantity is rejected by the migration's CHECK quantity >= 0 constraint (real branch)  (AC2-file-new-stock-confirmed)
- [x] T8: the stock_records migration applies, reverses on a single downgrade -1, and re-applies cleanly, preserving any pre-existing rows (real branch, isolated migration test)  (AC2-file-new-stock-confirmed)
- [x] T9: refiling an existing (sku, location) with a different quantity and inventory_code updates the existing row in place, leaving exactly one row for that pair (real-branch integration)  (AC3-refile-updates-not-duplicates)
- [x] T10: inserting a second stock_records row with a (sku, location) pair that already exists raises an IntegrityError from the composite UNIQUE(sku, location) constraint (real branch)  (AC3-refile-updates-not-duplicates)
- [x] T11: refiling the same (sku, location) a second time returns a 2xx save confirmation and the operator stays on the normal stock screen, with no error page shown for the collision (real-branch integration)  (AC4-refile-no-error-page)
- [x] T12: submitting an invalid filing (e.g. a negative quantity) returns a field-named inline error naming the offending field, not a bare 400 (real-branch integration)  (AC2-file-new-stock-confirmed)

## Deferred / skipped
- (none)
