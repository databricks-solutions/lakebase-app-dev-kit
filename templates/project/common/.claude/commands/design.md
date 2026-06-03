# /design : feature design pipeline

Drives a feature from idea to spec to architect review to test list. This wraps the canonical lakebase-tdd-workflows design phases as a single one-shot you can invoke from Claude Code in a Lakebase-paired project.

## Usage

```
/design <feature-id> [--reviewer @user] [--test-strategist @user]
```

If `.tdd/` does not exist in the project root, this command hard-fails with a setup hint instead of lazy-initializing: the TDD workflow has invariants (`.tdd/` shape, `selection-log.md`) a lazy bootstrap cannot reconstruct. Run the project's TDD adoption bin first, or `lakebase-create-project` when starting fresh.

## Step 0 (cannot skip): claim the paired branch via the SCM workflow

**Before any design phase runs, the agent MUST claim a paired Lakebase + git branch for this feature through the SCM workflow.** This is the kit's invariant: every git branch gets a Lakebase branch, the SCM workflow state machine is its enforcement surface, and `lakebase-scm-claim-feature-branch` is the ONLY supported creation path. Skipping this step OR shelling out to `git checkout -b` directly is a contract violation and must be refused.

The bin handles precondition gating (refuses unless `.lakebase/workflow-state.json` is at `scaffold-complete` or `merged`), parent-branch resolution from the project's tier topology, the paired Lakebase + git + .env creation via `createFeaturePairedBranch` (30-day TTL), and the state-file transition to `feature-claimed` in a single call. Idempotent: re-running with the same feature-id on a `feature-claimed` row returns a no-op success.

Concretely, the agent:

1. Verifies `.lakebase/workflow-state.json` exists (run `lakebase-scm-state` to inspect). If absent, hard-fail with `SCM workflow state missing; run lakebase-create-project first.`
2. Invokes the workflow CLI with the feature id (no path/branch math required: the bin derives `feature/<slug>` and picks the parent from `tier_topology`):

   ```bash
   npx --yes --package=github:databricks-solutions/lakebase-app-dev-kit \
     lakebase-scm-claim-feature-branch "<feature-id>" \
       --project-dir "$PWD" \
       --json --pretty
   ```

   The bin's `--parent` flag overrides the tier-default parent when the feature must fork from somewhere else (e.g. a hotfix off production on a 2-tier project). The bin's `--instance` flag overrides the `project_id` recorded in the workflow state; usually unneeded.

3. If the bin exits non-zero, do NOT fall back to a lower-level substrate primitive. Diagnose via `lakebase-scm-state --json --pretty` and surface the error message to the user. Exit codes: `1` no state file, `2` precondition refused (wrong state, invalid feature-id, already claimed for a different feature), `3` substrate failure.
4. Run `.claude/commands/design.pre-hook.md` if present. The default pre-hook (shipped with the kit) documents this very step for reference; projects may APPEND project-specific gestures to it (claim a JIRA epic, post to Slack, etc.). The pre-hook does NOT replace step 0 above; it extends it.

If step 0 cannot complete, REFUSE to proceed to phase 1. Do not work around. The substrate is the only path; the SCM workflow is how that path is enforced.

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
