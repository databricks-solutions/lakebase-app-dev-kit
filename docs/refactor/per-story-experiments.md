# Per-story experiments (build isolation + throw-away) with PO acceptance

**Status**: Design proposal, 2026-06-07
**Primary FEIP**: FEIP-7566 (per-story experiments: build isolation + PO accept/discard/revise)
**Umbrella FEIP**: FEIP-7461 (workflows as executable state machines)
**Builds on**: FEIP-7565 (per-story pipelined design->build), FEIP-7510 (per-role agent runtime)
**Cross-ref**: FEIP-7058 (Lakebase SCM workflows epic), the paired-branch + tier substrate.

---

## Why this exists

The per-story pipeline (FEIP-7565) lets the design lane run ahead and a single build lane drain a gated queue one story at a time, but every story is built on the one paired feature branch. A story the Product Owner does not like after seeing it built cannot be thrown away cleanly: its code and (worse) its schema migrations are already on the feature branch.

The PO wants to review each story as **working software** and then keep it or throw it away with no residue. That needs **build isolation per story**: build each story on its own branch, deploy it for the PO to use, then either merge it into the feature or discard it whole.

## Terminology, releveled (the load-bearing change)

The lexicon already had **spike** and **experiment**, both scoped to a feature. Adding per-story build isolation collided with both, so we relevel:

| Term | Before | Now |
| --- | --- | --- |
| **Feature** | Capability on one feature branch, decomposes into stories. | Unchanged. The durable integration unit + the SCM unit (claim / PR / merge-to-trunk / tier-promote / sprint-deploy). |
| **Story** | A feature slice with ACs. | Unchanged. The per-story pipeline unit. |
| **Experiment** | A rigorous TDD branch at the **feature** level. N=1 -> the experiment IS the feature; N>=2 -> competing strategies for the feature, raced. | A rigorous, isolated TDD branch forked from feature HEAD, scoped to a **story**. Build isolation lives here. **N=1 (default): one experiment per story = the story's isolated build** ("the experiment IS the story's build"). **N>=2: competing strategies for that story**, raced. Feature-level whole-feature racing retires. |
| **Spike** | Throwaway pre-spec exploration, no rigor, learn-only, attached to a feature. | Same meaning (throwaway, no rigor, no test list, never merged, learning carries forward) but explicitly attachable to a feature **or** a story. |
| **promote** | Tier-promotion (SCM, feature up the ladder) AND N>=2 winner-as-is. | Unchanged (both senses kept; context disambiguates). NOT reused for accepting one experiment. |
| **synthesize** | N>=2: PO menu-picks capabilities across competing experiments; fresh branch. | Unchanged. Reserved for the N>=2 cross-experiment ceremony, now at story scope. |
| **merge** | SCM: feature branch -> trunk. | Adds a second boundary: an accepted story **experiment -> feature branch**. It (a) git-merges the experiment's code into the feature branch AND (b) runs the experiment's migration scripts against the **feature branch's Lakebase branch DB** so the feature's database is brought up to the merged story's schema. A real git merge plus a migrate step, hence the name; the boundary (experiment->feature vs feature->trunk) disambiguates. Reuses the existing migration runner (same pattern as `scm-merge --wait-migrate`). |

