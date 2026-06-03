# v2: Add Owners (User entity + FK from Bug)

**Branch**: `feature/add-owners`
**Lakebase parent**: `staging`
**Migration**: V2 (`CREATE TABLE users` + `ALTER TABLE bugs ADD owner_id`)

## Story

Introduce a `User` entity and pair each bug with an owner via a
foreign key. The owner is optional at first (`bugs.owner_id` is
nullable) so existing rows from v1 don't need a backfill.

## Acceptance Criteria

| ID | Given | When | Then |
|----|-------|------|------|
| AC1 | the `users` table is empty | POST /users with `{email: "k@x", display_name: "K"}` | the response is 201 with a generated id, and a row exists in `users` |
| AC2 | a user with id=7 exists | GET /users | the response is 200 and the list includes the user with id=7 |
| AC3 | a bug with no owner exists | PATCH /bugs/{id} with `{owner_id: 7}` (where user 7 exists) | the response is 200 and `bugs.owner_id` is 7 |
| AC4 | a bug exists | PATCH /bugs/{id} with `{owner_id: 9999}` (no such user) | the response is 4xx with a foreign-key error message |
| AC5 | bugs created in v1 have NULL owner_id (no backfill required) | GET /bugs/{id} on an old bug | the response is 200 and `owner_id` is null/absent |

## Schema delta

```python
def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("display_name", sa.String(100), nullable=False),
    )
    op.add_column(
        "bugs",
        sa.Column("owner_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
    )
```

## Files /build is expected to produce or change

- New: `alembic/versions/0002_add_owners.py`
- Update: `app/models.py` (add `User`, add `owner_id` relation on `Bug`)
- Update: `app/main.py` (add `/users` endpoints + extend bug schema to accept `owner_id`)
- New: `tests/test_users.py`
- Update: `tests/test_bugs.py` to cover AC3 + AC4

## Refactor type

**FK introduction.** First time the schema gains a relationship.
The smoke verifies the migration applies cleanly to a paired
Lakebase branch already carrying v1's `bugs` table, and that the
schema-diff comment in the PR shows `users (new)` + `bugs.owner_id (added)`.

## Out of scope for v2

- Backfilling owners for v1 bugs (intentional: NULL is fine)
- User authentication (out of scope for the entire smoke)
- Cascade-delete behaviour on user removal (no DELETE /users endpoint yet)
