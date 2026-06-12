---
name: ui-ux-design-principles
description: "Experience-level engineering canon, the UI/UX counterpart to software-design-principles (code-level) and architectural-design-principles (system-level). Usability heuristics, visual hierarchy, accessibility, interaction and feedback, information architecture, design systems and tokens, and testable UI. Imported by the lakebase-tdd-workflows UX Designer (authoring design-guide.{md,json} + ia.md and the adherence gate) and by the Driver building UI. Use when: shaping a design guide or information architecture, reviewing a user-facing surface, choosing a UI framework, or making the UI testable."
---

# ui-ux-design-principles

Canon for decisions about the USER's experience. The third of the design-principles trio:

- `software-design-principles` – how a unit of code is written (SOLID, DRY, clean code).
- `architectural-design-principles` – how the system is shaped (layers, twelve-factor, fitness functions).
- **`ui-ux-design-principles`** – how the product looks, behaves, and is navigated, kept testable.

The project's `design-guide.{md,json}` and `ia.md` are the per-project *instantiation* of this canon, the way `architecture.json` instantiates the layering rules. Markdown only, no scripts: consulted, not invoked. Like the architecture canon, it points each rule at how it's enforced (the E2E/Playwright layer, the design-adherence check against `design-guide.json`, a11y checks). A rule no test defends is advisory; one a check defends is part of the build.

## When to use

- The `lakebase-tdd-workflows` UX Designer imports it to author `design-guide.{md,json}` + `ia.md` and define the adherence gate.
- The Driver imports it when building UI that must adhere to the design guide.
- You're reviewing a user-facing change and need a shared vocabulary (heuristics, hierarchy, accessibility) rather than taste.
- You're choosing how the UI is built and need the testability rules (framework choice, stable seams).

## UX review checklist (mandatory before promote/merge)

Confirm each row before declaring the design done. A blank row is fine when scope justifies it; an unconsidered row is a smell.

| Property | The rule | Enforced by |
|---|---|---|
| Feedback | Every data-changing action shows success AND failure feedback; no silent failures | E2E asserts the visible confirmation |
| Accessibility | Keyboard-navigable, semantic HTML, sufficient contrast, labelled controls | a11y check (axe / equivalent) at the E2E layer |
| Visual hierarchy | The primary action is most prominent; the eye is guided | design-adherence (tokens) + review |
| Consistency | Reuses design-guide tokens + standard components; one pattern per job | design-adherence against `design-guide.json` |
| Information architecture | Screens, navigation, primary flows defined before styling | `ia.md` present + E2E flows trace it |
| Testable seams | Interactive elements expose stable selectors (`data-testid` / role) | E2E addresses elements by seam, not brittle CSS |
| Loading / latency | Any action over ~200ms shows a loading state; feedback causes no layout shift | E2E + design-adherence |

A property with no owner or no check: resolve it before merging.

## References

- [Usability heuristics](references/usability-heuristics.md) – Nielsen's ten, condensed, each with its violation smell.
- [Visual hierarchy](references/visual-hierarchy.md) – type scale, spacing, color, contrast, alignment: guiding the eye.
- [Accessibility](references/accessibility.md) – WCAG essentials, semantic HTML, ARIA, keyboard, focus, contrast. Not optional.
- [Interaction and feedback](references/interaction-and-feedback.md) – affordances, feedback rules, loading states, error prevention/recovery, progressive disclosure.
- [Information architecture](references/information-architecture.md) – screens, navigation, flows, mental models. The source of `ia.md`.
- [Design systems and tokens](references/design-systems-and-tokens.md) – tokens as source of truth, consistency, component reuse, the `design-guide.md` / `.json` relationship.
- [Testable UI](references/testable-ui.md) – testable frameworks, stable seams, deterministic rendering, boundary-layer rendering, design-adherence at the E2E layer.

## Hard rules

1. **No silent failures, no unacknowledged success.** Every data-changing action shows visible success and failure feedback; feedback never shifts layout.
2. **Accessibility is not optional.** Keyboard-navigable, screen-reader-friendly, sufficient contrast, labelled controls, defended by an a11y check.
3. **Consistency over novelty.** Reuse the design-guide tokens and standard components; one pattern per job. `design-guide.json` is the source of truth.
4. **Visual hierarchy guides the eye.** The most important action is the most prominent; importance maps to weight, size, position.
5. **Information architecture before pixels.** Screens, navigation, and flows are defined (`ia.md`) before styling.
6. **The UI is testable by construction.** Modern framework, deterministic render, stable seams; rendering lives in the boundary layer. See [testable-ui](references/testable-ui.md).
7. **Progressive disclosure.** Show what the user needs now; defer complexity behind intent.

## Composition

- **`lakebase-tdd-workflows`** – UX Designer authors `design-guide.{md,json}` + `ia.md` and sets the adherence contract; Test Strategist writes E2E scenarios + a11y checks against it (see [test-strategy](../lakebase-tdd-workflows/references/test-strategy.md)); Driver builds UI that adheres.
- **`architectural-design-principles`** – [testable-ui](references/testable-ui.md) shares the boundary-layer rule (templating is a boundary adapter) and the fitness-function model.
- **`software-design-principles`** – clean-code naming applies to components and template partials too.
