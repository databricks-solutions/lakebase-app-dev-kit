# migration-tool fixtures

Tiny project layouts for the three built-in migration adapters. Adapter
contract tests (`flyway-adapter.test.ts`, `alembic-adapter.test.ts`,
`knex-adapter.test.ts`) copy these into a tmpdir per test and exercise
`detect()` + `list()` against them without booting any database.

`apply` and `status` are NOT exercised here. Those need a real Lakebase
branch and live in the env-gated `*-live` BDD suites.

Each sample is the minimum filesystem shape an adapter needs to claim
the project + enumerate two migrations in apply order:

- `flyway/` Maven layout, V1 + V2 SQL files
- `alembic/` alembic.ini + migrations/versions with revision chain (0001 -> 0002)
- `knex/` knexfile.js + ./migrations with timestamp-prefixed files
