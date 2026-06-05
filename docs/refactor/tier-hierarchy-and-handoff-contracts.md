# FEIP-7508: tier hierarchy + enforced TDD-workflow handoff contracts

**Ticket:** FEIP-7508, a sub-task of FEIP-7461 (umbrella: SCM + TDD workflows as
executable state machines). Labels: lakebase-app-dev-kit, lakebase-for-agile-dev.
**Status:** scoping only (no code).

**Lineage (the 2026-06-04 defect family):** this is the structural foundation
the two sibling sub-tasks now depend on:
- **FEIP-7494** (thin scaffolded shells onto TS substrate CLIs) , mostly landed;
  the one holdout is `post-checkout.sh`, which can only thin onto `checkoutPaired`
  once parent resolution is structural + `strictParent` is enforced (this doc).
  See `docs/refactor/post-checkout-thinning.md`.
- **FEIP-7495** (live tests must exercise scaffolded touchpoints, not bypass
  them) , the `002`-to-`main` leak below is a textbook instance; the smoke-fix
  section here (git-HEAD guard, entry-tier guard, `verify-vN` binding) is the
  remaining 7495 work.
Builds on FEIP-7458 (SCM workflow state machine); surfaced by the FEIP-7422 smoke.
Source: the `tdd-handoff-contract-audit` workflow (5-agent map + synthesis).

## Core principle (the reframing)

The substrate must NOT reason about tier *names*. A project may call its top
tier `main`, `prod`, or `production`; its middle tier `staging`, `testing`,
or `uat`. Names are user choice. What the substrate cares about is
**structure**:

- **Is a branch a TIER?** A tier is a long-living branch. A feature is
  ephemeral and forks from a tier.
- **Does a tier have a PARENT?** The parent-of relationship between tiers IS
  the promotion hierarchy.

From those two facts everything else follows:

```
 prod        (top tier; no parent)            name is arbitrary: main|prod|production
   ^
 staging     (tier; parent = prod)            name is arbitrary: staging|testing|uat
   ^
 dev         (tier; parent = staging)         name is arbitrary
   ^
 feature/*   (ephemeral; forks from the ENTRY tier; promotes UP the parent chain)
```

- A **feature** forks from the **entry tier** (bottom of the chain) and is
  promoted up, one parent hop at a time, to the top.
- **Promotion** = move changes from a tier to **its parent**. Never skip a
  level; the top tier only ever receives what came from its child.
- **1-tier** = a single tier that is both entry and top. Features fork from it
  (which is prod). Forking-from-prod is therefore CORRECT in a 1-tier project
  and FORBIDDEN the moment a lower tier exists.

The architect / scrum-master DECLARES the hierarchy (which long-living
branches exist and their parent order). The substrate records it and ENFORCES
the relationships; it never invents or hardcodes them.

## What exists today + why it is wrong

- `tier_topology` is a bare integer `1|2|3` (scm-workflow-state.schema.json),
  conflating "how many tiers" with "which branch is the parent."
- `resolveParentBranch(tierTopology)` (scm-claim-feature.ts:105-125) hardcodes
  the string `"staging"` for tier 2 and `"dev"` for tier 3. A project that
  named its middle tier `testing` is already broken, and the count says
  nothing about the parent relationship.
- The Lakebase-side parent is resolved by name with a **silent fallback**:
  `createBranch` (branch-create.ts:136-160) falls back to the project default
  (prod) with a stderr-only warning when the named parent is absent, and
  `strictParent` is not plumbed through the claim chain (CreatePairedBranchArgs
  in paired-branch.ts does not even accept it). So a 2-tier feature silently
  forks from prod when its entry tier is missing.
- Promotion (tier to parent) lives in `release.ts` and is NOT part of the SCM
  workflow state machine; no handoff links `scm-merge` to `release`.

There is already a STRUCTURAL seed to build on: `inferTierTopology`
(scm-adopt-state.ts:83-92) inspects the actual Lakebase branch list, and the
post-checkout / branchTree tier auto-discovery already treats "a git branch
whose name matches an existing non-default Lakebase branch" as a tier. The fix
is to make that structural view the source of truth and retire the
integer+name coupling.

## How a feature's migration reached `main` (the 002 incident)

Three independently unenforced facts lined up:

1. **Silent entry-tier fallback.** The 2-tier feature's parent resolved to the
   prod default (staging absent / not enforced), so `parent_branch` was written
   as prod while the topology still said "2."
2. **No git-HEAD guard.** The orchestrator returned to trunk, trusted the claim
   to move HEAD, then ran `git add -A; git commit` unconditionally
   (run-smoke.sh:380-381). `verify-workflow-state.sh` asserted only the state
   name + that `parent_branch` was non-empty, never HEAD or the parent.
3. **No structural promotion guard.** `merge.yml` maps git branch to Lakebase
   tier by NAME (main to default) and applies migrations on any push to main;
   nothing checks that main received the change from its child tier.

## The model change

Replace the integer `tier_topology` with a declared, structural **tier
hierarchy** recorded in workflow state:

```
tiers: [
  { branch: "<prod-name>",    parent: null },
  { branch: "<staging-name>", parent: "<prod-name>" },
  { branch: "<dev-name>",     parent: "<staging-name>" }
]
entry_tier: "<the bottom branch>"   # feature parent; derived (the tier no other tier names as parent)
```

Names are whatever the project uses. The relationships (parent links) are the
contract. `tier_topology: 1|2|3` becomes a derived convenience (the chain
length), retained for backward-compat read, not the source of truth.

Helpers become structural, not name-keyed:
- `resolveFeatureParent(state)` returns `entry_tier` (the bottom of the chain),
  by structure. 1-tier returns the single tier (prod) legitimately.
