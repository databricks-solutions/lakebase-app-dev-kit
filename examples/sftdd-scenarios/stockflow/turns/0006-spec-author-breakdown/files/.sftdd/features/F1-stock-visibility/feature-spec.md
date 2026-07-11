# Record and view stock by SKU and location

## Summary

The foundational capability of StockFlow: record what stock a SKU holds
at a physical location and read it back through the SPA. Each
`(sku, location)` pair is a single uniquely addressable record carrying a
quantity and one combined `inventory_code` (location + batch + serial).
This is read-and-record only; adjusting quantities and receiving inbound
goods are separate features.

## Stories

- **S1-record-stock** – An operator files a SKU's stock at a location
  (quantity + `inventory_code`) through a form and gets a save
  confirmation; re-filing the same `(sku, location)` resolves the
  collision at write time instead of creating a duplicate or erroring.
- **S2-stock-by-location-home** – The home screen shows a calm,
  scannable stock-by-location table (SKU, location, quantity
  right-aligned), with an explicit empty state instead of a blank page.
- **S3-sku-detail** – A SKU detail view shows that SKU's stock across
  its locations including the tracking code, with untracked optional
  detail (par level) shown as a clear "not tracked".

## Out of scope

- Adjusting quantities on an existing stock record (its own feature).
- Receiving inbound goods / recording receipts (its own feature).
- Splitting `inventory_code` into separate location / batch / serial
  fields (a later iteration; V1 stores and shows one combined code).
- Tracking par level as real data (V1 shows it as "not tracked" only).
- Multi-warehouse operation across warehouses.

## Open questions

Boundary questions for the PO to decide at Gate 1. Recommended
resolutions are recorded for headless proxy approval; they are not
final until signed off.

1. Is `location` free-text entered at record time, or chosen from a
   controlled set of known locations? *Recommend: free-text string in
   V1; a location master is a later feature.*
2. Is there a SKU master, or is `sku` free-text entered on the record
   form? *Recommend: free-text string in V1; no SKU master yet.*
3. When re-filing an existing `(sku, location)`, the request says
   "resolve the collision at write time, never store a duplicate" while
   quantity adjustment is out of scope. Does re-filing overwrite the
   record's quantity/`inventory_code`, or is the second write rejected
   in-place? *Recommend: the write updates the existing record's fields
   (last write wins) rather than erroring; this is collision resolution,
   not the separate quantity-adjustment feature.*
4. How does the operator navigate from the home table to a SKU detail
   view? *Recommend: selecting a table row opens that SKU's detail.*
5. Does the home table show one row per `(sku, location)` record, or one
   aggregated row per location? *Recommend: one row per
   `(sku, location)` record.*
