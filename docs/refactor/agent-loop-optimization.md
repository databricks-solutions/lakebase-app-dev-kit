# Agent-loop optimization plan

Status: **in review** (living doc , updated as we decide). Owner: TDD substrate.

Goal: cut wall-clock to run a feature through the deterministic driver (design ->
build -> deploy) without losing correctness, by attacking where the time actually
goes. The orchestrator routing is already free; all time is in agent turns.

## Measured baseline (live capture, run `bug-tracker-capture-20260609-221144`, S1 only)

Source: `.sftdd/agent-log.jsonl` timestamps. S1 = 6 ACs, kit `eab213f`, build roles
on sonnet, design roles on haiku.

- **Total S1: ~2,197s (~37 min)** across 96 log events, through full build (stopped at deploy on an env issue, unrelated to timing).
- **Orchestrator routing: ~0s** every transition (0.0-0.2s). Not a target.
- **Build lane dominates (~80%+).** Per-turn (sonnet):
  | turn | observed range | ~6-AC subtotal |
  |---|---|---|
  | navigator RED | 78-146s | ~620s |
  | driver GREEN | 41-155s | ~570s |
  | navigator REVIEW | 67-103s | ~450s |
  | driver REFACTOR (3 of 6 ACs) | 49-100s | ~200s |
- **Design lane ~440s, and ONE turn is ~half of it:** test-strategist = **200s** for a single test-list (haiku, no retry). Rest: propose 65s, breakdown 31s, ux 58s, per-story spec 43s.
- **Inter-phase gap ~44s** (plan -> design): git commit backlog + claim + verify-workflow-state + lk resolution.

Context findings (what each turn pays for):
- Build agents (navigator/driver) **cold-spawn every cycle** (`FRESH_PER_CYCLE`, no `--resume`) , ~18 cold `claude -p` boots for S1, each re-reading `architecture.md` + `design-guide.md` + app + test from disk. Design roles resume (warm).
- The **REVIEW prompt re-reads 3 full files every AC** (`architecture.md`, `nfrs.md`, `design-guide.md`) , 6x reload of the same context.
- No MCP overhead (`--strict-mcp-config`, empty). Role system prompts modest (~120 lines). Cost is model think-time + runtime file re-reads, not startup/prompt bloat.

## P5-adjusted baseline (live capture `bug-tracker-promote3-20260610-101525`, build roles on opus, P2 + P5 + P6 in effect)

Source: `lakebase-sftdd-timing --tdd-dir .../promote3/.tdd`. This is the first baseline AFTER P2/P5/P6 landed, so it is the honest reference for sizing the remaining build-lane options (the original baseline above predates them). Run total **36m30s**, two stories built (S1 ~5 ACs, S2 1 cycle), ending at an S2/S3 escalation (model quality), so promote itself ran only ~27s.

- **Design ~38% (15m47s) is now the single largest phase block**, all serial before the first `experiment.cut`. test-strategist alone is 7m01s.
- **Build lane ~17m35s:** navigator RED `8m27s` (5x, avg 1m41s, max 3m08s) + driver GREEN `7m08s` (5x, avg 1m26s, max 3m10s) + navigator REVIEW `2m01s` (5x, **avg 24.2s**).
- **REVIEW is already cheap , avg 24s.** P2 (inline `reviewRubric`, no 3-file reload) + P6 (`--effort low` on the review turn) did their job. This is the key reframing: **batching the review (old P3 / variant 8c) now saves ~2m total across a story, not the ~375s the pre-P2/P6 estimate claimed.** 8c is effectively dead.
- **The most expensive single thing is the FIRST cycle of a story:** AC1 RED `3m08s` + GREEN `3m10s` = 6m18s, vs later ACs ~1m32s. Even with P5's per-story warm `--resume`, the first turn of a story session pays the full context assembly (architecture + design-guide + app + tests); resume only amortizes turns 2..N.
- **The cold-spawn-per-cycle argument for P8 is spent.** P5 already keeps a warm per-story session, so the avg 1m41s RED / 1m26s GREEN are model think-time, not `claude -p` boots. P8b's remaining mechanism is therefore **amortizing the per-TURN fixed cost (context load + model spin-up think) across a layer-batch**, plus folding N turns of think into fewer larger ones , NOT boot elimination and NOT review folding.

