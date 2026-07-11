## Schema (Lakebase branch `staging`)

### Migrations applied on this branch (CI)
| Version | Migration |
|---------|-----------|
| 20260711203524_create_stock_records | (alembic) |
| 20260711203907_add_stock_records_audit_fields | (alembic) |

### Schema diff: `staging` vs production

**SCHEMA CHANGES (Lakebase diff)**

+ TABLE alembic_version (CREATED)
  L version_num character varying

+ TABLE stock_records (CREATED)
  L id integer
  L sku character varying
  L location character varying
  L quantity integer
  L inventory_code character varying
  L created_at timestamp with time zone
  L actor character varying
