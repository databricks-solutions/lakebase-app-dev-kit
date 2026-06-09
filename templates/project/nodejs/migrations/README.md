# Knex migrations

Create a migration with the kit's tool-agnostic command (run in the project
root):

```bash
lakebase-tdd-new-migration --name "<description>"
```

This runs `knex migrate:make`, which names the file with Knex's native
timestamp prefix (`<timestamp>_<slug>.js`) - already deterministically ordered.
Then author the exported `up` / `down`.

You do not run migrations by hand: the kit applies them to each paired Lakebase
branch through CI (`pr.yml` on the feature branch, `merge.yml` on staging /
production) via `lakebase-schema-migrate`. There is deliberately no empty
placeholder migration; the first feature migration is the real base.
