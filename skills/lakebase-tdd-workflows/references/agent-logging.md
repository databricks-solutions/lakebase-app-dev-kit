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
| `role` | the role performing the work (spec-author, ux-designer, architect-reviewer, test-strategist, scrum-master, navigator, driver, product-owner) |
| `level` | `debug` / `info` / `warn` / `error` (see below) |
| `event` | dotted machine name (e.g. `phase.start`, `artifact.written`, `gate.surfaced`, `handoff`, `reasoning`, `smell.flagged`) |
| `message` | human-readable one-liner |

Optional: `feature_id`, `phase`, `cycle_id`, `data` (structured payload, e.g. artifact path, gate name, conformance violations).

## 2. Levels (what to log at each)

- **`debug` , reasoning considerations.** Why a decision was made, alternatives weighed, open questions you held. The thinking, not just the result.
- **`info` , outputs + decisions.** Phase started/ended, an artifact was written (with its path + conformance result), a gate was surfaced or approved, a handoff to the next role.
- **`warn` , things the HIL should see.** A bad smell flagged, ambiguity surfaced to the PO, gate-integrity drift detected.
- **`error` , hard stops.** A gate refused, conformance failed, a substrate call errored.

## 3. How to emit

Shell out to the kit CLI (works from a headless `claude -p` agent):

```bash
lakebase-tdd-log --role spec-author --level info \
  --event artifact.written --message "wrote feature.json + 3 stories" \
  --feature F1-initial-domain --data '{"path":"feature.json","conformant":true}'
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
| **Scrum-Master** | `phase.start`/`phase.end` per transition; `gate.approved`; `experiment.cut` | `reasoning` on N=1 vs N>=2 | `warn` budget cap; `error` postcondition unmet |
| **Navigator** | `cycle.red` (failing test written); `review.verdict` | `reasoning` on the design the test forces | `warn` smell flagged (`smell.flagged`) |
| **Driver** | `cycle.green`; `cycle.refactored` | `reasoning` on the minimal change | `warn` cycle stall; `error` runner missing |

The orchestrator may also emit `handoff` events at each role boundary so the
log reads as a clean relay timeline.

## 5. Where it does NOT go

This log is execution narrative, not workflow state. Gate state stays in
`gates.json`; SCM state in `.lakebase/workflow-state.json`; spec artifacts in
the `.tdd/` tree. The agent log records what the agents DID, in order, for
debugging + audit.