Revised P8b sizing against this run: the 5-AC E2E story batches to ~2 layer-chunks (cap 3). RED 5 turns (8m27s) -> ~2 turns; GREEN 5 turns (7m08s) -> ~2 turns; REVIEW unchanged (per-AC, already ~24s each). A batched RED/GREEN turn is larger (writes/implements 3 ACs), so the saving is sub-linear in turn count: realistic est. **~5-7 min/story on the build lane (~30-40% of it), ~15% of total run** , materially less than the doc's original ~700s, and the gain is concentrated in stories with 4+ same-layer ACs (homogeneous UI/API stories, which the per-story spec gate already tends to produce). Re-measure on a batched run via `lakebase-sftdd-timing --json` before trusting any single number.

## Options

Each: change / effort (S/M/L) / est. save / risk / **status**.

### P1 , kill the test-strategist 200s outlier , LANDED
- **Change:** A/B test-strategist on `sonnet` (often converges faster than haiku thrashing on structured output) and/or tighten its prompt to pass the AC ids inline (it already has them) so it does not re-derive; cap output.
- **Effort:** S. **Save:** ~150s/feature. **Risk:** low.
- **Status:** **LANDED** (branch `perf/agent-loop-p0-p1-p7`). Two parts:
  - **Inline the AC ids (kit code):** `roleTaskBody`'s test-strategist case now states the story's exact AC ids inline (`storyAcIds`) + pins the `ac_id`-mapping contract the response-formatter enforces, so the role no longer re-scans `acs/` to re-derive them. Falls back to the bare directive when no ACs are on disk yet. (`orchestrator-effects.ts`; test in `orchestrator-effects.test.ts`.)
  - **Drop the haiku pin (smoke):** the root cause of the 200s was the smoke pinning ALL design roles to haiku, incl. `--agent-model test-strategist=haiku`; haiku thrashed on the structured test-list. The kit default is already `sonnet`. Removed the test-strategist pin from `run-smoke.sh` + `_replay-smoke.sh` (other prose roles stay haiku, still exercising the override path). Smoke test updated to assert it is NOT pinned.
  - Output cap was already in place via `AGENT_TERSE_SUFFIX`.

### P2 , pre-digest the REVIEW rubric (stop re-reading 3 files per AC) , LANDED
- **Change:** orchestrator computes a compact, AC-scoped rubric once (design tokens + NFR ids + layer for THIS AC) and passes it inline; navigator stops re-reading `architecture.md`/`nfrs.md`/`design-guide.md` every review.
- **Effort:** M. **Save:** ~20-40s x 6 reviews. **Risk:** low (same data, pre-extracted).
- **Status:** **LANDED** (branch `perf/agent-loop-p0-p1-p7`). New `reviewRubric(tddDir, featureId, story, ac)` extracts the AC `layer` (via `readAcLayer`), the NFRs whose `applies_to` is this story or feature-wide (id + brief, from `architecture.json` , the canonical NFR home), and, for an E2E (UI) AC only, the design-token groups (from `design-guide.json`). The navigator REVIEW prompt now embeds this rubric inline and says to open the full files ONLY if more detail is needed (was: mandatory read of all 3 every AC). Best-effort: a missing source is simply omitted. Non-UI ACs (the majority) need NO design-guide read at all. Test in `orchestrator-effects.test.ts` (rubric content + scoping + graceful absence).

### P3 , batch or conditionally skip REVIEW
- **Change:** most reviews return `refactor:false`. Either one review turn covering all just-greened ACs of a story (1 turn vs N), or a deterministic skip for trivial display-only ACs.
- **Effort:** M. **Save:** up to ~5x80s/story. **Risk:** medium (must not skip a real smell).
- **Status:** _proposed_.

