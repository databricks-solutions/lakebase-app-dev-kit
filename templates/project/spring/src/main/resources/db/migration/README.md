# Flyway migrations

Add your migrations here as `V<n>__<description>.sql`, starting at
`V1__<description>.sql`. Flyway runs with `-baselineOnMigrate=true
-baselineVersion=0`, so every `V<n>` file (from V1 up) is applied as a pending
migration, and Flyway's own baseline row anchors the non-empty Lakebase `public`
schema.

You do not run migrations by hand: the kit applies them to each paired Lakebase
branch through CI (`pr.yml` on the feature branch, `merge.yml` on staging /
production) via `lakebase-schema-migrate`. There is deliberately no empty
placeholder migration; the first feature migration (`V1`) is the real base.
