Given: Form is submitted with a tracking code value in the inventory_code field
When: Record is saved to the database
Then: The tracking code is stored with the record and can be retrieved without loss or truncation

**Independence from prior ACs:** Tests complete data integrity of the tracking code field independent of other record fields. AC2 verifies the basic record is created; AC5 specifically verifies the tracking code is preserved end-to-end.