So: a story is built by one or more **experiments**; the PO **accepts** (-> **merge** into the feature), **discards** (throw away), or sends back to **revise**. N>=2 at the story level still uses **promote**/**synthesize** to choose among competing experiments before the winner merges.

## The model

The single build lane (FEIP-7565) keeps this clean. Builds are serialized, so each story's experiment forks from the **current feature-branch HEAD**, which already contains every previously-merged story. No inter-story chaining: a merged story advances feature HEAD for the next experiment; a discarded or revised story leaves feature HEAD untouched.

Per story, inside the build lane (N=1 shown; N>=2 cuts >1 experiment + a promote/synthesize step before the merge):

```
ready (spec-gate approved)
  -> dispatch
       cut experiment: ephemeral PAIRED Lakebase branch forked off feature-branch HEAD (short TTL)
       Navigator + Driver run TDD cycles on the experiment
       deploy the story FROM the experiment (working software up)
  -> awaiting-acceptance        (PO uses the running story)
       PO acceptance gate (headless: Human Proxy):
         accept  -> MERGE the experiment into the feature branch: git-merge the code AND run the experiment's
                    migration scripts against the feature branch's Lakebase branch DB; tear down; story = done
         discard -> tear down the experiment (code + schema vanish); withdraw the spec gate; story = discarded (out of sprint)
         revise  -> tear down the experiment; story = designing (re-spec, re-cut a fresh experiment later)
   (every outcome frees the single lane, so the next ready story dispatches)
```

The feature branch stays the **single durable unit** the SCM machine claims / PRs / merges-to-trunk / tier-promotes / sprint-deploys. Experiments are ephemeral children; nothing in the per-feature SCM surface multiplies.

## What it touches (substrate)

- **Story state machine.** New per-story statuses `awaiting-acceptance` (built + deployed, PO reviewing) and `discarded` (terminal reject); `done` now means accepted-and-merged; `revise` routes back to `designing`. (pipeline.json, isolated, as in FEIP-7565 phase 2b.)
- **Per-story acceptance record.** Distinct from the spec gate (approve/withdraw): a three-way decision `accepted | discarded | revise` with approver + reason + history.
- **Per-story experiment ref.** `{ slug, branch, lakebase_branch_uid, parent (feature branch), parent_sha, n (1 or >=2), status: active|merged|discarded, cut_at, closed_at }` on each story. Reuses the existing experiment substrate (cutExperiment / listExperiments / deleteExperiment, outcomes.json, cycles) re-scoped from feature to story.
- **Experiment lifecycle for a story.** cut (fork a paired Lakebase branch off feature HEAD, short TTL), merge (git-merge the experiment's code into the feature branch AND run the experiment's migration scripts against the feature branch's Lakebase branch DB, then tear down the experiment branch), discard (tear down git + Lakebase branch, no trace). Composes the existing paired-branch + git-merge substrate and the migration runner (same pattern as `scm-merge --wait-migrate`).
- **Per-story deploy.** Deploy a story from its experiment branch (point the app at the experiment's Lakebase DSN), distinct from the per-feature/per-sprint deploy gate which stays the sprint working-software check. The release-engineer owns it.
- **scm-doctor / recover-orphans.** Surface stale **spikes** and stale **experiments** as distinct kinds (plus stale feature branches), each labeled, so a crashed build that left a paired Lakebase branch behind is named for what it is and reclaimed. (Per the PO request: stale spikes and experiments surface as such through scm-doctor.)

## Releveling ripple (existing feature-level experiment substrate)

The current substrate keys experiments at the feature level: `.tdd/experiments/<feature>/<slug>/`, `plan.json` mode N=1/N>=2, `cutExperiment`, the comparison report, feature-status `experiments[]`. Releveling to the story level means these become story-scoped (`.tdd/experiments/<feature>/<story>/<slug>/` or similar). The proposed stance is **reuse + re-scope** (keep the experiment primitives, change their key from feature to story) rather than rip-and-replace, so the heavily-tested cycle/outcomes/comparison code is preserved. Exact migration is phase 1's first task.

## Phased plan (each phase: a commit, full suite green)

0. **Design + FEIP.** This doc (repo + ~/docs/specs); file the FEIP under FEIP-7461, cross-ref FEIP-7058. (Ticket filing gated on explicit go.)
1. **Acceptance + experiment-ref substrate (pipeline.json).** StoryStatus adds `awaiting-acceptance` + `discarded`; `StoryAcceptance` (accepted/discarded/revise + history); per-story `experiment` ref; functions `cutStoryExperiment` / `awaitAcceptance` / `acceptStory` (merge + done) / `discardStory` (withdraw spec gate + discarded) / `reviseStory` (-> designing); each frees the lane. Schema + unit tests. Isolated in pipeline.json. NOTE: the existing feature-level `experiment.ts` on-disk layout (`.tdd/experiments/<feature>/<slug>/`, cutExperiment, comparison report) is NOT re-scoped here, it is only needed for N>=2 story-level racing (a later concern); `run-cycle.ts` is already story-scoped (`cycles/<feature>/<story>/<ac>/`). The N=1 build-isolation + throw-away path needs only this pipeline-state substrate + the experiment-branch lifecycle CLI (phase 2).
2. **Experiment branch lifecycle CLI.** `lakebase-tdd-experiment cut|merge|discard` composing the paired-branch fork + git merge + teardown; short TTL; scm-doctor / recover-orphans label stale spikes vs experiments. Tests.
3. **Per-story deploy from an experiment.** Extend the deploy substrate to target an experiment's branch/DSN; release-engineer wiring. Tests.
4. **Orchestration docs.** scrum-master.md build lane (dispatch -> cut experiment -> TDD -> deploy -> PO acceptance gate -> merge/discard/revise -> free lane); build.md; lexicon update in README.md + SKILL.md (experiment is story-level; merge is the accept verb); Human Proxy supplies accept/discard/revise headless.
5. **Hermetic e2e + advisory smoke assert + dist.** Extend tdd-per-story-pipeline-e2e: a 3-story feature where one story is accepted (merged), one discarded, one revised-then-accepted; assert feature HEAD reflects only merged stories and discarded experiments leave no trace. Advisory smoke assert (stale-experiment label) + dist rebuild.
6. **Live re-validate.** Drive the FEIP-7422 smoke with a feature whose PO discards a story; confirm the discard leaves the feature branch + its Lakebase branch clean.

## Decisions locked (2026-06-07)
- Build isolation per story via a per-story **experiment** branch (the experiment concept moves to the story level; feature-level whole-feature racing retires).
- Reject path: PO chooses **discard or revise** per rejection.
- Isolation: **paired Lakebase branch** per experiment (code + schema), ephemeral, short TTL.
- PO review: **deploy the story from its experiment** (working software), then accept/reject.
- Accept verb: **merge** the experiment into the feature branch = git-merge the code AND run the experiment's migration scripts against the feature branch's Lakebase branch DB (a real git merge + migrate; distinct boundary from feature->trunk; reuses the existing migration runner).
- Single build lane retained: it keeps experiments chain-free (fork from feature HEAD).
- Stale **spikes** and **experiments** surface as distinct kinds through `scm-doctor`.

## Open questions (resolve in phase 1)
- Migration of existing feature-level experiment records: reuse + re-scope (proposed) vs a one-time rewrite of the on-disk layout.
- TTL for an experiment branch (build + review window); auto-reclaim policy if the PO never decides (scm-doctor surfaces; reclaim default = feature-branch TTL unless shortened).
- Does `revise` keep the prior spec as a starting point, or reset the story's spec?
- Merge conflict policy when a merged story's migrations overlap a later story's (serial build makes this rare but not impossible).
