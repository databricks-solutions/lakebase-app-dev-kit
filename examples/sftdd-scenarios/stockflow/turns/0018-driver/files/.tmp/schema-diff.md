## Schema (Lakebase branch `experiment-s1-record-stock-exp1`)

### Migrations applied on this branch (CI)
| Version | Migration |
|---------|-----------|
| 20260711203524_create_stock_records | (alembic) |
| 20260711203907_add_stock_records_audit_fields | (alembic) |

### Schema diff: `experiment-s1-record-stock-exp1` vs production

**SCHEMA CHANGES (Lakebase diff)**

+ TABLE stock_records (CREATED)
  L id integer
  L sku character varying
  L location character varying
  L quantity integer
  L inventory_code character varying
  L created_at timestamp with time zone
  L actor character varying
