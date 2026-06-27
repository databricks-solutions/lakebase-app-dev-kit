# Record and view stock by SKU and location

## Summary

The foundation of inventory visibility: warehouse operators can file a stock record at any physical location for a SKU, and retrieve it via a home screen table or SKU detail view. Each (SKU, location) pair is uniquely tracked, with tracking codes (inventory_code) stored and displayed for full traceability.

## Stories

- S1-record-stock: File a stock record by entering SKU, location, quantity, and tracking code
- S2-home-stock-table: View all current stock in a scannable table organized by location
- S3-sku-detail-view: View a specific SKU's stock across all its locations with tracking codes

## Out of scope

- Adjusting quantities after initial record (that is a separate feature)
- Receiving inbound goods from suppliers (separate feature)
- Picking goods off shelves for orders (separate feature)
- Multi-warehouse support (V1 is single warehouse)
- Par level tracking (optional field shows "not tracked")

## Open questions

- How does the user navigate from the home screen to the SKU detail view? (Direct URL, click SKU name in table, or both?)
- What validation rules apply to form input? (e.g., required fields, numeric format for quantity, maximum code length for tracking code)
- What happens if the user tries to record stock for a location that does not yet exist in the system? (Create it implicitly, or require pre-creation?)
- Should the confirmation message after save include the details of what was saved, or just a simple "saved successfully" message?
