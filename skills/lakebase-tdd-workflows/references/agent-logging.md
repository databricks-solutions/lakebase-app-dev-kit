# Agent logging (structured, centralized)

The TDD workflow is a relay of role agents with isolated memory (FEIP-7510). To
make a run observable, **each agent emits structured log events** describing
what it is doing (and, at debug level, why), and a centralized logger collects
them into one file. This is the audit + debug trail for the whole relay.

## 1. Format

One JSON object per line (JSON Lines) in `.tdd/agent-log.jsonl`, validated
against `scripts/tdd/schemas/agent-log-event.schema.json`. Required fields:

| Field | Meaning |
|---|---|
| `ts` | ISO-8601 UTC timestamp (stamped by the logger) |
| `role` | the role performing the work (orchestrator, spec-author, ux-designer, architect-reviewer, test-strategist, navigator, driver, product-owner, release-engineer) |
| `level` | `debug` / `info` / `warn` / `error` (see below) |
| `event` | dotted machine name (e.g. `phase.start`, `artifact.written`, `gate.surfaced`, `handoff`, `reasoning`, `smell.flagged`) |
| `message` | human-readable one-liner |

Optional: `feature_id`, `phase`, `cycle_id`, `data` (structured payload, e.g. artifact path, gate name, conformance violations).

## 2. Levels (what to log at each)

- **`debug` , reasoning considerations.** Why a decision was made, alternatives weighed, open questions you held. The thinking, not just the result.
- **`info` , outputs + decisions.** Phase started/ended, an artifact was written (with its path + conformance result), a gate was surfaced or approved, a handoff to the next role.
- **`warn` , things the HIL should see.** A bad smell flagged, ambiguity surfaced to the PO, gate-integrity drift detected.
- **`error` , hard stops.** A gate refused, conformance failed, a substrate call errored.

## 2.5 Progress cadence (emit during long phases)

A role's work between phase boundaries can take many minutes (an LLM drafting a dozen ACs, assigning layers, ordering tests, running a cycle). If you only emit at `phase.start` / `phase.end`, an observer sees a long silent block and cannot tell "working" from "stuck." So emit a `progress` event at each meaningful **sub-step**:

- **Spec Author:** one per candidate feature proposed (planning); one per story and per AC drafted (drafting).
- **Architect Reviewer:** one per AC layer assigned; one per `nfrs.md` Required item covered (`brief_ref`).
- **Test Strategist:** one per test ordered into the list.
- **Navigator / Driver:** one per cycle step (PLAN / RED / REVIEW; GREEN / REFACTOR).
- **Release Engineer:** one per deploy step (deploy / reachable / verify).

```bash
lakebase-tdd-log --role spec-author --level debug --event progress \
  --message "AC 4/11 drafted: bug is reachable by identifier after filing" --feature F1-initial-domain
```

Use `debug` for sub-step progress (so `info` stays the outputs/decisions stream). The rule is cadence: roughly one line per sub-step, so a gap in the log reliably means stuck, not working.

## 3. How to emit

Shell out to the kit CLI (works from a headless `claude -p` agent):

```bash
lakebase-tdd-log --role spec-author --level info \
  --event artifact.written --message "wrote feature-spec.json + 3 stories" \
  --feature F1-initial-domain --data '{"path":"feature-spec.json","conformant":true}'
```

Read / tail the centralized log:

```bash
lakebase-tdd-log --read --feature F1-initial-domain --min-level info
```

In-process callers use `emitAgentLogEvent` / `readAgentLog` from
`scripts/tdd/agent-log.ts`.

## 4. Per-role emit points (instrumentation)

Each role emits at its phase boundaries, on each artifact it writes, and on its
handoff. Minimum expected events:

| Role | info | debug | warn / error |
|---|---|---|---|
| **Spec Author** | `phase.start`/`phase.end`; `artifact.written` per feature/story/AC; `handoff` to Architect/UX | `reasoning` on scope calls | `warn` open-question left unresolved |
| **UX Designer** | `artifact.written` design-guide/ia; `handoff` | `reasoning` on token/IA choices, reference provenance | `error` adherence check failed |
| **Architect Reviewer** | `artifact.written` architecture.{md,json}; `gate.surfaced` (NFRs proposed to HIL) | `reasoning` on layer/NFR proposals | `warn` cross-cutting concern with no owner |
| **Test Strategist** | `artifact.written` test-list; `gate.surfaced` | `reasoning` on ordering rationale | `warn` a test needing impl-first (smell) |
| **Orchestrator** (the deterministic driver) | `phase.start`/`phase.end` per transition; `gate.approved`; `experiment.cut` | the chosen action + the state it was derived from | `warn` budget cap; `error` postcondition unmet |
| **Navigator** | `cycle.red` (failing test written); `review.verdict` | `reasoning` on the design the test forces | `warn` smell flagged (`smell.flagged`) |
| **Driver** | `cycle.green`; `cycle.refactored` | `reasoning` on the minimal change | `warn` cycle stall; `error` runner missing |

The orchestrator may also emit `handoff` events at each role boundary so the
log reads as a clean relay timeline.

## 4.5 HITL interactions (the human is a logged participant)

Every HITL gate is a two-sided, logged interaction: the workflow transitions
TO the human, and the proceed is GATED BY their response. Both sides are
recorded, the audit trail must show who was asked and what they decided.

1. **Transition to the human** (the surfacing role, `info`):
   `--event gate.surfaced --message "Gate N surfaced to PO: <what they must decide>"`.
   This marks that the workflow handed control to the human and is now waiting.

2. **The human's response** (`--role product-owner`), recorded BEFORE the
   workflow advances, the transition past the gate is gated by it:
   - `--event gate.approved --message "<what they approved + any decisions>"`
   - `--event gate.modified --message "<what they changed>"` (with the change)
   - `--event gate.rejected --message "<why, what to revise>"`
   Capture the human's ACTUAL decision verbatim in the message + `data`, not a
   paraphrase. If the human answered open questions, record their answers.

So a normal (human) run logs: `gate.surfaced` (transition) then the human's
`gate.approved`/`gate.modified`/`gate.rejected` (their response), and only then
the next phase's `phase.start`. In **Human Proxy mode** the human is performed
by `human-proxy`, which emits the SAME `product-owner` `gate.approved` /
`gate.refused` events (it validated the artifact's expected elements first). The
log shape is identical; only the approver identity in `data.approver` differs,
so an auditor sees exactly where a human was, or was not, in the loop.

## 5. Where it does NOT go

This log is execution narrative, not workflow state. Gate state stays in
`gates.json`; SCM state in `.lakebase/workflow-state.json`; spec artifacts in
the `.tdd/` tree. The agent log records what the agents DID, in order, for
debugging + audit.
