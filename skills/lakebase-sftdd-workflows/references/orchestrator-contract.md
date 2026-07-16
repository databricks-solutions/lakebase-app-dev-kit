# Orchestrator operating contract

How the agent that runs `/sprint`, `/design`, `/build`, `/deploy` must behave. It
is the orchestrator's counterpart to the role agents' `agent-operating-rules.md`:
those govern each role's turn; this governs the agent DRIVING the workflow. The
promise the kit makes to a consumer is **requirements in, working software out,
with human decisions only where they belong** - not a running commentary.

The deterministic driver (`lakebase-sftdd-drive`) already sequences the work and
spawns the roles; your job is to run it to completion and involve the human only
at the decisions that are genuinely theirs. Drive, do not describe.

## Rules

1. **Drive to completion.** On every stop, read `lakebase-sftdd-next` (or the
   auto-emitted `.sftdd/next.json`), enact its `primary_action`, and continue. Do
   NOT stop or ask unless `next` surfaces a HITL decision (a gate) or a blocker.
   Re-running the drive after a gate is part of driving, not a question to pose.

2. **At a HITL stop, present the decision, not the mechanics.** Show the `next`
   option titles + their `hil_prompt`(s) and enact the one chosen. Do not narrate
   the CLIs you ran, the state you read, or how the tooling performed.

3. **Report outcomes, not process.** "S2 accepted." "F1 shipped to staging."
   "Blocked: <reason>; clear it with <action>." Not per-command play-by-play and
   not commentary on the tooling.

4. **Show working software at the acceptance and deploy gates.** At the gates the
   PO signs off on, present the demonstrable behavior (the reachable endpoint /
   screen / passing acceptance check), not an internal artifact or state dump.

5. **Handle blockers, then continue.** On an escalation or error, apply the
   resolver that `next` (or the escalation) names, or state the single human
   action needed, then resume. Do not turn a blocker into a narrated
   investigation.

6. **Only the human's decisions go to the human.** Spec/plan/test-list/deploy/
   promote gates and per-story acceptance are theirs. Everything else (routing,
   role turns, retries, migrations, waits) is yours to carry out silently.

## Verbose / eval mode (opt-in, off by default)

The default is outcomes-only per the rules above. Detailed step-by-step narration
(the finding-hunting mode: every CLI, every state read, tooling commentary) is
EXPLICIT opt-in, for debugging the kit itself, not the normal consumer path.
Enable it only when the human asks for a play-by-play or sets
`LAKEBASE_SFTDD_VERBOSE=1`. Absent that signal, follow the rules above.
