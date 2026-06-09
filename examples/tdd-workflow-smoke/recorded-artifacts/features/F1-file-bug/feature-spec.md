# File a Bug in the Browser

## Summary

A team member can open the app and fill in a short title and longer description on a create form. When they submit, they receive a stable, shareable URL to that bug's detail page (e.g., `/bugs/42`). The detail page shows the bug's title, description, status, and identifier.

## Stories

- S1-create-bug: User can fill in title and description on a form, submit it, and receive a stable URL for the new bug.
- S2-view-bug-detail: User can view a filed bug's detail page showing its title, description, status, and identifier.

## Out of scope

This feature does not include bug list or queue views; the only way back to a bug after filing is via its URL. Editing, deleting, assigning owners, search, filtering, and state management are deferred to later sprints.

## Open questions

1. Is the create form the app's landing page, or accessible at a dedicated route?
2. Are there validation rules for title and description fields (e.g., required fields, maximum length)?
3. After form submission, does the user land directly on the bug detail page, or is there a confirmation screen?
