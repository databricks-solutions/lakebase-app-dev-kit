# StockFlow Information Architecture

Project-level IA for the StockFlow single-page application. Screens
map to stories; `data-testid` seams named here are the contract the
E2E layer selects against and the adherence gate's
`checkRequiredSeams` verifies are actually rendered.

## Screens

### Home / Stock by Location (built: S2-stock-by-location-home)

The entry screen. A calm, scannable table of stock-by-location: SKU,
location, quantity (right-aligned, tabular figures). Shows an explicit
empty state, never a blank page, when there is no stock.

- `data-testid="stock-home-screen"` - screen root.
- `data-testid="stock-table"` - the table, present when there is >=1 record.
- `data-testid="stock-table-row"` - one per `(sku, location)` record;
  the click/tap target that opens SKU detail.
- `data-testid="stock-table-empty"` - the explicit empty state
  ("No stock at this location, receive an inbound shipment"), rendered
  in place of the table when there are zero records.
- `data-testid="record-stock-cta"` - the entry point into the record
  form (primary button, brand-red, sharp corners).

### Record Stock (built: S1-record-stock)

A form for filing a SKU's quantity and combined `inventory_code` at a
location. Re-filing the same `(sku, location)` updates the existing
record (last write wins) rather than duplicating or erroring, per the
Gate 1 resolution on record-stock's open question 3.

- `data-testid="record-stock-form"` - the form root.
- `data-testid="record-stock-field-sku"`,
  `data-testid="record-stock-field-location"`,
  `data-testid="record-stock-field-quantity"`,
  `data-testid="record-stock-field-inventory-code"` - labeled inputs.
- `data-testid="record-stock-field-error-<field>"` - inline validation,
  naming the field it belongs to (e.g.
  `record-stock-field-error-quantity`).
- `data-testid="record-stock-success"` - the save confirmation view.

### SKU Detail (built: S3-sku-detail)

A single SKU's stock across all its locations: quantity per location,
the combined `inventory_code`, and par level shown as "not tracked"
(V1 does not track par level as real data).

- `data-testid="sku-detail-screen"` - screen root.
- `data-testid="sku-detail-location-row"` - one row per location the
  SKU is held at.
- `data-testid="sku-detail-inventory-code"` - the combined tracking
  code, rendered in `font_mono`.
- `data-testid="sku-detail-par-level-not-tracked"` - the explicit "not
  tracked" state for the untracked optional field.

### Adjust Stock (planned, not yet specced beyond record-stock's write-time collision resolution)

A lighter-weight form to change an existing record's quantity in
place (distinct from re-filing via Record Stock). Anticipated by
`product-overview.md`'s V1 goals ("count what is on the shelf, and
reconcile"); no story exists yet. When specced, it inherits the same
inline-validation and no-silent-failure rules as Record Stock, with an
inline `success` flash rather than a full confirmation screen (per the
brief's Interaction and feedback section).

### Receive (planned)

Records an inbound receipt: a known supplier delivers a known
quantity, stock goes up at a chosen location
(`product-overview.md`, What they need to accomplish). No story exists
yet; when specced, it is the target of the home screen's empty-state
copy ("receive an inbound shipment").

### Pick (planned)

Records an outbound pick against a customer order, drawing stock down
at a chosen location, with the system refusing to overcommit
(`product-overview.md`, What they need to accomplish). No story exists
yet; overcommit is shown as an inline validation error naming the
field, per the brief.

### Search (planned)

A way to jump directly to a SKU or location without scanning the home
table, named in `design-brief.md`'s UI delivery summary. No story
exists yet.

## Navigation

- Client-side routed via React Router, no full-page reloads
  (`product-overview.md`, How it is delivered).
- Entry point: **Home** (`/`). Loads the stock-by-location table (or
  its empty state) on first paint.
- **Home -> SKU Detail**: selecting a `stock-table-row` navigates to
  that SKU's detail screen (per the Gate 1 resolution on
  S1-record-stock/S2's open question 4: row selection opens detail).
  Route shape: `/sku/:sku`.
- **Home -> Record Stock**: the `record-stock-cta` primary button
  navigates to the record form. Route shape: `/record`.
- **Record Stock -> Home (or Detail)**: on `record-stock-success`, the
  operator returns to Home (the table now reflects the new/updated
  record) or, alternatively, to that SKU's Detail screen; this exact
  post-save destination is an open UX decision for the PO, not yet
  resolved, flagged here rather than guessed.
- **Home -> Receive / Pick / Adjust / Search** (planned): these
  screens do not exist yet; when specced they hang off Home (and
  likely SKU Detail) as their own primary-button entry points,
  following the same pattern as Record Stock.
- No persistent top navbar is specced yet; the small screen count
  (Home, Detail, Record, and future Receive/Pick/Adjust/Search) may
  not need one. If a persistent navbar is added later, it takes
  `theme.css`'s 64px navbar height and navy/warm-oat palette
  unchanged, per the Databricks-brand default
  (`STYLE_GUIDE.md`, Layout).

## User flows

1. **View stock by location** (S2). Operator opens the app -> Home
   loads -> sees `stock-table` populated, or `stock-table-empty` if
   there is no stock yet. Seeds the E2E scenario: "home shows stock by
   location, or an explicit empty state."
2. **Record a SKU's stock** (S1). Operator on Home taps
   `record-stock-cta` -> fills SKU, location, quantity,
   `inventory_code` on `record-stock-form` -> submits -> sees
   `record-stock-success`, or an inline `record-stock-field-error-*`
   naming the invalid field. Re-filing the same `(sku, location)`
   updates the existing record rather than erroring or duplicating.
   Seeds the E2E scenario: "operator records stock and gets a save
   confirmation; re-filing the same pair does not duplicate."
3. **View a SKU's detail** (S3). Operator on Home taps a
   `stock-table-row` -> `sku-detail-screen` loads -> sees per-location
   quantities, the `sku-detail-inventory-code`, and
   `sku-detail-par-level-not-tracked` in place of a blank par-level
   region. Seeds the E2E scenario: "SKU detail shows stock per
   location, its tracking code, and 'not tracked' for par level."
4. **Receive / Pick / Adjust / Search** (planned, not yet specced).
   Future flows anticipated by `product-overview.md`'s V1 goals: an
   inbound receipt raising stock at a location, an outbound pick
   lowering it without overcommitting, an in-place quantity
   adjustment, and a direct search to a SKU or location. These will
   seed their own E2E scenarios once specced as features.
