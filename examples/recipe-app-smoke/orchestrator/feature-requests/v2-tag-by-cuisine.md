---
author: Feature Requester
---

# v2: Classify a Recipe by Cuisine

Now that the collection has recipes that people browse and add, it is getting
harder to understand at a glance what kind of food is in it. We want to start
classifying recipes, beginning with **cuisine** (Italian, Thai, Mexican, and so
on).

A contributor on the add-recipe and edit-recipe forms should be able to **pick
one or more cuisines** for a recipe from a managed list of cuisines (not free
text, so the same cuisine is spelled the same way every time). On a recipe's
detail page and on its card in the home list, its cuisines show as **labeled
pills**, each pill carrying the cuisine name as text.

Existing recipes simply have no cuisines until someone adds them, and they
continue to display and work exactly as before. Adding cuisines to a recipe never
changes the recipe's own fields.

## Out of scope

This is only the cuisine tag kind, other kinds of classification (meal type,
dietary labels) come in later sprints as their own additive features. There is no
filtering or browsing *by* cuisine yet (clicking a pill does nothing), no
managing the list of available cuisines from the UI, and no search. Drafts and
review remain out of scope.
