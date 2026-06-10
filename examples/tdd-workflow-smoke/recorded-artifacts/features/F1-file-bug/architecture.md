# Architecture: File a Bug in the Browser

## Summary

Story S1-create-bug spans three layers: API (form delivery), E2E (form interaction and submission), and Application/Domain (bug persistence and state validation). AC1 is API-layer (form served by HTTP); AC2-4 are E2E (require browser, database, and full user flow). Cross-cutting concerns: client-side validation (AC2, pages/CreateBugForm), server-side validation and error clarity (AC3, API middleware/BugService), status-field validation per R2 (AC4, BugService/BugRepository).

## Architectural Concerns Mapping

| Concern | Owner | Layer | S1 ACs Touched |
|---------|-------|-------|---|
| Client-side validation | pages/CreateBugForm | Presentation | AC2 |
| Server-side validation (title, description) | BugService + API middleware | Application | AC3 |
| Status field validation (R2) | BugService + BugRepository | Application/Infra | AC3, AC4 |
| Error message clarity | API middleware (validation handler) | API | AC3 |
| Transaction management (bug creation) | BugService | Application | AC3 |

## Pattern Proposals

- **BugService**: Encapsulate bug creation logic (title, description, status) and status-field validation per R2. Depends on BugRepository for persistence.
- **BugRepository**: Data access layer for bug CRUD. Enforces status is one of recognized states before write (defensive programming per R2).
- **API error middleware**: Catch validation errors and format as clear, specific messages naming the offending field/value (per nfrs preference).

## Risks

- **Status field not validated before storage**: If BugService or BugRepository doesn't enforce the status enum/allowed values, an invalid status could be stored, violating R2. Mitigation: add database constraint and repository-level validation.
- **Client-side validation mismatch**: Client and server may have different validation rules (e.g., title length). Mitigation: server is the source of truth; client is for UX only.
- **No migration handling for schema changes**: If future stories add columns (e.g., owner, assignee) without careful migration, existing bugs may break (R1 violation). Mitigation: schema migrations must be tested against seeded data from S1.

## Decisions

- **Form framework choice**: Use React for the create form (pages/CreateBugForm) with form state management (useState or reducer). Recommendation: local state (useState) is sufficient for S1; consider Formik or React Hook Form if validation rules become complex in future stories.
- **API POST endpoint shape**: POST /bugs with JSON body `{ "title": string, "description": string }` returns `{ "id": number }` or `{ "bugId": number }` and HTTP 201/redirect. Recommendation: return 201 with redirect-location header pointing to /bugs/{bugId}; test that browser follows redirect.
- **Status field initialization**: Newly created bugs always have status "open" (hardcoded in BugService, not from user input). Recommendation: hardcoded is correct for S1; R2 ensures only "open" or other recognized states are allowed.

## Test Strategy

Acceptance tests are REAL integration tests against the paired Lakebase branch database. For Python (pytest-bdd, Gherkin `.feature` files under `tests/features/`, step definitions in `tests/step_defs/test_*.py`, shared fixtures + FK-aware seed/teardown in `tests/conftest.py`):

1. Alembic migrations are applied to the Lakebase branch before tests run.
2. Each scenario creates its own test data via fixtures, exercises the running app (browser Selenium/Playwright + HTTP API), and cleans up with targeted, FK-aware DELETEs keyed on the test's own data.
3. ACs verified by this suite: AC1 (form loads), AC2 (form input), AC3 (form submission + redirect), AC4 (bug detail shows status "open").
4. No mocks, stubs, fakes, or in-memory substitutes for the database; the real Lakebase branch is the test database.

## Sign-off

**Recommendation: Proceed.** All four ACs are layered and annotated. NFRs from nfrs.md (R1, R2, preferences) are captured in architecture.json, proposed for HIL acceptance. No blockers identified; risks are mitigated by design patterns and test strategy. Ready for Test Strategist and Navigator to build the pytest-bdd test list.

**Architect Reviewer:** Isaac (agent)  
**Date:** 2026-06-08
