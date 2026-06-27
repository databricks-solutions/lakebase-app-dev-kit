# Test List: F1-stock-visibility

Ordered for: design-momentum

## S1 - Record Stock

| ID | AC | Kind | Description |
|----|-----|------|-------------|
| T1 | AC1-form-displays | behavior | Navigating to the record stock page renders a form with input fields for SKU, location, quantity, and tracking code |
| T2 | AC1-form-displays | behavior | Submitting the form with a required field left blank shows an inline validation error that names the missing field |
| T3 | AC2-record-created-on-submission | behavior | Submitting the form with all valid inputs creates a stock record in the database with the submitted SKU, location, quantity, and tracking code |
| T4 | AC3-confirmation-shown | behavior | After a successful form submission the user sees a confirmation message indicating the stock record was saved |
| T5 | AC5-tracking-code-persisted | behavior | A tracking code submitted on the form is retrievable from the API without loss or truncation |
| T6 | AC4-collision-handled-via-update | behavior | Submitting the form for a SKU and location that already has a record updates the existing record's quantity and shows no error message |
| T7 | AC2-record-created-on-submission | behavior | Submitting a stock record with a negative quantity is rejected at write time and no row with a negative quantity is stored |
| T8 | AC2-record-created-on-submission | fitness | The routes/boundary module does not import the DB session; persistence is only reachable through the repository layer (layering contract) |
| T9 | AC5-tracking-code-persisted | fitness | The application reads DB_NAME/PGDATABASE from the environment and contains no hardcoded DSN string (config-in-env, NFR-F1-5) |
| T10 | AC4-collision-handled-via-update | fitness | The stock table carries a database-level unique constraint on (sku, location) so the upsert strategy is enforced at the schema layer (NFR-F1-3) |
| T11 | AC2-record-created-on-submission | fitness | The pytest-bdd conftest binds to the real paired-branch DB (DB_NAME=stockflow); no mock or in-memory DB substitution is used in any integration test (NFR-F1-4) |

## S2 - Home Stock Table

| ID | AC | Kind | Description |
|----|-----|------|-------------|
| T12 | AC1-table-displays | behavior | Navigating to the stock home page when records exist renders a table with one row per seeded stock record |
| T13 | AC5-empty-state | behavior | Navigating to the stock home page when no records exist shows an explicit empty-state guidance message instead of a blank or empty table |
| T14 | AC2-organized-by-location | behavior | When records span multiple locations the table rows are grouped so all rows for one location appear together before rows for the next location |
| T15 | AC3-columns-display | behavior | Each table row displays the SKU, location, quantity, and inventory_code values from the corresponding seeded stock record |
| T16 | AC3-columns-display | behavior | A stock record whose inventory_code is null renders the literal text 'not tracked' in the inventory_code column rather than an empty cell (NFR-F1-6) |
| T17 | AC4-quantities-right-aligned | behavior | The rendered quantity cell carries a right-align CSS style so the numeric column is visually scannable |
| T18 | AC1-table-displays | fitness | The home route module does not import the DB session; the read path reaches the database only through the repository layer (layering contract) |
| T19 | AC2-organized-by-location | fitness | The repository or service module supplies rows already ordered by location then SKU; no sorting or grouping logic appears in the boundary or template module |

## S3 - SKU Detail View

| ID | AC | Kind | Description |
|----|-----|------|-------------|
| T20 | AC1-detail-view-displays-sku-distribution | behavior | Navigating to the detail page for a SKU that has stock at multiple locations renders one row per location with the location name and current quantity |
| T21 | AC2-tracking-code-displayed | behavior | Each location row in the SKU detail view displays the inventory tracking code stored on that location's stock record |
| T22 | AC3-optional-fields-show-not-tracked | behavior | A location row whose optional fields (e.g., par level) have no stored value displays the literal text 'not tracked' rather than a blank cell or raw null |
| T23 | AC1-detail-view-displays-sku-distribution | fitness | The SKU detail route module does not import the DB session; the read path is enforced as boundary -> service -> repository with no ORM access outside the repository (layering contract, NFR-F1-7) |
| T24 | AC1-detail-view-displays-sku-distribution | fitness | Seeding stock for a SKU at N locations and requesting the detail view returns exactly N rows with matching location, quantity, and tracking code for each seeded record, with no records omitted (read completeness, NFR-F1-7) |

## Deferred

None.