### P4 , parallelize the per-AC build (biggest wall-clock, hardest)
- **Change:** today AC1->AC2->... is strictly sequential. The `ExpectationLedger.processCallback` now supports out-of-order/concurrent completion, so RED+GREEN for independent ACs can run bounded-concurrent (e.g. 3-wide), then review. 6 sequential -> ~2 waves ~= 2-3x on the build lane.
- **Catch:** concurrent ACs editing the same file (`app/main.py`) conflict , needs per-AC isolation (separate worktrees, or only parallelize ACs touching disjoint modules).
- **Effort:** L. **Save:** ~700-1,000s/story. **Risk:** medium-high (file contention).
- **Status:** _proposed_.

### P5 , warm the build session (fresh per STORY, not per cycle) , LANDED
- **Change:** stop cold-spawning navigator/driver every cycle: keep a per-story warm `--resume` session with a small per-cycle delta, OR keep fresh but pass a digest so each cold turn re-reads less. Fresh-per-cycle exists to avoid "Prompt too long" on long stories, so this needs a measured cap.
- **Effort:** M. **Save:** cold-boot + re-read x ~18 turns. **Risk:** medium (context growth).
- **Status:** **LANDED as fresh-per-STORY** (branch `perf/agent-loop-p0-p1-p7`, user-chosen variant). `commandsForAction` now gives the build roles a STORY-scoped `resumeKey` (`${role}:${story}`): the navigator/driver `claude -p` session resumes across a story's RED/GREEN/REVIEW/REFACTOR cycles (warm context + prompt cache) and starts FRESH at each new story, so context growth is bounded to one story (the per-story spec gate keeps stories small). Config `sessionScope` (default `story`), with `LAKEBASE_TDD_BUILD_SESSION=cycle` as the cold-spawn-every-turn safety valve if a long story ever overflows the window. Other roles still resume across the whole feature. Tests in `orchestrator-effects.test.ts`.

### P6 , fast REVIEW turn (via `--effort`) , LANDED
- **Change:** REVIEW is judgment, not code authoring , try it on a faster tier than the sonnet code-writers; consider fast-mode for the deterministic-ish turns.
- **Effort:** S (config). **Save:** per-review. **Risk:** low, needs a quality check.
- **Status:** **LANDED** (branch `perf/agent-loop-p0-p1-p7`). **Tooling note:** headless `claude -p` (v2.1.170) has NO `--fast` flag , fast-mode is an interactive-only toggle. The supported headless speed knob is `--effort <low|medium|high|xhigh|max>`. So P6 sets `--effort low` on the Navigator's REVIEW turn ONLY (the judgment turn); RED/GREEN/REFACTOR author code and keep the model default. Config `reviewEffort` (default `low`), overridable via `LAKEBASE_TDD_REVIEW_EFFORT` (e.g. `medium`, or `default` to drop the flag). The `effort` field threads through the `claude` DriveCommand to the runner (`--effort`). Tests in `orchestrator-effects.test.ts`. Quality of low-effort reviews is the thing to watch , now measurable via the P0 timing report + the review verdicts.

