# AC independence (shift-left) + blocking-smell revise-routing

> Tickets: **FEIP-7625** (Part A / Phase 1, shift-left, implemented) and **FEIP-7626** (Part B / Phase 2, revise-routing + Human-Proxy self-heal, design only), both under FEIP-7461.

## Problem

A blocking, contradictory, or **overlapping** acceptance criterion surfaces only mid-BUILD, as a `cycle-stall`, and then just halts.

Live evidence (2026-06-11 smoke `bug-tracker-20260611-024311`, kit `f988a5c`): the build raised to HIL at `S1/AC3`:

> T3 [AC3-land-on-bug-url] cannot go RED: the AC2 cycle already built the 303 redirect to `/bugs/{id}` + the bug_detail route, so T3 passes with zero new code. A faithful RED is impossible without deleting shipped code.

`AC2` ("submit files a bug") and `AC3` ("land on the bug URL") **overlap**: satisfying AC2's redirect inherently satisfies AC3, so AC3's test can never go RED. This is a **spec/test-list decomposition defect**, authored at design time, but it was only discovered after burning AC1+AC2 build cycles. The halt itself is correct (the blocking-smell -> raise-to-HIL wiring works); the cost is that it was found late and there is no path to clean it up and resume short of a human re-run.

## Principle: the PO owns the assertions

An approved AC's `then` is locked at Gate 1; no downstream role may weaken it. So a build-phase role must NEVER silently rewrite an AC to dissolve an overlap. Any cleanup routes THROUGH the PO gate to the artifact's owning author. Two consequences:

1. **Shift the detection left** to the design gates (catch overlap before any build cycle).
2. When a spec-level defect does escape to build, **raise to HIL, let the PO decide, then route the fix to the owning author and re-gate**, never auto-edit.

## Part A, shift-left: catch overlap at the design gate (this is the implemented piece)

The test-strategist already owns "one observable behavior per item." Extend that to **AC independence**: every AC must be independently RED-able, and no AC's `then` may be implied by, duplicate, or contradict another's.

