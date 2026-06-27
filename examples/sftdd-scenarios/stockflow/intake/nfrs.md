---
author: Product Owner
---

# NFRs (StockFlow)

The PO's non-functional requirements for StockFlow, the Architect's
intake. Recorded ahead of time so the Human Proxy can supply it in a
headless run (the same file a human would author at the `/design` NFR
interview). Deliberately small: it proves the pipeline carries PO NFRs
through to `architecture.json`, not NFR depth.

Note: agent / role observability (every role emitting what it does to
the agent log) is a SUBSTRATE invariant, not stated here. This file is
StockFlow's requirements, not the substrate's.

## Required

- R1: existing stock data survives every schema migration with no loss.
  Each iteration's additive model change preserves the inventory records
  created before it, and every inventory adjustment keeps an
  unmodifiable timestamp and actor.
- R2: stock levels never go below zero, and never overcommit beyond
  available quantity. A pick that would overcommit is rejected at write
  time (never a stored negative, never a silently-allowed
  double-allocation).
- R3: every SKU at every location is uniquely addressable by
  `(sku, location)` and no two records share that pair. A collision is
  resolved at write time (never two stored duplicates, never an error
  page).
- R4: integration tests run against the paired Lakebase branch, not a
  mock or in-memory substitute. The CI workflow refuses to merge a PR
  whose integration tests do not run against a real branch.

## Preferences

- clear, specific validation messages that name the offending field
  (not just "bad request")
- migrations are additive where possible (old reads keep working during
  rollout); a new column or table never breaks an existing page
- a stock-level row missing optional detail still renders cleanly (par
  level, batch, serial default to empty and show an explicit "not
  tracked", never a null crash or a blank region)
- barcode-scan interactions feel immediate (perceived response under
  ~200ms from scan event to UI update)

## Out of bounds

- no authentication, authorization, or per-tenant ownership for V1
- no caching layer or multi-region concerns
- no real-time multi-operator conflict resolution beyond the simple
  no-overcommit rule

## Environment constraint (for the Architect)

- The app connects to the `stockflow` database, NOT the default
  `databricks_postgres`. The deployed pool resolves its host from the
  paired Lakebase branch; the Architect must keep `DB_NAME` /
  `PGDATABASE` set to `stockflow` so local preview follows the
  checked-out branch.
