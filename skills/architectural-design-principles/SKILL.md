---
name: architectural-design-principles
description: "System-level engineering canon, the architecture counterpart to software-design-principles. Layered architecture + dependency direction, ports and adapters (repository / ORM-as-adapter), the twelve-factor app for cloud-native development, and evolutionary architecture with fitness functions. Imported by workflow skills (lakebase-sftdd-workflows, lakebase-scm-workflows, lakebase-release-workflows). Use when: shaping a system boundary, deciding what is a backing service, mapping config to the environment, or authoring the fitness functions that keep the architecture honest as it evolves."
---

# architectural-design-principles

Canon for decisions above the function and class. `software-design-principles` governs how a unit of code is written (SOLID, DRY, clean code); this skill governs how the system is shaped: layers, boundaries, its relationship to the platform, and how those properties stay true over time. Read it alongside that skill, not instead of it.

Markdown only, no scripts: consulted, not invoked. Its job is to point each architectural rule at the **fitness function** that enforces it. A rule no test defends is advisory; a rule a fitness function defends is part of the build.

## When to use

- A workflow skill's agent contract tells you to import it (e.g. the `lakebase-sftdd-workflows` Architect Reviewer reviews every design against layering + twelve-factor; the Test Strategist authors the fitness functions named here).
- You're deciding a system boundary: what is a layer, a backing service, where config lives, what is stateless.
- You're about to declare an architectural constraint ("we use an ORM", "raw SQL appears only in the repository layer") and need it enforced, not just written down.

## Architectural fitness checklist (mandatory before promote/merge)

Confirm each row before declaring the design done. A blank row is fine when scope justifies it; an unconsidered row is a smell.

| Property | The rule | Enforced by (fitness function) |
|---|---|---|
| Layer direction | Dependencies point inward; infrastructure never imports service, service never imports HTTP | import-linter (or equivalent) contract, in CI + the TDD cycle |
| Persistence boundary | All DB access through the repository layer via the ORM; no raw SQL outside it | "raw-SQL-location" + "ORM-only" checks |
| Config in environment | No host, secret, or per-environment value hardcoded | "no-hardcoded-config" grep/AST check |
| Statelessness | A process holds no session state another instance would need; state lives in a backing service | review + a restart-survives-request test where it matters |
| Backing services attached | DB, object store, queue are URL/config-addressed, swappable without code change | dev/prod parity: the same code path runs against the paired Lakebase branch |
| Mock policy | Mocks only where there's no real backing resource; the database is never mocked | "no-mock-for-DB" check (see [test-strategy](../lakebase-sftdd-workflows/references/test-strategy.md)) |
| NFR budgets | Performance / scalability / security budgets stated and measured | NFR budget tests (see `software-design-principles` NFRs) |

A property with no clear owner or no fitness function: resolve it before merging.

## References

- [Layered architecture](references/layered-architecture.md) – the four layers, the cardinal dependency rule, ports and adapters, the repository + ORM persistence boundary. The canonical home for layering.
- [Twelve-factor app](references/twelve-factor.md) – the twelve factors mapped to this substrate (paired Lakebase branch as attached backing service, config in the environment, stateless processes, dev/prod parity).
- [Evolutionary architecture](references/evolutionary-architecture.md) – fitness functions: how an architectural rule becomes an executable test that fails the build on violation, plus the catalog this kit expects.

## Hard rules

1. **Dependencies point inward.** HTTP calls service; service calls infrastructure; infrastructure never calls service; nothing calls HTTP. Enforced by a layering fitness function, not good intentions.
2. **The repository layer is the only door to the database, through the ORM.** Raw SQL outside it is a violation a fitness function catches.
3. **Config lives in the environment.** Hosts, credentials, per-environment limits are read from the environment, never hardcoded or committed.
4. **Backing services are attached resources.** The database is config-addressed and swappable. Here the paired Lakebase branch IS the attached database, so dev/prod parity is the default.
5. **Processes are stateless and disposable.** Anything a second instance would need lives in a backing service.
6. **Every constraint names its fitness function.** If you can't say which test fails when the rule breaks, it isn't enforced.
7. **Mocks only where no real resource exists.** Never mock the database; the paired branch makes a real isolated DB cheap. See [test-strategy](../lakebase-sftdd-workflows/references/test-strategy.md).

## Composition

- **`lakebase-sftdd-workflows`** – Architect Reviewer imports this in architectural review (layering + twelve-factor); Test Strategist authors the fitness functions as RED tests; Navigator imports in PLAN; Driver keeps them green through REFACTOR.
- **`lakebase-scm-workflows`** – branch PRs reviewed against layering + the fitness-function suite in CI.
- **`lakebase-release-workflows`** – the NFR budget fitness functions are part of the release gate.
