# Interaction and feedback

How the UI responds to what the user does. The canonical home for the feedback rules the project design guide instantiates as its "User Feedback Principles".

## Affordances

An element looks like what it does. A button looks pressable; a link looks followable; a disabled control looks disabled. The user should never have to guess whether something is interactive. Do not style a non-interactive element to look clickable, and do not hide a real action behind something that looks inert.

## The feedback rules

These are the most testable UX rules; each maps to an E2E assertion.

- **No silent failures.** Every action that changes data shows BOTH success and failure feedback. A failed save that looks like a successful one is the worst outcome. Use the project's error presenter (e.g. `describeError()`) so failures are human-readable.
- **No unacknowledged success.** Something visible confirms the action worked: a navigation, a toast, a flash, an inserted row, a checkmark. Silence reads as "did it work?".
- **No layout shift from feedback.** Feedback uses fixed-position elements (toasts, overlays), never inline alerts that push content and make the user lose their place.
- **Loading states are mandatory over ~200ms.** Any action that is not instant shows a loading state (spinner, skeleton, disabled-with-progress). Below the perception threshold, do not flash one.

## Latency and optimism

- **Make it feel fast.** Optimistic UI (apply the change immediately, reconcile on response) is good where the action almost always succeeds, but you MUST handle the rollback: if the server rejects it, visibly revert and explain.
- **Skeletons over spinners** for content that has a known shape; they reduce perceived wait and prevent layout shift.

## Error prevention and recovery

- **Prevent first** (heuristic 5): pickers over free text, inline validation before submit, sensible defaults, disabling the submit until valid.
- **Recover gracefully** (heuristic 9): when an error happens, say what went wrong in plain language, name the field or cause, and offer the next step. Never a bare "Error".
- **Confirm destructive, undo where possible.** A delete gets a confirm or an undo window. Irreversible actions get an extra beat.

## Progressive disclosure

Show what the user needs for the current step; defer the rest behind intent (an "Advanced" section, a second screen, a disclosure triangle). A form that asks for everything up front is a wall; a flow that asks for what it needs when it needs it is a path.

## Enforcement

The feedback rules are E2E-testable and should be asserted: the behavior scenario for a data-changing AC asserts the visible success path AND a failure path (forced error -> visible, readable message, no layout shift). See [test-strategy](../../lakebase-tdd-workflows/references/test-strategy.md).
