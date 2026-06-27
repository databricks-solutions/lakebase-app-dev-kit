# Recorded SFTDD scenarios

A **scenario** is a recorded run of the SFTDD workflow (design lane + build lane)
that the kit can **replay** as an integration test, deterministically and without
re-spending model tokens. Each scenario is captured once from a real live run and
then replayed forever: the captured artifacts are the fixture, the deterministic
orchestrator is the system under test.

This directory is the home for those scenarios, so new ones can be added over
time. Each lives in its own folder:

```
examples/sftdd-scenarios/<name>/
  scenario.json        # manifest (schema: scripts/sftdd/schemas/scenario.schema.json)
  recorded-artifacts/  # the DESIGN-lane corpus (per-feature design + agent-log.design.jsonl)
  recorded-build/      # the BUILD corpus (code tree + green/reviewed cycles + experiments)
  turns/               # the per-turn recorder timeline (index.json + <NNNN>-<label>/)
  intake/              # optional: product-overview.md / nfrs.md / design-brief.md for replay
```

## scenario.json

```jsonc
{
  "name": "stockflow",                       // must match the directory name
  "description": "Inventory app: F1 record-stock, then F6 split tracking-code (contract drop).",
  "tiers": 2,                                 // 1=prod, 2=prod+staging, 3=+dev
  "uiTrack": true,                            // has a user-facing UI (design-brief in intake)
  "pauseBefore": "release-engineer",          // default handoff the live replay drives to
  "features": [                               // replayed in order, chained in one project
    { "id": "F1-stock-visibility",    "buildReplay": true,  "summary": "additive" },
    { "id": "F6-split-tracking-code", "buildReplay": true,  "summary": "contract: drop a column" }
  ]
}
```

## The loop

### 1. Capture (once, expensive, live)
Drive a real feature with the per-turn recorder pointed at the scenario dir:

```bash
examples/sftdd-scenarios/capture-scenario.sh \
  --scenario <name> --project-dir <live-project> --feature F1-... [--feature F6-...]
```

It sets `LAKEBASE_SFTDD_RECORD_DIR` + `LAKEBASE_SFTDD_RECORD_BUILD_DIR` into the
scenario dir (the kit recorder, `scripts/sftdd/turn-recorder.ts`, writes every
state-machine turn), then reconstitutes the agent-log onto the recorded timeline.
Author `scenario.json`, then commit the corpus.

### 2. Guard (always-on, hermetic, no workspace)
`tests/bdd/sftdd-scenarios.test.ts` runs under `npm test` everywhere. For every
scenario it asserts the corpus is well-formed + replay-ready: the manifest is
valid, each feature has a `recorded-artifacts/features/<id>/` (and a
`recorded-build/features/<id>/` when `buildReplay`), and `turns/index.json` has
strictly monotonic ordinals pointing at present turn dirs. This is the regression
guard: a corpus can never silently rot into an un-replayable state.

### 3. Replay (live, on demand, workspace-backed)
```bash
examples/sftdd-scenarios/replay-scenario.sh --scenario <name> [--to release-engineer]
```
Reuses the shared replay engine (`examples/tdd-workflow-smoke/orchestrator/_replay-smoke.sh`):
for each feature it replays the DESIGN lane from `recorded-artifacts/`, restores
the recorded BUILD from `recorded-build/` (no Navigator/Driver spawn), and drives
the deterministic orchestrator to the handoff. Wired into the live suite as
`scripts/run-live-tests.sh --scenarios` (and `--all`).

## Why both layers
The hermetic guard is cheap and always runs, catching corpus drift in CI. The
live replay is the true end-to-end exercise (real scaffold, real Lakebase
branches, real deploy + acceptance + promote) but needs a workspace + credentials,
so it runs on demand. Together: fast everyday protection + full on-demand validation.
