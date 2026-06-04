# /design pre-hook: claim a paired feature branch via the SCM workflow

Runs before `/design`'s phase 1 (Spec Author). Enforces the kit's
invariant: **every git branch gets a Lakebase branch**, the SCM
workflow state machine tracks that pairing, and
`lakebase-scm-claim-feature-branch` is the only supported claim path.

## Pre-hook job

Before any design work, ensure a paired Lakebase + git branch exists
for the feature being designed AND that
`.lakebase/workflow-state.json` records it. The feature id is the
positional argument to `/design` (e.g. `F1-initial-domain`).

1. Verify the SCM workflow state file is present:

   ```bash
   KIT_PKG="github:databricks-solutions/lakebase-app-dev-kit${LAKEBASE_KIT_REF:+#${LAKEBASE_KIT_REF}}"
   npx --yes --package="$KIT_PKG" \
     lakebase-scm-state --project-dir "$PWD"
   ```

   If the bin exits non-zero with "no state file", hard-fail with
   `SCM workflow state missing; run lakebase-create-project first.`
   Do NOT fall back to lower-level substrate primitives.

2. Invoke the claim CLI:

   ```bash
   npx --yes --package="$KIT_PKG" \
     lakebase-scm-claim-feature-branch "<feature-id>" \
       --project-dir "$PWD" \
       --json --pretty
   ```

   `LAKEBASE_KIT_REF` overrides the kit-main default with a branch/tag/sha so smoke runs and feature validation can pin an unreleased kit build.

   The bin handles everything end-to-end:
   - Reads `.lakebase/workflow-state.json` and refuses unless the
     workflow is at `scaffold-complete` or `merged`.
   - Derives the git branch name (`feature/<slug>`) from the feature
     id using the substrate's sanitizer.
   - Picks the parent branch from `tier_topology` (tier 1 -> Lakebase
     default branch; tier 2 -> `staging`; tier 3 -> `dev`).
   - Calls `createFeaturePairedBranch` underneath: 30-day TTL on the
     Lakebase side, `git checkout -b` on the git side, `.env` synced.
   - Writes the new `feature-claimed` state record.

3. If the bin exits non-zero, surface the error to the user. Exit
   codes:
   - `1` no state file (run `lakebase-create-project`)
   - `2` precondition refused (wrong state, invalid feature-id, or
     already-claimed for a different feature)
   - `3` substrate failure (Lakebase create / git checkout / .env sync)

4. Idempotency: re-running with the same feature-id on a
   `feature-claimed` row exits 0 with `alreadyClaimed: true`. Safe to
   invoke repeatedly inside a single design session.

## Why this lives here

The kit ships this as a default `design.pre-hook.md` so every
scaffolded project enforces the "no git branch without Lakebase
branch" invariant out of the box. Without the SCM workflow's claim
bin, agents or humans could shell out to `git checkout -b` directly
and create an orphan git branch. The substrate is the single source
of truth for branch creation; the SCM workflow is the enforcement
surface around it.

Projects that want to extend this gesture (claim a JIRA epic, post to
Slack, etc.) can append to this file. The kit's
`lakebase-update-commands` won't clobber a pre-hook that diverges
from the default.

## Override

To skip the pre-hook for a specific design run (e.g. when continuing
work on an already-claimed branch), pass `--skip-pre-hook` to
`/design`. The skill respects this flag and proceeds directly to
phase 1 without invoking this hook.
