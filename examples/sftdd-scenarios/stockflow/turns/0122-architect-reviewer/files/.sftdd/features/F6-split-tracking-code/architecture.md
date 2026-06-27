# Architecture: F6-split-tracking-code (story S1-split-add-backfill)

## Layer assignment summary

S1 is a canonical schema refactor: add `batch_number` and `serial_number` to the
stock table, backfill them by delimiter-parsing the existing `inventory_code`
(`split_part`, segment 2 = batch, segment 3 = serial, `NULLIF` for missing
segments), drop the combined code, and keep `location` canonical and unchanged.
Every AC (AC1-AC7) is therefore an **Infra** AC: a contract on the data-store
shape and on data-store state after the migration, proven by a parent-aware
schema diff plus an integrity-probe count run against the paired Lakebase branch.
None of these ACs cross an HTTP/CLI boundary, so none are `API`, and none drive a
multi-service UI flow, so none are `E2E`. `service_backed: true`: the feature
persists domain entities and the change is a real migration, so the Infra-layer
ACs and the R1 storage/migration NFR are consistent with the declared
boundary -> service -> repository -> models layering (inherited verbatim from
F1-stock-visibility; no layer remapped or renamed).

## Architectural Concerns Mapping

| Concern | Owner layer (this feature) | Notes |
| --- | --- | --- |
| HTTP/CLI request handling | boundary (`app/routes/`) | Not exercised by S1; relevant to S4 display. |
| Business logic / parse rule orchestration | service (`app/services/`) | Backfill parse rule lives in the Alembic revision; the service never re-implements parsing. |
| ORM / DB session / schema migration | repository (`app/repositories/`) + Alembic revision | ONLY layer touching the session; owns the up/down migration and the integrity probe. |
| Domain entity definition | models package (`app/models/`, e.g. `app/models/stock.py`) | Declares `batch_number` / `serial_number`; one module per aggregate. |
| Data integrity / no silent loss (R1) | repository/migration | Nonconforming codes -> NULL, never guessed/dropped; probe surfaces the count. |
| Unique addressability (R3) | repository (DB constraint) | UNIQUE(sku, location) preserved; location never derived from the code. |
| Config (DB_NAME=stockflow) | infrastructure / env | Twelve-factor config-in-env; Alembic env reads the paired-branch DSN. |
| Validation / authz | boundary | Out of bounds for V1 (no auth); not touched by S1. |

## Pattern proposals

- Keep the parse-and-backfill as a single set-based `UPDATE` inside one Alembic
  revision (transactional up/down), not row-by-row application code: it is a
  data-store transformation, owned by the migration in the repository layer.
- The `models` layer gains the two columns; the repository remains the only code
  that touches the ORM/session. The service and boundary are unchanged by S1 and
  must not learn the parse rule (SRP / dependency-points-inward).
- Down path reconstructs the combined code from canonical `location` + split-out
  batch/serial, normalizing the leading segment to `location` (the pre-split
  leading segment was never authoritative).

## Risks

- Variable-width, non-uniform seed data ('X-1', bare 'c') means a meaningful
  fraction of rows will legitimately backfill to NULL. Risk: a reviewer reads the
  probe warning count as a failure. Mitigation: the probe WARNs (does not abort)
  and the count is surfaced for explicit review before accept.
- Dropping `inventory_code` is destructive forward. Reversibility depends on the
  down path reconstruction being lossy-tolerant (leading segment normalized to
  location). Flag for PO: confirm a normalized round-trip is acceptable.
- Down-path NOT NULL on the reconstructed `inventory_code` assumes location is
  always present; safe given UNIQUE(sku, location), but verify on the branch.

## Decisions (for PO adjudication at Gate 2)

1. **Probe behavior: WARN vs ABORT on nonconforming rows.** Recommendation:
   WARN and surface the count (proceed with NULLs), per R1 "surface for review",
   matching the migration reference. PO to confirm vs forcing data cleanup first.
2. **Reversibility contract.** Recommendation: ship a real down() that
   reconstructs a normalized combined code; accept that the leading segment is
   normalized to canonical `location` rather than the original opaque prefix.
3. **R2 applicability.** Recommendation: mark R2 N/A-carried-forward for this
   story (quantity untouched), verified by AC7. PO to accept.

## Test strategy

Real-DB integration tests against the paired Lakebase branch only (R4); no mocks,
stubs, or in-memory substitutes. Python: pytest-bdd (`.feature` + step defs +
`conftest.py`), Alembic migrations applied to the branch first, FK-aware
targeted-DELETE cleanup. The suite seeds variable-width rows, applies the up
revision, and verifies: schema shape (AC1), parse correctness for three/two/one
segment codes (AC2-AC4), migration completeness across all rows (AC5),
preservation of canonical `location` (AC6) and business columns sku/quantity
(AC7), and the up/down round-trip plus integrity-probe count (NFR-F6-S1-1/6).
All seven ACs of S1 are verified through this real-branch suite.

