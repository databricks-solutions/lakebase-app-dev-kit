# Split the combined tracking code into batch and serial columns

The V1 `inventory_code` introduced in F1 is a hyphen-delimited location-batch-serial code (for example "A12-B7-S001"). It bundles three facts into one opaque string, so nothing can query or validate batch and serial on their own. This iteration is the canonical schema refactor the Product Owner demos after sprint 1: it pulls the batch and serial out into their own columns and retires the combined code, while every existing stock row survives the change.

Concretely for this feature:

- Add `batch_number` and `serial_number` as first-class columns on the stock record, then backfill them from the existing `inventory_code` and drop the combined column. `location` is already its own column (part of UNIQUE(sku, location)), so this iteration does NOT recreate a location column. It extracts only batch and serial.
- The backfill parses by delimiter (split on "-", segment 2 is batch, segment 3 is serial), NOT by fixed width. The seed and fixture data is variable width and not uniform (some codes such as "X-1" or a bare "c" have no batch or serial segment).
- No silent data loss or corruption (R1). Every sprint-1 row must survive the migration. Codes that do not parse as location-batch-serial leave `batch_number` and `serial_number` NULL rather than being guessed or dropped, and an integrity probe surfaces the count of nonconforming rows for review before the change is accepted. The code's leading segment is NOT treated as authoritative for `location`, which stays canonical and unchanged.
- The migration is reversible: the down path reconstructs a combined `inventory_code` from the canonical `location` plus the split-out batch and serial.
- After the change, a stock record exposes batch and serial as distinct, separately addressable fields wherever the combined code was shown before (R3, single unambiguous identity per stock position).

Builds on F1-stock-visibility (the stock table and `inventory_code` it introduced). The proof of correctness is the parent-aware schema diff plus the integrity-probe warning count, run against the paired Lakebase branch (R1, R4). A worked reference for the migration shape lives at `.tdd/release/migration-examples/split_inventory_code.sql`.
