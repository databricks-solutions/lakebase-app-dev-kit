# next.json / `lakebase-sftdd-next` schema

The authoritative, strictly read-only "what do I do next?" surface. It is produced two ways, from the SAME engine the deterministic drive runs on (so it can never disagree with what the drive would actually do):

- **On demand**: `lakebase-sftdd-next --feature <F>` (or `--sprint <S>`), `--json` for the machine contract.
- **Auto-emitted**: the drive writes this snapshot to `.sftdd/next.json` on every stop (a HITL gate, a raised escalation, feature-complete, an error, a killed run), feature scope.

The contract for an orchestrating agent is therefore: **on any drive stop, read `.sftdd/next.json`, present its `options` to the human, and enact the chosen one.** Never reverse-engineer the next move from source, and never hand-edit workflow state. `lakebase-sftdd-next` is read-only: no model spawn, no writes to workflow artifacts, no actions performed. Enacting a chosen option is the caller's job (each option carries its exact command).

## Top-level shape

```ts
interface NextSnapshot {
  scope: "feature" | "sprint";
  feature?: string;                 // present in feature scope
  sprint?: string;                  // present in sprint scope
  state: NextState;
  primary_action: { kind: string; describe: string };  // the single engine next-action
  options: NextOption[];            // the decision MENU (always includes a "hold")
  summary: string;                  // plain-language, TRUTHFUL relay text
  authoritative_playbook_version: string;  // the kit version that produced it
  generated_at: string;             // ISO 8601
}

interface NextState {
  coarse_phase: string;             // driver phase: planning | feature | deploy | promote | done
  derived_phase: string | null;     // feature phase DERIVED from pipeline.json (the source of
                                     // truth): complete | build | design; null in sprint scope /
                                     // when no stories are tracked. Reconciled, never the stale
                                     // coarse workflow-state.json phase.
  stories: Record<string, string>;  // story id -> status (feature scope)
  open_gates: string[];             // the HITL gate the drive would stop at (spec | plan |
                                     // acceptance | deploy | promote), or []
  blockers: NextBlocker[];          // unresolved escalations pre-empting progress, or []
}

interface NextOption {
  id: string;                       // stable dotted id (acceptance.accept, spec.approve, resume, hold)
  title: string;                    // short human label
  hil_prompt: string;               // the question to pose to the human, so the agent proposes
  kind: "action" | "gate" | "noop" | "manual";
  enact: { bin: string; args: string[] } | null;  // exact command; null for noop/manual
  outward_facing?: boolean;         // true => reaches GitHub / merges / deletes: confirm first
  note?: string;                    // extra guidance (e.g. resolve the blocker before resume)
}

interface NextBlocker {
  source: string;                   // the escalation source
  reason: string;
  story?: string;
  resolver: { bin: string; args: string[] } | null;  // deterministic fix command, when known
  resolver_hint?: string;           // guidance when there is no single command
}
```

## The decision menu per stop

`options` is the real set of choices at the current stop, each with its CORRECT enact command (drawn from the one gate -> CLI mapping the drive uses):

| Stop | Options (besides `hold`) | Enact |
|---|---|---|
| Acceptance (`accept`) | `acceptance.accept` / `acceptance.discard` / `acceptance.revise` | `lakebase-sftdd-pipeline accept\|discard\|revise --feature <F> --story <S> --approver <you>` (accept owns the experiment git-merge) |
| Per-story spec gate (`approve-gate`) | `spec.approve` | `lakebase-sftdd-approve-gate --feature <F> --story <S> --approver <you>` |
| Sprint plan gate (`approve-plan-gate`) | `plan.approve` | `lakebase-sftdd-approve-gate --sprint <S> --approver <you>` |
| Deploy gate (`approve-deploy-gate`) | `deploy.approve` | `lakebase-sftdd-approve-gate --feature <F> --gate deploy --approver <you>` |
| Promote gate (`approve-promote-gate`) | `promote.approve` (outward-facing) | `lakebase-sftdd-approve-gate --feature <F> --gate promote --promote-ref <feature-branch> --approver <you>` (the `--promote-ref` is REQUIRED, else the approval is a silent no-op) |
| Blocked (`raise-to-hil`) | `resume` (after resolving the blocker) | `lakebase-sftdd-drive --feature <F>` |
| Feature complete | `resume` (deploy the feature) | `lakebase-sftdd-drive --feature <F>` |
| Any other step | `resume` (carry out the next step) | `lakebase-sftdd-drive --feature <F>` |
| Done | terminal noop (nothing to do) | (none) |

`<you>` is a placeholder unless `--approver` is passed; the auto-emitted `next.json` leaves it as `<you>` for the human to fill.

## Truthful messaging

`summary` states plainly what is happening: a finished feature reads as "complete: every story built, accepted, deployed per story, and merged", NOT "deploy complete in 0 actions". A feature past all its stories frames the next step as "deploy the feature", not silence. A blocked feature says "BLOCKED and needs a human" with the blocker + how to resolve it.

## Scope note

Sprint scope (`--sprint`) reports the planning state + plan gate on demand. The drive's auto-emit is feature scope (the stops that most need a resume/decision surface).
