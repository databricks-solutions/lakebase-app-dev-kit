# /build : feature build pipeline

Drives a designed feature through TDD cycles to ready-for-review. This wraps the lakebase-tdd-workflows Scrum-Master orchestrator as a one-shot you can invoke from Claude Code in a Lakebase-paired project. It is the second phase of the orchestrated path: `/design` -> `/build` -> `/deploy`. When the cycles are green, run `/deploy <feature-id>` to ship the increment to a target and verify it is working software (the per-sprint review).

## Usage

```
/build <feature-id> [--parallel-experiments N]
```

Requires `.tdd/features/<feature-id>/test-list.json` to exist (the artifact `/design` produces). If the test list is missing, this command stops with a pointer back to `/design <feature-id>`.

## Phases

1. **Scrum-Master orchestrator** picks the next AC, runs Driver / Navigator cycles, watches smells, surfaces gate 3 (test-list immutability) and gate 4 (promote vs synthesize) to the human.
2. At gate 3 the orchestrator stops and refers back to `/design --resume <feature-id>` when the test list needs renegotiation.
3. At gate 4 the orchestrator invokes `archiveExperiment` for losing branches once the human picks promote or synthesize.

The orchestrator is implemented by the substrate agent at `@lakebase-tdd-workflows/agents/scrum-master`. Per-cycle work fans out to `@lakebase-tdd-workflows/agents/driver` and `@lakebase-tdd-workflows/agents/navigator`.

## Human Proxy (headless) mode

If `LAKEBASE_TDD_HUMAN_PROXY=1` (set by CI / the smoke), the human review at gate 3 (test-list immutability) and gate 4 (promote vs synthesize) is performed by `human-proxy`: it validates the gate's artifacts exist + carry their expected elements (format-conformant) and approves only then. The orchestrator advances on that validated approval, never by skipping the gate, and never on a missing/malformed artifact. See `@lakebase-tdd-workflows/SKILL.md` "Headless / Human Proxy mode".

## Logging

Every agent emits structured events via `lakebase-tdd-log` to `.tdd/agent-log.jsonl` (see `@lakebase-tdd-workflows/references/agent-logging.md`). The orchestrator emits `phase.start` / `phase.end` per cycle and `gate.approved` at gates 3/4; the Navigator emits `cycle.red` + `review.verdict`; the Driver emits `cycle.green` + `cycle.refactored`; smells go to `--level warn --event smell.flagged`. Tail with `lakebase-tdd-log --read --feature <id>`.

## Project pre/post hooks

If `.claude/commands/build.pre-hook.md` exists in this project, it runs before phase 1. Common uses: confirm CI is green, refresh Lakebase credentials, ping the on-call channel that a build is starting.

If `.claude/commands/build.post-hook.md` exists in this project, it runs after promote. Common uses: open the PR via the project's PR bin, post a summary to Slack, move the JIRA epic to "review."

Hooks are owned by the project; this command file only consults them when present. One pre-hook plus one post-hook per command (no chains in v1).

## Substrate version

Pinned to: `${KIT_VERSION_AT_SCAFFOLD}`

The future `lakebase-update-commands` bin will re-pull this command's canonical template while preserving your pre/post hooks.
