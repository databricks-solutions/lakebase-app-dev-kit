# Cross-branch migration collision: the rebase resolver

**Status**: Design proposal, 2026-06-07
**Primary FEIP**: FEIP-7566 (per-story experiments + tier merge correctness)
**Builds on**: the schema-migration adapter (ADR-0005), the create-adapter
(`lakebase-tdd-new-migration`, counts up per tool), `scm-merge` (feature -> tier).
**Cross-ref**: per-story-experiments.md, orchestrator-deterministic-driver.md
(this is the migration half of the driver's "merge" build effect).

---

## The problem (the real "v2 mismatch")

Sequential migration numbers (`0001`, `0002`, ...) are computed from the
**local** branch's `versions/` dir. That is correct within one lineage, but
two features that fork from the same tier head pick the **same** next number
independently:

```
staging head = 0005
  feature/users    forks at 0005 -> authors 0006_add_users
  feature/reviews  forks at 0005 -> authors 0006_add_reviews   (concurrent)
```

When both merge into staging, the second collides:

- **Alembic**: two revisions with id `0006` (illegal), or two revisions whose
  `down_revision = '0005'` (a branch point that needs a merge revision). Either
  way `alembic upgrade head` no longer walks a single line.
- **Flyway**: two `V6__*.sql` files -> Flyway aborts on a duplicate version.
- **Knex**: filenames are wall-clock timestamps, globally unique -> **no
  collision** (this is why the create-adapter leaves Knex on its native scheme).

So the collision is intrinsic to *sequential per-branch numbering*. Knex avoids
it with timestamps; Alembic's own default (hashes) avoids it with a DAG +
explicit merge revisions. The kit deliberately overrode Alembic's hash with a
linear count-up for readability and deterministic ordering, which reintroduced
the collision for Alembic + Flyway.

We want the readability and linear ordering of sequential numbers **without**
the collision.

## Where the collision actually occurs (and where it does NOT)

There are two merge boundaries. Only one collides.

1. **experiment -> feature** (FEIP-7566, intra-feature). Experiments are cut off
   the *current* feature HEAD and the build lane is **serial** (one story builds
   at a time). Each cut sees the latest feature HEAD, so story S2's migration is
   numbered after S1's already-merged one. A discarded experiment vanishes, so
   the next cut reuses the freed number cleanly. **Serialization => no collision
   here.** Nothing to do at this boundary.

2. **feature -> tier** (`scm-merge`, inter-feature). Sibling features forked from
   the same tier head independently numbered from the same base. **This is the
   only place the collision happens, and the only place the resolver runs.**

## The model: rebase the feature's migrations onto the tier head

Treat a feature's migration sequence like a stack of commits being rebased onto
a moved base. At merge time, before the git-merge of feature into the tier
branch, **renumber the feature's migrations to follow the tier's current head
and re-chain the first one onto that head.**

```
tier (staging) head after feature/users merged:  0006_add_users
feature/reviews still has:                        0006_add_reviews   (base 0005)

rebase feature/reviews onto staging head:
  0006_add_reviews  ->  0007_add_reviews
    (Alembic: revision '0007', down_revision '0006'; file renamed)
    (Flyway:  V6__add_reviews.sql -> V7__add_reviews.sql; rename only)
    (Knex:    no-op, timestamps never collide)
  ...any later feature migrations shift in lockstep, internal chain preserved.
```

Then the git-merge brings in only linear, non-colliding files, and the tier's
CI migrate step (`merge.yml` / `scm-merge --wait-migrate`) applies a single
clean line.

This is `git rebase` for migrations: the **number is a label**, the
**down_revision is the chain**, and rebasing rewrites both onto the new base.

## Ordering in `scm-merge` (feature -> tier)

Insert a rebase step **on the feature branch, before the git merge**:

1. Resolve the tier head's max migration number `P` (from the parent branch's
   `versions/` after fetch, via the adapter's `list`).
2. If the feature's lowest migration number `> P`: no overlap -> no-op.
3. Else **rebase**: renumber the feature's migrations to `P+1, P+2, ...`
   (preserving their relative order) and re-chain the first onto the tier head's
   revision id. Commit the rewrite on the feature branch.
4. git-merge feature -> tier (now collision-free).
5. CI applies the migrations to the tier's Lakebase DB in linear order (the
   existing `--wait-migrate` path, unchanged).

`mergeFeature` (`scm-merge.ts`) already owns steps 4-5; the resolver is a new
pre-step 1-3.

## The load-bearing invariant: serialized merges per tier

