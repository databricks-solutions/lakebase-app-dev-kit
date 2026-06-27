Given: Form is displayed with valid inputs entered (SKU, location, quantity, tracking code)
When: User clicks the submit button
Then: A stock record is created in the database with the submitted values

**Independence from AC1:** Tests data persistence independent of form rendering. AC1 ensures the form exists; AC2 ensures submission actually creates a record in the database.
