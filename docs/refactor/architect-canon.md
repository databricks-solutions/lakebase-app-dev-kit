# Architect canon: decide once, conform deterministically, live turn only on novelty

Status: design only; not built. Parent: FEIP-7461 (umbrella: SCM + TDD workflows
as executable state machines). Sibling of the design-guide + architecture-
conventions work; builds directly on the revise-routing self-heal (FEIP-7626).

## Problem

In the SFTDD design lane the architect-reviewer fires a **live agent turn per
story, on every feature**. `nextDesignAction` dispatches it whenever a story has
ACs but is not yet annotated (`orchestrator-drive.ts`: the
`!design.architectAnnotated` branch), and its task
(`roleTaskBody` architect-reviewer branch in `orchestrator-effects.ts`) asks for
two very different kinds of output:

1. **The project layout** , the role -> module paths in `architecture.json`
   (boundary/service/repository, rendering framework).
2. **The service-backed call + `persistence_invariants[]` + per-AC
   `architectural_notes`** , which layer each AC lives in and how it realizes the
   design.

These have opposite reuse profiles:

| Output | Reuse profile | Already abstracted across features? |
|---|---|---|
| Layout (role -> module) | Project-wide, stable | **Yes** , `conventions.json`, established once, hard-conformed deterministically |
| service_backed / invariants / per-AC notes | Mostly restates the same standing *rules*; only the AC *mapping* is genuinely per-feature | **No** , re-derived by a live turn every story |

The layout half is the proof the pattern works. The first service-backed feature's
`architecture.json` is deterministically projected into
`.sftdd/architecture/conventions.json` (`establishConventionsIfAbsent`, called from
the deterministic `reconcileArtifactLog`), later features inherit it
(`readConventions`), the prompt tells the architect to reuse it
(`architectConventionsDirective`), and the spec gate hard-blocks a divergence
(`architectureConventionsReason` -> `assertArchitectureConforms`). No agent turn is
needed to *enforce* it. The UX Designer is even further along: it runs **once per
project** (`uxDesignerPending` = `uiTrack && breakdownDone && !designGuideReady`),
authors the design system once, and every later feature conforms to the schema
deterministically (`designGuideConformance`).

The remaining live cost , the per-story architect turn for AC annotation + NFR /
invariant declaration , is what this design removes for the common case.

## Goal

Lift the architect's **cross-cutting, standing decisions** (NFR posture, layer-
placement rules, invariant patterns) to a project-level **canon**, established
once, mirroring `conventions.json`. Then the per-story architect turn collapses to
a **deterministic projection** in the common case, and a **live turn fires only
when a story introduces something the canon has not seen** , recovered through the
existing revise-routing self-heal rather than an up-front blanket turn.

## The model

### `architecture/canon.json` (new, project-level)

A second project canon, sibling to `conventions.json`, holding the standing rules
that today get re-stated in every architect turn:

```jsonc
{
  "established_by": "F1-stock-visibility",
  "established_at": "2026-07-08T...",
  "nfr_posture": [
    { "id": "pagination", "rule": "every list/collection endpoint paginates", "applies_to": "boundary" },
    { "id": "writes-through-service", "rule": "all mutations pass through the service layer", "applies_to": "service" }
  ],
  "layer_placement": [
    { "ac_shape": "read/list", "layer": "boundary" },
    { "ac_shape": "mutation", "layer": "service" },
    { "ac_shape": "persistence", "layer": "repository" }
  ],
  "invariant_patterns": [
    { "trigger": "unique/composite key", "invariant_type": "unique" },
    { "trigger": "parent/child relation", "invariant_type": "foreign_key" }
  ]
}
```

Everything here is a **standing rule**, not a per-feature fact. Same envelope as
`ArchitectureConventions` (`established_by`, `established_at`, established once from
the first service-backed feature). Feature-specific instances (this composite key
on this table) still live in the feature's own `architecture.json`; the canon holds
the *pattern* those instances match.

### New pure module `architecture-canon.ts` (twin of `architecture-conventions.ts`)

| Concern | Conventions (exists) | Canon (new) |
|---|---|---|
| Path | `architectureConventionsJson` (`sftdd-paths`) | `architectureCanonJson` |
| Establish (deterministic, on reconcile) | `establishConventionsIfAbsent` <- `reconcileArtifactLog` | `establishCanonIfAbsent` + `amendCanon` |
| Inherit probe | `readConventions` / `conventionsReady` | `readCanon` / `canonReady` |
| Prompt directive | `architectConventionsDirective` | fold canon rules into it (novelty turn only) |
| Hard gate | `assertArchitectureConforms` | `assertCanonCoverage` (NFR + invariant coverage) |
| Project per-AC notes | (n/a) | `projectArchitecturalNotes(canon, ac)` |
| Novelty decision | (n/a, always dispatch) | `architectNovelty(story, canon)` |

All deterministic, all hermetically testable, exactly like the conventions module.

### The per-story turn becomes conditional

A deterministic novelty check runs before the architect is dispatched. For each AC
in the story:

- **maps cleanly** onto a `layer_placement` rule, its persistence needs match a
  known `invariant_pattern`, and it introduces no new cross-cutting concern
  -> `projectArchitecturalNotes` writes the AC's `architectural_notes` from the
     canon template, deterministically.
- **does not map cleanly** -> the AC is flagged novel.

`nextDesignAction`:

- **all ACs project cleanly** -> a pure function writes every AC's notes, sets
  `design.architectAnnotated = true`, no agent turn. The design lane advances.
- **any AC is novel** -> optimistically project a best-guess note **and** raise a
  canon-gap smell (see below). The story keeps moving; the architect is pulled in
  reactively, not up front.

### Scope decision: optimistic projection + reactive route-to-architect

When the novelty check is unsure, we **fail toward projection** (the cheap path)
rather than a blanket up-front architect turn, on the strict condition that a
**fallback recognizes the mistake and routes to the architect to clean the AC**.
This reuses the existing revise-routing self-heal (FEIP-7626) rather than new
machinery.

Flow:

1. **Project optimistically** , deterministic `architectural_notes` for every AC,
   including a best guess for a novel one. No architect turn.
2. **Recognize the smell** , two recognizers, both already exist or are cheap:
   - design-time: `assertCanonCoverage` flags an AC whose shape/persistence the
     canon does not cover as a **canon-gap smell** (early catch);
   - build-time backstop: the layering-clean gate + born-green fitness already
     block when code built against a mis-placed AC violates the layering, so a bad
     projection cannot ship silently even if the design-time check misses it.
3. **Route to the architect to clean the AC** , the canon-gap smell is registered
   in `SMELL_CATALOG` as **spec-level**, `owning_role = architect-reviewer`,
   `gate_to_rerun = architecture` (the design-lane architect step). `specLevelSmell`
   already drives the PO/Human-Proxy accept|revise decision; on revise the router
   re-enters the design lane at the architect step for that story. The architect
   re-annotates the novel AC **and** its output amends `canon.json` (via
   `amendCanon` on reconcile), so the next feature inherits the new rule. Bounded to
   one revise per (smell, story) by the existing budget on `smells.json`; a second
   escape hard-halts to a human.

Net: the architect goes from "every feature, every story" to "**first feature
establishes the canon, then only when a story does something the canon has not
seen, recovered through self-heal.**" This is where UX already sits, with the added
safety of the reactive route.

### What we deliberately do NOT abstract

- **Feature-specific invariant instances** stay in the feature's `architecture.json`.
  The canon holds the *pattern* ("composite keys get a `unique` invariant + a real-
  branch test"); the novelty check catches an instance whose *pattern* is new.
- **The recognizers must have teeth.** Because we project optimistically, the
  design-time canon-coverage check and the build-time layering/fitness gates are the
  guarantee. If neither can assert a dimension, do not project it , flag it novel.

## Where it plugs in (files)

- `scripts/sftdd/architecture-canon.ts` , new pure module (twin of
  `architecture-conventions.ts`).
- `scripts/sftdd/sftdd-paths.ts` , `architectureCanonJson(tddDir)`.
- `scripts/sftdd/log-reconcile.ts` , call `establishCanonIfAbsent` / `amendCanon`
  next to `establishConventionsIfAbsent` (deterministic, code-emitted).
- `scripts/sftdd/orchestrator-drive.ts` , `nextDesignAction` gains the novelty
  check: project-or-dispatch instead of the unconditional architect dispatch.
- `scripts/sftdd/orchestrator-effects.ts` , scope the architect turn to novel ACs +
  canon amendment; fold canon rules into `architectConventionsDirective`.
- `scripts/sftdd/gate-conformance-guard.ts` , `assertCanonCoverage` wired into the
  design gate.
- `scripts/sftdd/smell-catalog` , register the `architect-canon-gap` spec-level
  smell (owning_role = architect-reviewer, gate_to_rerun = architecture).

## Phasing (each ends green: `npm run typecheck` + `npx vitest run`)

1. `architecture-canon.ts` pure module + `architectureCanonJson` path + unit tests
   (derive / read / establish / amend / project / novelty).
2. Wire `establishCanonIfAbsent` into `reconcileArtifactLog` (deterministic, beside
   conventions). Establish-once + inherit hermetic tests.
3. `nextDesignAction`: novelty check -> project-or-dispatch; scope the architect
   turn to novel ACs + canon amendment. Pure transition tests.
4. `assertCanonCoverage` gate + `architect-canon-gap` smell registration + revise-
   routing wiring (owning_role = architect-reviewer).
5. Hermetic e2e: F1 establishes the canon (one architect turn); F2 with clean
   stories takes zero architect turns; F3 with a novel AC projects optimistically,
   the smell routes to the architect, the AC is cleaned and the canon amended,
   build resumes; a second escape of the same smell hard-halts.

## Verification

- Full suite green per phase.
- Hermetic proof: clean-mapping stories take no architect turn; a novel AC raises
  the canon-gap smell, routes to the architect via revise-routing (bounded one
  revise), and amends the canon; the layering/fitness gates still block a mis-
  placed projected AC.
- Live (gated): a stockflow F1+F6 sprint capture shows F1 establishing
  `architecture/canon.json` and F6's clean stories taking zero architect turns;
  compare architect-turn count against the recorded baseline with
  `lakebase-sftdd-drive-log-report`.

## Notes

- Source-only kit change; no version bump / publish / push without explicit
  instruction. Lands on the current working branch (renamed for this FEIP).
- Mirrors the two precedents already in the tree: the design-guide (once per
  project) and architecture-conventions (established once, deterministic
  conformance). This closes the last per-feature live architect turn by the same
  method.
