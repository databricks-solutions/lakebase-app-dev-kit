# Information architecture

How the product is organized and how the user moves through it. Decided before styling: you can't lay out a screen until you know what it's for and how the user got there. The canon behind the project `ia.md` artifact (Screens / Navigation / User flows).

## The three things IA defines

1. **Screens (the sitemap).** Every screen and what each is *for*, in one line. A screen with no clear job is a smell; two screens with the same job should merge.
2. **Navigation (the model).** How screens connect: entry points, primary nav (navbar / tabs / routing), and how a user gets back. The user should always be able to answer "where am I, and how do I get out?".
3. **User flows.** The primary paths to a goal, as ordered steps across screens ("file a bug": list -> new -> fill -> submit -> confirmation -> back to list). Each flow maps to one or more stories and seeds an E2E scenario.

## Principles

- **Match the user's mental model, not the schema.** Organize around tasks and concepts the user has ("my bugs", "report a problem"), not tables. Heuristic 2 applied to structure.
- **Shallow over deep.** Fewer levels to the thing the user wants. A common task five clicks deep means the IA is wrong.
- **One primary path per goal.** Shortcuts are fine, but each goal has an obvious main route. Multiple equally-weighted routes create doubt.
- **Findability.** A feature is reachable by browsing the nav OR an obvious entry point. Reachable only by a URL you must know means it's not in the IA.
- **Consistent location.** The same kind of thing lives in the same place across screens (nav, primary action, breadcrumb). Heuristic 4 at the structural level.
- **Progressive disclosure at the IA level.** Secondary destinations live behind a clear secondary nav, not crammed into the primary one.

## Flows seed tests

The user flows in `ia.md` aren't decoration: the Test Strategist turns each primary flow into an E2E (Playwright) scenario, and the Architect assigns the E2E layer against them. A flow with no test is an unverified claim about how the product is used. Write flows concretely enough that a test can follow them step by step.

## Enforcement

`ia.md` is a required artifact for UI projects (Screens / Navigation / User flows sections, conformance-checked). The flows are enforced by the E2E scenarios that trace them; a flow no scenario exercises is surfaced in the UX adherence review.
