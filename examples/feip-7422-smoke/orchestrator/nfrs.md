---
author: Product Owner
---

# NFRs (bug tracker)

The HIL's non-functional requirements for the bug-tracker smoke, the
Architect's intake. Recorded ahead of time so the Human Proxy can supply it in
the headless smoke (the same file a human would author at the `/design` NFR
interview). Deliberately small: the smoke proves the pipeline carries HIL NFRs
through to `architecture.json`, not NFR depth.

Note: agent/role observability (every role emitting what it does to the agent
log) is a SUBSTRATE invariant, not stated here. This file is the bug-tracker
app's requirements, not the substrate's.

## Required

- R1: existing bugs and their data survive every schema migration with no loss; each iteration's model change (owners, status table, split details) preserves the bugs filed before it
- R2: a bug's status is always one of the recognized states; an unrecognized status is rejected at write time, never stored

## Preferences

- clear, specific error messages that name the offending value (not just "bad request")
- new tables introduced by a migration are additive where possible (old reads keep working during rollout)

## Out of bounds

- no authentication, authorization, or per-user permissions for this smoke
- no caching layer or multi-region concerns
