# v4: Split Bug Entity (extract BugDetails)

**Branch**: `feature/split-bug-entity`
**Lakebase parent**: `staging`
**Migration**: V4 (`CREATE TABLE bug_details` + data backfill from `bugs.description` + `ALTER TABLE bugs DROP description` + add `bugs.repro_steps` -> moved to `bug_details`)

## Story

The bug-details surface keeps growing. Today `bugs.description` is
already there. We're about to add `repro_steps` (longer free-text)
and we know `severity_notes` is coming next sprint. Rather than
pile more `TEXT` columns onto `bugs`, extract the long-form fields
into a separate `bug_details` table keyed by `bug_id`.

This is the split-entity refactor the user asked for: one logical
entity becomes two physical tables, with the discriminator on
identity rather than type.

## Acceptance Criteria

| ID | Given | When | Then |
|----|-------|------|------|
| AC1 | migration V4 has been applied | `\d bug_details` (or `information_schema.columns`) | the table has `bug_id` (PK + FK to bugs), `description` (text), `repro_steps` (text), no other columns |
| AC2 | a v3-era bug existed with `description = "the thing is broken"` before V4 ran | the V4 upgrade backfills `bug_details.description` from `bugs.description` for every existing bug | a `bug_details` row exists for that bug with the original description text |
| AC3 | the `bugs.description` column no longer exists post-migration | inspecting `information_schema.columns` | `bugs.description` is absent |
| AC4 | a bug exists | GET /bugs/{id} | the response is 200 and includes both `description` and `repro_steps` (joined from `bug_details`) |
| AC5 | a bug exists | PATCH /bugs/{id} with `{description: "...", repro_steps: "..."}` | the response is 200 and both fields are persisted in `bug_details` (not in `bugs`) |
| AC6 | a bug with `bug_details` row exists | DELETE /bugs/{id} | (if a DELETE endpoint exists) the `bug_details` row is also removed via cascade |

## Schema delta

```python
def upgrade():
    # 1. Create the new table.
    op.create_table(
        "bug_details",
        sa.Column("bug_id", sa.Integer, sa.ForeignKey("bugs.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("repro_steps",  sa.Text, nullable=False, server_default=""),
    )
    # 2. Backfill from bugs.description.
    op.execute("""
        INSERT INTO bug_details (bug_id, description, repro_steps)
        SELECT id, COALESCE(description, ''), ''
        FROM bugs
    """)
    # 3. Drop the now-redundant column on bugs.
    op.drop_column("bugs", "description")
```

## Files /build is expected to produce or change

- New: `alembic/versions/0004_split_bug_entity.py`
- Update: `app/models.py` (add `BugDetails` model with 1:1 relation to `Bug`; remove `description` field from `Bug`)
- Update: `app/main.py` (GET/PATCH read+write both `description` and `repro_steps` through the relation; POST /bugs creates both `bugs` AND `bug_details` rows in one transaction)
- New: `tests/test_bug_details.py`
- Update: `tests/test_bugs.py` (existing description-related ACs adjust to the new shape, no externally-observable behaviour change for AC1+AC2 of v1)

## Refactor type

**Split entity.** This is the most invasive refactor in the smoke.
The migration adds, populates, and drops columns in a single
transaction. The kit's PR schema-diff comment must show:

- `bug_details (new)` table
- `bug_details.bug_id (FK to bugs.id)`
- `bugs.description (removed)`

The smoke's v4 verification asserts the diff comment carries
all three change classes.

## Out of scope for v4

- A `comments` table (would be useful but is a 1:many, not a split)
- Cascade-delete behaviour for users -> bugs (would touch v2, not v4)
- A migration to split `bugs.title` into a separate table (no motivation)