1. **`ac-overlap` blocking smell.** A new `SmellName` + `SMELL_CATALOG` entry, added to `BLOCKING_SMELLS`. The test-strategist (and spec-author) flag it when ordering/structuring reveals that satisfying one AC inherently satisfies or contradicts another. Because it is blocking and flagged at the design phase (Gate 3), it reuses the existing `recordBlockingSmellFlag` -> `firstPendingEscalation` -> `raise-to-HIL` wiring and halts at DESIGN, before any build cycle is wasted.
2. **Prompt contract.** `test-strategist.md` + `spec-author.md` require each AC to be independently testable; on overlap/contradiction, surface to the PO (`ac-overlap`) rather than ordering both as separate cycles. The spec-author prompt makes prevention *operational*, not just declarative: an **independence test** run on every AC pair in a story (you must be able to make AC_n RED while AC_m is GREEN and vice versa, else merge), and an explicit **delineate-by-outcome-not-mechanism** rule (a single action that persists + navigates is one outcome unless each is independently observable and breakable, do not split "the redirect" into its own AC). This targets the authoring failure mode behind the smoke (AC2/AC3 split along an implementation seam).
3. **Deterministic backstop.** A `checkAcIndependence(acs)` helper flags the literal case, two ACs in a story whose normalized `then` clauses are identical, in the spec-author response-formatter self-check (exit non-zero before handoff). It catches only exact duplication (semantic implication is the LLM's job via #2), but it is a true-positive-only guard that documents the contract.
4. **Story-level independence (the same principle, one level up).** The recurring live failure was not two ACs but two STORIES overlapping: stories build in order on one growing codebase, so a later story whose behavior an earlier story's build already produced ("file a bug" already builds the detail page that "view a bug" is about) has no honest RED and stalls. The spec-author breakdown applies a **story-independence test** (could you build story A fully and have B still genuinely unbuilt? if building A inherently delivers B, fold B into A or re-scope B to a distinct slice) at enumeration time. Prevention upstream of the build; revise-routing (Part B) is the recovery when one still escapes.

## Part B, revise-routing (Phase 2, headless self-heal IMPLEMENTED)

When a spec-level blocking smell escapes to build (or is raised at the gate), the loop currently halts and waits for a human re-run. The target flow:

```
blocking smell (ac-overlap / test-list-drift / spec-flavored cycle-stall)
  -> raise to HIL  [exists]
  -> PO decides: accept-as-is (e.g. "T3 is satisfied by AC2, mark done")
              OR revise
  -> on revise, route to the OWNING author + re-gate:
       AC contradiction/overlap -> spec-author (spec decomposition) -> Gate 1
       pure test-list order/dup  -> test-strategist                 -> Gate 3
  -> build resumes on the cleaned story (per-story pipeline)
```

### The test-strategist verdict circles back to the spec-author

The test-strategist is the role that *detects* `ac-overlap` (it is the first role to walk every AC and reason about whether each is independently RED-able). But it is NOT the role that can *fix* an AC overlap: rewriting an AC's `then` is a spec-decomposition change the **spec-author** owns, gated by the PO at Gate 1. So the verdict and the fix live in different roles, and the workflow must carry the verdict from one to the other:

```
test-strategist (Gate 3): flags ac-overlap with detail = "AC_n's `then` is implied by AC_m; <how>"
  -> raise to HIL (the verdict, verbatim, is the escalation `reason`)
  -> PO decides accept | revise
  -> on revise -> route to spec-author, NOT back to the test-strategist:
       the spec-author reads the test-strategist's verdict (the escalation detail) as its
       brief, merges/differentiates the overlapping ACs, re-runs its self-check, re-gates at Gate 1
  -> architect re-annotates the changed AC(s) (Gate 2) -> test-strategist re-orders (Gate 3)
  -> build resumes
```

The escalation `detail` the test-strategist writes (`--slot detail="<which ACs + how they overlap>"`) is therefore not just a log line: it is the **handoff payload** the spec-author consumes when the PO chooses `revise`. The router reads the smell's owning author from the taxonomy (below) and re-enters the design lane at that author's step, carrying the verdict forward. A test-strategist that merely flags-and-halts without a precise, actionable `detail` makes the circle-back impossible, so the prompt contract requires it to name the offending AC ids and the implication.

### Self-healing when the PO is a Human Proxy (headless)

In `LAKEBASE_TDD_HUMAN_PROXY=1` there is no live human to make the `accept | revise` call, yet the workflow must still recover rather than halt forever. The revise-routing must therefore be **self-healing under the Human Proxy**: when a spec-level escalation is raised headless, the Human Proxy makes the `accept | revise` decision in the human's place and drives the circle-back autonomously, exactly as Gate 1/2/3 are already approved headless today.

- **Bounded autonomy.** The Human Proxy may `revise` a spec-level overlap **once per story** (re-route to the spec-author -> re-gate -> resume). A second escape of the *same* `ac-overlap` on the same story after a revise is a hard halt (the proxy could not heal it; a real human must look). This bound prevents an infinite revise<->stall loop when the spec-author cannot actually separate the ACs.
- **Recorded decision.** The proxy records its choice as the PO's, the same `gate.modified|gate.approved` events the real PO would emit, with the routed-to role and the verdict it acted on, so the headless run is auditable as a self-heal (not an invisible auto-edit). The PO still owns the assertions on paper; the proxy is acting *as* the PO under an explicit headless contract.
- **Re-gate, don't shortcut.** Even headless, the revised AC goes back through Gate 1 (spec) -> Gate 2 (architect) -> Gate 3 (test-list); the proxy validates each as it does for a first pass. Self-healing is "the proxy makes the human's decision and the normal gates run," never "skip the gates because there's no human."

This is the headless analog of the live `accept | revise` surface: live, a human picks; headless, the proxy picks within the per-story revise bound and the same gates re-run.

Required:
- **Smell taxonomy split.** Tag each blocking smell `spec-level` (route to an author after the PO decides) vs `build-level` (`cycle-stall` from genuine thrashing, `fragility-ratio` -> driver/navigator retry). The router needs this to pick the owning author; today everything halts identically. The taxonomy also names, per spec-level smell, the **owning author** to route to (`ac-overlap`/AC contradiction -> spec-author; pure test-list order/dup -> test-strategist).
- **A `revise` transition** in the orchestrator drive state-machine: on the PO's (or proxy's) revise decision, re-enter the per-story design lane at the owning step, re-gate, and resume the build lane on that story. Pairs with the per-story pipeline + the experiment `revise` verb (FEIP-7566).
- The PO/Human-Proxy gate surface gains an `accept | revise` choice on a spec-level escalation (with the role to route to). Headless, the Human Proxy resolves it within the per-story revise bound above.