## Sign-off

Recommendation: **proceed** to test-list construction once the PO adjudicates the
three Gate-2 decisions and the six proposed NFRs. Layering reuses the F1-established
conventions unchanged.

Architect Reviewer (architect-reviewer), F6-split-tracking-code / S1-split-add-backfill.

---

# Architecture: F6-split-tracking-code (story S4-split-display)

## Layer assignment summary

S4 surfaces the split columns in the UI: the home stock table gains a 'Batch
Number' and a 'Serial Number' column (AC1), and the SKU detail view shows batch
and serial as separate labeled per-location fields (AC3); NULL values render the
explicit literal 'not tracked' in both surfaces (AC2, AC4). Every AC is an **E2E**
AC: it drives a rendered page plus the full read path (boundary -> service ->
repository -> models) and asserts observable UI state. None is a bare HTTP/CLI
contract (`API`) nor a data-store-shape contract (`Infra`). `service_backed:
true` (inherited from F1; the feature persists domain entities), so the read path
goes through the established boundary -> service -> repository -> models layering;
the layout is reused verbatim from F1-stock-visibility with no layer remapped or
renamed. The display path reads the split model fields directly and must never
re-parse the combined inventory_code (dropped after S3).

## Architectural Concerns Mapping

| Concern | Owner layer (this feature) | Notes |
| --- | --- | --- |
| HTTP/CLI request handling | boundary (`app/routes/`) | Home page + SKU detail page routes render the views. |
| Presentation / column + field layout, 'not tracked' substitution | boundary + templates | Display rule; NULL -> 'not tracked' literal lives here, never in the domain. |
| Business logic | service (`app/services/`) | Read orchestration only; no parsing, no conditional display logic. |
| ORM / DB session / read query | repository (`app/repositories/`) | ONLY layer touching the session; supplies stock rows with split fields. |
| Domain entity definition | models package (`app/models/`, e.g. `app/models/stock.py`) | Exposes batch_number / serial_number (nullable). |
| Read fidelity (NFR-F6-S4-1) | service + repository | Detail view reflects every committed location row; no stale/omitted row. |
| Config (DB_NAME=stockflow) | infrastructure / env | Twelve-factor config-in-env. |
| Validation / authz | boundary | Out of bounds for V1 (no auth); display-only story. |

## Pattern proposals

- Keep the NULL -> 'not tracked' substitution in the template/view helper, not in
  the service or model: it is a presentation default, SRP-owned by the boundary.
- The home table and the detail view consume the same repository read shape (stock
  rows carrying split fields); differ only in template structure (columns vs
  labeled per-location fields). No new service or repository method should
  re-derive batch/serial from a code.
- Dependencies point inward unchanged: boundary -> service -> repository -> models;
  the boundary never imports the DB session.

## Risks

- The combined inventory_code is gone after S3; any residual display code that
  still reads/parses it would 500. Risk surfaced for the build lane: the display
  path must bind only to batch_number/serial_number.
- 'not tracked' must be applied per field (batch independent of serial), since a
  row can have one populated and the other NULL; a row-level all-or-nothing check
  would mis-render. Mitigation: field-level substitution, asserted by AC2/AC4.

## Decisions (for PO adjudication at Gate 2)

1. **Exact display literal.** Recommendation: render the lowercase literal 'not
   tracked' verbatim in both surfaces, consistent with the F1 NFR-F1-6 preference
   and S4 AC2/AC4 Then clauses. PO to confirm casing/wording.
2. **Column vs labeled-field framing.** Recommendation: keep the two surfaces
   structurally distinct (table columns on home, labeled per-location fields on
   detail) per AC1/AC3; do not unify into one widget. PO to accept.

## Test strategy

Real-DB integration/UI tests against the paired Lakebase branch only (R4 /
NFR-F6-S4-3); no mocks, stubs, or in-memory substitutes. Python: pytest-bdd
(`.feature` + step defs + `conftest.py`), F6 Alembic migrations (through S3)
applied to the branch first, FK-aware targeted-DELETE cleanup. The suite seeds
both populated and NULL batch/serial rows, renders the home page and the SKU
detail page, and verifies: split columns present and valued (AC1), home NULL ->
'not tracked' (AC2), labeled detail fields present and valued (AC3), and detail
NULL -> 'not tracked' (AC4). All four ACs of S4 are verified through this
real-branch suite.

## Sign-off

Recommendation: **proceed** to test-list construction once the PO adjudicates the
two Gate-2 decisions and the four proposed S4 NFRs. Layering reuses the
F1-established conventions unchanged.

Architect Reviewer (architect-reviewer), F6-split-tracking-code / S4-split-display.
