# StockFlow Information Architecture

## Screens

### S-HOME: Stock-by-Location Table (Home)

**Route:** `/`
**Purpose:** The primary daily-driver view. A calm, scannable table of every `(sku, location)` stock record in the warehouse. Inventory managers and warehouse operators use this to see what is on the shelves at a glance.

**Content:**
- Navbar with StockFlow logo, nav links (Home, Receive, Pick)
- Page title "Inventory"
- Stock table: columns SKU, Location, Qty (right-aligned, tabular mono), Stock State pill, Tracking Code; row hover highlight
- Empty state when no stock records exist: "No stock at this location / Receive an inbound shipment to start tracking..."
- Search/filter input above table (filter by SKU or location)
- "Receive Inbound" primary CTA button (links to S-RECEIVE)

**Testids:**
- `data-testid="navbar"`
- `data-testid="stock-table"`
- `data-testid="stock-table-empty"`
- `data-testid="stock-search-input"`
- `data-testid="btn-receive-inbound"` (primary CTA)
- `data-testid="stock-row"` (one per row; each also carries `data-sku` and `data-location`)

**Feedback region:** `role="alert"` or `data-testid="page-error"` for page-load failures.

---

### S-SKU-DETAIL: SKU Detail View

**Route:** `/sku/:skuId`
**Purpose:** Shows one SKU's stock across all its warehouse locations, including its tracking code. Used by inventory managers to investigate a specific product.

**Content:**
- Page title: SKU code + name
- Stock-by-location list (card per location): location name, quantity, stock state pill, tracking code; "not tracked" shown explicitly for optional fields (e.g. par level) that have no value -- never blank
- "Adjust" action button per location row (links to S-ADJUST with context)
- "Receive Inbound" primary CTA (links to S-RECEIVE with SKU pre-filled)
- Back link to Home

**Testids:**
- `data-testid="sku-detail-page"`
- `data-testid="sku-detail-location-row"` (one per location)
- `data-testid="sku-tracking-code"`
- `data-testid="btn-adjust"` (per row)
- `data-testid="btn-receive-for-sku"` (page-level CTA)
- `data-testid="page-error"` for page-load failures

---

### S-ADJUST: Stock Adjustment Form

**Route:** `/sku/:skuId/location/:locationId/adjust`
**Purpose:** Corrects the quantity of one `(sku, location)` record. Used when a physical count disagrees with the system. Quantity can never go below zero.

**Content:**
- Page title "Adjust Stock"
- Read-only context: SKU, Location
- Quantity field (new value or delta -- V1: absolute corrected value), label always visible
- Reason field (optional text), label always visible
- "Save Adjustment" primary CTA (brand-red, sharp corners)
- "Cancel" secondary link back to SKU detail
- Inline validation: shown directly below the offending field, names the field (e.g. "Quantity: cannot go below zero")
- Success: navigate to SKU detail page (navigation is feedback) + inline green flash

**Testids:**
- `data-testid="adjust-form"`
- `data-testid="adjust-qty-input"`
- `data-testid="adjust-reason-input"`
- `data-testid="btn-save-adjustment"` (primary CTA)
- `data-testid="adjust-error"` (`role="alert"`, inline validation banner)
- `data-testid="field-error-qty"` (field-level message)

---

### S-RECEIVE: Inbound Receipt Form

**Route:** `/receive`
**Purpose:** Records an inbound receipt from a supplier. Increases stock at the chosen location. Used by warehouse operators when a delivery arrives.

**Content:**
- Page title "Receive Inbound"
- Supplier field (free text or select), label always visible
- SKU field (text / scan input), label always visible
- Quantity field (positive integer), label always visible
- Location field (select or scan), label always visible
- Scan zone component (dashed border, scan icon) -- barcode scan auto-fills SKU
- "Save Receipt" primary CTA
- "Cancel" secondary link back to Home
- Inline validation: below offending field, naming it (e.g. "SKU: not found", "Quantity: must be greater than zero")
- Success: confirmation screen (S-RECEIPT-CONFIRM) or navigation to Home + success toast

**Testids:**
- `data-testid="receive-form"`
- `data-testid="receive-supplier-input"`
- `data-testid="receive-sku-input"`
- `data-testid="receive-qty-input"`
- `data-testid="receive-location-input"`
- `data-testid="receive-scan-zone"`
- `data-testid="btn-save-receipt"` (primary CTA)
- `data-testid="receive-error"` (`role="alert"`)
- `data-testid="field-error-sku"`
- `data-testid="field-error-qty"`
- `data-testid="field-error-location"`

---

### S-RECEIPT-CONFIRM: Receipt Confirmation

**Route:** `/receive/confirm` (or redirect with state)
**Purpose:** Confirms a successful inbound receipt. Shows what was received, where it landed, and the updated stock level. The explicit success acknowledgement required by the feedback contract.

**Content:**
- Success icon + heading "Receipt Recorded"
- Summary: Supplier, SKU, Quantity received, Location, New stock level
- "Receive Another" secondary button (back to S-RECEIVE)
- "Go to Home" link

**Testids:**
- `data-testid="receipt-confirm-page"`
- `data-testid="receipt-confirm-summary"`
- `data-testid="btn-receive-another"`

---

### S-PICK: Outbound Pick Form

**Route:** `/pick`
**Purpose:** Records an outbound pick for a customer order. Decreases stock at the chosen location. Rejects picks that would overcommit available stock.

