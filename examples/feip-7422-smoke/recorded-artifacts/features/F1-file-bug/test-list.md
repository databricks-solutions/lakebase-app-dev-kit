# Test List: F1-file-bug (File a Bug in the Browser)

**Ordered for**: design-momentum

**Story**: S1-file-bug - File a bug

**Status**: Pending PO sign-off at Gate 3

---

## Ordering Rationale

This list follows **design-momentum ordering**:

1. **Phase 1 (T1-T3): Form Interface Design** forces the frontend contract:
   - What fields exist (title, description)?
   - How is state managed (controlled component)?
   - What triggers submission (button click)?

2. **Phase 2 (T4-T6): Backend Happy-Path Skeleton** forces the application and infrastructure contracts:
   - What endpoint accepts form submission?
   - How is data validated and persisted?
   - How is the ID generated and uniqueness guaranteed?
   - What are the status initialization rules?

3. **Phase 3 (T7): Router Integration** glues the frontend and backend:
   - How does the frontend receive the bug ID and navigate?

This ordering prevents the common pitfall of starting with tests that require three abstractions (API, database, router) before any are invented. Instead, we build the form first (proves the UI contract), then the API/DB (proves the backend contract), then the router (integrates both).

---

## Test List

### T1: Form with title and description fields renders on page load
- **AC**: AC1-form-renders
- **Layer**: E2E (Presentation)
- **Behavioral scenario**: When a user navigates to the application and the page loads, a form is displayed with input fields for bug title and bug description, plus a submit button.
- **NFRs covered**: None directly; prerequisite for T2-T3.
- **Notes**: Exercises the frontend presentation layer (CreateBugForm component). Forces decision: what are the field IDs/selectors, button label, form structure?

### T2: User can enter and retain text in form title and description fields
- **AC**: AC2-form-accepts-input
- **Layer**: E2E (Presentation)
- **Behavioral scenario**: When the create bug form is displayed and the user enters text into the title field and the description field, the entered text is visible and retained in the respective fields.
- **NFRs covered**: None directly; prerequisite for T4.
- **Notes**: Exercises frontend state management. Forces decision: controlled vs. uncontrolled inputs? What is the state shape?

### T3: Form submission is initiated when submit button is clicked
- **AC**: AC3-form-can-be-submitted
- **Layer**: E2E (Presentation)
- **Behavioral scenario**: When the user has entered a title and description in the form and clicks the submit button, the form submission is initiated.
- **NFRs covered**: None directly; prerequisite for T4-T7.
- **Notes**: Exercises form submission event handling. Forces decision: what request method, URL, and content-type? What happens if submission fails?

### T4: Bug is created in database with submitted title and description
- **AC**: AC4-bug-created-with-data
- **Layer**: E2E (Application + Infrastructure)
- **Behavioral scenario**: When a user submits the form with title "Login button broken" and description "Users cannot click the login button on mobile devices", the form submission completes successfully and a bug is created in the system with those exact values.
- **NFRs covered**: NFR-persistence (bug data durably persisted on successful form submission), NFR-error-messages (validation errors should be clear if fields are invalid).
- **Notes**: First end-to-end test through the backend. Exercises BugService.create_bug() and BugRepository.create(). Forces decision: what is the request schema (JSON)? What validation happens? Is the persistence atomic?

### T5: Created bug is assigned a unique numeric identifier
- **AC**: AC5-bug-has-unique-id
- **Layer**: E2E (Infrastructure + Application)
- **Behavioral scenario**: When a bug is created via form submission and the creation completes, the bug is assigned a unique numeric identifier.
- **NFRs covered**: NFR-R1-migration-durability (unique IDs enable bugs to survive migrations), NFR-R2-status-validation (ID uniqueness + status validation ensures data consistency).
- **Notes**: Exercises database auto-increment ID generation in BugRepository and BugService transaction logic. Forces decision: auto-increment or UUID? How is the ID returned to the frontend? Enables T7 (detail page URL generation).

### T6: Created bug's status is initialized to open
- **AC**: AC6-bug-starts-open
- **Layer**: E2E (Domain + Application)
- **Behavioral scenario**: When a bug is created via form submission and the creation completes, the bug's status is set to "open".
- **NFRs covered**: NFR-R2-status-validation (only recognized status values are stored; "open" is one of them).
- **Notes**: Exercises Bug domain model status enum and BugService transaction logic. Forces decision: where is the enum defined? What are all recognized values? How is invalid status rejected at write time?

### T7: User is navigated to bug detail page with correct bug ID in URL after successful submission
- **AC**: AC7-user-navigated-to-detail
- **Layer**: E2E (Presentation + Router)
- **Behavioral scenario**: When a user submits the create bug form and the bug is created successfully, the user's browser navigates to the bug's detail page at URL `/bugs/{bug-id}`, where `{bug-id}` is the numeric identifier of the created bug.
- **NFRs covered**: None directly; completes the user journey from form submission to detail view.
- **Notes**: Final integration test: frontend router receives bug ID from API response and navigates. Forces decision: how is the bug ID passed back (response body field name)? What is the router state management pattern?

---

## Summary

- **Total items**: 7
- **All items pending**: Yes, no items deferred or skipped.
- **Coverage**:
  - All 7 acceptance criteria for S1-file-bug are exercised.
  - NFRs covered: NFR-persistence, NFR-R1-migration-durability, NFR-R2-status-validation, NFR-error-messages (flagged as design smell; see below).
  - Skipped or deferred: None.

## Design Smells and Flags

### Missing AC: Error Message Specificity

**Smell**: NFR-error-messages ("Error messages are clear and specific, naming the offending value") is proposed but no AC exercises it. Current ACs all follow the happy path.

**Impact**: Risk of generic "Bad Request" errors reaching users, violating the NFR.

**Recommendation**: Add an AC to the test list or to a future story that exercises invalid form input (empty title, oversized description) and verifies the error response names the field and the violation (e.g., "Title is required" vs. "Validation failed").

**Status**: Flagged for PO review. Should this be added to S1-file-bug, deferred to a later story, or descoped?

---

## Gate 3: PO Sign-off

**Awaiting approval** from the Product Owner on:

1. The design-momentum ordering above (does it make sense?).
2. Whether the missing error-message AC is a gap (should it be added?).
3. Any items that should be deferred or reordered before design-spec gate.

Once signed off, this list is locked and drives the Navigator's test writing and the Driver's implementation.
