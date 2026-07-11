# Split the combined tracking code into batch and serial columns

## Summary

The V1 `inventory_code` from F1 bundles location, batch, and serial into
one opaque hyphen-delimited string, so batch and serial cannot be queried
or validated on their own. This feature is the canonical schema refactor:
a reversible migration pulls `batch_number` and `serial_number` out into
first-class columns, backfills them by delimiter from the existing codes,
and retires the combined column, while every existing stock row survives.
The warehouse operator then sees batch and serial as distinct, separately
addressable fields wherever the combined code was shown before.

## Stories

- **S1-split-schema-migration** - a reversible migration adds
  `batch_number` and `serial_number` columns, backfills them by splitting
  the existing `inventory_code` on `-` (segment 2 batch, segment 3
  serial), leaves nonconforming codes NULL rather than guessing, drops the
  combined column, and surfaces the count of nonconforming rows for review.
  Not user-facing; proven by the parent-aware schema diff plus the
  integrity-probe count on the paired Lakebase branch.
- **S2-detail-view-split-fields** (E2E / UI) - the SKU detail view renders
  batch and serial as distinct, separately labelled fields in place of the
  opaque combined code, with an explicit "none" state where a row's batch
  or serial is NULL.

## Out of scope

- Recreating a `location` column. `location` is already its own column and
  part of `UNIQUE(sku, location)`; it stays canonical and unchanged, and
  the code's leading segment is NOT treated as authoritative for it.
- Fixed-width parsing. The backfill splits only on the `-` delimiter;
  variable-width and short codes (e.g. `X-1`, a bare `c`) are handled by
  leaving the missing segments NULL.
- Guessing or dropping data. No silent data loss or corruption (R1): every
  sprint-1 row survives, and nonconforming codes are left NULL, never
  inferred or discarded.

## Open questions

These seed the Architect's Gate 1 adjudication; they are not resolved here.
Recommended resolutions are recorded for the Human Proxy.

1. Does the F1 record-stock **input form** also need to capture batch and
   serial as distinct inputs (replacing the combined-code field), or does
   this iteration change only how existing and displayed records expose
   them? _Recommended: out of scope this iteration. The request scopes the
   UI change to "wherever the combined code was shown" (display) plus the
   migration; redesigning the capture form is a separate feature._
2. Besides the SKU detail view (F1 S3), was the combined code shown
   anywhere else that must now expose split fields (e.g. the
   stock-by-location home table)? _Recommended: no. The home table shows
   only sku / location / quantity; the SKU detail view is the canonical
   place the code was displayed, so it is the only screen this feature
   changes._
3. For a row whose batch or serial backfilled to NULL, what should the
   detail view show? _Recommended: an explicit "none" state consistent with
   the untracked-field convention in the product overview; do not resurrect
   the dropped combined code in the UI._
