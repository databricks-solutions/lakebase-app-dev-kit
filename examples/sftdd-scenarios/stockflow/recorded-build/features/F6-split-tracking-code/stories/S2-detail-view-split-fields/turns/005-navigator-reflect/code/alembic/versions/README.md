# Alembic migrations

Add your migrations here. Create one with the kit's tool-agnostic command (run
in the project root):

```bash
lakebase-sftdd-new-migration --name "<description>"
```

This assigns a UTC timestamp rev-id (`YYYYMMDDHHMMSS`), so the file is
`<timestamp>_<slug>.py` and its internal `revision` matches. Timestamps are
globally unique and sort chronologically, so sibling feature branches never
pick the same id (the collision a 4-digit counter would cause). The first
revision has `down_revision = None` and is the schema baseline; each later
revision chains off the previous head. Then author the `upgrade()` /
`downgrade()` body.

Alembic still chains via `down_revision`, so when two feature branches merge
into the same tier the kit collapses the resulting heads with `alembic merge
heads` at merge time (see docs/refactor/migration-collision-resolution.md).

Add `--autogenerate --instance <id> --branch <branch>` to diff the SQLAlchemy
models against the branch DB and prefill the body. Do NOT run `alembic revision
--autogenerate` directly: it produces an unordered hash-named revision.

You do not run migrations by hand: the kit applies them to each paired Lakebase
branch through CI (`pr.yml` on the feature branch, `merge.yml` on staging /
production) via `lakebase-schema-migrate`. There is deliberately no empty
placeholder migration; the first feature migration is the real base.
