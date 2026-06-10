# The twelve-factor app

The methodology for building cloud-native, deploy-anywhere services. Each factor is a property that keeps an app portable, scalable, and disposable. Below, each factor is stated plainly, then mapped to how it lands in THIS substrate (paired Lakebase branches, the scaffolded project, the deploy targets).

The single biggest payoff in this kit: factors IV (backing services) and X (dev/prod parity) are what make **real-database testing without mocks** the default rather than the expensive path. The paired Lakebase branch is a real, isolated, attached backing service, so the test environment and production differ by config, not by code.

## The twelve factors

1. **Codebase** , one codebase tracked in version control, many deploys. Here: one repo per project; each feature branch is paired with a Lakebase branch; deploys differ by config.
2. **Dependencies** , declare and isolate them explicitly. Here: the language project declares deps (`pyproject.toml` / `package.json`); nothing relies on system-wide packages.
3. **Config** , store config in the environment, never in code. Here: host, token, database URL, per-environment limits come from the environment (`.env`, the profile, CI secrets). A hardcoded host is a violation a fitness function catches.
4. **Backing services** , treat databases, queues, caches as attached resources addressed by URL/config, swappable without a code change. Here: **the paired Lakebase branch is the attached database.** The repository layer addresses it by config; pointing at a different branch (experiment, staging, prod) is a config change, not a code change.
5. **Build, release, run** , strictly separate the stages. Here: build (scaffold + deps), release (the artifact + its config for a target), run (the deploy). The release-engineer composes these.
6. **Processes** , execute as one or more stateless, share-nothing processes. Here: handlers hold no session state another instance would need; state lives in the backing service (the branch DB).
7. **Port binding** , export services by binding to a port; be self-contained. Here: the local deploy target binds a port (the smoke uses `:8000`) and is reachable on it; nothing is injected by a webserver container.
8. **Concurrency** , scale out via the process model. Here: scale by adding stateless processes, not by growing one; anything shared must live in a backing service.
9. **Disposability** , fast startup, graceful shutdown; robust against sudden death. Here: a process can be killed and restarted; the deploy teardown between iterations relies on this.
10. **Dev/prod parity** , keep development, staging, and production as similar as possible. Here: this is the substrate's core bet. The same code path runs against a paired Lakebase branch in dev, a staging branch, and prod. **This is why integration tests hit a real DB and do not mock it**, the dev DB is the same kind of resource as prod.
11. **Logs** , treat logs as event streams; write to stdout, let the platform route them. Here: structured events go to the agent log + stdout; the process does not manage log files.
12. **Admin processes** , run admin/management tasks as one-off processes in the same environment. Here: migrations (alembic / flyway / knex) run as one-off processes against the same branch DB the app uses.

## How to use this checklist

- The **Architect Reviewer** walks these factors during architectural review for any non-trivial change. A factor that scope makes irrelevant is fine; a factor that was *not considered* is a smell.
- Factors III (config), IV (backing services), VI (stateless processes), and X (dev/prod parity) are the ones with **fitness functions** in this kit (no-hardcoded-config, DB-addressed-by-config / not-mocked, restart-survives, parity-by-paired-branch). See [evolutionary-architecture](evolutionary-architecture.md).
- The rest are review-assisted: stated in `architecture.json`, checked at the architectural review gate.

## Why it matters here

A twelve-factor app deploys the same way to a developer's paired branch, to staging, and to production. That uniformity is exactly what lets the TDD cycle run behavior tests against a real database instead of a mock, and what lets an experiment branch be promoted without a rewrite. The factors are not bureaucracy; they are the properties that make the paired-branch workflow possible.
