---
author: Product Owner
---

# NFRs (bug tracker)

The HIL's non-functional requirements for the bug-tracker smoke, the
Architect's intake. Recorded ahead of time so the Human Proxy can supply it in
the headless smoke (the same file a human would author at the `/design` NFR
interview). Deliberately small: the smoke proves the pipeline carries HIL NFRs
through to `architecture.json`, not NFR depth.

## Required

- R1: every bug status transition is recorded so the history is auditable
- R2: an invalid status is rejected at write time, never silently stored

## Preferences

- structured, queryable logs for bug-create and status-transition operations
- clear error messages that name the offending value (not just "bad request")

## Out of bounds

- no authentication, authorization, or per-user permissions for this smoke
- no caching layer or multi-region concerns
