# AC4: Created Bug Starts in Open State

Given: the user has just submitted a new bug via the create form
When: the user is redirected to and views the bug detail page at /bugs/{bugId}
Then: the bug's status field displays "open"
