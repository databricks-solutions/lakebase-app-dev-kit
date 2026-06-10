# Agent logging (structured, centralized)

The TDD workflow is a relay of role agents with isolated memory. To
make a run observable, **each agent emits structured log events** describing
what it is doing (and, at debug level, why), and a centralized logger collects
them into one file. This is the audit + debug trail for the whole relay.

## 1. Format

One JSON object per line (JSON Lines) in `.tdd/agent-log.jsonl`, validated
against `scripts/tdd/schemas/agent-log-event.schema.json`. Fields, in order:

| Field | Meaning |
|---|---|
| `timestamp` | ISO-8601 UTC timestamp (stamped by the logger) |
| `level` | `debug` / `info` / `warn` / `error` (see below) |
| `role` | the role performing the work (orchestrator, spec-author, ux-designer, architect-reviewer, test-strategist, navigator, driver, product-owner, release-engineer) |
| `event` | dotted machine name (e.g. `phase.start`, `artifact.written`, `gate.surfaced`, `handoff`, `reasoning`, `smell.flagged`) |
| `message` | human-readable one-liner |
| `metadata` | optional structured payload |

`timestamp`, `level`, `role`, `event`, `message` are required. `metadata` is optional; when present, `feature_id` is its top-level attribute (the primary scope key), followed by `phase`, `cycle_id`, and any event-specific keys (artifact path, gate name, conformance violations, ...).

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
./scripts/lk lakebase-tdd-log --role spec-author --level debug --event progress \
  --message "AC 4/11 drafted: bug is reachable by identifier after filing" --feature F1-initial-domain
```

Use `debug` for sub-step progress (so `info` stays the outputs/decisions stream). The rule is cadence: roughly one line per sub-step, so a gap in the log reliably means stuck, not working.

## 3. How to emit

Shell out to the kit CLI (works from a headless `claude -p` agent). Roles invoke it through the project's `./scripts/lk` resolver shim (fast; no npx), which is always present at the project root:

```bash
./scripts/lk lakebase-tdd-log --role spec-author --level info \
  --event artifact.written --message "wrote feature-spec.json + 3 stories" \
  --feature F1-initial-domain --data '{"path":"feature-spec.json","conformant":true}'
```

Read / tail the centralized log:

```bash
./scripts/lk lakebase-tdd-log --read --feature F1-initial-domain --min-level info
```

In-process callers use `emitAgentLogEvent` / `readAgentLog` from
`scripts/tdd/agent-log.ts`.

### One common function, two callers

There is exactly ONE logging function, `emitAgentLogEvent` (the `lakebase-tdd-log`
CLI is its shell face); `role` is a parameter, not a function per agent. It is
the only thing that may write `.tdd/agent-log.jsonl`: it stamps the canonical
`timestamp`, validates against the schema, and atomically appends one line.

**NEVER hand-write the log file.** Do not `echo`/`Write`/`>>` a JSON line into
`agent-log.jsonl`, and do not invent fields. A model that hand-writes invariably
mangles the schema (the observed failure: a `timestamp` field with a local
wall-clock instead of the required `timestamp` stamped in UTC). Always shell out to
`lakebase-tdd-log`, which fills the required fields for you. If a field is not
accepted by the CLI, it is not part of the schema.

### Who emits what

- The **orchestrator owns the lifecycle as CODE**: the deterministic driver
  (`lakebase-tdd-drive`) emits `handoff` (which role it dispatched), the invoked
  role's `phase.start`, the gate events (`gate.surfaced` / `gate.approved`),
  `experiment.cut` / `experiment.accepted`, and `phase.end`. It also runs the
  artifact **reconcile** after each role, which code-emits `artifact.written`
  for everything the role left on disk. These are guaranteed every run,
  regardless of model, with no agent action required.
- Each **role** adds only its in-flight JUDGMENT events through the same CLI:
  `progress` sub-steps, `reasoning` (debug), `smell.flagged` (warn), and the
  human's recorded gate decision. You do not need to emit your own
  `phase.start` / `phase.end` / `artifact.written`, the orchestrator already
  does. The shared `.tdd/agent-log.jsonl` is the bus: you append to it as you
  work; there is no need to return events to the orchestrator (a subagent only
  returns its completion).

## 4. Per-role emit points (instrumentation)

`event` is a CLOSED vocabulary (`scripts/tdd/agent-log-events.ts`); each event has
a fixed message TEMPLATE with `{{ slot }}` placeholders. You do NOT write a
message: you pass `--event <name>` + the template's slots as `--slot key=value`,
and the logger renders the message and REJECTS (exit 3, nothing dropped) an
off-vocabulary event or a missing required slot. The event NAME carries the phase;
the slots carry the specifics you fill.

The orchestration **code-emits** the lifecycle + cycle skeleton, and these are
NOT yours to emit: `phase.start`/`phase.end`, `handoff`, `gate.*`, `experiment.*`,
`deploy.*`/`verify.*`, `escalation.raised`, and the entire **`cycle.*` family
(`cycle.red` / `cycle.green` / `cycle.review` / `cycle.refactored`)** plus
`artifact.written` (via reconcile). The substrate stamps those with the right
slots; emitting them yourself would double-log. The columns below are the
JUDGMENT events each role adds ON TOP, via `lakebase-tdd-log`:

| Role | info | debug | warn / error |
|---|---|---|---|
| **Spec Author** | `artifact.written` (auto via reconcile) | `reasoning` on scope calls | `open.question` left unresolved |
| **UX Designer** | (artifacts auto-logged) | `reasoning` on token/IA choices, reference provenance | `adherence.failed` |
| **Architect Reviewer** | (architecture auto-logged) | `reasoning` on layer/NFR proposals | `concern.flagged` (cross-cutting concern with no owner) |
| **Test Strategist** | (test-list auto-logged) | `reasoning` on ordering rationale | `smell.flagged` (a test needing impl-first) |
| **Orchestrator** (deterministic driver) | code-emits `phase.*`, `handoff`, `gate.approved`, `experiment.*`, `cycle.*` | , | `escalation.raised` |
| **Navigator** | (the `cycle.red` / `cycle.review` are code-stamped) | `reasoning` on the design the test forces | `smell.flagged` |
| **Driver** | (the `cycle.green` / `cycle.refactored` are code-stamped) | `reasoning` on the minimal change | `runner.missing` |

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
   Capture the human's ACTUAL decision verbatim in the message + `metadata`, not a
   paraphrase. If the human answered open questions, record their answers.

So a normal (human) run logs: `gate.surfaced` (transition) then the human's
`gate.approved`/`gate.modified`/`gate.rejected` (their response), and only then
the next phase's `phase.start`. In **Human Proxy mode** the human is performed
by `human-proxy`, which emits the SAME `product-owner` `gate.approved` /
`gate.rejected` events (it validated the artifact's expected elements first). The
log shape is identical; only the approver identity in `data.approver` differs,
so an auditor sees exactly where a human was, or was not, in the loop.

## 5. Where it does NOT go

This log is execution narrative, not workflow state. Gate state stays in
`gates.json`; SCM state in `.lakebase/workflow-state.json`; spec artifacts in
the `.tdd/` tree. The agent log records what the agents DID, in order, for
debugging + audit.
