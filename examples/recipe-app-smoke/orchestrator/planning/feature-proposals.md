---
author: Spec Author
---

# Feature proposals (sprint 1)

Derived from the Product Owner's `product-overview.md`, the `nfrs.md` brief, and
the UX `design-brief.md`. Each proposal follows the overview's growth arc (earn
each capability only once the prior is in real use) and stays purely additive,
pairing a code change with a schema migration. This is the Spec Author's
sprint-planning INPUT to the PO; the PO turns the accepted ones into
`feature-requests/`.

## F1: Browse, view, add, and edit recipes
- **Ask:** The MVP recipe app: a home list of recipe cards, a recipe detail page reached by a stable slug, an add-recipe form, and an edit-recipe form, all reading/writing one `recipes` table seeded with a handful of starter recipes.
- **Rationale:** Phase 1 of the product arc, the smallest thing recognizably a recipe app (schema + UI). Establishes the `recipes` table that every later feature extends additively; satisfies "browse the recipes that exist", "open a single recipe", "add a new recipe", "edit a recipe", and "return to a recipe by a stable link". Carries R1 (a `created_at` timestamp on every recipe) and R2 (unique slug, non-empty title).
- **E2E story:** Yes, a visitor browses the list, opens a recipe, and a contributor adds then edits one in the browser.
- **Priority:** P0

## F2: Classify a recipe by cuisine
- **Ask:** A recipe can be tagged with one or more cuisines (Italian, Thai, ...); cuisines show as labeled pills on the card and detail page, and the add/edit form lets a contributor pick them. Cuisines are a managed lookup, not free text.
- **Rationale:** Phase 2 of the arc (classify recipes with tags), the first use of the tag framework. Purely additive: a cuisine lookup table + a recipe-cuisine join + a pill component, no change to the `recipes` table. Makes the collection understandable/groupable. Honors R1 (additive migration preserves existing recipes) and the design brief (a state carries its name as text, not color alone).
- **E2E story:** Yes, a contributor tags a recipe with a cuisine and sees the pill on the card + detail.
- **Priority:** P1

## F3: Search recipes by what you remember
- **Ask:** A search box on the home page filters the recipe list by a typed query matched against title (and description); an empty result shows an explicit "no recipes match" state, never a blank page.
- **Rationale:** Phase 3 of the arc (find a recipe by typing what you remember), the first use of the search extension slot. Additive: a search provider + a home-section slot, no schema rewrite (a read-path query change, with an optional index migration to satisfy the pairing rule). Fulfills the design brief's explicit empty-state requirement.
- **E2E story:** Yes, a visitor types a query and the list narrows; an unmatched query shows the empty state.
- **Priority:** P1

## F4: Keep a recipe as a draft until it is ready
- **Ask:** A recipe has a visibility (draft or published); drafts are excluded from the public home list and search, the author can still reach a draft by its URL, and the add/edit form sets visibility. Published is the default so existing recipes are unaffected.
- **Rationale:** Phase 3 of the arc (a cross-cutting capability), the first use of the visibility extension. Additive: a `visibility` column defaulting to `published` (R1: existing recipes stay visible) + a visibility predicate wired into the list/search read path. The draft/published state carries its name as text (design brief, accessibility).
- **E2E story:** Yes, a contributor saves a draft, confirms it is absent from the public list, and reaches it by URL.
- **Priority:** P2

## F5: Review a submitted recipe before it joins the collection
- **Ask:** A newly added recipe enters a "submitted" state and is held out of the public collection until it is reviewed (approved or rejected); a simple review surface lists submissions and records the decision, with a clear acknowledgement of the outcome.
- **Rationale:** Phase 3 of the arc (a cross-cutting capability), the first use of the review extension. Additive: a submission-state column + a reviewer surface, no rewrite of the create path (it appends a reviewer). Honors no-silent-failure (the review decision is acknowledged) and R1 (existing recipes are grandfathered as approved).
- **E2E story:** Yes, a contributor submits a recipe, a reviewer approves it, and it then appears in the collection.
- **Priority:** P2
