# Knex migrations

Add your migrations here with a 4-digit sequential prefix
(`0001_<description>.js`, `0002_<description>.js`, ...), each exporting `up` and
`down`.

You do not run migrations by hand: the kit applies them to each paired Lakebase
branch through CI (`pr.yml` on the feature branch, `merge.yml` on staging /
production) via `lakebase-schema-migrate`. There is deliberately no empty
placeholder migration; the first feature migration is the real base.
