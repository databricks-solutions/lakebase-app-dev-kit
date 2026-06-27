Given: A stock record already exists for SKU=X and location=Y with quantity Q1
When: User submits the form to record stock for the same SKU X at the same location Y with a different quantity Q2
Then: The existing record is updated with the new quantity Q2 and no error message is shown

**Independence from prior ACs:** Tests collision resolution (duplicate prevention) independent of normal creation. AC2 covers new record creation; AC4 covers the constraint that (SKU, location) pairs are unique and resolved via update, never duplicate.
