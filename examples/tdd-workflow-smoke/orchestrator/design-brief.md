---
author: Product Owner
---

# Design brief (bug tracker)

The HIL's design intent for the bug-tracker UI, the UX Designer's intake.
Recorded ahead of time so the Human Proxy can supply it in the headless smoke
(the same brief a human would author at the `/design` UX interview). The UI in
this product is small: a bug create form + a bug detail page (v1) and a status
control (v2); this brief is deliberately small.

## References

The design language is teased from these reference sites; the UX Designer
extracts tokens from them and cites which decision came from which.

- **Databricks-brand default** (the kit's shipped `default-design-guide.md`): take BRAND and COLOR from here, the primary/surface palette, the accent (Databricks red), and the typographic family. This is the source of truth for color and brand.
- **GitHub Issues** (github.com issue list): take LAYOUT and INFORMATION DENSITY from here, a scannable single-column list, one row per item, with compact columns for identifier, title, a status pill, and an owner. The triage-at-a-glance feel is what we want for the bug list.

## Brand constraints

- Use the Databricks accent for the primary action / active-state only; keep the list itself calm and high-contrast for readability.
- System/UI font stack is fine; no custom web font for this smoke.

## Interaction and feedback

- Every state is shown explicitly: an unowned bug reads "unowned", never a blank cell; an empty list shows an explicit empty-state message, never a blank page.
- No action in the bug-list view (it is read-only), so no success/failure toasts are needed there yet; the no-silent-failure principle applies to the create form (v1) + status control (v2).

## Accessibility

- Status must not be conveyed by color alone (pill carries the state name as text).
- The list is keyboard-reachable and readable at 200% zoom.
