# Agent-loop optimization plan

Status: **in review** (living doc , updated as we decide). Owner: TDD substrate.

Goal: cut wall-clock to run a feature through the deterministic driver (design ->
build -> deploy) without losing correctness, by attacking where the time actually
goes. The orchestrator routing is already free; all time is in agent turns.

## Measured baseline (live FEIP-7422 capture, run `bug-tracker-capture-20260609-221144`, S1 only)

Source: `.tdd/agent-log.jsonl` timestamps. S1 = 6 ACs, kit `eab213f`, build roles
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

## Options

Each: change / effort (S/M/L) / est. save / risk / **status**.

### P1 , kill the test-strategist 200s outlier
- **Change:** A/B test-strategist on `sonnet` (often converges faster than haiku thrashing on structured output) and/or tighten its prompt to pass the AC ids inline (it already has them) so it does not re-derive; cap output.
- **Effort:** S. **Save:** ~150s/feature. **Risk:** low.
- **Status:** _proposed_.

### P2 , pre-digest the REVIEW rubric (stop re-reading 3 files per AC)
- **Change:** orchestrator computes a compact, AC-scoped rubric once (design tokens + NFR ids + layer for THIS AC) and passes it inline; navigator stops re-reading `architecture.md`/`nfrs.md`/`design-guide.md` every review.
- **Effort:** M. **Save:** ~20-40s x 6 reviews. **Risk:** low (same data, pre-extracted).
- **Status:** _proposed_.

### P3 , batch or conditionally skip REVIEW
- **Change:** most reviews return `refactor:false`. Either one review turn covering all just-greened ACs of a story (1 turn vs N), or a deterministic skip for trivial display-only ACs.
- **Effort:** M. **Save:** up to ~5x80s/story. **Risk:** medium (must not skip a real smell).
- **Status:** _proposed_.

### P4 , parallelize the per-AC build (biggest wall-clock, hardest)
- **Change:** today AC1->AC2->... is strictly sequential. The `ExpectationLedger.processCallback` now supports out-of-order/concurrent completion, so RED+GREEN for independent ACs can run bounded-concurrent (e.g. 3-wide), then review. 6 sequential -> ~2 waves ~= 2-3x on the build lane.
- **Catch:** concurrent ACs editing the same file (`app/main.py`) conflict , needs per-AC isolation (separate worktrees, or only parallelize ACs touching disjoint modules).
- **Effort:** L. **Save:** ~700-1,000s/story. **Risk:** medium-high (file contention).
- **Status:** _proposed_.

### P5 , warm the build session (or shrink its per-turn re-read)
- **Change:** stop cold-spawning navigator/driver every cycle: keep a per-story warm `--resume` session with a small per-cycle delta, OR keep fresh but pass a digest so each cold turn re-reads less. Fresh-per-cycle exists to avoid "Prompt too long" on long stories, so this needs a measured cap.
- **Effort:** M. **Save:** cold-boot + re-read x ~18 turns. **Risk:** medium (context growth).
- **Status:** _proposed_.

### P6 , model / fast-mode tiering
- **Change:** REVIEW is judgment, not code authoring , try it on a faster tier than the sonnet code-writers; consider fast-mode for the deterministic-ish turns.
- **Effort:** S (config). **Save:** per-review. **Risk:** low, needs a quality check.
- **Status:** _proposed_.

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

- **Suggested shape:** gate behind a **loop-granularity mode** (`ac` | `story` | `hybrid-a` | `hybrid-b`, default `ac`), so a fast capture/CI run picks the batched variant while a rigorous run keeps strict per-AC. Pick the variant per `tdd_mode` or per project.
- **Effort:** L (8a/8b), M (8c , it is mostly batching the review). **Save:** ~1,000s/story (8a), ~700s (8b), ~375s (8c). **Risk:** as per the table; LOW for all if gated behind the mode.
- **Status:** _proposed (user-requested); 3 variants on record, awaiting pick._

### P7 , cut inter-phase shell overhead
- **Change:** the ~44s plan->design gap is git commits + claim + `verify-workflow-state` + `lk` resolution. Batch the commits, drop redundant verifies, reuse a warm `lk`.
- **Effort:** S. **Save:** ~40s/feature. **Risk:** low.
- **Status:** _proposed_.

### P0 (enabler) , per-turn timing report
- **Change:** small tool that reads the agent-log timestamps and prints per-turn durations (it already has the data), so every change above is A/B-measurable instead of guessed.
- **Effort:** S. **Save:** none directly; de-risks all others. **Risk:** none.
- **Status:** _proposed_.

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
| **P8a** full story-level loop | no (batched) | ~4 | discipline + big-turn quality |
| **P8b** hybrid A (batch build, per-AC review) | partial | ~8 | middle ground |
| **P8c** hybrid B (per-AC build, batch review) | yes | ~13 | keeps TDD, only batches review |

All P8 variants batch by `layer` (capped) , see P8 for the unit + runner-contract rationale.

## Decision log

- 2026-06-09: baseline measured; options P0-P7 drafted; awaiting selection.
- 2026-06-09: added **P8 (story-level TDD loop)** at user request , reframed the build lane as a P8-vs-P4 fork (story-level batching vs per-AC parallelism); P8 subsumes P3.