**Content:**
- Page title "Pick Stock"
- SKU field (text / scan), label always visible
- Location field (select or scan), label always visible
- Quantity field (positive integer), label always visible -- after SKU + location are resolved, shows current available qty as helper text
- Scan zone component (barcode scan auto-fills SKU)
- "Save Pick" primary CTA
- "Cancel" secondary link back to Home
- Inline validation: below offending field, naming it (e.g. "Quantity: only 3 available at A-12", "SKU: not found")
- Success: confirmation screen (S-PICK-CONFIRM)

**Testids:**
- `data-testid="pick-form"`
- `data-testid="pick-sku-input"`
- `data-testid="pick-location-input"`
- `data-testid="pick-qty-input"`
- `data-testid="pick-available-qty"` (helper text showing current available)
- `data-testid="pick-scan-zone"`
- `data-testid="btn-save-pick"` (primary CTA)
- `data-testid="pick-error"` (`role="alert"`)
- `data-testid="field-error-qty"`
- `data-testid="field-error-sku"`

---

### S-PICK-CONFIRM: Pick Confirmation

**Route:** `/pick/confirm`
**Purpose:** Confirms a successful outbound pick. Closes the pick loop with an explicit acknowledgement.

**Content:**
- Success icon + heading "Pick Recorded"
- Summary: SKU, Quantity picked, Location, Remaining stock level
- "Pick Another" secondary button
- "Go to Home" link

**Testids:**
- `data-testid="pick-confirm-page"`
- `data-testid="pick-confirm-summary"`
- `data-testid="btn-pick-another"`

---

## Navigation

**Navbar** (persistent across all screens, height 64px):
- Logo (Databricks spark mark, brand red) + "StockFlow" wordmark
- Nav links: Home (`/`), Receive (`/receive`), Pick (`/pick`)
- Active link: brand-red indicator (underline or left border)
- `data-testid="navbar"`, `data-testid="nav-link-home"`, `data-testid="nav-link-receive"`, `data-testid="nav-link-pick"`

**Routing model (React Router):**

```
/                              -> S-HOME
/sku/:skuId                    -> S-SKU-DETAIL
/sku/:skuId/location/:locId/adjust -> S-ADJUST
/receive                       -> S-RECEIVE
/receive/confirm               -> S-RECEIPT-CONFIRM
/pick                          -> S-PICK
/pick/confirm                  -> S-PICK-CONFIRM
```

**Entry points:**
- Home is the default landing screen.
- "Receive Inbound" CTA on Home and SKU Detail opens S-RECEIVE.
- "Pick" nav link opens S-PICK.
- Clicking a stock row on Home navigates to S-SKU-DETAIL for that SKU.
- "Adjust" per-row button on SKU Detail opens S-ADJUST with context pre-filled.

---

## User Flows

### Flow 1: View stock at a location (F1-S2, F1-S3)

1. Operator lands on **S-HOME** (stock table).
2. Scans or types in the search input to filter by location or SKU.
3. Sees matching rows with quantities and stock-state pills.
4. Clicks a row to open **S-SKU-DETAIL**.
5. Reviews stock across all locations for that SKU, sees tracking code.
6. If a field has no data (e.g. par level), sees "not tracked" -- never blank.
7. Empty location: sees "No stock at this location" empty state on Home.

*Seeds E2E scenario: "stock table displays correct quantities by location".*

### Flow 2: Record a stock adjustment (F2)

1. From **S-SKU-DETAIL**, operator clicks "Adjust" on a location row.
2. **S-ADJUST** opens with SKU and location pre-filled.
3. Operator enters corrected quantity and optional reason.
4. Submits: if quantity >= 0, success -> navigate back to S-SKU-DETAIL (navigation is feedback).
5. If quantity would go negative: inline error below qty field naming it; form stays open.
6. No silent failure; no blank response.

*Seeds E2E scenario: "adjustment rejected when quantity would go below zero".*

### Flow 3: Receive an inbound shipment (F3)

1. Operator clicks "Receive Inbound" on **S-HOME** or **S-SKU-DETAIL**, or clicks nav "Receive".
2. **S-RECEIVE** opens.
3. Operator scans barcode (scan zone flashes green on success) or types SKU, selects supplier, quantity, location.
4. Submits: on success -> **S-RECEIPT-CONFIRM** showing summary + new stock level.
5. On failure (unknown SKU, zero quantity, missing location): inline field-level error, form stays open, user sees exactly which field failed.
6. Operator can click "Receive Another" to loop.

*Seeds E2E scenario: "inbound receipt increases stock level at the chosen location".*

### Flow 4: Pick stock for an order (F4)

1. Operator clicks "Pick" in navbar.
2. **S-PICK** opens.
3. Operator scans barcode or types SKU, selects location, enters quantity; available qty shown as helper text.
4. Submits: on success -> **S-PICK-CONFIRM** showing summary + remaining stock.
5. On overcommit (requested > available): inline error below qty field: "Quantity: only N available at LOCATION"; form stays open.
6. On unknown SKU or non-positive quantity: inline error names the field.

*Seeds E2E scenario: "pick rejected when quantity exceeds available stock".*

### Flow 5: Barcode scan on warehouse floor (cross-cutting)

1. On S-RECEIVE or S-PICK, operator uses a barcode scanner (keyboard wedge input to the scan zone).
2. Successful scan: scan zone flashes green, SKU field populates, focus moves to next field.
3. Failed scan (unknown barcode, locked SKU): scan zone flashes red, persistent error toast appears (user must dismiss).
4. Operator corrects and retries or types manually.

*Seeds E2E scenario: "barcode scan failure shows persistent error toast and red flash".*