Two siblings merging into the same tier at the same instant could both read
`P = 5` and both rebase to `6`. The resolver is correct **iff merges into a
given tier are serialized** so each reads `P` fresh after the prior merge
landed. The PR + CI model already provides this: a tier branch takes one
squash-merge at a time, CI runs, then the next PR merges. The resolver depends
on (and should assert) this; it does not introduce its own distributed lock.
A concurrent-merge attempt that slips through is caught defensively: after
rebase, if the tier already has the target number, refuse and re-resolve.

## DB-state reconciliation (mostly free)

The feature branch's Lakebase DB already applied the migration under its **old**
number/id. Three cases:

- **Experiment branches (FEIP-7566)** are ephemeral and torn down on merge, so
  their DB never outlives the rebase. **No reconciliation needed.** (This is a
  second reason the experiment model is the right substrate: only the durable
  parent DB persists, and it only ever sees rebased, linear numbers.)
- **A long-lived feature branch** that persists past the merge needs an
  `alembic stamp <new-head>` after rebase to align its `alembic_version` row.
  Flyway's schema-history is filename-derived; renaming pre-apply is clean,
  post-apply needs a history fixup. Scope: only if we keep long-lived feature
  branches; the experiment model removes the need.
- **Tier -> tier promotion** (staging -> prod) never collides: staging is
  already linear, so prod inherits a linear line. The resolver is a feature ->
  tier concern only; promotions up the ladder are pass-through.

## Per-tool rewrite (new adapter capability)

Add an optional `rebaseMigrations` to the `SchemaMigrationAdapter` contract,
parallel to the just-added `newMigration`, so tool knowledge stays in the
adapter and the merge step stays tool-agnostic:

```ts
rebaseMigrations?(args: {
  projectDir: string;
  /** Tier head's revision id + max number to rebase onto. */
  ontoVersion: string;     // e.g. "0006"
  ontoRevisionId: string;  // alembic down_revision target; == ontoVersion under our scheme
}): Promise<RebaseResult>;  // { renamed: Array<{from,to}>, status }
```

- **Alembic**: for each feature revision in chain order, rename
  `<old>_<slug>.py -> <new>_<slug>.py`, rewrite the in-file `revision=` and
  `down_revision=` (first one points at `ontoRevisionId`, the rest at the
  previous rebased id). Reuse `listAlembicFiles` for ordering.
- **Flyway**: rename `V<old>__<slug>.sql -> V<new>__<slug>.sql`. No internal
  chain to rewrite (Flyway orders by filename). Trivial.
- **Knex**: omit the method -> the dispatcher treats it as a no-op (timestamps
  do not collide). Mirrors how Knex omits `newMigration`-numbering concerns.

A dispatcher `rebaseMigrationsOntoTier({projectDir, ontoVersion, language})`
resolves the adapter and routes; a missing `rebaseMigrations` is a no-op (Knex),
not an error.

## scm-doctor

Surface a detectable bad state: a feature branch whose migration numbers overlap
its tier head (rebase pending / was skipped), and an actual duplicate-number
collision already on a tier (manual repair). `scm-doctor --fix` runs the rebase
for the pending case.

## Phased plan (each phase: a commit, TDD, green suite)

1. **Pure rebase planner.** `planMigrationRebase(featureVersions, tierHead)` ->
   a renumber map + the re-chain edges. No I/O. Exhaustive unit tests (overlap,
   no-overlap, multi-migration feature, gaps).
2. **Per-tool rewrite.** `rebaseMigrations` on the Alembic + Flyway adapters
   (rename + re-chain); Knex omits. Hermetic tests on temp projects (no DB).
3. **Dispatcher + scm-merge wiring.** `rebaseMigrationsOntoTier`; call it in
   `mergeFeature` before the git merge, guarded by the serialized-merge
   invariant + the defensive post-check. Integration test with a faked tier head.
4. **scm-doctor detection + --fix.** Overlap + duplicate-number checks.
5. **Live validation.** The FEIP-7422 smoke extended to a two-sibling-feature
   scenario that proves staging ends up linear (`0001..000N`, no duplicates).

## Open question carried forward

This linearizes by **renumber-on-merge**. The alternative, embracing Alembic's
native multi-head DAG + merge revisions, is closer to Alembic's intent but
abandons the human-readable linear count-up the kit committed to. We keep the
linear count-up (the affirmed convention) and pay for it with the rebase step;
the doc records the tradeoff so a future reversal is a deliberate choice, not a
drift.