## Acceptance

- A feature whose ACs overlap (AC_n's `then` implied by AC_m) is caught at the design gate as `ac-overlap` and halts there, not after build cycles.
- The deterministic backstop flags exact-duplicate AC `then` clauses in the spec-author self-check.
- (Part B) On a spec-level escalation, the PO can choose `revise`; the orchestrator routes the **test-strategist's verdict to the spec-author** (the smell's owning author), re-runs it + re-gates (1->2->3) + resumes build, with no human re-run and no AC weakened without PO approval.
- (Part B) Headless (`LAKEBASE_TDD_HUMAN_PROXY=1`), the same circle-back is **self-healing**: the Human Proxy makes the `accept | revise` decision as the PO, routes to the spec-author, and re-gates, all without a live human, bounded to one revise per story per smell before a hard halt.

## Implementation notes (Phase 2, landed)

How Part B maps onto the deterministic driver (the resume reuses the standing lanes, no parallel re-gate machinery):

- **Taxonomy** lives on `SMELL_CATALOG` (`smells.ts`): each entry gains `level` (`spec`/`build`), `owning_role`, and `gate_to_rerun`. `specLevelSmell(name)` is the routing lookup. `ac-overlap` -> spec-author/spec; `test-list-drift` -> test-strategist/test_list; everything else is build-level (hard-halt).
- **Story scope + budget** on `smells.json`: a `SmellHit` carries `story_id`; `markSmellResolved(...,{kind:"revised"})` + `priorReviseCount` enforce the one-revise-per-(smell,story) bound.
- **Routability** is computed in the disk probe (`orchestrator-probe.ts` `pendingEscalation`): a `smell:<name>` escalation that is spec-level, has a story (its own, else the active build story), and has revise budget left gets `escalation.routable = { story, owning_role, gate }`. Everything else leaves it unset.
- **The pure transition** (`orchestrator-drive.ts` `nextTransition`): `escalation.routable` -> `revise-route` (lane `design`); else the byte-identical `raise-to-hil`. Gated behind `routable` so every existing escalation path is unchanged.
- **The effect** (`orchestrator-effects.ts`): `revise-route` emits ONE `lakebase-sftdd-human-proxy decide-escalation` command (atomic, no inter-command readState window).
- **The self-heal** (`human-proxy.ts` `decideEscalationAsHumanProxy`): records the PO's `revise` decision as a `gate.modified` event (auditable), `reviseStory` (discard experiment + reopen gate + free lane -> `designing`), and resolves the smell as `revised` (spends the budget). The standing design lane then re-runs Gate 1->2->3 at the owning author and the build resumes.

## Phasing

- **Phase 1 (landed):** Part A, `ac-overlap` blocking smell + prompt contract + deterministic backstop. Prevents the stall.
- **Phase 2 (landed):** Part B, smell taxonomy (`spec-level`/`build-level`) + the `revise-route` transition + the test-strategist/spec-author circle-back + the Human-Proxy self-heal (bounded one revise per smell per story). Recovers from it headless.
- **Phase 2 follow-up (not yet built):** interactive (`--gates interactive`) parity, surface the live `accept | revise` choice to a human (stop before `revise-route`), the live-human analog of the headless self-heal.
