# /sprint : the top-level orchestrator (the whole sprint, plan -> design -> build -> deploy)

`/sprint` is the Tier-1 entry point. It runs an entire sprint as one continuous
flow: plan the backlog (to the plan gate), then for each feature claim its branch
and drive it `design` -> `build` -> `deploy` to done. Control returns to the human
only at the gates, the human answers them live; headless, the Human Proxy does.

This is the autonomous path. The Tier-2 commands (`/plan`, `/design`, `/build`,
`/deploy`) are for running ONE phase at a time when you want hands-on control;
`/sprint` chains them. `/spike` is throwaway exploration outside the loop.

## Usage

```
/sprint [<sprint-name>]
```

Requires `.tdd/` + project intake (the same precondition `/plan` enforces). The
sprint backlog (which features are in the sprint) is the PO's call, recorded at
`.tdd/sprints/<name>/backlog.json`, produced by `/plan`'s authoring (headless,
from the recorded backlog).

## How it runs: the deterministic driver

`/sprint` IS the deterministic orchestrator driver run at sprint scope:

```bash
GATES=interactive; [ "${LAKEBASE_TDD_HUMAN_PROXY:-}" = "1" ] && GATES=proxy
./scripts/lk \
  lakebase-tdd-drive --sprint "<sprint-name>" --gates "$GATES" --project-dir "$PWD"
```

It FLOWS: plan -> **[PLAN GATE]** -> for each backlog feature: claim its branch
(via `lakebase-scm-claim-feature-branch`, the SCM entry-tier fork the driver does
not own) -> design (per-story **spec gates**) -> build (per-story **acceptance**)
-> deploy (**deploy gate**) -> next feature. Routing is code (not an LLM
orchestrator); each role is spawned as a subagent at its resolved per-role model;
the per-story pipeline streams within each feature. The phase/handoff log is
emitted as code to `.tdd/agent-log.jsonl`.

**Gates + resume (interactive).** The run never skips a gate. It stops at the
next HITL gate, prints a `GATE` marker, and exits so YOU surface it to the human.
On the human's approval, record it (the same approve CLI the Tier-2 commands use
for that gate), then re-run `/sprint <name>` to RESUME: planning and already-done
features are idempotent no-ops, and the in-progress feature continues past the
now-approved gate. Headless (`--gates proxy`, `LAKEBASE_TDD_HUMAN_PROXY=1`): the
Human Proxy answers every gate and the whole sprint runs end to end (what the
TDD-workflow smoke exercises).

## Re-invoking each cycle

`/sprint` is re-run per sprint cycle. After a cycle ships, re-running it re-plans
(the PO folds in what the last cycle's working software revealed) and drives the
next features. A sprint is never deployed as a unit; each feature ships through
its own deploy gate.

## Substrate version

Pinned to: `${KIT_VERSION_AT_SCAFFOLD}`

The future `lakebase-update-commands` bin re-pulls this command's canonical template while preserving any project hooks.
