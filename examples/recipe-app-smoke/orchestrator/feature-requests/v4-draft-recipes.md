---
author: Feature Requester
---

# v4: Keep a Recipe as a Draft Until It Is Ready

Contributors want to start a recipe and come back to finish it later without it
showing up half-written in the public collection. We want a notion of **draft
versus published**.

Every recipe has a **visibility**: `draft` or `published`. The add-recipe and
edit-recipe forms let the contributor choose, and **published is the default**,
so a recipe behaves exactly as it does today unless someone deliberately makes it
a draft. A **draft is excluded from the public home list and from search**, but
the contributor can still reach it directly by its URL to keep working on it.
Publishing a draft (editing it to published) makes it appear in the list and
search like any other recipe. Wherever a recipe's visibility is shown, the state
is written as text ("Draft"), not signaled by color alone.

Because published is the default, all the recipes that already exist stay visible
exactly as before.

## Out of scope

There is no separate "my drafts" dashboard, no scheduled/timed publishing, and no
multi-step approval, this is just the draft/published toggle on the recipe
itself. Review of submissions by someone else is a separate, later feature. No
accounts, so a draft is reachable by anyone who has its URL.
