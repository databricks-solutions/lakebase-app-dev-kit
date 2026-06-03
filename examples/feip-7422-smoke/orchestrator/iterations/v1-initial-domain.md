# v1: Initial Domain (Bug CRUD)

**Branch**: `feature/initial-domain`
**Lakebase parent**: `staging`
**Migration**: V1 (`CREATE TABLE bugs`)

## Story

Establish the bug-tracking app's core domain. A `Bug` has an id,
title, free-text description, and a status drawn from a fixed enum
(`open`, `in_progress`, `closed`). CRUD endpoints support filing,
reading, and updating bugs.

## Acceptance Criteria

| ID | Given | When | Then |
|----|-------|------|------|
| AC1 | the `bugs` table is empty | POST /bugs with `{title: "broken", description: "X", status: "open"}` | the response is 201 with a generated id, and a row exists in `bugs` with the same fields |
| AC2 | a bug with id=42 exists | GET /bugs/42 | the response is 200 with the bug's title, description, and status |
| AC3 | no bug with id=999 exists | GET /bugs/999 | the response is 404 |
| AC4 | a bug exists with status="open" | PATCH /bugs/{id} with `{status: "in_progress"}` | the response is 200 and the bug's status is "in_progress" |
| AC5 | the request body has `status: "frobnicate"` (not in the enum) | POST /bugs | the response is 422 with a validation error |

## Schema (V1__init_bugs.sql equivalent in Alembic form)

```python
op.create_table(
    "bugs",
    sa.Column("id", sa.Integer, primary_key=True),
    sa.Column("title", sa.String(200), nullable=False),
    sa.Column("description", sa.Text, nullable=False, server_default=""),
    sa.Column("status", sa.String(20), nullable=False, server_default="open"),
)
op.create_check_constraint(
    "ck_bugs_status",
    "bugs",
    "status IN ('open', 'in_progress', 'closed')",
)
```

## Files /build is expected to produce

- `alembic/versions/0001_init_bugs.py`
- `app/models.py` (`Bug` SQLAlchemy model)
- `app/main.py` (FastAPI app with the 4 endpoints + Pydantic schemas)
- `tests/test_bugs.py` (one test per AC, against the paired Lakebase branch's DSN)

## Out of scope for v1

- Multi-user / owners (v2)
- Status as a relation (v3)
- Splitting description into its own table (v4)
- HTML rendering (v5)