### P8 , run the TDD loop at the STORY level, not per AC
- **Change:** today the build loop is **per AC**: navigator writes one failing test (RED) -> driver greens it (GREEN) -> navigator reviews that AC (REVIEW) -> driver refactors (REFACTOR). For a 6-AC story that is ~18-24 agent turns (6 RED + 6 GREEN + 6 REVIEW + N REFACTOR), each a cold spawn. **Story-level** collapses this to ~4 turns per story: navigator writes the story's WHOLE failing test suite once (RED, all ACs), driver implements until all green (GREEN), ONE holistic REVIEW, ONE REFACTOR.
- **Why it is the biggest turn-count lever:** ~20 turns -> ~4 turns/story. Even though each turn is larger (the GREEN turn implements all ACs at once), it removes ~16 cold `claude -p` spawns + their re-reads, and folds 6 review turns into 1. Est. **~1,000s+/story**, comparable to or larger than P4 (parallel build) and simpler (no file-contention , it is still one sequential builder).
- **Subsumes P3** (one review per story is exactly the batched review) and **reduces the need for P4** (far fewer turns left to parallelize).
- **Trade-offs / risks (this is a philosophy change, not just a perf knob):**
  - Loses Beck's granular red-green-refactor micro-cycle , "write all the story's tests, then make them all pass" is closer to test-after-batch than strict per-test TDD. The kit's stated discipline is the tight loop; this softens it.
  - Bigger turns = more context per turn (the GREEN turn must hold all the story's tests + implement every AC) , higher chance of context pressure / lower quality on a large story. Pairs poorly with very large stories; pairs well with small ones (which the per-story spec gate already encourages).
  - Coarser failure attribution: one failing test reds the whole GREEN turn; the per-AC cycle isolates exactly which AC regressed.
  - Substrate change: cycle records, test-list scoping, and the review/refactor flags are per-AC today (`cycle-NNN` per test, `reviewAc`/`refactorAc` per AC). Story-level needs a cycle granularity + a loop-granularity mode.
- **How the ACs are batched (the unit):** **by `layer`, capped.** The batch unit is `(story, layer[, chunk])`, NOT the whole story, because the runner contract is per layer: `recordRunnerOutcome` maps an AC's `layer` -> tag -> the runner that must have run, and `markGreen` refuses to green a cycle unless that layer's runner recorded an outcome. So one GREEN turn can only cleanly all-green tests sharing one runner = one layer.
  - Group the story's ACs by layer (API / E2E / Infra); a batch = the test-list items of one layer (capped at ~3 ACs so a big homogeneous story does not make one giant GREEN turn).
  - RED batch: navigator writes that layer's failing tests in one turn. GREEN batch: driver implements, runs that layer's runner once, records the single per-tag outcome, all batch items flip green together.
  - All-`E2E` 6-AC UI story -> 1 batch (~4 turns). Mixed API+E2E -> one batch per layer.
  - Substrate mapping: one `cycle` keyed by `(story, layer, chunk)` listing the covered test ids (RED stamps once, GREEN stamps once after the layer runner passes); the per-batch "all listed items green" predicate is a PRECISE ledger contract (unlike today's coarse story-level `codeWritten`), so the expectation ledger can re-enforce the build lane.

- **Three variants to choose from (all on the layer-batched unit above):**

  | variant | preserves | collapses | ~turns / 6-AC story | risk |
  |---|---|---|---|---|
  | **8a , full story-level** | nothing (all batched) | RED+GREEN+REVIEW+REFACTOR | ~4 | highest: softens TDD + big-turn quality + coarse attribution |
  | **8b , Hybrid A (batch build, per-AC review)** | per-AC smell review | RED+GREEN into batches | ~8 | medium: review granularity kept; build batched |
  | **8c , Hybrid B (per-AC build, batch review)** | the red-green micro-cycle (TDD discipline) | the 6 reviews into 1 | ~13 | low-medium: keeps strict TDD, only batches the cheap-to-batch review |

  8a maximizes speed; 8c maximizes fidelity to TDD; 8b is the middle. 8c == P3 layered on the per-AC build.

- **Suggested shape:** gate behind a **loop-granularity mode** (`ac` | `story` | `hybrid-a` | `hybrid-b`, default `story`), so a fast capture/CI run picks the batched variant while a rigorous run keeps strict per-AC. Pick the variant per `tdd_mode` or per project.
- **Effort:** L (8a/8b), M (8c , it is mostly batching the review). **Save:** ~1,000s/story (8a), ~700s (8b), ~375s (8c). **Risk:** as per the table; LOW for all if gated behind the mode.
- **Status:** **8b (hybrid-a) LANDED** (branch `perf/p8b-layer-batched-build`), gated behind `loopGranularity` (now default `story`: the full story-level loop, variant 8a, is the shipped default). 8c not built (it is dead per the P5-adjusted baseline). Live A/B pending. See the build-ready subsection below for the as-built A1-A5.
- **Estimate correction (P5-adjusted baseline, 2026-06-10):** the original saves predate P2/P5/P6. With REVIEW now ~24s avg, **8c collapses (~2m/story, no longer worth its own change)** and 8b's realistic build-lane save is **~5-7 min/story (~30-40% of the build lane)**, concentrated in 4+ same-layer-AC stories. See the P5-adjusted baseline section. P8b's mechanism is now turn-fixed-cost amortization, not boot elimination (P5 spent that).

#### Build-ready substrate design (P8b) , the half the proposal left open

Grounded in `cycle-record.ts` + `run-cycle.ts` as they stand. Two facts collapse the originally-feared gaps: cycles are per `test_id` (not per AC), and **review/refactor state is DERIVED from disk every turn** (`acReviewStates` recomputes from green cycles + `review.json`; the `reviewAc`/`refactorAc` in build state are just "the next pending one" via `firstReviewPendingAc`/`firstRefactorPendingAc`). So no review-queue state machine is needed.

- **A1 , batch-aware cycle artifact (additive).** `CycleArtifact` gains optional `test_ids: string[]` (the batch's covered tests) + `chunk: string` (the `(layer, n)` key); single-test cycles keep `test_id`. Add one helper `coveredTestIds(c)`, and switch every reader that keys on `c.test_id` (`storyTestProgress` green/pending sets, `acReviewStates` green set) to it. This is the entire data-model change , backward-compatible (old per-test cycles still read). **Empty-array guard (known defect class):** a test-strategist defect already bit us by emitting/dropping an EMPTY `test_ids: []`, so `coveredTestIds` must treat an empty array as "fall back to `test_id`" (or reject the cycle), NEVER as "covers zero tests" , else a batch cycle with `test_ids: []` silently greens/stalls nothing and the story never completes. So `coveredTestIds(c) = (c.test_ids && c.test_ids.length > 0) ? c.test_ids : (c.test_id ? [c.test_id] : [])`, and `beginNextPendingBatch` must refuse to stamp a batch with no covered tests.
- **A2 , two batch record fns beside the per-test pair.** `beginNextPendingBatch` stamps ONE RED cycle for the first pending layer-chunk: take `storyTestProgress().pending`, group by AC `layer`, write a cycle with the first layer's pending items capped at `batchCap` (~3) as `test_ids` + `chunk`. `greenOpenBatch` greens it: run the layer's runner ONCE (exactly what `recordRunnerOutcome` already models , per-layer-tag), `markGreen`, then propagate `markTestItemGreen` for EACH covered test id + one `commitCycleWork`. The honest-GREEN verify (`ensureDeployedAndVerify`) already runs the whole suite, so batch verification needs no new verifier.
- **A3 , loop-granularity mode.** Config `loopGranularity: "ac" | "hybrid-a"` (default `ac`), env `LAKEBASE_TDD_LOOP=hybrid-a`. `commandsForAction` + `nextBuildAction` pick per-test vs per-batch for RED/GREEN only. REVIEW/REFACTOR routing is UNCHANGED: once a batch GREEN propagates per-test green status, `firstReviewPendingAc` derives the per-AC review queue for free (the feared "multi-AC review state" is a non-issue).
- **A4 , refactor re-verify (a real correctness fix, do regardless of P8b).** Today `refactorAc` stamps `refactored_at` + commits but does NOT re-run the runner , a refactor that breaks a sibling test goes unnoticed. Batching shares more code across ACs, raising that risk, so hybrid-a re-runs the layer runner once after a batch's refactors complete (honest-green at refactor); a failure raises the same escalation as a failed GREEN.
- **A5 , partial-green degrade, no silent fallback.** `greenOpenBatch`'s verify is whole-suite pass/fail; on failure the batch stays RED and raises a HIL escalation, identical to today's single-cycle honest-GREEN. Optional `LAKEBASE_TDD_BATCH_FALLBACK=per-ac` re-reds the failed layer as single-test cycles (a flaky big batch can drop to strict per-AC) , default OFF, and any drop is logged (no silent cap).
- **Corpus/replay , no format fork.** A batch cycle is stored under its first AC's dir with `test_ids` spanning the chunk; `storyCycles` already scans all of a story's subdirs, so the `recorded-build` corpus stays a verbatim copy and `restoreBuildTurn` replays a batched run as-batched , provided the A1 readers are batch-aware.

Net delta: A1 (field + one reader helper) + A2 (two fns) + A3 (mode flag) + A4 (refactor re-verify) + A5 (degrade policy). No change to the design lane, the SCM ladder, or the recorder format. **Effort is M, not L** , the derive-from-disk state model absorbs what looked like the hard parts. A4 is worth landing on its own.

### P7 , cut inter-phase shell overhead , LANDED (corrected: the 40s estimate was wrong)
- **Original change (as drafted):** the ~44s plan->design gap is git commits + claim + `verify-workflow-state` + `lk` resolution. Batch the commits, drop redundant verifies, reuse a warm `lk`.
- **Correction after reading the code (do not trust the original estimate):** three of the four assumed levers do not exist as overhead:
  - **git commits are already batched.** `run_plan_sprint` commits the whole backlog in ONE `git commit` (`run-smoke.sh:621`); there is no per-artifact commit to fold.
  - **`lk` is already warm.** The smoke runs `lk --warm` once up front (`run-smoke.sh:324`); per-bin resolution is then a ~0.09s cache hit, not a cold ~3.5s resolve.
  - **the gap is dominated by the inherent Lakebase claim.** Step 3 (`lakebase-scm-claim-feature-branch`) creates a paired Lakebase branch + git branch + `.env` sync , a real network op of several seconds that is NOT removable without changing what the workflow does.
  So the genuinely-removable overhead is small (~1 node boot/feature), not ~40s. The plan-doc estimate was built on assumptions the code does not bear out.
- **What actually landed (the one safe, contract-respecting win):** the step-3.5 assertion `verify-workflow-state.sh feature-claimed` was spawning a SECOND CLI process (`lakebase-scm-feature-branch`) purely to re-derive the canonical branch for a string-compare, on top of the `lakebase-scm-state` boot it already does. `lakebase-scm-state --json` now emits an additive `canonical_branch` field (computed by the same `sanitizeFeatureSlug` + `featureBranchName` single source of truth), and the assertion reuses it from the JSON it already fetched , removing that second boot per claimed-state check (the verify runs at multiple checkpoints across a full run). Falls back to the dedicated CLI for older kits. In-kit, so live human runs benefit too, not just the smoke. (`scm-state.cli.ts`, `assertions/verify-workflow-state.sh`; test in `scm-state-cli.test.ts`.)
- **Effort:** S. **Save:** ~1 node boot per claimed-state assertion (modest, real). **Risk:** low (additive field + fallback; no guard weakened).
- **Status:** **LANDED** (branch `perf/agent-loop-p0-p1-p7`), with the estimate corrected. The big inter-phase cost (the claim) is inherent; left as-is.

### P0 (enabler) , per-turn timing report , LANDED
- **Change:** small tool that reads the agent-log timestamps and prints per-turn durations (it already has the data), so every change above is A/B-measurable instead of guessed.
- **Effort:** S. **Save:** none directly; de-risks all others. **Risk:** none.
- **Status:** **LANDED** (branch `perf/agent-loop-p0-p1-p7`). `scripts/sftdd/timing-report.ts` (`computeTiming` + `formatTimingReport`) + the `lakebase-sftdd-timing` CLI (`--tdd-dir`/`--feature`/`--top`/`--json`). It reads `.sftdd/agent-log.jsonl`, treats each gap between consecutive events as a span attributed to the ending event, and rolls up by phase / role / role-event kind with the slowest spans surfaced. Approximate by design (a cold `claude -p` boot before a turn's first emit is not separately visible) but enough to find the outliers. Test: `tdd-timing-report.test.ts`.
- **Usage:** `./scripts/lk lakebase-sftdd-timing --feature <F>` (text) or `--json` (machine API for A/B comparisons).

### P0.1 (enabler) , snapshot the model + option matrix per run , LANDED

**Why:** a timing number is meaningless without the config that produced it. Today a run's matrix , per-role model, `--effort` per turn kind, `buildSessionScope`, `loopGranularity`/`batchCap`/`batch-fallback`, agent-model overrides, gates mode, kit SHA , is spread across env vars, CLI flags, and the smoke script, NOT recorded with the results. So two `agent-log.jsonl`s cannot be safely compared: the promote3 baseline differs from the original in build model AND P2/P5/P6, and that was only recoverable by reading git branches. Every A/B in this doc (especially the P8b before/after) is untrustworthy until the config travels with the timing.

**Change:** the deterministic driver writes `.sftdd/run-config.json` ONCE at startup (the common path for both interactive `/` commands and the smoke runners, so one write covers all runners) capturing the RESOLVED matrix, not the override list:
- per-role model (resolved default + any `--agent-model` override),
- `--effort` per turn kind (e.g. `reviewEffort`),
- `buildSessionScope`, `loopGranularity`, `batchCap`, `LAKEBASE_TDD_BATCH_FALLBACK`,
- kit ref/SHA (`.lakebase/kit-ref`), `tdd_mode`, gates mode (`interactive`/`proxy`),
- run label + start timestamp.

`lakebase-sftdd-timing` reads it and prints a `config:` header above the timing (so a text report is self-describing), and `--json` nests it as `{ config, timing }` , an archivable, comparable pair that sits next to the recorded corpus. The turn recorder should mirror `run-config.json` into the corpus root so a replay carries its own provenance.

**Effort:** S. **Save:** none directly; it is what makes P0 (and therefore every option here) a real A/B instead of a guess. **Risk:** none (additive write + read). **Do this before the P8b A/B**, otherwise the batched-vs-per-AC comparison is not defensible.

## Recommended sequencing

1. **P0** (timing report) so we measure, not guess.
2. **P1 + P7** (low-risk, no behavior change, ~190s/feature combined).
3. **P2** (pre-digest review) , low risk, recurring save.
4. **P6** (review on a faster tier) , measure quality.
5. **Decide the build-lane structure** , this is the big fork:
   - **P8 (story-level loop)** , biggest turn reduction, simplest mechanically (one sequential builder), but trades TDD granularity. Best behind an `ac|story` mode.
   - **P4 (parallel per-AC)** , keeps per-AC TDD granularity, but file-contention is the hard part.
   - **P3 (batch review)** , subsumed by P8; only relevant if we keep per-AC build.
   Pick P8 *or* P4 (they address the same ~80% build cost from opposite directions); don't build both.

## Build-lane decision (the fork)

| | keeps per-AC TDD discipline | turns/6-AC story | main risk |
|---|---|---|---|
| status quo (per-AC, sequential) | yes | ~20 | slow |
| **P4** parallel per-AC | yes | ~20 (but ~2 waves wall-clock) | file contention |
| **P8a** full story-level loop (shipped default, `loopGranularity: story`) | no (batched) | ~4 | discipline + big-turn quality |
| **P8b** hybrid A (batch build, per-AC review) | partial | ~8 | middle ground |
| **P8c** hybrid B (per-AC build, batch review) | yes | ~13 | keeps TDD, only batches review |

All P8 variants batch by `layer` (capped) , see P8 for the unit + runner-contract rationale.

## Decision log

- 2026-06-09: baseline measured; options P0-P7 drafted; awaiting selection.
- 2026-06-09: added **P8 (story-level TDD loop)** at user request , reframed the build lane as a P8-vs-P4 fork (story-level batching vs per-AC parallelism); P8 subsumes P3.
- 2026-06-10: **P2 + P5 + P6 LANDED** on branch `perf/agent-loop-p0-p1-p7` (full hermetic suite green, 1981 passed). P2 = inline pre-extracted review rubric (`reviewRubric`), navigator no longer reloads 3 files per AC. P5 = build session is now fresh-per-STORY (story-scoped `resumeKey`; `buildSessionScope` config + `LAKEBASE_TDD_BUILD_SESSION=cycle` valve), the user-chosen variant. P6 = `--effort low` on the REVIEW turn (`reviewEffort` config), since headless `claude -p` has no `--fast` flag. Build-lane fork (P4 vs P8) still the only big open item; P3 subsumed by a future P8.
- 2026-06-09: **P0 + P1 + P7 LANDED** on branch `perf/agent-loop-p0-p1-p7` (full hermetic suite green). P0 = the `lakebase-sftdd-timing` report. P1 = inline AC ids in the test-strategist prompt + drop its haiku pin in the smoke (kit default sonnet). P7 = `scm-state --json` now carries `canonical_branch` so `verify-workflow-state.sh` skips a second CLI boot. **P7's original ~40s estimate was corrected to ~1 boot/feature** after reading the code: commits are already batched, `lk` is already warm, and the gap is dominated by the inherent Lakebase claim (not removable). The build-lane fork (P4 vs P8a/8b/8c) + P2/P5/P6 remain open and now A/B-measurable via P0.
- 2026-06-10: **P5-adjusted baseline added** from live capture `bug-tracker-promote3-20260610-101525` (opus build roles, P2/P5/P6 in effect). Findings: REVIEW is now ~24s avg, so **8c collapses** and **8b's realistic save is ~5-7 min/story (~30-40% of build lane)**, not ~700s; design (~38%) is now the largest phase block. **P8b reframed as turn-fixed-cost amortization** (P5 already spent the boot-elimination argument).
- 2026-06-10: **P8b build-ready substrate design written** (the A1-A5 subsection). The derive-from-disk review state model collapses the feared gaps (no review-queue machine, no corpus fork); **effort revised L -> M**. A4 (refactor re-verify) flagged as a standalone correctness fix. **P0.1 (run-config.json model+option snapshot) added as a PROPOSED enabler** , prerequisite for a defensible P8b A/B (config must travel with timing). No code landed this date; doc-only.
- 2026-06-10: **A4 + P0.1 LANDED + merged to main (#149)** , refactor re-verify (honest verify before stamping refactored_at; failed verify -> driver-refactor escalation) + the run-config snapshot (.sftdd/run-config.json; `lakebase-sftdd-timing` prints a `config:` header / nests `{config, timing}`).
- 2026-06-11: **Live A/B (ac vs hybrid-a) , turn count halved, wall-clock NOT improved.** `ac` baseline (`bug-tracker-ab-ac`, 11 tests): 11 RED + 11 GREEN = 22 build turns, **2.0 turns/test**; build lane RED 572s + GREEN 643s. `hybrid-a` (`bug-tracker-fixrun`, 13 tests, batchCap=3, batching confirmed , `chunk: E2E-1`, `test_ids:[T1,T2,T3]`): 6 RED + 6 GREEN = 12 build turns, **0.92 turns/test** (~2.2x fewer). BUT GREEN avg ballooned 58s -> **183s (max 799s)** , each batched GREEN implements ~3 ACs at once , so total wall-clock did NOT drop (ac 3017s vs hybrid-a 3731s, also +2 tests). **Conclusion: the turn-count win is real but the wall-clock payoff is not guaranteed; batchCap=3 over-batches the heavy E2E layer (one 799s GREEN). Next: a smaller or layer-aware cap (e.g. cap 2 for E2E), and a clean same-feature re-measure now that the run-config A/B (P0.1) makes it trustworthy.** Caveat: not a perfectly controlled A/B (13 vs 11 tests; ac on pre-CI-fix kit), but the per-test turn ratio is the clean signal.
- 2026-06-10: **P8b (hybrid-a) LANDED** (branch `perf/p8b-layer-batched-build`, gated behind `loopGranularity`, default `ac` at the time, later flipped to `story` as the shipped default). As built: A1 = `CycleArtifact.test_ids`/`chunk` + `coveredTestIds` (empty-array guard); readers (`storyTestProgress`, `acReviewStates`) + green propagation use it. A2 = `nextPendingBatch` + `beginNextPendingBatch` (first pending layer, capped). A3 = `loopGranularity` config + `LAKEBASE_TDD_LOOP=hybrid-a` env, `--loop`/`--batch-cap` on `lakebase-sftdd-cycle begin`, RED/GREEN prompt variants; review/refactor unchanged (per-AC, derived). A4 = already landed. A5 = batch failure escalates (default); `LAKEBASE_TDD_BATCH_FALLBACK` knob captured, per-ac re-red not yet built. greenOpenCycle is unified (batch + per-test); no separate greenOpenBatch. Hermetic suite green; live A/B still pending.
