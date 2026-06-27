## Schema (Lakebase branch `experiment-s1-split-add-backfill-exp1`)

### Migrations applied on this branch (CI)
| Version | Migration |
|---------|-----------|
| 20260624124618_create_stock_table | (alembic) |
| 20260624131321_add_actor_column_to_stock | (alembic) |
| 20260624134308_add_inventory_code_to_stock | (alembic) |
| 20260624142037_add_batch_number_serial_number_to_stock | (alembic) |

### Schema diff: `experiment-s1-split-add-backfill-exp1` vs production

**SCHEMA CHANGES (Lakebase diff)**

~ TABLE stock (MODIFIED)
  + batch_number character varying
  + serial_number character varying
