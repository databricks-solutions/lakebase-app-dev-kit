Given: Form submission succeeds and record is saved
When: The server returns a successful save response
Then: User sees a confirmation message indicating the stock record was successfully saved

**Independence from prior ACs:** Tests user feedback independent of record persistence. AC2 verifies the record is created; AC3 verifies the user is informed of success via visible confirmation.
