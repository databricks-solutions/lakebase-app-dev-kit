## Schema (Lakebase branch `experiment-s1-record-stock-exp1`)

### Migrations applied on this branch (CI)
| Version | Migration |
|---------|-----------|
| 20260624124618_create_stock_table | (alembic) |
| 20260624131321_add_actor_column_to_stock | (alembic) |

### Schema diff: `experiment-s1-record-stock-exp1` vs production

**SCHEMA CHANGES (Lakebase diff)**

+ TABLE alembic_version (CREATED)
  L version_num character varying

+ TABLE stock (CREATED)
  L id integer
  L sku character varying
  L location character varying
  L quantity integer
  L tracking_code character varying
  L created_at timestamp with time zone
  L actor character varying
