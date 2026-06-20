# Evolutionary architecture and fitness functions

An architecture is not a diagram drawn once; it's a set of properties kept true as the system changes. A **fitness function** is an executable test that measures whether the architecture still has a property you care about. Break the property, the fitness function fails, the same way a unit test fails when behavior breaks.

This turns an architectural *principle* (advisory, easily eroded) into a *constraint* (enforced, part of the build). Here, fitness functions are first-class TDD tests: the Test Strategist authors them, they go RED before the code satisfies them, and they stay GREEN through every later refactor. See [test-strategy](../lakebase-sftdd-workflows/references/test-strategy.md).

## A good fitness function

- **Automated:** runs in CI and the local TDD cycle, no human deciding pass/fail.
- **Objective:** the dependency points the wrong way, or it doesn't.
- **Fast enough to run often:** contracts run every cycle; heavier ones (load tests) at the deploy/release gate.
- **Owned:** lives in the test tree with the behavior tests, not a wiki nobody runs.

## The catalog this kit expects

Each architectural hard rule names the fitness function that defends it.

| Property | Fitness function | Example (Python) |
|---|---|---|
| Layer direction | layered-dependency contract | `import-linter` layers contract `web` -> `service` -> `repository`; a violation fails CI |
| Persistence boundary | raw-SQL-location check | grep/AST-scan for raw SQL or `cursor.execute` outside the repository package |
| ORM-only data access | ORM-usage check | assert the repository goes through the ORM session; no string SQL in service/web |
| Config in environment | no-hardcoded-config check | scan for hardcoded hosts/URLs/secrets; fail on any literal that should be env-sourced |
| Mock policy | no-mock-for-DB check | fail if `unittest.mock` / `Mock(` appears in a persistence test (DB is the paired branch) |
| Statelessness | restart-survives test | a second process serves a request the first started |
| NFR budgets | budget tests | a p95-latency assertion on a hot path; a query-count assertion catching N+1 |
| Secret hygiene | no-secret-in-log check | an error path does not log the token |

Starting points, not a fixed list. State a new architectural rule, name its fitness function in the same breath, or the rule isn't real yet.

## Where they run

1. **TDD cycle:** a story's architectural fitness functions are part of its RED tests; the Driver makes them GREEN with the behavior tests; REFACTOR keeps them GREEN.
2. **CI:** the whole suite runs on every PR, catching an architectural regression on an unrelated change before merge.
3. **Release gate:** the heavier NFR budget functions (load, latency) run before promotion.

## Relationship to the other canon

- **`software-design-principles`** governs the inside of a module (SOLID, clean code); fitness functions govern relationships *between* modules and between the app and its platform.
- **Layering** ([layered-architecture](layered-architecture.md)) is the most important property to defend, because it erodes silently: one convenient wrong-direction import at a time.
- **Twelve-factor** ([twelve-factor](twelve-factor.md)) properties (config, backing services, statelessness, parity) each map to a fitness function above.

## The one rule

**Every architectural constraint names its fitness function.** If you can't point at the test that fails when the rule breaks, you've written a wish, not a constraint. Write the test first (RED), then satisfy it. That's the new TDD: behavior AND architecture, both defended by tests that fail before they pass.
