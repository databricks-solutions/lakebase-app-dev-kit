# /build : feature build pipeline

Drives a designed feature through TDD cycles to ready-for-review by delegating to the deterministic orchestrator driver. It is the second phase of the per-feature loop: `/design` -> `/build` -> `/deploy`, which a sprint of features runs after `/plan` authored their requests. When the stories are built + accepted, run `/deploy <feature-id>` to ship the increment to a target and verify it is working software (the per-sprint review).

## Usage

```
/build <feature-id> [--parallel-experiments N]
```

Requires `.tdd/features/<feature-id>/test-list.json` to exist (the artifact `/design` produces). If the test list is missing, this command stops with a pointer back to `/design <feature-id>`.

## How it runs: the deterministic driver

`/build` delegates the build lane to the deterministic orchestrator driver. Run
it bounded to `build`, with interactive gates so YOU answer each per-story
acceptance (headless: the Human Proxy answers):

```bash
GATES=interactive; [ "${LAKEBASE_TDD_HUMAN_PROXY:-}" = "1" ] && GATES=proxy
./scripts/lk \
  lakebase-tdd-drive --feature "<feature-id>" --only build --gates "$GATES" --project-dir "$PWD"
```

The driver:
- builds on a **single Navigator+Driver lane** fed by a FIFO ready queue: one
  gate-approved story at a time, cut its paired experiment branch -> Navigator
  (PLAN + RED) -> Driver (GREEN + REFACTOR) -> deploy the story for the PO's
  acceptance review (the story's deploy must be reachable + verify-green, the
  teeth) -> **accept** (merge the experiment) -> pull the next ready story.
- routes deterministically (routing is code, not an LLM orchestrator): spawns `@lakebase-tdd-workflows/agents/{navigator,driver,release-engineer}`
  at their resolved per-role models, emits the cycle/handoff log as code. Tail:
  `lakebase-tdd-log --read --feature <id>`.
- **requires design done**: `--only build` REFUSES (stops at iteration 0) if a
  story is not yet designed (its spec gate unapproved). If it refuses, run
  `/design <feature-id>` first.
- `--only build` STOPS before deploy; the merged feature is ready for `/deploy`.

**Gates.** Interactive: the driver stops at each per-story acceptance (and any
test-list / promote gate) and prints a `GATE` marker. Surface the running story
to the human; on accept, record it (`lakebase-tdd-experiment merge` +
`lakebase-tdd-pipeline accept --story <s> --approver <human>`), then re-run to
resume. Headless (`--gates proxy`): the Human Proxy validates + approves. A story
that is not reachable + verify-green cannot be accepted (never a silent merge).

## Project pre/post hooks

If `.claude/commands/build.pre-hook.md` exists in this project, it runs before phase 1. Common uses: confirm CI is green, refresh Lakebase credentials, ping the on-call channel that a build is starting.

If `.claude/commands/build.post-hook.md` exists in this project, it runs after promote. Common uses: open the PR via the project's PR bin, post a summary to Slack, move the JIRA epic to "review."

Hooks are owned by the project; this command file only consults them when present. One pre-hook plus one post-hook per command (no chains in v1).

## Substrate version

Pinned to: `0.3.0-beta.0`

The future `lakebase-update-commands` bin will re-pull this command's canonical template while preserving your pre/post hooks.
