# Per-story design->build pipeline (streaming, single build lane + ready queue)

**Status**: Design proposal, 2026-06-07
**Umbrella FEIP**: (workflows as executable state machines)
**Primary FEIP**: (per-story pipelined design->build)
**Builds on**: (per-role agent runtime), the /plan -> /design -> /build -> /deploy loop.

---

## Why this exists

Today `/design` produces the ENTIRE feature-spec (all stories + all ACs) before Gate 1, then the Architect annotates all of it, then the Test Strategist orders all of it, and only then does `/build` start. Build waits behind the complete design. In the live smoke this showed as an ~8-minute block while the Spec Author drafted a 4-story / 11-AC spec, with nothing buildable until the whole thing was done.

The Product Owner wants software to flow per story: as soon as ONE story's design is done and the HIL approves it (and it is included in the sprint), the Navigator + Driver build that story immediately, while the remaining stories are still being designed. Stories stream through the pipeline independently; the team does not wait for the full feature spec.

## The model

Two lanes coordinated by the Scrum-Master (which still only coordinates):

**1. Design lane (can run ahead, per story).** For each story S in the feature:
- Spec Author drafts story S + its ACs (one story at a time; hands off as soon as S is done, then starts S+1).
- Architect Reviewer assigns layers + NFR coverage on S's ACs.
- Test Strategist orders S's tests into a per-story test list.
- **Per-story spec gate:** the HIL reviews S's design and approves it INTO the sprint (headless: the Human Proxy validates + approves). Only an approved story becomes buildable.

**2. Build lane (single, queue-fed).** There is ONE Navigator + Driver pair.
- When story S passes its gate, the Scrum-Master puts it on a FIFO **ready-for-build queue**.
- If the pair is idle, it dispatches the head of the queue. If the pair is busy building an earlier story, S waits in the queue.
- When the pair finishes a story, it pulls the next ready story. Build is serialized (one pair); design + gating overlap with the in-flight build.

**Scrum-Master (coordinator).** Advances each story's design sub-pipeline, surfaces each per-story gate, enqueues approved stories, and dispatches the queue to the single build pair when it is free. It writes nothing itself; it manages the lanes + the queue.

```
design lane (runs ahead):  S1 spec->arch->tests->[gate] -> ready
                           S2 spec->arch->tests->[gate] -> ready (queued)
                           S3 spec->arch->tests->[gate] -> ...
ready-for-build queue:     [S2, S3, ...]   (FIFO, scrum-master-managed)
build lane (single pair):  building S1 ... done -> pull S2 ... done -> pull S3
deploy:                    per the working-software gate once the feature's stories are built
```

## What it touches (substrate, not just prompts)

- **/design <-> /build boundary.** Today sequential commands. Per-story pipelining interleaves them; the orchestration becomes a streaming loop, not two phases. Likely a combined orchestration the Scrum-Master drives (or `/design` emits gated ready-stories and `/build` consumes the queue).
- **Gate model.** Per-story spec gate (vs the per-feature `spec`/`plan`/`test_list`/`promote` in `gates.json`). Either a per-story gate key, or a logged per-story HITL decision (like the deploy gate).
- **State machine.** A single feature-level `phase` cannot represent "S1 building while S2 designing while S3 queued." Need per-story status (`designing` / `awaiting-gate` / `ready` / `building` / `done`) + the ready queue, in `workflow-state.json`.
- **Test-list scoping.** `test-list.json` is feature-level today; this needs per-story test lists (the schema already has per-AC views to build on).
- **Concurrency.** The Scrum-Master spawns design(S+1) while build(S) runs, and reconciles gates + the queue as they land. Single build lane bounds it.

## Phased plan

1. **[done] Orchestration layer (docs).** Scrum-Master pipelines per story + manages the ready queue + single build lane; Spec Author / Architect / Test Strategist operate at story scope and hand off per story; per-story HIL gate (Human Proxy headless); concurrent design-ahead. (skills/.../agents/*.md + design.md/build.md.)
2. **[done] Substrate.** Landed isolated in `.tdd/features/<F>/pipeline.json` (NOT overloading the per-feature `gates.json`):
   - 2a pipeline state + single-lane FIFO ready queue (`story-pipeline.ts`, `lakebase-sftdd-pipeline` CLI, schema).
   - 2b formal per-story spec gate (surface -> approve-gate -> ready; withdraw-gate rescinds), recorded per story alongside its status.
   - 2c per-story test-list scoping (`scopeToStory` / `writeStoryTestList` -> `stories/<story>/test-list-per-story.json`, the build lane's per-story input).
   Each with unit tests.
3. **[done, hermetic; live run pending] Smoke + re-validate.** A hermetic end-to-end vitest (`tdd-per-story-pipeline-e2e`) drives a 3-story feature through all three layers together, proving design runs ahead and gates later stories while the single build lane drains the FIFO queue one story at a time. An advisory `verify-story-pipeline.sh` is wired into the smoke (step 4.5) to confirm a clean terminal pipeline state on a live run. The live TDD-workflow smoke run against a real workspace is the final confirmation.

## Open questions (resolve during phase 1)

- Does `/design` stay a command that produces gated ready-stories while `/build` consumes the queue, or do they merge into one streaming orchestration the Scrum-Master runs?
- Per-story gate as a `gates.json` key (formal, conformance-checked) vs a logged HITL decision (lighter, like deploy)? Phase 1 uses logged; phase 2 may formalize.
- Deploy cadence: per story, or once the feature's stories are all built? (Current `/deploy` is per feature; per-story deploy is a later question.)

## Decisions locked
- Full design sub-pipeline per story (Spec Author -> Architect -> Test Strategist -> gate -> build), not a lean spec->build.
- Single Navigator+Driver build lane; a Scrum-Master-managed FIFO ready-for-build queue absorbs stories that gate while the pair is busy.
- Design + FEIP + phased plan first; implement phase-by-phase with the suite green at each step.
