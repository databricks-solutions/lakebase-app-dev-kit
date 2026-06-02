# /design : feature design pipeline

Drives a feature from idea to spec to architect review to test list. This wraps the canonical lakebase-tdd-workflows design phases as a single one-shot you can invoke from Claude Code in a Lakebase-paired project.

## Usage

```
/design <feature-id> [--reviewer @user] [--test-strategist @user]
```

If `.tdd/` does not exist in the project root, this command hard-fails with a setup hint instead of lazy-initializing: the TDD workflow has invariants (`.tdd/` shape, `selection-log.md`) a lazy bootstrap cannot reconstruct. Run the project's TDD adoption bin first, or `lakebase-create-project` when starting fresh.

## Phases (HITL-gated)

1. **Spec Author** drafts `spec.md` + `feature.json` from the prompt.
2. **Architect Reviewer** challenges scope and boundaries. Gate 1 stops the pipeline until the human signs off.
3. **Test Strategist** writes `test-list.json`. Gate 2 stops the pipeline until the human signs off.

Each phase is implemented by the substrate agent of the same name:
- `@lakebase-tdd-workflows/agents/spec-author`
- `@lakebase-tdd-workflows/agents/architect-reviewer`
- `@lakebase-tdd-workflows/agents/test-strategist`

References resolve through Claude Code's `@skill-name/agent-name` lookup, so agent renames inside the substrate skill stay safe.

## Project pre/post hooks

If `.claude/commands/design.pre-hook.md` exists in this project, it runs before phase 1. Common uses: create a JIRA epic for the feature, claim a working branch in Lakebase.

If `.claude/commands/design.post-hook.md` exists in this project, it runs after phase 3. Common uses: notify a Slack channel, assign reviewers, link the spec into a tracking doc.

The hooks are owned by the project, not the substrate: this command file only consults them when present. Author the markdown files freely; one pre-hook plus one post-hook per command (no chains in v1).

## Substrate version

Pinned to: `${KIT_VERSION_AT_SCAFFOLD}`

Bumping the kit may shift agent prompts. The future `lakebase-update-commands` bin will re-pull canonical templates while preserving the pre/post hook files above.
