# /design pre-hook: claim a paired feature branch via the substrate

Runs before `/design`'s phase 1 (Spec Author). Enforces the kit's
invariant: **every git branch gets a Lakebase branch**, and the
substrate's `lakebase-branch create-paired` is the only supported path
to create one. The hook makes that the default for every scaffold,
not a per-project opt-in.

## Pre-hook job

Before any design work, ensure a paired Lakebase + git branch exists
for the feature being designed. The feature id is the positional
argument to `/design` (e.g. `F1-initial-domain`).

1. Read `LAKEBASE_PROJECT_ID` from the project's `.env`.
2. Derive the git branch name from the feature id by stripping the
   leading `F<N>-` and prefixing `feature/`:
   - `F1-initial-domain` -> `feature/initial-domain`
   - `F2-add-owners` -> `feature/add-owners`
3. Pick the parent branch:
   - If `LAKEBASE_BASE_BRANCH` is set in `.env`, use that.
   - Else if the project has a `staging` branch (3-tier scaffold), use `staging`.
   - Else use the project default branch (2-tier scaffold; usually `production`).
4. Invoke the substrate primitive:

   ```bash
   npx --yes --package=github:databricks-solutions/lakebase-app-dev-kit \
     lakebase-branch create-paired \
       --instance "$LAKEBASE_PROJECT_ID" \
       --branch "feature/$SLUG" \
       --parent-branch "${LAKEBASE_BASE_BRANCH:-<staging-or-production>}" \
       --cwd "$PWD" \
       --pretty
   ```

   `lakebase-branch create-paired` wraps the substrate's
   `createPairedBranch`. The atomic sequence:
   - Create the Lakebase branch first (with TTL auto-recovery if the
     workspace caps below the kit's default).
   - Run `git checkout -b feature/$SLUG`. The kit's `post-checkout`
     hook fires + populates `.env` credentials from the Lakebase side.
   - If the Lakebase create fails, no git branch is left dangling.

5. If `create-paired` errors with `branch already exists`, the branch
   was claimed in a prior session - skip and proceed to phase 1.

## Why this lives here

The kit ships this as a default `design.pre-hook.md` so every
scaffolded project enforces the "no git branch without Lakebase
branch" invariant out of the box. Without it, agents or humans could
shell out to `git checkout -b` directly and create an orphan git
branch that the post-checkout hook then races to populate, sometimes
succeeding sometimes not (depends on workspace auth state). The
substrate is the single source of truth for branch creation; this
pre-hook makes that real.

Projects that want to extend this gesture (claim a JIRA epic, post to
Slack, etc.) can append to this file. The kit's `lakebase-update-commands`
won't clobber a pre-hook that diverges from the default.

## Override

To skip the pre-hook for a specific design run (e.g. when continuing
work on an already-claimed branch), pass `--skip-pre-hook` to
`/design`. The skill respects this flag and proceeds directly to
phase 1 without invoking this hook.
