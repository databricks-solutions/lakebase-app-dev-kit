# v3: Status Table (promote enum to its own table)

**Branch**: `feature/status-table`
**Lakebase parent**: `staging`
**Migration**: V3 (`CREATE TABLE statuses` + `ALTER TABLE bugs ADD status_id` + data backfill + `ALTER TABLE bugs DROP status`)

## Story

The v1 status enum has outgrown itself. Promote `status` from a
`VARCHAR(20)` column constrained by a `CHECK` to a separate
`statuses` table with `id`, `name`, `sort_order`. Existing rows
backfill from their current string value.

This is the iteration where the schema-diff PR comment has to
correctly surface `CREATE TABLE` + `ADD COLUMN` + `DROP COLUMN` +
`DROP CONSTRAINT` in a single migration.

## Acceptance Criteria

| ID | Given | When | Then |
|----|-------|------|------|
| AC1 | migration V3 has been applied | GET /statuses | the response is 200 and lists `[{name: "open", ...}, {name: "in_progress", ...}, {name: "closed", ...}]` in `sort_order` |
| AC2 | a v2 bug with `status` (string) = "open" existed before V3 ran | the upgrade backfills `status_id` from the matching `statuses.name` | the bug's `status_id` references the `open` row, and the old `status` column is gone |
| AC3 | the `bugs.status` string column no longer exists post-migration | inspecting `information_schema.columns` | `bugs.status` is absent, `bugs.status_id` is present |
| AC4 | a bug exists | PATCH /bugs/{id} with `{status_id: 2}` (in_progress) | the response is 200 and the bug's status_id is 2 |
| AC5 | a bug exists | PATCH /bugs/{id} with `{status_id: 9999}` (no such status) | the response is 4xx with a foreign-key error |

## Schema delta

```python
def upgrade():
    # 1. Create the new table.
    op.create_table(
        "statuses",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(50), nullable=False, unique=True),
        sa.Column("sort_order", sa.Integer, nullable=False),
    )
    # 2. Seed the canonical rows. Order matches the v1 enum.
    op.bulk_insert(
        sa.table("statuses",
            sa.column("id", sa.Integer),
            sa.column("name", sa.String),
            sa.column("sort_order", sa.Integer)),
        [
            {"id": 1, "name": "open",        "sort_order": 10},
            {"id": 2, "name": "in_progress", "sort_order": 20},
            {"id": 3, "name": "closed",      "sort_order": 30},
        ],
    )
    # 3. Add the FK column nullable so existing rows can populate it.
    op.add_column(
        "bugs",
        sa.Column("status_id", sa.Integer, sa.ForeignKey("statuses.id"), nullable=True),
    )
    # 4. Backfill from the old string column.
    op.execute("""
        UPDATE bugs SET status_id = (
            SELECT id FROM statuses WHERE statuses.name = bugs.status
        )
    """)
    # 5. Now make it non-null.
    op.alter_column("bugs", "status_id", nullable=False)
    # 6. Drop the old column + its check constraint.
    op.drop_constraint("ck_bugs_status", "bugs", type_="check")
    op.drop_column("bugs", "status")
```

## Files /build is expected to produce or change

- New: `alembic/versions/0003_status_table.py`
- Update: `app/models.py` (replace `Bug.status: str` with `Bug.status_id: int` + `Status` model)
- Update: `app/main.py` (PATCH body accepts `status_id`; add `/statuses` GET endpoint)
- New: `tests/test_statuses.py`
- Update: `tests/test_bugs.py` to match the new shape

## Refactor type

**Enum to table + data backfill.** The migration carries a
`UPDATE ... SET ... FROM` clause that the smoke verifies
exercises the kit's schema-diff PR comment (it should detect the
column add, the backfill, AND the column drop).

## Out of scope for v3

- Removing the `Bug.title` length limit (still 200)
- Adding a `created_at` to `statuses` (not needed)
- A migration to rename `status_id` to `status` (intentional: keep
  it explicit that this column is an FK)
