# Information architecture

How the product is organized and how the user moves through it. IA is decided before styling: you cannot lay out a screen well until you know what it is for and how the user got there. This is the canon behind the project `ia.md` artifact (Screens / Navigation / User flows).

## The three things IA defines

1. **Screens (the sitemap).** Every screen the product has, and what each is *for*, in one line. A screen with no clear job is a smell; two screens with the same job should merge.
2. **Navigation (the model).** How screens connect: the entry points, the primary nav (navbar / tabs / routing), and how a user gets back. The user should always be able to answer "where am I, and how do I get out of here?".
3. **User flows.** The primary paths a user takes to accomplish a goal, as ordered steps across screens ("file a bug": list -> new -> fill -> submit -> confirmation -> back to list). Each flow maps to one or more stories and seeds an E2E scenario.

## Principles

- **Match the user's mental model, not the database schema.** Organize around tasks and concepts the user has ("my bugs", "report a problem"), not around tables. Heuristic 2 applied to structure.
- **Shallow over deep.** Fewer levels to the thing the user wants. If a common task is five clicks deep, the IA is wrong.
- **One primary path per goal.** There can be shortcuts, but each goal has an obvious main route. Multiple equally-weighted routes to the same place create doubt.
- **Findability.** A user can locate a feature by browsing the nav OR by an obvious entry point. If a feature is only reachable by a URL you have to know, it is not in the IA.
- **Consistent location.** The same kind of thing lives in the same place across screens (nav, primary action, breadcrumb). Consistency (heuristic 4) at the structural level.
- **Progressive disclosure at the IA level.** Secondary destinations live behind a clear secondary nav, not crammed into the primary one.

## Flows seed tests

The user flows in `ia.md` are not decoration: the Test Strategist turns each primary flow into an E2E (Playwright) scenario, and the Architect assigns the E2E layer against them. A flow with no test is an unverified claim about how the product is used. Write flows concretely enough that a test can follow them step by step.

## Enforcement

`ia.md` is a required artifact for UI projects (Screens / Navigation / User flows sections, conformance-checked). The flows are enforced by the E2E scenarios that trace them; a flow that no scenario exercises is surfaced in the UX adherence review.
