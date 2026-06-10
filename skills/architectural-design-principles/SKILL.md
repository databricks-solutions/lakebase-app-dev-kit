---
name: architectural-design-principles
description: "System-level engineering canon, the architecture counterpart to software-design-principles. Layered architecture + dependency direction, ports and adapters (repository / ORM-as-adapter), the twelve-factor app for cloud-native development, and evolutionary architecture with fitness functions. Imported by workflow skills (lakebase-tdd-workflows, lakebase-scm-workflows, lakebase-release-workflows). Use when: shaping a system boundary, deciding what is a backing service, mapping config to the environment, or authoring the fitness functions that keep the architecture honest as it evolves."
---

# architectural-design-principles

Shared canon for decisions ABOVE the function and class. Where `software-design-principles` governs how a unit of code is written (SOLID, DRY, clean code), this skill governs how the system is shaped: its layers, its boundaries, its relationship to the platform it runs on, and how those properties are kept true over time.

Read it alongside `software-design-principles`, not instead of it. Code-level discipline keeps a module clean; architectural discipline keeps the system clean as it grows.

## When to use

- A workflow skill's agent contract instructs you to import this canon (e.g. the `lakebase-tdd-workflows` Architect Reviewer reviews every design against layering + the twelve-factor checklist, and the Test Strategist authors the fitness functions named here).
- You are deciding a system boundary: what is a layer, what is a backing service, where config lives, what is stateless.
- You are about to declare an architectural constraint ("we use an ORM", "templating is Jinja", "the repository layer is the only place raw SQL appears") and you need it to be enforced, not just written down.

## What this skill is

A reference, not an executor. It ships markdown only, no scripts. The job is to give roles a consistent system-level vocabulary and, crucially, to point each architectural rule at the **fitness function** that enforces it. A principle no test defends is advisory; a principle a fitness function defends is part of the build.

## Architectural fitness checklist (mandatory before promote/merge)

For any non-trivial change, confirm each row before declaring the design done. A blank row is fine when scope justifies it; an *unconsidered* row is a smell.

| Property | The rule | Enforced by (fitness function) |
|---|---|---|
| Layer direction | Dependencies point inward; infrastructure never imports service, service never imports HTTP | import-linter (or equivalent) contract, run in CI + the TDD cycle |
| Persistence boundary | All database access goes through the repository layer via the ORM; no raw SQL outside it | "raw-SQL-location" check + "ORM-only" check |
| Config in environment | No host, secret, or per-environment value is hardcoded; all read from the environment | "no-hardcoded-config" grep/AST check |
| Statelessness | A process holds no session state that another instance would need; state lives in a backing service | review + a restart-survives-request test where it matters |
| Backing services attached | DB, object store, queue are attached resources addressed by URL/config, swappable without code change | dev/prod-parity: the same code path runs against the paired Lakebase branch |
| Mock policy | Mocks appear only where there is no real backing resource; the database is never mocked | "no-mock-for-DB" check (see [test-strategy](../lakebase-tdd-workflows/references/test-strategy.md)) |
| NFR budgets | Performance / scalability / security budgets are stated and measured | NFR budget tests (see `software-design-principles` NFRs) |

If a property has no clear owner or no fitness function, resolve it before merging.

## References

The canon is three focused, opinionated references.

- [Layered architecture](references/layered-architecture.md) , the four layers, the cardinal dependency rule, ports and adapters, and why the repository + ORM is the persistence boundary. The prominent, canonical home for layering.
- [Twelve-factor app](references/twelve-factor.md) , the twelve factors of cloud-native development, each mapped to this substrate (the paired Lakebase branch as an attached backing service, config in the environment, stateless processes, dev/prod parity).
- [Evolutionary architecture](references/evolutionary-architecture.md) , fitness functions: how an architectural rule becomes an executable test that fails the build on violation, and the catalog of fitness functions this kit expects.

## Hard rules

These apply across all references. Workflow skills that import this canon inherit them.

1. **Dependencies point inward, never outward.** HTTP calls service; service calls infrastructure; infrastructure never calls service; nothing calls HTTP. This is enforced by a layering fitness function, not by good intentions.
2. **The repository layer is the only door to the database, and it goes through the ORM.** Raw SQL outside the repository layer is a violation a fitness function catches.
3. **Config lives in the environment.** Hosts, credentials, per-environment limits are read from the environment, never hardcoded or committed.
4. **Backing services are attached resources.** The database is addressed by config and is swappable. In this substrate the paired Lakebase branch IS the attached database, which is why dev/prod parity is the default, not an aspiration.
5. **Processes are stateless and disposable.** Anything a second instance would need lives in a backing service.
6. **Every architectural constraint names its fitness function.** If you cannot say which test fails when the rule is broken, the rule is not yet enforced.
7. **Mocks only where no real resource exists.** Never mock the database; the paired branch makes a real isolated DB cheap. See [test-strategy](../lakebase-tdd-workflows/references/test-strategy.md).

## Composition with workflow skills

- **`lakebase-tdd-workflows`** , the Architect Reviewer imports this canon during architectural review (layering + twelve-factor checklist). The Test Strategist authors the fitness functions named here as part of the cycle's RED tests (see [test-strategy](../lakebase-tdd-workflows/references/test-strategy.md)). The Navigator imports during PLAN; the Driver keeps the fitness functions green through REFACTOR.
- **`lakebase-scm-workflows`** , branch PRs are reviewed against layering + the fitness-function suite as part of CI.
- **`lakebase-release-workflows`** , the NFR budget fitness functions are part of the release gate.

This skill ships no slash commands and no scripts. It is consulted, not invoked.