- `parentOf(tier, state)` walks the recorded hierarchy.
- `isTier(branch, state)` = membership in `tiers`, not a name guess.

## Handoff contracts (the 5 transitions, hierarchy-based)

Each contract is preconditions / actions / postconditions. "Tier target" =
the entry tier for claim, and the promoting tier's parent for merge.

1. **scaffold to claim** (`scm-claim-feature` / `resolveFeatureParent`)
   - pre: state in {scaffold-complete, merged}; hierarchy recorded; the
     entry tier EXISTS on the Lakebase project (no silent fallback).
   - act: parent = entry tier (structural); plumb `strictParent=true` so a
     missing entry tier THROWS; cut Lakebase + git `feature/<slug>` + .env in
     lockstep.
   - post: `parent_branch` == entry tier EXACTLY (reject prod fallback unless
     the project is 1-tier where entry == prod); git HEAD == `feature/<slug>`;
     Lakebase branch reachable. An override to a non-entry tier is refused
     unless an explicit `--hotfix` flag is set.

2. **design to build** (promote the implicit handoff to a checked one)
   - pre: state == feature-claimed; **git HEAD == state.branch** before any
     artifact write or commit; spec.md + feature.json + test-list.json present.
   - post: test-list.json parses; feature_id matches; HEAD still on the
     feature branch (no drift back to a tier).

3. **build to prepare-pr** (`scm-prepare-pr`)
   - pre: state == feature-claimed; HEAD == branch; tree clean; commits ahead
     of parent; `parent_branch` is a tier in the hierarchy (the entry tier).
   - post: PR base.ref == `parent_branch` == entry tier; refuse a base that is
     a non-parent tier (e.g. top tier on a multi-tier project).

4. **pr to ci** (`scm-wait-ci`)
   - pre: state == pr-ready; the PR's LIVE base.ref still == `parent_branch`
     (re-fetch; catches a hand-edited base).
   - post: CI ran against the declared tier, confirmed by the base re-check.

5. **ci to merge / promote** (`scm-merge` + `release`)
   - pre: state == ci-green; PR live base.ref == `parent_branch`.
   - act: merge feature into its entry tier; `--wait-migrate` polls the
     tier's migrate workflow.
   - post: migrate ran against the entry tier, NOT a higher tier. Reaching the
     top tier happens ONLY via `release` promotions that walk the parent chain
     one hop at a time, each recorded as a transition. A feature merging
     directly into the top tier on a multi-tier project is REFUSED.

## Enforcement split

**Substrate (cannot be bypassed, even via CLI directly):**
- `resolveFeatureParent` returns the entry tier structurally; `strictParent`
  plumbed through `claim -> createFeaturePairedBranch -> createPairedBranch ->
  createBranch` so a missing entry tier THROWS (branch-create.ts:147-160
  fallback becomes legal only when the requested parent already IS the default,
  i.e. the 1-tier case).
- `scm-prepare-pr` + `scm-merge`: base/target must be a valid parent hop in the
  recorded hierarchy; refuse feature-into-top-tier on a multi-tier project.
- Scaffold a branch-protection ruleset so the top tier only accepts merges
  from its child tier (or a release source); `merge.yml` gains a base.ref /
  promotion check instead of name-only mapping.

**Orchestrator (cross-checks state and git agree at each handoff):**
- Before any commit: assert `git HEAD == state.branch`.
- `verify-workflow-state.sh` (feature-claimed case): assert HEAD == branch AND
  `parent_branch` == entry tier of the recorded hierarchy (not just non-empty).

## Smoke assertion fixes (tie back to the contracts)

- **git-HEAD guard** in `verify-workflow-state.sh`: would have caught the
  commit landing on a tier instead of the feature branch.
- **entry-tier guard**: assert `parent_branch` == entry tier; would have caught
  the silent prod fallback.
- **verify-vN binding**: `verify-v1.sh`/`verify-v2.sh` glob `0001_*`/`0002_*`
  by bare sequence number with no link to the feature. Bind the assertion to
  the feature under test (migration reachable from `state.branch` HEAD and tied
  to the current feature_id), so a migration that landed on a tier cannot read
  as "verified." Also align the expected names with the scaffold's actual
  convention (the scaffold ships `001_*` 3-digit; the verifier expects
  `0001_*` 4-digit, and `bug` vs `bugs`).

## Phases

0. Confirm the hierarchy schema shape (tiers[] + entry_tier; tier_topology as
   derived read-only) and the override/hotfix policy.
1. Schema + helpers: structural `tiers`/`entry_tier`; `resolveFeatureParent`,
   `parentOf`, `isTier` by structure; `tier_topology` derived. Unit tests
   (1/2/3-tier, arbitrary names, missing entry tier).
2. Substrate guards: `strictParent` plumbing; refuse non-parent base in
   prepare-pr/merge; hotfix override gate.
3. Orchestrator + smoke guards: git-HEAD + entry-tier assertions;
   verify-vN binding fix.
4. Branch-protection ruleset + merge.yml base.ref check at scaffold.
5. Live parity tests: 1/2/3-tier with non-default names; missing-entry-tier
   throws; feature-into-top-tier refused; promotion walks the chain.
6. Typecheck + full vitest + bundle smoke. PAUSE for review before any version
   bump (user owns SemVer).

## Risk

This touches the claim, prepare-pr, merge, schema, scaffold, and smoke. The
live parity suite in phase 5 is the real deliverable. The one invariant that
must not regress: on a multi-tier project, the top tier receives changes ONLY
via a recorded parent-chain promotion, never a direct feature merge or a silent
entry-tier fallback.
