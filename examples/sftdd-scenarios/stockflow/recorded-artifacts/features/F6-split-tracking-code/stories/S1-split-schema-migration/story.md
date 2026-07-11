# S1-split-schema-migration

**As an** inventory manager
**I want to** have the combined `inventory_code` split into first-class
`batch_number` and `serial_number` columns by a reversible migration that
backfills them by delimiter from the existing codes (split on `-`, segment
2 batch, segment 3 serial), leaves nonconforming codes NULL, drops the
combined column, and reports how many rows did not parse
**So that** batch and serial become separately queryable and validatable
without losing or corrupting any existing stock row (R1), and the change
can be reviewed before acceptance and rolled back safely.

Not user-facing. The proof of correctness is the parent-aware schema diff
plus the integrity-probe nonconforming-row count, run against the paired
Lakebase branch (R1, R4). The down path reconstructs a combined
`inventory_code` from the canonical `location` plus the split-out batch and
serial. A worked reference lives at
`.tdd/release/migration-examples/split_inventory_code.sql`.
