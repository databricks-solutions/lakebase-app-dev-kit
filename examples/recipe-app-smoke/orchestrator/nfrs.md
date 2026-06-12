---
author: Product Owner
---

# NFRs (recipe app)

The HIL's non-functional requirements for the recipe app, the Architect's
intake. Recorded ahead of time so the Human Proxy can supply it in a
headless run (the same file a human would author at the `/design` NFR
interview). Deliberately small: it proves the pipeline carries HIL NFRs
through to `architecture.json`, not NFR depth.

Note: agent/role observability (every role emitting what it does to the
agent log) is a SUBSTRATE invariant, not stated here. This file is the
recipe app's requirements, not the substrate's.

## Required

- R1: existing recipes and their data survive every schema migration with no loss; each iteration's additive model change (a tag's lookup + join table, an extension's column or table) preserves the recipes created before it, and every recipe keeps a creation timestamp.
- R2: every recipe is reachable by a stable, unique link (its slug); two recipes never share a slug, a slug collision is resolved at write time (never a stored duplicate, never an error page), and a recipe always has a non-empty title , a blank title is rejected at write time, never stored.

## Preferences

- clear, specific validation messages that name the offending field (not just "bad request")
- migrations are additive where possible (old reads keep working during rollout); a new tag kind or extension never breaks an existing page
- a recipe missing optional detail still renders cleanly (description / ingredients / instructions default to empty and show an explicit "none yet", never a null crash or a blank region)

## Out of bounds

- no authentication, authorization, or per-user ownership for this app
- no caching layer or multi-region concerns

## Environment constraint (for the Architect)

- The app connects to the **`recipe`** database, NOT the default
  `databricks_postgres`. The deployed pool resolves its host from the
  paired Lakebase branch; the Architect must keep `DB_NAME`/`PGDATABASE`
  set to `recipe` so local preview follows the checked-out branch.
