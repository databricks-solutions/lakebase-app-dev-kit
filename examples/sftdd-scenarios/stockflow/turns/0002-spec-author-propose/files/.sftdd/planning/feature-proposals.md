---
author: Spec Author
---

# Feature proposals (StockFlow, next sprint)

Candidate features for the **next coherent usable increment**: the
simplest runnable slice that lets the warehouse team *see and adjust
stock at one warehouse*, per the PO's V1 intent. The PO owns priority
and what gets committed; this is the input to that call. UI track is
ON, so every candidate is framed as a user-facing increment and each
needs an **E2E (UI) story** driving the rendered SPA (Playwright)
against the real paired-branch backend.

## Sprint intent

Land a demonstrable "see and adjust stock" loop: an operator opens the
app, sees stock by location, files a SKU's stock, and adjusts a level
with the row moving in place. Inbound receipts and outbound picks
extend this and are proposed as follow-on candidates so the PO can
pull them in if capacity allows; running the full V1 backlog ahead of
this working slice is deferred.

## Committed-increment candidates (highest priority)

### FP1 - View stock by location
- **Ask:** As an operator, open the app and see a calm, scannable grid
  of stock-by-location (home), and open a SKU to a detail page.
- **Rationale:** Serves the overview's core need "know what they have,
  in what quantity, at which physical location" and delivers R5's SPA
  home + SKU detail routes. Nothing is adjustable until it is visible.
- **Priority:** Must (foundational).
- **E2E (UI) story:** Yes. Browser: load home, see the stock grid;
  empty state ("No stock yet") when there are no records; click a row
  to route to SKU detail with no full-page reload.

### FP2 - File a SKU's stock at a location
- **Ask:** As an operator, file a new stock record: a SKU held at a
  chosen location within one warehouse, addressable by `(sku,
  location)`, including the same SKU at multiple locations.
- **Rationale:** Serves "file, retrieve" stock and the multi-location
  requirement; upholds R3 (`(sku, location)` unique, collision refused
  at write time with a named-field message).
- **Priority:** Must.
- **E2E (UI) story:** Yes. Browser: fill the form (visible labels),
  save, land on a confirmation / see the new row on home; a duplicate
  `(sku, location)` shows an inline validation error naming the field.

### FP3 - Adjust a stock level in place
- **Ask:** As an operator, adjust the quantity of a SKU at a location
  and watch the stock row update in place with a green flash.
- **Rationale:** Completes the "see and adjust" loop and the overview's
  demo bar (scan/adjust, watch the row move); exercises R5 optimistic
  in-place update and R2 (never below zero).
- **Priority:** Must.
- **E2E (UI) story:** Yes. Browser: change a quantity, see the row
  update in place (no page reload) with success feedback; an
  adjustment that would drive stock negative is rejected inline.

## Follow-on candidates (pull in if capacity; else next sprint)

### FP4 - Record an inbound receipt
- **Ask:** As an operator, record that a known supplier delivered a
  known quantity, raising stock at a chosen location.
- **Rationale:** Serves "receive inbound goods and put them somewhere
  recoverable"; distinct behavior from FP3 (supplier + receipt intent,
  stock up), not a bare adjustment.
- **Priority:** High.
- **E2E (UI) story:** Yes. Browser: complete the receipt form, land on
  confirmation, see the raised quantity on home/detail.

### FP5 - Record an outbound pick (no overcommit)
- **Ask:** As an operator, record a customer-order pick that draws
  stock down at a location, with the system refusing to overcommit.
- **Rationale:** Serves "pick without overcommitting"; upholds R2
  (a pick beyond available quantity is rejected at write time).
- **Priority:** High.
- **E2E (UI) story:** Yes. Browser: complete the pick form, see stock
  drawn down; a pick beyond available is rejected inline naming the
  shortfall, with no stored negative.

## Notes for the PO

- Multi-location holding for one SKU is folded into FP1/FP2 (it is the
  `(sku, location)` addressing, not a separate capability).
- The single combined tracking code (location/batch/serial encoded
  together) is the PO's stated V1 simplification; splitting those
  fields is explicitly out of scope for this increment.
- No auth, receipts limited to a manual known-supplier reference, and
  no cycle-count reconciliation yet (later increment).

## Open question for the PO

- Commit FP1-FP3 as this sprint's frozen scope and defer FP4-FP5, or
  pull FP4/FP5 in now? I recommend FP1-FP3 as the demonstrable slice
  and FP4/FP5 next, but the priority call is the PO's.
