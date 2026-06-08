# lakebase-release-workflows

The opinionated branching layout and release flow every Lakebase-paired project should follow. Composes on top of [`lakebase-scm-workflows`](../lakebase-scm-workflows/README.md) (which gives you `createBranch`, `getSchemaDiff`, `applySchemaMigrations`, and the matching CLI bins) and adds the canonical answer to "how do those primitives compose into a release."

This README is the human-facing overview. The agent's operating contract (the branch table, the four-phase release sequence, the per-tier policy gates, the planned orchestrator primitives) lives in [`SKILL.md`](SKILL.md). The full reasoning and decision record lives in [`references/branching-and-release-methodology.md`](references/branching-and-release-methodology.md).

## When to use

- A new project is being bootstrapped and you need to decide branch layout and chain length.
- A release candidate needs cutting, regression-testing, backing up, and migrating into a long-running tier.
- An N-tier promotion (`dev` → `staging` → `prod`) needs to happen one tier at a time.
- A rollback is being discussed and you need to know which backup branch to point at.
- A team is asking whether a non-standard chain (extra preprod tier, split test / uat / perf) is supported and how to wire it.

## Branch convention

A project's branches form a directed chain of long-running tiers ending in `prod`. Working branches (`feature`, `test`, `uat`, `perf`) each target one tier in that chain, chosen by the architect at project bootstrap. Two-tier is the default; any chain length is supported and is stored in project metadata so agents and the VS Code extension read the same source of truth.

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

| Branch | Purpose | Who merges in |
|---|---|---|
| `prod` | Production state. Lakebase + git both authoritative. | Release promotion only (no PRs from working branches). |
| Each intermediate tier (`staging`, `dev`, `preprod`, ...) | Pre-promotion integration. Where the next release at this tier bakes. | Releases from the tier below + PRs from working-branch types whose configured target is this tier. |
| `feature/<n>` | New work | Dev |
| `test/<n>` | QA / regression rehearsal | QA |
| `uat/<n>` | User acceptance | UAT runner / product |
| `perf/<n>` | Load and performance testing | Perf engineer |

Each working-branch type pairs to its own Lakebase branch via [`lakebase-scm-workflows`](../lakebase-scm-workflows/README.md)'s `createBranch` / `createFeatureBranch`. Schema changes flow up the chain one release at a time.

## Every merge into a long-running branch IS a release

The substrate maintains this convention uniformly. There is no separate "casual PR merge" vs "formal release" distinction:

- `feature/X → staging` is a release to `staging`
- `feature/X → dev` (three-tier shop) is a release to `dev`
- `dev → staging` (three-tier shop) is a release to `staging`
- `staging → prod` is a release to `prod`

The same four-phase shape runs in all cases. What differs is whether the release candidate is implicit (the working branch IS the RC) or explicit (cut from `to` and merged with `from` for a tier-to-tier promotion).

## The four-phase release flow

A release promotes one branch (the `from` source) into a long-running target (the `to` tier). `from` can be a working branch or another long-running tier; `to` is always a long-running tier. The shape is identical at every release, only the from / to labels change. `to == prod` adds the app-deploy step; intermediate-tier releases skip it.

A PR is required for every release. There are no direct pushes to long-running branches.

1. **PR open → cut `ci-pr-branch` from `to`.** The substrate auto-creates an ephemeral Lakebase branch (per PR) forked from the current `to`. This is the release candidate. Cutting from `to` (not `from`) is what locks the release surface: the test runs against the current target's data shape, not whatever has accumulated on `from`. Wired by the kit-scaffolded `.github/workflows/pr.yml`.
2. **Regression test the `ci-pr-branch`.** `pr.yml` runs `applySchemaMigrations` against the RC, then the project's full test suite. Merge is gated on this passing: GitHub branch protection blocks the merge button until the check is green.
3. **PR merge → cut backup of `to`.** `merge.yml` on the `to` push fires `lakebase-cut-backup`, snapshotting current `to` (Lakebase branch + git tag). One-step revert target. Runs at every tier: `staging-backup-<id>` matters less than `prod-backup-<id>`, but the same primitive runs for both.
4. **Migrate `to`.** `merge.yml` continues with `applySchemaMigrations` against `to`'s Lakebase branch, fast-forwards `to` in git, and (only when `to == prod`) deploys the app.

