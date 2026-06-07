# Alembic migrations

Add your migrations here. Generate the first one with:

```bash
alembic revision --autogenerate -m "<description>"
```

The first revision has `down_revision = None` and is the schema baseline; each
later revision chains off the previous head. The kit names them with a 4-digit
sequential prefix (`0001_<slug>.py`, `0002_<slug>.py`, ...).

You do not run migrations by hand: the kit applies them to each paired Lakebase
branch through CI (`pr.yml` on the feature branch, `merge.yml` on staging /
production) via `lakebase-schema-migrate`. There is deliberately no empty
placeholder migration; the first feature migration is the real base.
