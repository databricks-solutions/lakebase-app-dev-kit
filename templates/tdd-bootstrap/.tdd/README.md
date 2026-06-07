# .tdd/

This directory is the canonical home for this project's TDD workflow state. It is read and written by `lakebase-tdd-workflows` (`skills/lakebase-tdd-workflows/`).

## Layout

- `product-overview.md` – the Product Owner's project-level overview (the feature catalog). `spec.json` – the machine-readable feature catalog.
- `workflow-state.json` – current phase + locus (feature / story / AC / cycle / experiment).
- `features/<F>/` – one directory per feature. Contains `feature-request.md` (the Feature Requester's original ask, the Spec Author's input), `feature-spec.{md,json}` (the Spec Author's draft spec), `architecture.{md,json}` (added by Architect Reviewer), `test-list.{md,json}` (Test Strategist), `stories/<S>/...`.
- `experiments/<F>/<exp>/` – one directory per experiment branch with `notes.md`, `branch.txt`, `outcomes.json`, `timeline.json`.
- `spikes/<slug>/` – throwaway exploration. Notes preserved after branch teardown.
- `synthesis/<F>/` – N>=2 menu-pick decision records + `synthesized-spec/` subtree.
- `cycles/<F>/<S>/<AC>/cycle-NNN.json` – per-cycle RED/GREEN/REFACTOR artifacts.
- `selection-log.md` – append-only HITL gate decisions + rationale.
- `smells.json` – detected bad smells + remediations.
- `adapters/<adapter>.json` – optional per-adapter config (JIRA, GitHub Issues, etc.).

## Getting started

1. Read [`skills/lakebase-tdd-workflows/SKILL.md`](../../../../skills/lakebase-tdd-workflows/SKILL.md) (or open via your agent's installed copy of the skill).
2. The Spec Author authors a draft spec (`feature-spec.{md,json}`) under `features/<F>/` from the requester's `feature-request.md`, using the schemas in `scripts/tdd/schemas/`.
3. Get the Product Owner to sign off (Gate 1) before invoking the Architect Reviewer.
4. The deterministic orchestrator (`lakebase-tdd-drive`) routes the rest of the phases, spawning the role agents under `skills/lakebase-tdd-workflows/agents/`.

JSON files are validated against `scripts/tdd/schemas/` by `scripts/tdd/spec-sync.ts`. Drift is warned, not auto-corrected.
