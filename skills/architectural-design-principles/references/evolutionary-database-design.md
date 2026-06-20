# Evolutionary database design

The schema is not modeled once up front; it evolves increment by increment, the same way the architecture and the spec do. Big up-front data modeling is rejected for the same reason big up-front design is rejected everywhere else in agile: you learn the right shape by building, not before you start. The database is a first-class participant in iterative development, not a monolith the rest of the system has to work around.

This kit makes that practical because every git branch is paired with a real Lakebase branch, so schema can change as cheaply and as often as code.

## The unit of change is the migration

Every schema change ships as a versioned, reversible **migration** (alembic / flyway / knex), committed alongside the application code that needs it. The migration, not the data, is the contract that travels between branches and tiers. A PR carries both the code and its migration; CI cuts a branch, applies the migration, runs the tests, and reports.

- Schema lives in migrations checked into the repo, never in out-of-band DDL run by hand.
- A migration is small and frequent. Frequency reduces difficulty: many tiny migrations beat one rare, large one.
- A migration is **idempotent and reversible** , the same script runs safely across many branches and tiers, and can be rolled back.
- The migration is what merges/promotes upward; the rows stay in their branch.

## The paired branch makes evolution safe and disposable

Each feature gets a real, isolated database branched copy-on-write from its **parent tier**. Schema changes are exercised against real, production-shaped (and governance-masked) data, not mocks. The branch is a phoenix: burnt down and rebuilt at will, reset between test runs, destroyed on merge. When a reset costs nothing, the schema stops being a precious shared resource and becomes something you change freely.

## Parent-aware schema diff reframes the review

Every change is diffed against the **parent tier** and surfaced on the PR. The database review question shifts from "will this break the database?" to "is this the right design?" , the team reviews code and schema together, one PR, one conversation.

## Expand / contract (parallel change)

Evolve schema without a destructive big bang. Spread a breaking change across increments:

1. **Expand:** add the new shape (column / table / constraint) additively; nothing reads it yet.
2. **Migrate:** move readers and writers over; backfill; run both shapes in parallel.
3. **Contract:** once nothing uses the old shape, remove it in a later increment.

Each step is its own migration in its own increment, each green against the paired branch. A destructive change that drops or rewrites in one step is a smell.

## Production is a branch point, not an endpoint

Shipping a feature does not freeze the model. Production is the persistent base from which the next iteration branches: extend the schema for a new requirement, refactor an entity whose design has shown its limits, validate a new rule against real distributions. Continuous evolution is the default posture, not a quarterly migration event.

## Fitness functions for the evolving schema

The Infra runner defends the schema the way [evolutionary-architecture](evolutionary-architecture.md) fitness functions defend layering:

- **migrations-clean** , the migration set applies forward (and reverses) cleanly.
- **schema-diff-computable** , the change diffs against the parent without error.
- **connection-reachable** , the branch's database is live and serving.

These run in the TDD cycle, on every PR, and at the deploy/release gate.

## The one rule

**Every schema change is a migration, exercised on a real paired branch, diffed against its parent.** No hand-run DDL, no big up-front model, no destructive one-step rewrite. The branch is gone in a second; the design decision it validated is permanent.

## Relationship to the other canon

- **[layered-architecture](layered-architecture.md)** , only the repository layer touches the ORM/session, so schema change has one owner.
- **[evolutionary-architecture](evolutionary-architecture.md)** , same idea, one layer up: properties kept true by executable checks as the system changes.
- **[twelve-factor](twelve-factor.md)** , the paired branch is the attached backing service; its connection comes from the environment.
