---
name: software-design-principles
description: "Foundational engineering canon – SOLID, DRY, clean code, layered architecture, cross-cutting concerns, NFRs. Imported by workflow skills (lakebase-sftdd-workflows, lakebase-scm-workflows, lakebase-release-workflows). Use when designing a module, reviewing a PR, planning a refactor, mapping cross-cutting concerns to layers, or arguing about API shape."
---

# software-design-principles

The code-level engineering canon. Markdown only, no scripts – consulted, not invoked. Workflow skills cite it; agents and humans read it. Larger scopes live in the sibling skills `architectural-design-principles` (system-level) and `ui-ux-design-principles` (experience-level).

## Architectural concerns mapping (mandatory before promote/merge)

Fill this in for any non-trivial change before calling the design done. An unfilled row, or a concern with no clear owner, is a design smell – resolve it before merging.

| Concern | Layer | Owner module | Cross-cutting? |
|---|---|---|---|
| Authentication | HTTP / boundary | `<module>` | Yes |
| Authorization | Service | `<module>` | Yes |
| Capability resolution | Service | `<module>` | Yes |
| Audit logging | Cross-cutting | `<module>` | Yes |
| Rate limiting | HTTP / boundary | `<module>` | Yes |
| Schema validation | HTTP / boundary | `<module>` | Yes |
| Policy config | Service / config | `<module>` | Yes |
| Domain logic | Service | `<module>` | No |
| Storage | Infrastructure | `<module>` | No |

## References

- [SOLID](references/solid.md) – the five object-design rules.
- [DRY](references/dry.md) – one home for each piece of logic.
- [Clean code](references/clean-code.md) – naming, function shape, comments, error boundaries.
- [Cross-cutting concerns](references/cross-cutting-concerns.md) – which layer owns auth, authz, capability resolution, audit, rate limiting, schema, policy.
- [NFRs](references/nfrs.md) – performance, scalability, security, observability, operability, resilience.

Layered architecture lives in the architectural skill ([reference](../architectural-design-principles/references/layered-architecture.md)).

## Hard rules

1. **Names carry the design.** If a fresh reader can't infer the concept from the name, rename it before the next test.
2. **Layers depend inward.** HTTP -> service -> infrastructure, never the reverse.
3. **One owner per cross-cutting concern.** Overlapping auth/audit logic in two modules is a smell: one owns it, the rest delegate.
4. **No duplicated logic.** Before writing a block, look for an existing copy and extract one shared helper; fix every call site of a bug together.
5. **NFR baseline before done.** Skim performance / scalability / security / observability / operability / resilience.
6. **Public boundary tests, private refactors.** A correct refactor never changes the outer-boundary tests.
7. **No import-time coupling to an optional build artifact.** A module must import in every environment it ships to. An unconditional `StaticFiles` mount / asset read at import scope greens where the artifact exists and crashes everywhere it does not (backend-only tests, CI before the client build, fresh clones). Mount/read it only when present; degrade clearly (a 503 "not built") when absent. The `import-time-build-coupling` smell, enforced by `lakebase-sftdd-imports-clean`.
8. **Tests encode requirements at a point in time; evolution can supersede them.** Requirements accumulate and the latest one wins. When a later AC, story, or feature INTENTIONALLY changes behavior an earlier test asserts , a dropped column, a changed contract, a removed endpoint, a renamed field , that earlier test is *superseded*: it is neither a regression nor a constraint to preserve. Refactor it to the new behavior, or retire it, alongside the change that obsoleted it , across stories and features, not only the one in hand , and never weaken a test or force a green to keep an obsolete assertion alive. A genuine regression is the opposite (still-valid behavior broken by accident: fix the code, keep the test). Telling supersession from regression is required judgment, not a reason to stop; only a real conflict (making the superseded tests current would break a still-valid one) is escalated. Scan for supersession COMPREHENSIVELY, not just the tests that name the changed shape: when a change drops/renames a column, field, table, or endpoint, the superseded set also includes FITNESS / architecture / migration tests that assert a *property* of the now-gone shape , a reversibility check ("after up() then down(), the column is reconstructed"), a schema-shape assertion ("the column exists"), an invariant over the old field. A reversibility/fitness test for a column a later contract step intentionally drops encodes abandoned behavior and is superseded like any other. Missing one leaves the suite red for a reason the change fully intended.
9. **A schema contract change updates the data model AND the code in lockstep.** Dropping a column (or removing/renaming a field, table, or endpoint) is NOT done when the migration is written. In the SAME change you must also remove it from the ORM/model definition, every query that names it, every serializer/DTO, and every template/view , or the running code keeps emitting SQL (or responses) for something the database no longer has, and you get `column ... does not exist` at runtime even though the migration "succeeded". The migration changes the database; the model + queries + views must match it. This is the *contract* half of expand/contract: expand adds the new shape and backfills; contract removes the old shape EVERYWHERE (DB and code together), never just the DB.

## Composition

- **`lakebase-sftdd-workflows`** – Architect Reviewer imports this in per-story review; Navigator in PLAN; Driver in REFACTOR.
- **`lakebase-scm-workflows`** – PRs reviewed against the layered-architecture + cross-cutting checks.
- **`lakebase-release-workflows`** – the NFR baseline is the release gate.
