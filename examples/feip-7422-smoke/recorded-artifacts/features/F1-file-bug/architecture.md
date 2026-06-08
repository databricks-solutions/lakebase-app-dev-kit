# Architecture (F1 - File a Bug)

## Layer Assignments Summary

All acceptance criteria for S1-file-bug are tagged as **E2E** (end-to-end), as the story explicitly exercises the user interface through the browser form, followed by backend processing and database persistence. The ACs span multiple layers:

- **Presentation/API layer**: AC1-3 (form rendering, input handling, submission)
- **Application/Service layer**: AC4-6 (bug creation, ID assignment, status initialization)
- **Infrastructure layer**: AC5-6 (ID generation via database auto-increment, status persistence)

ACs 1-3 verify the frontend form behavior; ACs 4-7 verify the end-to-end flow from form submission through database persistence to UI navigation.

## Architectural Concerns Mapping

| Concern | Category | Owner Layer | Rationale | Implementation |
|---------|----------|-------------|-----------|-----------------|
| Input Validation | Security | API/Application | Validate title and description format and length at request boundary | API handler validates, application service enforces business rules |
| Audit Logging | Observability | Application | Log bug creation events (who, what, when) for compliance and debugging | BugService calls AuditLogger.log_bug_created() after transaction commits |
| Transaction Integrity | Resilience | Application | Ensure bug, its ID, and initial status are persisted atomically | BugService.create_bug() wraps create + ID assignment + status set in a transaction |
| Status Validation | Security | Domain | Enforce that only recognized status values (open, closed, etc.) are stored | Bug domain model has status enum; repository rejects unrecognized values on write |
| Error Messages | Observability | API | Return specific error messages that name the offending value | API handler catches validation errors and returns 400 with the field name and value |
| ID Generation | Infrastructure | Infrastructure | Assign unique numeric IDs to bugs | Database table uses auto-increment primary key; BugService returns ID to caller |
| No Auth/Authz | Compliance | N/A | Per HIL brief, no authentication or authorization for this smoke | Not implemented; feature is admin-only for the smoke |

## Pattern Proposals

### Module Structure

The application will adopt a layered architecture with the following modules:

1. **Frontend (Presentation Layer)**
   - `CreateBugForm` (component): renders the form, manages user input state, calls the backend API
   - `Router` (navigation): navigates to `/bugs/{bug_id}` on successful creation

2. **Backend API (Presentation Layer)**
   - `POST /bugs` handler: accepts form submission, validates input, calls BugService
   - `GET /bugs/{id}` handler: fetches a bug (for detail page, story S2)

3. **Application/Service Layer**
   - `BugService`: implements create_bug(), delete_bug() (future), list_bugs() (future)
   - `AuditLogger`: centralized logging for bug creation, modification, deletion events
   - Request/response models: define and validate the shape of API requests and responses

4. **Domain Layer**
   - `Bug` entity: bug ID, title, description, status, created_at
   - `BugStatus` enum: defines recognized values (open, closed, in_progress, etc.)
   - Invariants: status is always one of the recognized values; title and description are non-empty

5. **Infrastructure Layer**
   - `BugRepository`: database queries (find_by_id, create, update)
   - Database schema: `bugs` table with columns (id, title, description, status, created_at, updated_at)
   - Alembic migration: initial schema creation with id as auto-increment primary key

### SOLID Principles Applied

- **Single Responsibility**: BugService owns bug creation logic; AuditLogger owns logging; Bug model owns status invariants.
- **Dependency Inversion**: API handler depends on BugService interface, not implementation; BugService depends on BugRepository interface, allowing future database swaps.
- **Interface Segregation**: API handler exposes a minimal request schema (title, description); BugService returns only the created bug (no internal state).

## Risks

1. **ID generation and uniqueness**: Auto-increment IDs are database-specific. If future work requires swapping databases, ID generation strategy may need to change. Mitigation: encapsulate ID generation in the infrastructure layer (BugRepository) so the application layer is unaware of the strategy.

2. **Status value expansion**: The domain currently defines a fixed set of status values (open, closed). Future stories may add new statuses (on_hold, waiting_for_info, etc.). Adding new statuses requires a migration and may impact existing queries. Mitigation: introduce a status lookup table in future iterations and reference it by foreign key, rather than hardcoding status strings.

3. **Audit logging performance**: Synchronous audit logging during form submission may add latency. If the audit log becomes a bottleneck, consider async logging (message queue) in a future iteration. For now, logging is synchronous and acceptable for a smoke.

