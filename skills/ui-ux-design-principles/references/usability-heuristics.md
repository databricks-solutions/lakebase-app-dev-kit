# Usability heuristics

Nielsen's ten, condensed and opinionated. Each is a lens to run over a screen before it ships. Each has a **smell**: the symptom that tells you it is being violated.

1. **Visibility of system status.** The UI always tells the user what is happening. Smell: an action fires and nothing visibly changes; a spinner that never resolves; a save with no confirmation.
2. **Match between system and the real world.** Speak the user's language, not the database's. Smell: an error that says `constraint violation` instead of "that title is already taken"; jargon in a label.
3. **User control and freedom.** Provide an exit, an undo, a cancel. Smell: a destructive action with no confirm and no undo; a modal with no close.
4. **Consistency and standards.** Same word, same component, same place, every time. Smell: "Delete" here and "Remove" there for the same action; a primary button styled three ways.
5. **Error prevention.** Stop the mistake before it happens. Smell: a free-text field where a picker would prevent a typo; no client-side validation before a costly submit.
6. **Recognition rather than recall.** Show options; do not make the user remember them. Smell: a command the user must memorize; a form that hides the rules until it rejects you.
7. **Flexibility and efficiency.** Accelerators for the experienced, defaults for the novice. Smell: no keyboard path for a high-frequency action.
8. **Aesthetic and minimalist design.** Every element competes for attention; cut what does not earn its place. Smell: a screen with three primary buttons (so none is primary); decoration with no function.
9. **Help users recognize, diagnose, recover from errors.** Errors are plain-language, name the problem, and offer the fix. Smell: a red box that says "Error" with no next step.
10. **Help and documentation.** Where help is needed, it is close at hand and task-focused. Smell: an empty state that scolds ("No data") instead of teaching ("Add your first bug to get started").

## Using the heuristics

- Run all ten over each new screen during the UX adherence review. A violated heuristic is a finding, fix it or justify it.
- Heuristics 1, 3, 5, and 9 (status, control, prevention, recovery) map onto the feedback rules in [interaction-and-feedback](interaction-and-feedback.md) and are the most testable: an E2E scenario can assert the confirmation, the undo, the validation, the recovery path.
