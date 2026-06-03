# /design : feature design pipeline

Drives a feature from idea to spec to architect review to test list. This wraps the canonical lakebase-tdd-workflows design phases as a single one-shot you can invoke from Claude Code in a Lakebase-paired project.

## Usage

```
/design <feature-id> [--reviewer @user] [--test-strategist @user]
```

If `.tdd/` does not exist in the project root, this command hard-fails with a setup hint instead of lazy-initializing: the TDD workflow has invariants (`.tdd/` shape, `selection-log.md`) a lazy bootstrap cannot reconstruct. Run the project's TDD adoption bin first, or `lakebase-create-project` when starting fresh.

## Step 0 (cannot skip): claim the paired branch via the substrate

**Before any design phase runs, the agent MUST claim a paired Lakebase + git branch for this feature via the substrate.** This is the kit's invariant: every git branch gets a Lakebase branch, and the substrate's `lakebase-branch create-paired` is the ONLY supported creation path. Skipping this step OR shelling out to `git checkout -b` directly is a contract violation and must be refused.

Concretely, the agent:

1. Reads `LAKEBASE_PROJECT_ID` from the project's `.env`. If absent, hard-fails with `Lakebase project id missing; run lakebase-create-project first.`
2. Derives the git branch name from the feature id by stripping the leading `F<N>-` and prefixing `feature/`. Example: `F1-initial-domain` -> `feature/initial-domain`.
3. Picks the parent branch with this precedence:
   - `LAKEBASE_BASE_BRANCH` from `.env` if set (explicit override).
   - Otherwise `staging` if the project's `lakebase-branch list` shows it (3-tier scaffold).
   - Otherwise the project default branch (2-tier scaffold; usually `production`).
4. Invokes the canonical substrate primitive via the kit CLI:

   ```bash
   npx --yes --package=github:databricks-solutions/lakebase-app-dev-kit \
     lakebase-branch create-paired-tier feature \
       --instance "$LAKEBASE_PROJECT_ID" \
       --branch "feature/<slug>" \
       --parent-branch "<resolved-parent>" \
       --cwd "$PWD" \
       --pretty
   ```

   `create-paired-tier feature` is the ONLY supported way to claim a feature branch: it combines `createPairedBranch`'s atomicity (Lakebase first, then git, then `.env` sync, all-or-nothing) with the 30-day convention TTL feature branches require. Do NOT use `create-paired` (lower-level, defaults to `no_expiry: true` which would silently create a long-running tier instead of a feature branch).

5. If `create-paired` errors with `branch already exists`, the feature branch was claimed in a prior session: proceed to step 6.
6. Run `.claude/commands/design.pre-hook.md` if present. The default pre-hook (shipped with the kit) documents this very step for reference; projects may APPEND project-specific gestures to it (claim a JIRA epic, post to Slack, etc.). The pre-hook does NOT replace step 0 above; it extends it.

If step 0 cannot complete, REFUSE to proceed to phase 1. Do not work around. The substrate is the only path.

## Phases (HITL-gated)

1. **Spec Author** drafts `spec.md` + `feature.json` from the prompt.
2. **Architect Reviewer** challenges scope and boundaries. Gate 1 stops the pipeline until the human signs off.
3. **Test Strategist** writes `test-list.json`. Gate 2 stops the pipeline until the human signs off.

Each phase is implemented by the substrate agent of the same name:
- `@lakebase-tdd-workflows/agents/spec-author`
- `@lakebase-tdd-workflows/agents/architect-reviewer`
- `@lakebase-tdd-workflows/agents/test-strategist`

References resolve through Claude Code's `@skill-name/agent-name` lookup, so agent renames inside the substrate skill stay safe.

## Project post-hook

If `.claude/commands/design.post-hook.md` exists in this project, it runs after phase 3. Common uses: notify a Slack channel, assign reviewers, link the spec into a tracking doc.

The post-hook is owned by the project, not the substrate: this command file only consults it when present. Author the markdown file freely; one post-hook per command (no chains in v1).

## Substrate version

Pinned to: `${KIT_VERSION_AT_SCAFFOLD}`

Bumping the kit may shift agent prompts. The future `lakebase-update-commands` bin will re-pull canonical templates while preserving the post-hook file above.
