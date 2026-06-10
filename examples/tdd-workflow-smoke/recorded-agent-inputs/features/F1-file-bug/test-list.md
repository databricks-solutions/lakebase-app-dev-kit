# Test List: F1-file-bug

**Ordered for:** design-momentum

**Rationale:** Interface decisions (form UI and API data contract) are established first to settle the design. Happy path tests follow to validate the skeleton through all layers. Validation and NFR fitness tests conclude the list.

## Tests

| ID | Description | AC | Status |
|---|---|---|---|
| T1 | Create bug form is displayed with title and description input fields when app loads | create-form-displays | pending |
| T2 | Bug record is created with status='open' when valid title and description are submitted to the API | bug-created-with-open-status | pending |
| T3 | Title input field captures and displays text entered by the user | form-accepts-title | pending |
| T4 | Description input field captures and displays text entered by the user | form-accepts-description | pending |
| T5 | Form submission with valid title and description triggers API request and processes without validation errors | form-submission-succeeds | pending |
| T6 | User is redirected to bug detail page at /bugs/{id} after successful bug creation | redirect-to-detail-page | pending |
| T7 | API rejects attempt to create bug with invalid status value and does not persist the record | bug-created-with-open-status | pending |
| T8 | Form submission with empty title returns validation error message that names the 'title' field | form-submission-succeeds | pending |
| T9 | Form submission with empty description returns validation error message that names the 'description' field | form-submission-succeeds | pending |

## Deferred

None.

## NFRs Covered

- **nfr-valid-status-enforcement (R2):** T2 and T7 ensure bug status is always 'open' and invalid statuses are rejected at write time.
- **nfr-clear-error-messages:** T8 and T9 verify validation errors name the offending field rather than generic messages.
