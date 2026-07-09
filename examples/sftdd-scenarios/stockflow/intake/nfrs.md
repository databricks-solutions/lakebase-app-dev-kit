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
- R5: the UI is a single-page web application. The warehouse-floor
  tablet loads the app once and navigates client-side (home, SKU
  detail, the receipt / pick / adjustment forms) with no full-page
  reloads; a stock adjustment updates the affected row in place
  (optimistic update, reconciled against the server response) rather
  than re-rendering the page. The client is a React + TypeScript
  application under `client/`, and the backend is a JSON API (the
  boundary layer returns data, not server-rendered HTML). The client
  ships its own component tests; the API is covered by the branch
  integration tests in R4.

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

- The app connects to the substrate-provisioned `databricks_postgres`
  database via the `DATABASE_URL` the post-checkout hook writes from the
  paired Lakebase branch. Do NOT rename the database or set `DB_NAME` /
  `PGDATABASE` to an app-specific name, and do not make the database name
  a requirement or NFR: the branch provisions only `databricks_postgres`
  (a migration creates tables, not databases), so an app pointed at any
  other name cannot connect. Leave the scaffold's connection defaults
  alone; the schema lives in `databricks_postgres` on the paired branch.
