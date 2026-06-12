---
author: Feature Requester
---

# v5: Review a Submitted Recipe Before It Joins the Collection

As more people add recipes, we want a light quality check before a brand-new
recipe shows up in the public collection, a chance to look it over and approve
or reject it.

When a contributor adds a recipe, it enters a **"submitted"** state and is **held
out of the public home list and search** until it has been reviewed. A simple
**review surface** lists the recipes awaiting review and lets a reviewer
**approve** (the recipe joins the public collection) or **reject** it. The
outcome is **clearly acknowledged** on the review surface, the reviewer always
sees whether their decision took effect, never a silent result.

Recipes that already exist in the collection are treated as already approved, so
this feature does not hide anything that is currently public.

## Out of scope

There are no reviewer accounts or permissions (anyone can review, consistent with
the app having no sign-in), no review comments or feedback back to the submitter,
no edit-then-resubmit loop, and no history of past review decisions. This is the
submit -> approve/reject step only. It is independent of the draft/published
toggle from the previous sprint.
