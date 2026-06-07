# Alembic migrations

Add your migrations here. Create one with the kit's tool-agnostic command (run
in the project root):

```bash
lakebase-tdd-new-migration --name "<description>"
```

This assigns a 4-digit sequential rev-id, so the file is `0001_<slug>.py`,
`0002_<slug>.py`, ... and its internal `revision` matches. The first revision
has `down_revision = None` and is the schema baseline; each later revision
chains off the previous head. Then author the `upgrade()` / `downgrade()` body.

Add `--autogenerate --instance <id> --branch <branch>` to diff the SQLAlchemy
models against the branch DB and prefill the body. Do NOT run `alembic revision
--autogenerate` directly: it produces an unordered hash-named revision, which
breaks the sequential ordering the kit relies on.

You do not run migrations by hand: the kit applies them to each paired Lakebase
branch through CI (`pr.yml` on the feature branch, `merge.yml` on staging /
production) via `lakebase-schema-migrate`. There is deliberately no empty
placeholder migration; the first feature migration is the real base.
