# S1-record-stock

**As a** warehouse operator
**I want to** file a SKU's stock level at a physical location through a
form, capturing its quantity and combined `inventory_code`
**So that** what is on the shelf is recorded once per `(sku, location)`
with no duplicate and no error page.

E2E (UI) story: the operator interacts with a record-stock screen and
sees a save confirmation. Re-filing the same `(sku, location)` resolves
the collision at write time.
