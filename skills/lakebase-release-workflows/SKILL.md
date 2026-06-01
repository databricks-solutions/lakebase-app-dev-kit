---
name: lakebase-release-workflows
description: "Opinionated branching + release methodology for Lakebase-paired projects. Use when designing a project's branch layout, cutting a release candidate, promoting between long-running tiers, rolling back, or asking 'where should this work happen?' Encodes the prod / staging / {feature,test,uat,perf} default and the N-tier-capable cut-RC / regression-test / cut-backup / migrate release flow."
compatibility: Requires the substrate's [lakebase-scm-workflows](../lakebase-scm-workflows/SKILL.md) skill for branch-pairing primitives, plus the substrate's migrate primitives (FEIP-7091).
metadata:
  version: "0.2.0"
parent: databricks-lakebase
---

# Lakebase Release Workflows

The convention and release flow every Lakebase-paired project should follow. Composes on top of [`lakebase-scm-workflows`](../lakebase-scm-workflows/SKILL.md) (which gives you `createBranch`, `getSchemaDiff`, `applyMigrations`, etc.) and adds the *opinionated* answer for "how do those primitives compose into a release."

The full reasoning + decision record lives in [references/branching-and-release-methodology.md](references/branching-and-release-methodology.md). This SKILL.md is the agent-facing tldr.

## Branch convention

A project's branches form a **directed chain of long-running branches** ending in `prod`. Each working-branch type targets a specific tier in that chain - the architect decides which. Two-tier is the default; N-tier is supported and configured per-project.

Two-tier (default):

```
prod                                     (only updated by a release)
 │
 ▼
staging                                  (next release accumulates here)
 │
 ▼
{feature, test, uat, perf}               (working branches off staging)
```

Three-tier example (architect splits early work onto `dev`, validation onto `staging`):

```
prod              (only updated by a release from staging)
 │
 ▼
staging           (only updated by a release from dev; validation work happens here)
 │       ▲
 │       └─── {test, uat, perf}
 ▼
dev               (next release accumulates here; feature work happens here)
 │
 ▼
{feature}
```

Any chain length works (`dev → staging → preprod → prod` etc.). The substrate stores both the chain and the per-type target-tier mapping as project metadata; agents and the extension read it rather than hardcoding.

| Branch | Purpose | Who merges in |
|---|---|---|
| `prod` | Production state. Lakebase + git both authoritative. | Release promotion only (no PRs from working branches). |
| Each intermediate tier (e.g. `staging`, `dev`) | Pre-promotion integration. Where the *next* release at this tier bakes. | Releases from the tier below + PRs from working-branch types whose configured target is this tier. |
| `feature/<n>` | New work | Dev. |
| `test/<n>` | QA / regression rehearsal | QA. |
| `uat/<n>` | User acceptance | UAT runner / product. |
| `perf/<n>` | Load / perf testing | Perf engineer. |

Each working-branch type pairs to its own Lakebase branch (via [`lakebase-scm-workflows`](../lakebase-scm-workflows/SKILL.md)'s `createBranch`). Schema changes flow up the chain one release at a time.

## A release is any merge into a long-running branch

The substrate maintains this convention uniformly. **Every merge that lands in a long-running branch IS a release**, regardless of where the source branch came from:

- `feature/X → staging` = release to `staging`
- `feature/X → dev` (3-tier shop) = release to `dev`
- `dev → staging` (3-tier shop) = release to `staging`
- `staging → prod` = release to `prod`

There is no separate "casual PR merge" vs "formal release" distinction. The same four-phase shape runs in all cases - what differs is whether the RC is implicit (feature branch IS the RC) or explicit (cut from `to` and merged with `from`).

## Release-sprint flow

A release promotes one branch (the `from` source) into a long-running target (the `to` tier). `from` can be a working branch (`feature/*`, `test/*`, etc.) or a long-running tier; `to` is always a long-running tier. **The shape is identical at every release**, regardless of source kind - only the from/to labels change. `to == prod` adds the app-deploy step; intermediate-tier releases skip it.

A release proceeds in four ordered phases. The first two happen automatically when the PR opens (pr.yml on `to`); the second two happen on PR merge (merge.yml on `to` push). **A PR is required for every release** - no direct pushes to long-running branches:

1. **PR open → cut ci-pr-branch from `to`.** The substrate auto-creates an ephemeral Lakebase branch named `ci-pr-branch` (per PR) forked from the *current* `to`. This is the RC. The PR's migration changes are applied here. Cutting from `to` (not `from`) is what locks the release surface - the test runs against the current target's data shape, not whatever's accumulated on `from`.
2. **Regression test the ci-pr-branch.** pr.yml runs `applyMigrations` against `ci-pr-branch`, then the project's full test suite. **Merge is gated on this passing** - GitHub branch protection blocks the merge button until the check is green.
3. **PR merge → cut backup of `to`.** merge.yml on the `to` push fires `lakebase-cut-backup`, snapshotting current `to` (Lakebase branch + git tag). One-step revert target. Runs at every tier - `staging-backup-<id>` matters less than `prod-backup-<id>` but the same primitive runs for both.
4. **Migrate `to`.** merge.yml continues with substrate `applyMigrations` against `to`'s Lakebase branch + git fast-forward of `to` + (only when `to == prod`) app deploy.

The 4-phase shape is identical for `feature/X → staging` and `staging → prod`. For `staging → prod`, the ci-pr-branch is cut from a fresh prod (NOT from staging) so the migration test runs against real production data shape - "ensure it will work on my prod" before merging.

## When to load the full reference

Load [references/branching-and-release-methodology.md](references/branching-and-release-methodology.md) when:

- A project is being bootstrapped and you have to recommend a branch layout (including deciding chain length).
- A release decision is in question ("can we cut the RC from `from` this time?" - no, see the doc).
- A consumer asks why `to`-backup exists separately from the RC.
- An N-tier shop's per-tier policy gates need to be designed.
- Drift from this convention is being proposed and you need the original reasoning to push back or extend.

## Primitives this skill expects (future work)

The substrate doesn't yet ship the release orchestrator. These primitives are planned (FEIP-7059 roadmap). All of them are parameterized over the from/to tier pair so the same primitive serves every adjacent pair in any chain length:

- `bootstrap-branch-convention({chain, workingTypeTargets})` - given a fresh project, creates the configured long-running chain (default `[staging, prod]`) plus the working-branch types, all from prod, and writes parent-pair metadata + the type → target-tier mapping.
- `cutRC({from, to, releaseId})` - branches the release candidate off current `to` and merges `from` in.
- `regressionTest({rc, suite})` - runs the project's full e2e suite against the RC branch.
- `cutBackup({to, releaseId})` - snapshots current `to` for rollback.
- `migrate({rc, to, releaseId})` - applies substrate `applyMigrations` against `to`'s Lakebase branch and fast-forwards the git pointer.
- `release` - orchestrator that calls the four phases in order with explicit gates between each.

Until these land, follow the manual procedure documented in the reference.
