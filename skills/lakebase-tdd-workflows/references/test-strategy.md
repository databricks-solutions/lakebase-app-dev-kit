# Test strategy , the test surface of the TDD cycle

What the Test Strategist authors, and what RED / GREEN mean in this kit. This is the "new TDD": the test surface of every cycle is **behavior tests (BDD) plus architectural fitness tests**, run against real backing services, with mocks reserved for the narrow case where no real resource exists.

This reframes the classic mock-heavy unit-test pyramid. Because every feature has a paired Lakebase branch, a real isolated database is cheap and always available, so the default test is an integration test against that real branch, not a unit test against a mocked repository.

## The two kinds of test in a cycle

1. **Behavior tests (BDD).** Each acceptance criterion becomes a behavior test expressed in the project's BDD framework (`pytest-bdd` for Python, the equivalent elsewhere): a `Given / When / Then` scenario backed by step definitions. The scenario exercises the real request path through the real layers against the paired-branch database. This is what proves the feature does what the AC says.
2. **Architectural fitness tests.** The architectural constraints for the story (layering, ORM-only persistence, config-in-env, NFR budgets) become fitness functions. See `architectural-design-principles` [evolutionary-architecture](../../architectural-design-principles/references/evolutionary-architecture.md). They prove the feature is built the way the architecture requires.

Both kinds are authored as part of the story's test-list. Both go RED before the code exists, and both must be GREEN to close the cycle. A behavior test that passes while a fitness function is RED is not done.

## The mock policy

Mocks are a tool, not a default. The rule:

- **Never mock anything you can hit for real.** The database is the canonical example: the paired Lakebase branch IS a real, isolated DB, so persistence is exercised for real, never mocked. The same goes for any backing service the substrate provides cheaply.
- **Mocks are acceptable only where no real backing resource exists or hitting it is genuinely unsafe/nondeterministic in the cycle:** a third-party payment API, an email send, wall-clock time, a paid external service. There, substitute a fake at the port (the seam the layered architecture gives you), not deep inside the code.
- A mock standing in for the database is a smell a fitness function catches (the no-mock-for-DB check). If you reach for one, the answer is almost always "point the repository at the paired branch instead."

Why this holds: dev/prod parity (twelve-factor X) plus backing-services-as-attached-resources (IV) mean the test database and the production database are the same kind of thing, differing by config. So testing against the real branch is both faithful and free of the maintenance tax that mock-heavy suites accrue.

## RED / GREEN / REFACTOR with this surface

- **RED:** the Test Strategist authors the behavior scenarios for each AC and the fitness functions for the story's architectural constraints. All fail (no implementation, contracts not yet satisfied).
- **GREEN:** the Driver writes the minimal code (DTSTTCPW) to make the behavior scenarios pass against the paired branch and to satisfy the fitness functions. No mock substitutes for the DB.
- **REFACTOR:** structure improves; both the behavior scenarios and the fitness functions stay GREEN. A refactor that needs a behavior test rewritten changed the public boundary, that is a design signal, not a license to edit the test.

## What the Test Strategist produces

For each AC in the story's test-list:

- one or more BDD behavior scenarios (real path, real DB), and
- the fitness functions for any architectural constraint the story touches (layering contract entry, ORM-only, config-in-env, an NFR budget if the AC has one).

Mocks appear in the list only with a one-line justification naming the real resource that does not exist. If the justification is "the database", reject it , use the paired branch.

## Composition

- **`architectural-design-principles`** , the source of the fitness-function catalog and the layering rules these tests defend.
- **`software-design-principles`** , the NFR baseline whose budgets become budget fitness tests.
- The **paired Lakebase branch** , the reason real-DB integration testing is the default and mocks are the exception.
