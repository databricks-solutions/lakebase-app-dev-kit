---
author: Spec Author
---

# Feature Proposals (Sprint 1)

Candidate features for the next sprint, derived from the Product Owner's growth arc in `product-overview.md`. These are Arc #1: "File, retrieve, and transition a single bug." All are proposed as end-to-end user-facing capabilities (E2E stories). The Product Owner prioritizes and selects which enter the sprint.

## F1: File a bug and retrieve it by stable ID

**One-line ask:** As a developer, I want to file a bug with a title and description, receive a unique ID I can share, and look it up later.

**Rationale:** Enables the core persistence loop. Serves product overview needs: "file a bug with enough detail" and "refer back to a specific bug by a stable identifier they can share." Satisfies NFR R1 (data survives migrations).

**E2E required:** Yes. User interaction: (1) navigate to bug form, (2) enter title and description, (3) submit, (4) see confirmation with bug ID, (5) navigate to that bug by ID and verify details.

**Priority:** High. This is the prerequisite for all downstream capabilities; no bug workflow without filing first.

---

## F2: Transition a bug through agreed states

**One-line ask:** As a developer, I want to move a bug through the team's workflow states (e.g., open to in-progress to closed) so the team knows what stage of work it is in.

**Rationale:** Enables workflow tracking. Serves product overview need: "move a bug through the team's agreed states as work progresses." Satisfies NFR R2 (status is always one of recognized states).

**E2E required:** Yes. User interaction: (1) retrieve a bug, (2) see current status, (3) change status to a different state, (4) verify new status persists when re-opening the bug.

**Priority:** High (Arc #1 completion). Depends on F1 (must have bugs to transition them).

---

## Out of Scope for This Sprint

- **Bug ownership and assignment** (Arc #2) - deferred to Sprint 2, after F1 and F2 are in production use
- **Customizable state lists** (Arc #3) - requires state-table infrastructure; deferred after Arc #2 is proven
- **Separate reproduction details** (Arc #4) - deferred after state management is stable
- **Open-queue list view** (Arc #5, design-brief focus) - deferred after single-bug workflow is solid; the list view is substantial and belongs after core bug CRUD is proven