4. **No API versioning**: The API is new and has no versioning strategy. Future changes to the request/response schema may break clients. Mitigation: add API versioning (e.g., /api/v1/bugs) in the next feature to enable safe evolution.

## Decisions

### Uniqueness of Bug IDs: Auto-increment vs. UUID

**Decision**: Use database auto-increment for bug IDs.

**Rationale**: Auto-increment is simple, database-provided, and familiar to users (bug IDs are small integers like #42). UUIDs are more distributed-system-friendly but harder for users to remember or share verbally. For a smoke in a single-database context, auto-increment is appropriate.

**Recommendation to PO**: Accept auto-increment. If future stories require distributed ID generation (e.g., multi-region), revisit this decision.

### Status Enum Location: Domain vs. Application

**Decision**: Status enum is defined in the Bug domain model (Infra: ORM field constraint + Enum class).

**Rationale**: Status is a core business concept; it should live in the domain, not scattered across the codebase. The Bug model is the authoritative definition of valid statuses.

**Recommendation to PO**: Accept. This enables the domain to enforce status invariants and makes the codebase easier to understand.

### Synchronous vs. Asynchronous Audit Logging

**Decision**: Audit logging is synchronous (application layer calls AuditLogger.log_bug_created() before returning).

**Rationale**: Smoke scope is small; async logging adds complexity. Synchronous logging is acceptable for now.

**Recommendation to PO**: Accept. If observability becomes a bottleneck in later features, migrate to async logging (e.g., Kafka, SQS).

## Test Strategy

Acceptance tests for S1-file-bug are **REAL integration tests against the real paired Lakebase branch database**, not mocked or in-memory substitutes.

### Test Framework & Approach

- **Framework**: pytest-bdd (Gherkin `.feature` files + Python step definitions)
- **Feature files**: `.tdd/features/F1-file-bug/tests/features/file_bug.feature`
- **Step definitions**: `tests/step_defs/test_file_bug.py`
- **Fixtures**: `tests/conftest.py` (shared database setup, FK-aware teardown)

### Test Lifecycle

1. **Setup**: Alembic migrations are applied to the paired Lakebase branch database before tests run (`alembic upgrade head`).
2. **Test execution**: Each Gherkin scenario in `file_bug.feature` is executed against the real database:
   - `Given a user navigates to the application` (start the test browser/API client)
   - `When the page loads` (load the form or call the API)
   - `Then a form is displayed...` (assert the form is present)
3. **Cleanup**: After each scenario, targeted DELETE statements remove only the test's own data (e.g., the bugs created during the test), keyed on a test ID or the specific bug title. Foreign-key constraints are respected (delete bugs before their cascading references).

### ACs Covered by Real-DB Behavior Tests

All 7 ACs for S1-file-bug are verified through this pytest-bdd test suite:
- **AC1**: pytest-bdd steps verify form elements exist (by ID or CSS selector)
- **AC2**: pytest-bdd steps verify form input state (enter text, assert it is displayed)
- **AC3**: pytest-bdd steps verify form submission is initiated (click button, assert POST request is made)
- **AC4**: pytest-bdd steps verify the bug is persisted in the real database with correct title/description (query the bugs table)
- **AC5**: pytest-bdd steps verify the bug has a unique numeric ID (query the database, assert ID is non-null and unique)
- **AC6**: pytest-bdd steps verify the bug's status is 'open' (query the database, assert status = 'open')
- **AC7**: pytest-bdd steps verify the browser navigates to /bugs/{id} (assert URL in browser history or response header)

### No Mocks, Stubs, or Fakes

The test suite **does not mock the database, ORM, API client, or any service layer**. All tests exercise the real application against a real Lakebase database branch. This ensures that:
- Schema mismatches between code and database are caught (not hidden by mocks).
- Data persistence bugs (e.g., missing columns, type mismatches) are caught.
- Transaction semantics are tested (atomicity, isolation) against the real database.

## Sign-off

**Architect recommendation**: Proceed to the next phase (Test-list construction).

**Rationale**: All ACs are tagged with layers and assigned to owning modules. NFRs cover the HIL's Required items (R1 data durability, R2 status validation) and Preferences (error messages, additive migrations). The layered architecture respects SOLID principles and the canon. Risks are identified and mitigated. The test strategy specifies real-DB pytest-bdd tests, not mocks. The design is ready for the Test Strategist to construct the ordered test list.

**Architect identity**: Claude (Architect Reviewer, role 2 of 6)

**Date**: 2026-06-08
