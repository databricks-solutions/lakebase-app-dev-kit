# Cross-branch migration collisions: one timestamp scheme + Alembic head-collapse

**Status**: Design proposal, 2026-06-07 (supersedes the rebase-resolver draft)
**Primary FEIP**: FEIP-7566 (per-story experiments + tier merge correctness)
**Builds on**: the schema-migration adapter (ADR-0005), the create-adapter
(`lakebase-tdd-new-migration`), `scm-merge` (feature -> tier).
**Cross-ref**: per-story-experiments.md, orchestrator-deterministic-driver.md
(this is the migration half of the driver's "merge" build effect).

---

## The problem (the real "v2 mismatch")

A 4-digit sequential number (`0001`, `0002`, ...) computed from the **local**
branch's `versions/` dir collides when two features fork from the same tier head
and independently pick the same next number:

```
staging head = 0005
  feature/users    forks at 0005 -> 0006_add_users
  feature/reviews  forks at 0005 -> 0006_add_reviews   (concurrent)
```

On the second merge: Alembic gets a duplicate rev-id (or two heads), Flyway gets
two `V6__` files (duplicate-version abort). The collision is intrinsic to
*sequential per-branch numbering*.

## The decision: one globally-unique, sortable scheme for all three tools

Adopt Knex's approach kit-wide: name every migration with a **UTC timestamp
version `YYYYMMDDHHMMSS`** (`migrationTimestamp()` in `schema-migrate.ts`). It is
globally unique (no two branches pick the same id) and lexicographically ==
chronologically sortable (apply order is obvious). This is what Rails, Django
(timestamp mode), and Knex all do precisely to dodge cross-branch collisions.

Per tool, via the create-adapter:

| Tool | File | Collision after timestamps? |
| --- | --- | --- |
| Knex (nodejs) | `<ts>_<slug>.js` (native) | none - flat ordered list, no DAG |
| Flyway (java) | `V<ts>__<slug>.sql` | none - flat ordered list, no DAG |
| Alembic (python) | `<ts>_<slug>.py` (rev-id = `<ts>`) | ids unique + sorted, but see below |

This replaces the earlier 4-digit count-up. It still honors the real goal that
motivated counting up - deterministic, readable ordering - while removing the
collision a counter cannot avoid.

## Why Knex and Flyway are then fully solved, and Alembic is not

Knex and Flyway are **flat ordered lists**: apply any not-yet-applied file in
version order, no parent pointers. Unique sortable versions => done, no
merge-time work.

Alembic is a **DAG**: every revision has a `down_revision`. Two siblings forked
from head `H` each get `down_revision = H`. Timestamp ids make the ids unique
and sortable (no duplicate-id hard error, history sorts), but after both merge
into the tier there are **two revisions pointing at `H` = two heads**, and
`alembic upgrade head` refuses until they are unified. So timestamps remove the
*renumber* problem entirely; Alembic still needs a one-step head-collapse at the
sibling-merge boundary.

## The only colliding boundary

1. **experiment -> feature** (intra-feature): the build lane is serial, so a
   later story's migration timestamps after the merged one and chains cleanly.
   No work.
2. **feature -> tier** (`scm-merge`, inter-feature): the sole place two
   independent lineages join. For Alembic only, collapse heads here.

## Alembic head-collapse: `alembic merge heads`

Chosen over a down_revision rechain: it is the native Alembic operation,
requires **no file renaming or line rewriting**, and is fully automatic.

Sequence inside the feature -> tier merge (`mergeFeature` in `scm-merge.ts`):

1. git-merge feature -> tier (locally) brings both lineages' revision files
   together.
2. If the tool is Alembic and `alembic heads` shows > 1 head:
   `alembic merge heads -m "merge <feature> into <tier>"` -> creates a merge
   revision whose `down_revision` is the tuple of both heads.
3. Commit the merge revision as part of the merge.
4. CI applies (`merge.yml` / `--wait-migrate`, unchanged): `upgrade head` now
   walks the join to a single head.

```
H -> tA (feature/users)
  \-> tB (feature/reviews)
alembic merge heads:
  H -> tA --\
  H -> tB --> tMerge   (down_revision = (tA, tB))
```

Flyway and Knex: this step is a no-op (no DAG).

## Substrate shape (new adapter capability)

Add an optional `collapseHeads?(args)` to `SchemaMigrationAdapter`, parallel to
`newMigration`, so the merge step stays tool-agnostic:

- **Alembic**: if `alembic heads` > 1, run `alembic merge heads -m ...`; return
  the created merge revision. Reuses the runner's spawn helper.
- **Flyway, Knex**: omit the method -> the dispatcher treats it as a no-op.

A dispatcher `collapseMigrationHeads({projectDir, language, message})` resolves
the adapter and routes; missing method = no-op (the common case).

`mergeFeature` calls it after the git merge, before pushing / completing the PR,
so the merge revision lands in the same merge commit and CI sees a single head.

## The load-bearing invariant: serialized merges per tier

Two siblings merging at the same instant could each miss the other's head.
Correctness relies on **serialized merges into a tier** - which the PR + CI
model already provides (one squash-merge at a time). `collapseHeads` is
idempotent: re-running when there is already a single head is a no-op, so a lost
race self-heals on the next merge.

## DB-state reconciliation (free)

Timestamp ids are assigned at create time and never change, so unlike the
rebase design there is **no renumber, hence no `alembic_version` drift** on the
feature branch. The merge revision is new and applied forward on the tier; the
feature branch's own DB is unaffected (and under the experiment model the
experiment branch is ephemeral anyway). Promotions up the tier ladder
(staging -> prod) inherit an already-single-head line, so they never collapse.

## scm-doctor

Detect a tier branch that has multiple Alembic heads (a merge that skipped the
collapse) and offer `scm-doctor --fix` -> `alembic merge heads`. Flyway/Knex
have no equivalent failure mode.

## Phased plan (each phase: a commit, TDD, green suite)

1. **Timestamp scheme (LANDED).** `migrationTimestamp()`; Alembic + Flyway
   create-adapters emit `<ts>`; Knex unchanged. Hermetic tests (format,
   ordering). Smoke `verify-v*` assertions move from `000N_` to the timestamp
   pattern (bundled with the gated re-run).
2. **`collapseHeads` adapter method.** Alembic implements via `alembic merge
   heads`; Flyway/Knex omit. Hermetic dispatcher-no-op test; live test for the
   Alembic two-head case.
3. **`scm-merge` wiring.** Call `collapseMigrationHeads` after the git merge,
   guarded by the serialized-merge invariant; idempotent re-run.
4. **scm-doctor detection + --fix.**
5. **Live validation.** FEIP-7422 smoke extended to a two-sibling-feature
   scenario proving the tier ends with a single head and all migrations applied.

## Tradeoff recorded

We adopt timestamps (sortable, collision-free) over a 4-digit count-up, and use
Alembic's native merge revisions over a custom down_revision rebase. The history
gains explicit merge nodes (like git merge commits) rather than a forced linear
line; that is the deliberate cost of not rewriting authored migrations at merge
time.
