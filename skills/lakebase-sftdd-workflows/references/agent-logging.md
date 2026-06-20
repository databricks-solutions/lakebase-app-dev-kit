# Agent logging (structured, centralized)

The TDD workflow is a relay of role agents with isolated memory. To make a run observable, **each agent emits structured log events** (what it's doing, and at debug level why), collected into one file: the audit + debug trail for the whole relay.

## 1. Format

One JSON object per line (JSON Lines) in `.tdd/agent-log.jsonl`, validated against `scripts/sftdd/schemas/agent-log-event.schema.json`. Fields, in order:

| Field | Meaning |
|---|---|
| `timestamp` | ISO-8601 UTC (stamped by the logger) |
| `level` | `debug` / `info` / `warn` / `error` |
| `role` | the role doing the work (orchestrator, spec-author, ux-designer, architect-reviewer, test-strategist, navigator, driver, product-owner, release-engineer) |
| `event` | dotted machine name (`phase.start`, `artifact.written`, `gate.surfaced`, `handoff`, `reasoning`, `smell.flagged`) |
| `message` | human-readable one-liner (rendered from the event template) |
| `metadata` | optional payload; `feature_id` is its primary scope key, then `phase`, `cycle_id`, event-specific keys |

`timestamp`, `level`, `role`, `event`, `message` are required; `metadata` optional.

## 2. Levels

- **`debug`:** reasoning, alternatives weighed, open questions. The thinking, not just the result.
- **`info`:** outputs + decisions (phase start/end, artifact written with path + conformance, gate surfaced/approved, handoff).
- **`warn`:** things the HIL should see (a bad smell, ambiguity surfaced, gate-integrity drift).
- **`error`:** hard stops (a gate refused, conformance failed, a substrate call errored).

## 2.5 Progress cadence

A role's work between phase boundaries can take minutes; emitting only at `phase.start`/`phase.end` makes "working" indistinguishable from "stuck." Emit a `progress` event (at `debug`) per meaningful sub-step, so a gap in the log reliably means stuck:
- **Spec Author:** one per candidate feature (planning); one per story + per AC (drafting).
- **Architect:** one per AC layer assigned; one per Required NFR covered.
- **Test Strategist:** one per test ordered.
- **Navigator / Driver:** one per cycle step (PLAN / RED / REVIEW; GREEN / REFACTOR).
- **Release Engineer:** one per deploy step (deploy / reachable / verify).

## 3. How to emit

Shell out through the project's `./scripts/lk` resolver (fast; no npx), always present at the project root:

```bash
./scripts/lk lakebase-sftdd-log --role spec-author --level info \
  --event artifact.written --slot artifact=feature-spec.json --slot summary="+ 3 stories" \
  --feature F1-initial-domain --data '{"path":"feature-spec.json","conformant":true}'
```

Read/tail: `./scripts/lk lakebase-sftdd-log --read --feature F1-initial-domain --min-level info`. In-process callers use `emitAgentLogEvent` / `readAgentLog` from `scripts/sftdd/agent-log.ts`.

`event` is a CLOSED vocabulary (`scripts/sftdd/agent-log-events.ts`); each event has a fixed message TEMPLATE with `{{ slot }}` placeholders. You pass `--event <name>` + its slots as `--slot key=value` (repeatable); the logger renders the message and REJECTS (exit 3) an off-vocabulary event or a missing required slot. There is no free-text `--message` flag.

**NEVER hand-write the log file.** Do not `echo`/`Write`/`>>` a JSON line into `agent-log.jsonl` or invent fields: a model that hand-writes mangles the schema (e.g. a local wall-clock `timestamp` instead of the required UTC stamp). There is exactly ONE writer, `emitAgentLogEvent` (the CLI is its shell face); `role` is a parameter, not a function per agent. If a field isn't accepted by the CLI, it isn't in the schema.

## 4. Who emits what

- **The orchestrator owns the lifecycle as CODE.** The deterministic driver (`lakebase-sftdd-drive`) emits `handoff`, the role's `phase.start`/`phase.end`, the gate events (`gate.surfaced`/`gate.approved`), `experiment.cut`/`experiment.accepted`, and the entire **`cycle.*` family** (`cycle.red`/`green`/`review`/`refactored`). Its post-role reconcile code-emits `artifact.written` for everything left on disk. These are guaranteed every run, regardless of model. Emitting them yourself double-logs.
- **Each role adds only its in-flight JUDGMENT events** through the CLI: `progress`, `reasoning` (debug), `smell.flagged` (warn), and the recorded gate decision. The shared `.tdd/agent-log.jsonl` is the bus; a subagent only returns its completion, not events.

Per-role JUDGMENT events on top of the code-emitted skeleton:

| Role | debug | warn / error |
|---|---|---|
| **Spec Author** | `reasoning` on scope calls | `open.question` |
| **UX Designer** | `reasoning` on token/IA choices + provenance | `adherence.failed` |
| **Architect** | `reasoning` on layer/NFR proposals | `concern.flagged` (cross-cutting concern, no owner) |
| **Test Strategist** | `reasoning` on ordering | `smell.flagged` (a test needing impl-first) |
| **Navigator** | `reasoning` on the design the test forces | `smell.flagged` |
| **Driver** | `reasoning` on the change | `runner.missing` |
| **Orchestrator** | (code-emits `phase.*`, `handoff`, `gate.*`, `experiment.*`, `cycle.*`) | `escalation.raised` |

## 4.5 HITL gates (the human is a logged participant)

Every gate is two-sided and logged; the proceed is gated by the response:
1. **Transition** (surfacing role, `info`): `--event gate.surfaced --slot gate=<spec|plan|test_list|promote|deploy> --slot subject="<what they decide>"`.
2. **Response** (`--role product-owner`), recorded BEFORE the workflow advances:
   - `--event gate.approved --slot gate=<gate>`
   - `--event gate.modified --slot gate=<gate> --slot change="<what changed>"`
   - `--event gate.rejected --slot gate=<gate> --slot reason="<why>"`
   Capture the actual decision (+ `--data`), not a paraphrase; record any answered open questions.

In practice these gate events are emitted by the Human Proxy / deterministic driver, not hand-written by a role. In Human Proxy mode the same `product-owner` `gate.*` events are emitted (after validating the artifact's expected elements); only `data.approver` differs, so an auditor sees exactly where a human was, or wasn't, in the loop.

## 5. Where it does NOT go

This log is execution narrative, not workflow state. Gate state lives in `gates.json`; SCM state in `.lakebase/workflow-state.json`; spec artifacts in the `.tdd/` tree. The agent log records what the agents DID, in order, for debugging + audit.
