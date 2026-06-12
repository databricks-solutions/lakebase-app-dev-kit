---
author: Feature Requester
---

# v3: Search Recipes by What You Remember

The collection is large enough now that scrolling the whole list to find one
recipe is tedious. People usually remember a word or two from a recipe's name,
so we want a simple way to **search**.

The home page should have a **search box**. As a visitor types a query and
submits it, the recipe list narrows to the recipes whose **title (and
description)** match what they typed. Clearing the query brings the full list
back. When nothing matches, the page shows an **explicit "no recipes match"
message**, never a blank page.

Search is for finding recipes that are part of the collection; it does not change
any recipe.

## Out of scope

This is a straightforward title/description match, no fuzzy matching, ranking,
typo correction, or searching within ingredients/instructions for now. There is
no searching or filtering by cuisine yet, and search does not need to consider
drafts or review state (those features do not exist yet). No saved searches or
search history.
