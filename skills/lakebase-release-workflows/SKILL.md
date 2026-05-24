---
name: lakebase-release-workflows
description: "Opinionated branching + release methodology for Lakebase-paired projects. Use when designing a project's branch layout, cutting a release candidate, promoting to production, rolling back, or asking 'where should this work happen?' Encodes the prod / staging / {feature,test,uat,perf} convention and the cut-RC / regression-test / cut-prod-backup / migrate-prod release flow."
compatibility: Requires the substrate's [lakebase-scm-workflows](../lakebase-scm-workflows/SKILL.md) skill for branch-pairing primitives, plus the substrate's migrate primitives (FEIP-7091, FEIP-7098).
metadata:
  version: "0.1.0"
parent: databricks-lakebase
---

# Lakebase Release Workflows

The convention and release flow every Lakebase-paired project should follow. Composes on top of [`lakebase-scm-workflows`](../lakebase-scm-workflows/SKILL.md) (which gives you `createBranch`, `getSchemaDiff`, `applyMigrations`, etc.) and adds the *opinionated* answer for "how do those primitives compose into a release."

The full reasoning + decision record lives in [references/branching-and-release-methodology.md](references/branching-and-release-methodology.md). This SKILL.md is the agent-facing tldr.

## Branch convention

```
prod                                     (only updated by a release)
 │
 ▼
staging                                  (next release accumulates here)
 │
 ▼
{feature, test, uat, perf}               (working branches off staging)
```

| Branch | Purpose | Who merges in |
|---|---|---|
| `prod` | Production state. Lakebase + git both authoritative. | Release promotion only (no PRs from working branches). |
| `staging` | Pre-release integration. Where the next release bakes. | PRs from `feature/*`, `test/*`, `uat/*`, `perf/*`. |
| `feature/<n>` | New work | Dev. |
| `test/<n>` | QA / regression rehearsal | QA. |
| `uat/<n>` | User acceptance | UAT runner / product. |
| `perf/<n>` | Load / perf testing | Perf engineer. |

Each working-branch type pairs to its own Lakebase branch (via [`lakebase-scm-workflows`](../lakebase-scm-workflows/SKILL.md)'s `createBranch`). Schema changes flow up: feature -> staging -> prod via release.

## Release-sprint flow

Production never changes outside a release. A release proceeds in four ordered phases:

1. **Cut RC from prod.** Branch the release candidate off the *current* prod (git + Lakebase). NOT off staging. This locks the release surface and excludes anything still settling on staging.
2. **Regression test the RC.** Run the project's full e2e suite against the RC's Lakebase branch. Substrate primitives: `applyMigrations`, then the project's test runner.
3. **Cut prod-backup.** Snapshot current prod (Lakebase branch + git tag). One-step revert target if the release misbehaves.
4. **Migrate prod.** Promote the RC into prod: substrate `applyMigrations` against the prod Lakebase branch + git fast-forward of `prod` to the RC tip + app deploy.

## When to load the full reference

Load [references/branching-and-release-methodology.md](references/branching-and-release-methodology.md) when:

- A project is being bootstrapped and you have to recommend a branch layout.
- A release decision is in question ("can we cut the RC from staging this time?" - no, see the doc).
- A consumer asks why prod-backup exists separately from the RC.
- Drift from this convention is being proposed and you need the original reasoning to push back or extend.

## Primitives this skill expects (future work)

The substrate doesn't yet ship the release orchestrator. These primitives are planned (FEIP-7059 roadmap):

- `bootstrap-branch-convention` - creates `staging`, `feature`, `test`, `uat`, `perf` from a fresh prod and writes parent-pair metadata.
- `cutRC(fromProd)` - branches the release candidate.
- `regressionTest(rc)` - runs the project's full e2e suite against the RC branch.
- `cutBackup(prod)` - snapshots current prod for rollback.
- `migrateProd(rc)` - applies substrate `applyMigrations` against the prod branch and fast-forwards the git pointer.
- `release` - orchestrator that calls the four phases in order with explicit gates between each.

Until these land, follow the manual procedure documented in the reference.
