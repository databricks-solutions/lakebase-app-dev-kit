# feature-status JSON schema

The stable JSON payload emitted by `lakebase-feature-status <featureId> --json` and the equivalent `getFeatureStatus()` module export. This shape is part of the substrate's public contract: agents and MCP consumers depend on it.

**Backwards-compatibility contract.** Top-level keys are append-only. Nested object keys are append-only. Field types do not change. Removing or renaming a key requires a major version bump.

## Top-level shape

```ts
interface FeatureStatusSnapshot {
  feature_id: string;
  current_workflow_phase: string | null;
  derived_phase: string | null; // phase DERIVED from the per-story pipeline (source of truth)
  current_workflow_pointer: WorkflowPointer | null;
  stories: StoryStatusEntry[]; // per-story rows from pipeline.json (id, status, gate_status, accepted)
  plans: PlanStatusEntry[]; // per-story: one { story_id, plan } per stories/<S>/plan.json
  test_list: TestListSummary | null;
  experiments: ExperimentStatusEntry[];
  selection_log_recent: SelectionLogEntry[];
  open_smells: SmellHit[];
  gates: GatesSummary | null;
  progression: ProgressionSummary | null; // deploy/promote completion reconciled from the drive engine
}
```

| Field | Type | Meaning |
|---|---|---|
| `feature_id` | string | Echo of the queried feature id. |
| `current_workflow_phase` | string \| null | The COARSE phase recorded in `.sftdd/workflow-state.json`. For a per-story-driven feature this is not advanced per story, so it can lag (stay `discovery`) while the feature is actually built; prefer `derived_phase`. `null` when `workflow-state.json` is missing. |
| `derived_phase` | string \| null | The feature phase DERIVED from the per-story `pipeline.json` (the source of truth): `complete` (every story done + accepted), `build` (a story is past its spec gate), or `design` (stories tracked, none gated yet). `null` when no stories are tracked (consumers fall back to `current_workflow_phase`). |
| `current_workflow_pointer` | object \| null | Active workflow locus (feature/story/ac/cycle/experiment ids). `null` when `workflow-state.json` is missing. The pointer's `feature_id` may differ from the queried `feature_id` (the workflow may be focused elsewhere). |
| `stories` | array | Per-story rows from `.sftdd/features/<F>/pipeline.json`, each `{story_id, status, gate_status, accepted}`. Empty when no stories are tracked yet. The per-story truth behind `derived_phase`. |
| `plans` | array | Per-story experiment plans, one entry `{story_id, plan}` per `.sftdd/features/<F>/stories/<story>/plan.json`. Empty until a story's design-spec gate is approved. |
| `test_list` | object \| null | Aggregated counts from `.sftdd/features/<F>/test-list.json`. `null` when the test list has not been authored yet. |
| `experiments` | array | One entry per directory under `.sftdd/experiments/<F>/`. Empty when no experiments have been cut. |
| `selection_log_recent` | array | Up to the last 5 entries from `.sftdd/selection-log.md`, oldest-first. |
| `open_smells` | array | Unresolved entries from `.sftdd/smells.json` (entries with no `resolution` field). Global to the `.sftdd/` tree; not filtered per feature in this version. |
| `gates` | object \| null | Compact view of `.sftdd/features/<F>/gates.json` (ADR-0004 structured HITL state). `null` when the feature directory does not exist. Default-open shape (all five gates `status: "open"`) returned when the directory exists but no `gates.json` file has been written yet. Use `scripts/sftdd/gates.readGates()` for the full state including history + artifact_hashes. |
| `progression` | object \| null | Deploy/promote completion RECONCILED from the drive engine (`readDriveContext`, the same reconciliation `lakebase-sftdd-next` uses): `{coarse_phase, deploy_done, promote_done}`. `deploy_done` is true once `deploy-evidence.json` exists (or the feature has merged); `promote_done` is true once the SCM `.lakebase/workflow-state.json` reaches `merged`. The renderer overlays this onto the `deploy`/`promote` gate lines so a shipped feature reads `done`, not the stale raw `gates.json` `open` bit. `null` when the drive context cannot be read. |

## Nested types

### WorkflowPointer

```ts
interface WorkflowPointer {
  feature_id: string | null;
  story_id: string | null;
  ac_id: string | null;
  cycle_id: string | null;
  experiment_id: string | null;
}
```

### ExperimentPlan

See `scripts/sftdd/design-spec-gate.ts`. Persisted at `.sftdd/features/<F>/plan.json`.

```ts
interface ExperimentPlan {
  feature_id: string;
  story_id: string; // experiments are story-scoped; one plan.json per story
  N: number;
  mode: "N=1" | "N>=2";
  strategies: Array<{ name: string; rationale: string }>;
  budget: {
    concurrent_branches: number;
    wall_clock_minutes: number;
    agent_pairs: number;
    per_experiment?: { max_cycles?: number; max_wall_clock_minutes?: number }; // default { max_cycles: 30, max_wall_clock_minutes: 60 }
  };
  rationale: string;
}
```

