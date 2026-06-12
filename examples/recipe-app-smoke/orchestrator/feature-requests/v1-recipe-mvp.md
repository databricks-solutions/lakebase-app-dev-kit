---
author: Feature Requester
---

# v1: Browse, View, Add, and Edit Recipes

We want the first usable version of the recipe app: a small collection of
recipes that anyone can browse, read, add to, and correct. Right now nothing
exists, so this version stands the whole thing up, the recipes themselves and
the pages to work with them.

A visitor should open the app in their browser and see a **home page listing the
recipes that exist**, one card per recipe showing its title and a short
description, laid out as a calm, scannable grid. Clicking a card opens that
**recipe's own page at a stable, shareable URL** built from a readable slug (for
example `/recipes/classic-margherita-pizza`). That URL is how someone returns to
a recipe later or shares it. The detail page shows the recipe's title,
description, ingredients, and instructions, and when a section has no content yet
it says so explicitly (for example "No ingredients listed yet") rather than
showing a blank area.

A contributor should be able to **add a new recipe** from an add-recipe form
(title, description, ingredients, instructions) and, on save, land on the new
recipe's page at its slug. They should also be able to **edit an existing
recipe** from an edit form prefilled with its current values, and on save land
back on the updated recipe.

Every recipe has a non-empty **title**; a save with a blank title is rejected at
the form with a message naming the missing field, and nothing is stored. Each
recipe gets a **unique slug** derived from its title; if that slug would collide
with an existing one, the collision is resolved when saving (never two recipes at
the same URL, never an error page). Every recipe records when it was created. The
app starts with a handful of seeded starter recipes so the list is not empty on
first run.

## Out of scope

There is no classification yet (no cuisines, meal types, or dietary labels), no
search box, no notion of drafts or review, and no accounts or permissions,
anyone can read, add, and edit. Deleting recipes, ratings, comments, and photos
are all out of scope for this version. Those capabilities come in later sprints.
