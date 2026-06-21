# .sftdd/

This directory is the canonical home for this project's TDD workflow state. It is read and written by `lakebase-sftdd-workflows` (`skills/lakebase-sftdd-workflows/`).

## Layout

- `product-overview.md` – the Product Owner's project-level overview (open-ended narrative). `nfrs.md` + `design/design-brief.md` – the other project-level intake artifacts. (There is no `spec.json`; the machine-readable spec is per-feature `features/<F>/feature-spec.json`.)
- `workflow-state.json` – current phase + locus (feature / story / AC / cycle / experiment).
- `features/<F>/` – one directory per feature. Contains `feature-request.md` (the Feature Requester's original ask, the Spec Author's input), `feature-spec.{md,json}` (the Spec Author's draft spec), `architecture.{md,json}` (added by Architect Reviewer, holds the NFRs), `test-list.{md,json}` (Test Strategist), `stories/<S>/...`.
- `experiments/<F>/<S>/<slug>/` – one directory per STORY experiment branch with `branch.txt`, `outcomes.json` (+ notes). Experiments are per-story.
- `spikes/<slug>/` – throwaway exploration. Notes preserved after branch teardown.
- `synthesis/<F>/` – N>=2 menu-pick decision records + `synthesized-spec/` subtree.
- `cycles/<F>/<S>/<AC>/cycle-NNN.json` – per-cycle RED/GREEN/REFACTOR artifacts.
- `selection-log.md` – append-only HITL gate decisions + rationale.
- `smells.json` – detected bad smells + remediations.
- `adapters/<adapter>.json` – optional per-adapter config (JIRA, GitHub Issues, etc.).

## Getting started

1. Read [`skills/lakebase-sftdd-workflows/SKILL.md`](../../../../skills/lakebase-sftdd-workflows/SKILL.md) (or open via your agent's installed copy of the skill).
2. You do not drive this by hand: the deterministic orchestrator (`lakebase-sftdd-drive`, run by the `/plan` -> `/design` -> `/build` -> `/deploy` commands) routes every phase, spawning the role agents under `skills/lakebase-sftdd-workflows/agents/` and surfacing the HITL gates (`spec` / `plan` / `test_list` / `promote` / `deploy`) for approval.
3. Per story, the design lane streams Spec Author -> Architect Reviewer -> Test Strategist, each followed by its per-story gate; an approved spec gate releases the story to the build lane.

JSON files are validated against `scripts/sftdd/schemas/` by `scripts/sftdd/spec-sync.ts`. Drift is warned, not auto-corrected.
