# Testable UI

A UI is testable when its output is deterministic and addressable. If a test can't reliably render it and find the element it cares about, the UI isn't done, however it looks. Testability is a UX property: it's what lets the behavior, design-adherence, and accessibility checks defend the experience over time.

The requirement is **modern and testable**, not a particular library. Pick whichever shape fits; both must render deterministically, escape by default, and expose stable seams.

- **A modern server-side template engine** with inheritance, autoescaping, and partials. Jinja is one example; the language's equivalents (ERB, Handlebars, Razor) are equally fine.
- **A modern component framework** (React, Vue, Svelte) for SPAs. Same rules: deterministic render, stable hooks, tokens from the design system.
- **No bespoke string templating.** Hand-concatenating HTML fails escaping (an injection and correctness risk), testability, and consistency at once. Never acceptable, in any language.

## Stable seams (the addressability rule)

Every interactive element and every region a test or the design-adherence check targets exposes a **stable selector**:

- a `data-testid`, or
- a semantic role / ARIA label (which doubles as an accessibility win, see [accessibility](accessibility.md)).

Never anchor to a brittle CSS path (`div > div:nth-child(3) > span`) or to user-visible copy that will change. The seam is a contract between the UI and its tests; it survives restyling.

## Deterministic rendering

Same inputs, same output. Non-determinism (unseeded ordering, embedded timestamps, random ids in markup) makes both behavior tests and design-adherence flaky. Push the variable parts (clock, random) behind a seam a test can pin, the UI mock policy: the DB is real (paired branch), but the clock may be faked. See [test-strategy](../../lakebase-sftdd-workflows/references/test-strategy.md).

## Rendering lives in the boundary layer

Templates and view components are an adapter at the HTTP / boundary layer (see [layered-architecture](../../architectural-design-principles/references/layered-architecture.md)). The service returns domain data; the boundary renders it. No business logic in templates: a template that computes a total or decides a permission has pulled service logic into the view, both a layering violation and untestable.

## How the UI is verified

1. **Behavior (BDD) scenarios** drive the real UI through its flows (from `ia.md`) against the real paired-branch backend, addressing elements by stable seams, and assert the feedback rules.
2. **Design-adherence** compares rendered tokens to `design-guide.json` (see [design-systems-and-tokens](design-systems-and-tokens.md)).
3. **Accessibility checks** (axe / equivalent) run at the same E2E layer.

All three run at the E2E (Playwright) layer, so the experience is proven by the same runner that proves the flows work. A UI built without stable seams or with logic in its templates can't pass these, which is why testability is a design rule, not an afterthought.
