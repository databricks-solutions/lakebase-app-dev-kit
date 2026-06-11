# Usability heuristics

Nielsen's ten, condensed. Each is a lens to run over a screen before it ships, with the **smell** that signals a violation.

1. **Visibility of system status.** The UI always says what's happening. Smell: an action fires and nothing changes; a spinner that never resolves; a save with no confirmation.
2. **Match the real world.** Speak the user's language, not the database's. Smell: an error saying `constraint violation` instead of "that title is already taken"; jargon in a label.
3. **User control and freedom.** Provide an exit, undo, cancel. Smell: a destructive action with no confirm and no undo; a modal with no close.
4. **Consistency and standards.** Same word, component, and place every time. Smell: "Delete" here, "Remove" there for the same action; a primary button styled three ways.
5. **Error prevention.** Stop the mistake before it happens. Smell: free text where a picker would prevent a typo; no client-side validation before a costly submit.
6. **Recognition over recall.** Show options; don't make the user remember them. Smell: a command the user must memorize; a form that hides the rules until it rejects you.
7. **Flexibility and efficiency.** Accelerators for the experienced, defaults for the novice. Smell: no keyboard path for a high-frequency action.
8. **Aesthetic and minimalist design.** Cut what doesn't earn its place. Smell: three primary buttons (so none is primary); decoration with no function.
9. **Recognize, diagnose, recover from errors.** Plain-language errors that name the problem and offer the fix. Smell: a red box saying "Error" with no next step.
10. **Help and documentation.** Where help is needed, it's close and task-focused. Smell: an empty state that scolds ("No data") instead of teaching ("Add your first bug to get started").

## Using the heuristics

- Run all ten over each new screen during the UX adherence review. A violated heuristic is a finding: fix it or justify it.
- Heuristics 1, 3, 5, 9 (status, control, prevention, recovery) map onto the feedback rules in [interaction-and-feedback](interaction-and-feedback.md) and are the most testable: an E2E scenario can assert the confirmation, the undo, the validation, the recovery path.
