# Accessibility

Not a feature, a floor. A UI a keyboard or screen reader can't operate is broken, the same way a 500 error is broken. Target **WCAG 2.1 AA**.

## The essentials

- **Semantic HTML first.** Use the element that means what you want: `<button>` for actions, `<a>` for navigation, `<nav>`, `<main>`, `<h1..h6>` in order, `<label>` bound to every input, `<table>` for tabular data. ARIA fills gaps semantics can't, it doesn't re-implement a button on a `<div>`.
- **Keyboard operable.** Every interactive element reachable and operable by keyboard alone: Tab follows reading order, Enter/Space activate, Escape dismisses, no keyboard trap. If you can click it, you can key to it.
- **Visible focus.** A clear, non-color-only focus indicator. Never `outline: none` without a replacement.
- **Color contrast.** 4.5:1 for normal text, 3:1 for large text and meaningful UI/graphics. Never use color as the *only* signal (pair with icon, text, or pattern); red/green alone fails for color-blind users.
- **Labels and names.** Every control has an accessible name (`<label>`, `aria-label`, or text). Icon-only buttons get `aria-label`. Meaningful images get `alt`; decorative images get empty `alt`.
- **Status and errors announced.** Use `aria-live` (or `role="alert"`) so a screen reader hears a save succeed or a validation fail, the auditory analogue of the visible feedback rule.
- **Respect user settings.** Honor reduced-motion, don't trap zoom, support text resize to 200% without breaking layout.

## Forms (the highest-risk surface)

- Label every field; don't rely on placeholder text (it vanishes on input).
- Associate the error with its field (`aria-describedby`) and name the field in the message ("Title is required", not "Required").
- Group related controls (`<fieldset>` + `<legend>`).

## Enforcement

Enforced, not eyeballed:

- An **automated a11y check** (axe-core or equivalent) runs at the E2E (Playwright) layer and fails the build on violations (missing labels, contrast failures, no accessible name). A fitness function in the sense of [evolutionary-architecture](../../architectural-design-principles/references/evolutionary-architecture.md).
- **Keyboard flows are E2E scenarios:** drive the primary flow with keyboard only and assert it completes.
- Automated checks catch the mechanical failures; the UX adherence review catches the judgment ones (is the focus order sensible? the announcement useful?).