### TestListSummary

```ts
interface TestListSummary {
  total: number;
  by_status: {
    pending: number;
    red: number;
    green: number;
    refactored: number;
    skipped: number;
  };
  completion_pct: number;  // (green + refactored) / total, rounded to nearest integer; 0 when total === 0
}
```

### ExperimentStatusEntry

```ts
interface ExperimentStatusEntry {
  story_id: string; // experiments are story-scoped
  slug: string;
  branch_id: string;
  status: "running" | "succeeded" | "failed" | "abandoned" | null;
  tests_passed: number | null;
  tests_failed: number | null;
  schema_diff_summary: string | null;
  cycle_count: number;  // count of entries in timeline.json
}
```

### SelectionLogEntry

```ts
interface SelectionLogEntry {
  timestamp: string;  // ISO 8601, as parsed from the `## <ISO> – <title>` heading (en-dash, U+2013)
  title: string;
}
```

### GatesSummary

```ts
type GateName = "spec" | "plan" | "test_list" | "promote" | "deploy";
type GateStatus = "open" | "approved" | "superseded" | "withdrawn";

interface GateSummary {
  status: GateStatus;
  approver: string | null;     // last approver; null when never approved
  approved_at: string | null;  // ISO 8601 of last approval; null when never approved
}

type GatesSummary = Record<GateName, GateSummary>;
```

The summary is a compact projection of `gates.json`. For full history, withdrawal reasons, or artifact_hashes, call `readGates()` from `scripts/sftdd/gates.ts` directly.

### SmellHit

See `scripts/sftdd/smells.ts`. Each open smell entry also carries `detected_at: string` from the on-disk log.

```ts
interface SmellHit {
  smell: string;       // one of the names from SMELL_CATALOG (e.g. "cycle-stall", "fragility-ratio")
  cycle_ids: string[];
  detail: string;
  detected_at: string; // ISO 8601
  // resolution field is absent for open smells (filtered out if present)
}
```

## Example payload

```json
{
  "feature_id": "F1-checkout",
  "current_workflow_phase": "discovery",
  "derived_phase": "build",
  "current_workflow_pointer": {
    "feature_id": "F1-checkout",
    "story_id": "S1-submit",
    "ac_id": null,
    "cycle_id": "C1",
    "experiment_id": null
  },
  "stories": [
    { "story_id": "S1-submit", "status": "building", "gate_status": "approved", "accepted": false }
  ],
  "plans": [
    {
      "story_id": "S1-submit",
      "plan": {
        "feature_id": "F1-checkout",
        "story_id": "S1-submit",
        "N": 1,
        "mode": "N=1",
        "strategies": [{ "name": "single-experiment", "rationale": "Iterative refinement; no parallel race needed." }],
        "budget": {
          "concurrent_branches": 1,
          "wall_clock_minutes": 180,
          "agent_pairs": 1,
          "per_experiment": { "max_cycles": 30, "max_wall_clock_minutes": 60 }
        },
        "rationale": "no opinion gaps detected"
      }
    }
  ],
  "test_list": {
    "total": 5,
    "by_status": { "pending": 3, "red": 0, "green": 1, "refactored": 1, "skipped": 0 },
    "completion_pct": 40
  },
  "experiments": [
    {
      "story_id": "S1-submit",
      "slug": "s1-submit",
      "branch_id": "br-feat-add-orders",
      "status": "running",
      "tests_passed": 2,
      "tests_failed": 0,
      "schema_diff_summary": null,
      "cycle_count": 4
    }
  ],
  "selection_log_recent": [
    { "timestamp": "2026-05-27T10:00:00Z", "title": "Experiment plan for F1-checkout/S1-submit" }
  ],
  "open_smells": [],
  "gates": {
    "spec": { "status": "approved", "approver": "po@example.com", "approved_at": "2026-05-31T20:00:00.000Z" },
    "plan": { "status": "approved", "approver": "po@example.com", "approved_at": "2026-05-31T21:00:00.000Z" },
    "test_list": { "status": "open", "approver": null, "approved_at": null },
    "promote": { "status": "open", "approver": null, "approved_at": null },
    "deploy": { "status": "open", "approver": null, "approved_at": null }
  },
  "progression": { "coarse_phase": "feature", "deploy_done": false, "promote_done": false }
}
```

## N=1 vs N≥2

The shape does not branch on `plan.mode`. An N=1 feature has `experiments.length === 1` (the feature branch); an N≥2 race has `experiments.length === N`. The same renderer surfaces both, with one row per experiment. Cross-experiment comparison rendering (`promote` vs `synthesize` decision aid) is intentionally out of scope here; that lives in the comparison-report renderer, which consumes the `experiments` array + per-experiment `outcomes.json` directly.

## Versioning

The shape carries no version field. Stability is enforced by the BDD assertion in `tests/bdd/tdd-feature-status.test.ts` (the "stable JSON schema shape" test). Any field addition that breaks that assertion is a contract change that needs deliberate review.
