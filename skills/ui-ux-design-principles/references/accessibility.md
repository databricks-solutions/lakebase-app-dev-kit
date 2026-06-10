# Accessibility

Not a feature, a floor. A UI that a keyboard or a screen reader cannot operate is broken, the same way a 500 error is broken. Target **WCAG 2.1 AA**.

## The essentials

- **Semantic HTML first.** Use the element that means what you want: `<button>` for actions, `<a>` for navigation, `<nav>`, `<main>`, `<h1..h6>` in order, `<label>` bound to every input, `<table>` for tabular data. Semantics give assistive tech the structure for free. ARIA is for filling gaps semantics cannot, not for re-implementing a button on a `<div>`.
- **Keyboard operable.** Every interactive element is reachable and operable by keyboard alone: Tab order follows reading order, Enter/Space activate, Escape dismisses. No keyboard trap. If you can click it, you can key to it.
- **Visible focus.** The focused element has a clear, non-color-only focus indicator. Never `outline: none` without a replacement.
- **Color contrast.** Text meets contrast ratios: 4.5:1 for normal text, 3:1 for large text and meaningful UI/graphics. Never use color as the *only* signal (pair it with an icon, text, or pattern), red/green alone fails for color-blind users.
- **Labels and names.** Every control has an accessible name (a `<label>`, `aria-label`, or text content). Icon-only buttons get an `aria-label`. Images that carry meaning get `alt`; decorative images get empty `alt`.
- **Status and errors announced.** Use `aria-live` regions (or a role like `alert`) so a screen reader hears a save succeeded or a validation failed, the auditory analogue of the visible feedback rule.
- **Respect user settings.** Honor reduced-motion, do not trap zoom, support text resize to 200% without breaking layout.

## Forms (the highest-risk surface)

- Label every field; do not rely on placeholder text as the label (it vanishes on input).
- Associate the error message with its field (`aria-describedby`), and name the field in the message text ("Title is required", not "Required").
- Group related controls (`<fieldset>` + `<legend>`).

## Enforcement

Accessibility is testable, and in this kit it is enforced, not eyeballed:

- An **automated a11y check** (axe-core or equivalent) runs at the E2E (Playwright) layer and fails the build on violations (missing labels, contrast failures, no accessible name). This is a fitness function in the sense of [architectural-design-principles](../../architectural-design-principles/references/evolutionary-architecture.md).
- **Keyboard flows are E2E scenarios:** drive the primary flow with keyboard only and assert it completes.
- Automated checks catch the mechanical failures; the UX adherence review catches the judgment ones (is the focus order sensible? is the announcement useful?).
