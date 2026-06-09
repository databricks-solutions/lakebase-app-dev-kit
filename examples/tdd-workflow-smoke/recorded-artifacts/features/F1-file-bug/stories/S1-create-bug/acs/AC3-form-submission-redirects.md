# AC3: Form Submission Redirects to Bug Detail

Given: the user has filled in a title and description on the create form
When: the user clicks the submit button
Then: the form submission is successful and the user is redirected to /bugs/{bugId} where {bugId} is the created bug's numeric ID
