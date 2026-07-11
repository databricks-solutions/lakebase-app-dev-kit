## Schema (Lakebase branch `experiment-s1-split-schema-migration-exp1`)

### Migrations applied on this branch (CI)
| Version | Migration |
|---------|-----------|
| 20260711203524_create_stock_records | (alembic) |
| 20260711203907_add_stock_records_audit_fields | (alembic) |
| 20260711222318_split_inventory_code_into_batch_and_ | (alembic) |

### Schema diff: `experiment-s1-split-schema-migration-exp1` vs production

**SCHEMA CHANGES (Lakebase diff)**

~ TABLE stock_records (MODIFIED)
  + batch_number character varying
  + serial_number character varying