The shape is identical for `feature/X → staging` and `staging → prod`. For `staging → prod` specifically, the `ci-pr-branch` is cut from a fresh prod (NOT from staging) so the migration test runs against real production data shape: "ensure it will work on my prod" before merging.

## How to use

Pointer notes for the most common asks. The agent reads [`SKILL.md`](SKILL.md) for the operating contract; humans read these.

### Pick a branch layout for a fresh project

Default to two-tier unless the team has a concrete reason to add an intermediate. Three-tier (`dev → staging → prod`) is appropriate when QA / UAT / perf testing needs a stable target that doesn't change every time a feature lands. Four+ tiers are unusual; reach for the full reference before recommending one.

### Cut a release between tiers

Open a PR from `from` into `to` (the GitHub-Actions side is fully scaffolded by `lakebase-create-project`). `pr.yml` cuts the RC, runs migrations, and runs tests. Merge once green. `merge.yml` cuts the backup, migrates, fast-forwards, and (for `prod`) deploys.

### Roll back a botched release

The `<tier>-backup-<id>` Lakebase branch created in phase 3 is your one-step target. Repoint the tier's working branches at it via the SCM substrate (`createPairedBranch` with the backup as parent) and revert the git pointer to the matching tag. The reference doc has the full procedure.

### Use the substrate's `cut-backup` directly

The backup primitive ships today as `lakebase-cut-backup` (CLI) and `cutBackup` (JS / MCP), reusable outside the release flow when you want a no-expiry snapshot off any source branch:

```bash
lakebase-cut-backup --instance proj-checkout --source-branch staging --backup-name pre-migration-experiment
```

```ts
import { cutBackup } from "@databricks-solutions/lakebase-app-dev-kit";
const result = await cutBackup({
  instance: "proj-checkout",
  sourceBranch: "staging",
  backupName: "pre-migration-experiment",
});
// result.backup.uid, result.backup.state, result.sourceBranchName
```

This is the same primitive `merge.yml` calls in phase 3.

## Status: orchestrator under construction

The branch convention, the four-phase shape, and the YAML scaffolding (`pr.yml` + `merge.yml`) ship today via [`lakebase-scm-workflows`](../lakebase-scm-workflows/README.md)'s `lakebase-create-project`. The named release orchestrator primitives (parameterized over from / to so the same primitive serves every adjacent pair in any chain length) are planned but not yet wired:

- `bootstrap-branch-convention({chain, workingTypeTargets})`: creates the configured long-running chain (default `[staging, prod]`) plus the working-branch types, all from prod, and writes parent-pair metadata + the type → target-tier mapping.
- `cutRC({from, to, releaseId})`: branches the release candidate off current `to` and merges `from` in.
- `regressionTest({rc, suite})`: runs the project's full end-to-end suite against the RC branch.
- `cutBackup({to, releaseId})`: snapshots current `to` for rollback. Available today.
- `migrate({rc, to, releaseId})`: applies `applySchemaMigrations` against `to`'s Lakebase branch and fast-forwards the git pointer.
- `release`: orchestrator that calls the four phases in order with explicit gates between each.

Until the named orchestrator primitives land, follow the manual procedure documented in the reference. The YAML workflows scaffolded by `lakebase-create-project` already implement phases 1, 2, and 4 end-to-end; phase 3 wires `lakebase-cut-backup` as shown above.

## Integration with sibling skills

- [`lakebase-scm-workflows`](../lakebase-scm-workflows/README.md): provides `createBranch`, `createPairedBranch`, `getSchemaDiff`, `applySchemaMigrations`, and `cutBackup`. Release-workflows uses these primitives; it does not duplicate them.
- [`lakebase-tdd-workflows`](../lakebase-tdd-workflows/README.md): the TDD workflow ends at "PR opened against `staging`." Release-workflows takes over from there. No overlap; the handoff is the PR.
- `databricks-lakebase` (dev-hub): the parent skill. Lakebase Postgres CLI basics (project / branch / endpoint shapes, "never delete the production branch" rule). This skill composes on top of it.

## When to load the full reference

Load [`references/branching-and-release-methodology.md`](references/branching-and-release-methodology.md) when:

- A project is being bootstrapped and you have to recommend a branch layout, including deciding chain length.
- A release decision is in question ("can we cut the RC from `from` this time?" answer: no, see the doc).
- A consumer asks why `to`-backup exists separately from the RC.
- An N-tier shop's per-tier policy gates need to be designed.
- Drift from this convention is being proposed and you need the original reasoning to push back or extend.
