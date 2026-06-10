# Evolutionary architecture and fitness functions

An architecture is not a diagram you draw once; it is a set of properties you keep true as the system changes. A **fitness function** is an executable test that measures whether the architecture still has a property you care about. When a change breaks the property, the fitness function fails, the same way a unit test fails when behavior breaks.

This is the mechanism that turns an architectural *principle* (advisory, easily eroded) into an architectural *constraint* (enforced, part of the build). In this kit, fitness functions are first-class TDD tests: the Test Strategist authors them, they go RED before the code satisfies them, and they stay GREEN through every later refactor. See [test-strategy](../lakebase-tdd-workflows/references/test-strategy.md).

## What makes a good fitness function

- **Automated.** It runs in CI and in the local TDD cycle, no human in the loop to decide pass/fail.
- **Objective.** Pass/fail is unambiguous: a dependency points the wrong way, or it does not.
- **Fast enough to run often.** Architectural contracts run on every cycle; heavier ones (load tests) run at the deploy/release gate.
- **Owned.** It lives in the test tree with the behavior tests, not in a wiki nobody runs.

## The catalog this kit expects

Each architectural hard rule names the fitness function that defends it.

| Property | Fitness function | Example (Python) |
|---|---|---|
| Layer direction (deps point inward) | A layered-dependency contract | `import-linter` with a layers contract: `web` -> `service` -> `repository`; a violation fails CI |
| Persistence boundary | Raw-SQL-location check | a test that greps/AST-scans for raw SQL or `cursor.execute` outside the repository package and fails if found |
| ORM-only data access | ORM-usage check | assert the repository goes through the ORM session; no string SQL in service/web |
| Config in environment | No-hardcoded-config check | scan for hardcoded hosts/URLs/secrets; fail on any literal that should be env-sourced |
| Mock policy | No-mock-for-DB check | a test that fails if `unittest.mock` / `Mock(` appears in a test that exercises persistence (the DB is the paired branch, never a mock) |
| Statelessness | Restart-survives test | where it matters, a test that a second process serves a request the first started |
| NFR budgets | Budget tests | a p95-latency assertion on a hot path; a query-count assertion that catches N+1 |
| Secret hygiene | No-secret-in-log check | a test that an error path does not log the token |

These are starting points, not a fixed list. When the team states a new architectural rule, it names a new fitness function in the same breath, or the rule is not yet real.

## Where they run

1. **In the TDD cycle.** The architectural fitness functions for a story are part of that story's RED tests. The Driver makes them GREEN alongside the behavior tests; the REFACTOR step must keep them GREEN.
2. **In CI.** The whole fitness-function suite runs on every PR, so an architectural regression on an unrelated change is caught before merge.
3. **At the release gate.** The heavier NFR budget functions (load, latency) run before promotion.

## Relationship to the other canon

- **`software-design-principles`** governs the inside of a module (SOLID, clean code). Fitness functions here govern the *relationships between* modules and between the app and its platform.
- **Layering** ([layered-architecture](layered-architecture.md)) is the most important property to defend with a fitness function, because it erodes silently: one convenient wrong-direction import at a time.
- **Twelve-factor** ([twelve-factor](twelve-factor.md)) properties (config, backing services, statelessness, parity) each map to a fitness function above.

## The one rule

**Every architectural constraint names its fitness function.** If you cannot point at the test that fails when the rule is broken, you have written a wish, not a constraint. Write the test first (it goes RED), then satisfy it. That is the new TDD: behavior AND architecture, both defended by tests that fail before they pass.
