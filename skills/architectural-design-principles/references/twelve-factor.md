# The twelve-factor app

The methodology for cloud-native, deploy-anywhere services: each factor is a property that keeps an app portable, scalable, and disposable. Each is stated plainly, then mapped to this substrate (paired Lakebase branches, the scaffolded project, the deploy targets).

The biggest payoff here: factors IV (backing services) and X (dev/prod parity) make **real-database testing without mocks** the default. The paired Lakebase branch is a real, isolated, attached backing service, so test and production differ by config, not code.

## The twelve factors

1. **Codebase** – one codebase in version control, many deploys. Here: one repo per project; each feature branch paired with a Lakebase branch; deploys differ by config.
2. **Dependencies** – declare and isolate explicitly. Here: the project declares deps (`pyproject.toml` / `package.json`); nothing relies on system-wide packages.
3. **Config** – in the environment, never in code. Here: host, token, database URL, per-environment limits come from `.env` / the profile / CI secrets. A hardcoded host is a fitness-function violation.
4. **Backing services** – databases, queues, caches as attached resources addressed by URL/config, swappable without code change. Here: **the paired Lakebase branch is the attached database.** Pointing at a different branch (experiment, staging, prod) is a config change.
5. **Build, release, run** – strictly separated. Here: build (scaffold + deps), release (artifact + target config), run (the deploy); the release-engineer composes these.
6. **Processes** – stateless, share-nothing. Here: handlers hold no session state another instance would need; state lives in the branch DB.
7. **Port binding** – export by binding to a port, self-contained. Here: the local deploy target binds a port (the smoke uses `:8000`) and is reachable on it.
8. **Concurrency** – scale out via the process model. Here: add stateless processes; anything shared lives in a backing service.
9. **Disposability** – fast startup, graceful shutdown, robust against sudden death. Here: a process can be killed and restarted; teardown between iterations relies on this.
10. **Dev/prod parity** – keep dev, staging, prod as similar as possible. Here: the substrate's core bet. The same code path runs against a paired branch in dev, a staging branch, and prod, which is **why integration tests hit a real DB and do not mock it.**
11. **Logs** – event streams to stdout; the platform routes them. Here: structured events go to the agent log + stdout; the process manages no log files.
12. **Admin processes** – one-off tasks in the same environment. Here: migrations (alembic / flyway / knex) run as one-off processes against the same branch DB.

## How to use this checklist

- The **Architect Reviewer** walks these factors during architectural review. A factor scope makes irrelevant is fine; one not considered is a smell.
- Factors III, IV, VI, X have **fitness functions** here (no-hardcoded-config, DB-addressed-by-config / not-mocked, restart-survives, parity-by-paired-branch). See [evolutionary-architecture](evolutionary-architecture.md).
- The rest are review-assisted: stated in `architecture.json`, checked at the review gate.

## Why it matters here

A twelve-factor app deploys the same way to a paired branch, staging, and production. That uniformity is what lets the TDD cycle run behavior tests against a real database instead of a mock, and lets an experiment branch promote without a rewrite. The factors are the properties that make the paired-branch workflow possible.
