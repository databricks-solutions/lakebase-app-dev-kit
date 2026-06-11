# Interaction and feedback

How the UI responds to what the user does. The canonical home for the feedback rules the project design guide instantiates as its "User Feedback Principles".

## Affordances

An element looks like what it does: a button looks pressable, a link followable, a disabled control disabled. The user should never guess whether something is interactive. Don't style an inert element to look clickable, or hide a real action behind something that looks inert.

## The feedback rules

The most testable UX rules; each maps to an E2E assertion.

- **No silent failures.** Every data-changing action shows BOTH success and failure feedback. A failed save that looks successful is the worst outcome. Use the project's error presenter (e.g. `describeError()`) so failures are human-readable.
- **No unacknowledged success.** Something visible confirms it worked: a navigation, toast, flash, inserted row, checkmark. Silence reads as "did it work?".
- **No layout shift from feedback.** Use fixed-position elements (toasts, overlays), never inline alerts that push content and make the user lose their place.
- **Loading states mandatory over ~200ms.** Anything not instant shows a loading state (spinner, skeleton, disabled-with-progress). Below the perception threshold, don't flash one.

## Latency and optimism

- **Make it feel fast.** Optimistic UI (apply immediately, reconcile on response) suits actions that almost always succeed, but you MUST handle rollback: on rejection, visibly revert and explain.
- **Skeletons over spinners** for content with a known shape; they cut perceived wait and prevent layout shift.

## Error prevention and recovery

- **Prevent first** (heuristic 5): pickers over free text, inline validation before submit, sensible defaults, disable submit until valid.
- **Recover gracefully** (heuristic 9): say what went wrong in plain language, name the field or cause, offer the next step. Never a bare "Error".
- **Confirm destructive, undo where possible.** A delete gets a confirm or an undo window; irreversible actions get an extra beat.

## Progressive disclosure

Show what the current step needs; defer the rest behind intent (an "Advanced" section, a second screen, a disclosure triangle). A form that asks for everything up front is a wall; a flow that asks for what it needs when it needs it is a path.

## Enforcement

E2E-testable: the behavior scenario for a data-changing AC asserts the visible success path AND a failure path (forced error -> visible, readable message, no layout shift). See [test-strategy](../../lakebase-tdd-workflows/references/test-strategy.md).
