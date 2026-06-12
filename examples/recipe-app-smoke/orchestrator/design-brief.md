---
author: Product Owner
---

# Design brief (recipe app)

The HIL's design intent for the recipe-app UI, the UX Designer's intake.
Recorded ahead of time so the Human Proxy can supply it in a headless run
(the same brief a human would author at the `/design` UX interview). The UI
is small , a home list of recipe cards, a recipe detail page, and an
add/edit form , and this brief is deliberately small.

## References

The design language is teased from these references; the UX Designer
extracts tokens from them and cites which decision came from which.

- **Databricks-brand default** (the kit's shipped `default-design-guide.md`): take BRAND and COLOR from here, a warm light "oat" surface (`#F6F4F1` page background), near-black navy text (`#1B3139`), white cards, and the Databricks **lava** accent (`#FF3621`) for primary actions. This is the source of truth for color and brand.
- **A clean recipe index** (a cooking site's recipe grid, e.g. Bon Appetit / NYT Cooking card lists): take LAYOUT and INFORMATION DENSITY from here, a calm, scannable grid of recipe cards on the home page , one card per recipe showing its title and a one-line description , with generous whitespace, and a single narrow column for the detail page and the add/edit form.

## Brand constraints

- Use the Databricks lava accent for the primary action / active state only (Add recipe, Save, the active link); keep the recipe grid itself calm and high-contrast so titles are easy to scan.
- System/UI font stack is fine; no custom web font for this app.
- Cards are white on the oat background with a soft shadow and a gentle radius; the primary button is solid lava with a slightly tighter radius. Keep these consistent across home, detail, and form.

## Interaction and feedback

- Every state is shown explicitly: an empty collection shows an explicit empty-state ("No recipes yet , add the first one"), never a blank page; a recipe with no ingredients or instructions shows a clear "none listed yet", never a blank region.
- The add and edit forms never fail silently: a successful save lands on the saved recipe's page, and a validation problem (e.g. a missing title) is shown inline next to the field that caused it, naming the field.
- The home grid and the detail page are read-only, so they need no toasts; the no-silent-failure principle applies to the create + edit forms.

## Accessibility

- Form inputs have visible, persistent labels (not placeholder-only).
- Recipe cards and every action are keyboard-reachable and readable at 200% zoom.
- Meaning is never conveyed by color alone (a draft/published or dietary state, when later features add one, carries its name as text, not just a colored pill).
