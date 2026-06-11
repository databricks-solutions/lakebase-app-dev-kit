---
name: software-design-principles
description: "Foundational engineering canon – SOLID, DRY, clean code, layered architecture, cross-cutting concerns, NFRs. Imported by workflow skills (lakebase-tdd-workflows, lakebase-scm-workflows, lakebase-release-workflows). Use when designing a module, reviewing a PR, planning a refactor, mapping cross-cutting concerns to layers, or arguing about API shape."
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
7. **No import-time coupling to an optional build artifact.** A module must import in every environment it ships to. An unconditional `StaticFiles` mount / asset read at import scope greens where the artifact exists and crashes everywhere it does not (backend-only tests, CI before the client build, fresh clones). Mount/read it only when present; degrade clearly (a 503 "not built") when absent. The `import-time-build-coupling` smell, enforced by `lakebase-tdd-imports-clean`.

## Composition

- **`lakebase-tdd-workflows`** – Architect Reviewer imports this in per-story review; Navigator in PLAN; Driver in REFACTOR.
- **`lakebase-scm-workflows`** – PRs reviewed against the layered-architecture + cross-cutting checks.
- **`lakebase-release-workflows`** – the NFR baseline is the release gate.
