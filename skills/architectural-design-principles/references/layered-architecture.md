# Layered architecture

The canonical home for layering in this kit: where code lives, made enforceable. Dependencies point inward; each cross-cutting concern has one owner layer; the persistence boundary is a single door.

> Supersedes the code-level note in `software-design-principles`, which keeps a one-paragraph pointer here.

## The four layers

1. **HTTP / Boundary** – the outer edge. Accepts requests (HTTP, CLI args, queue events, page requests), validates input shape, returns responses or rendered views. Knows the wire format and template engine. No business logic.
2. **Service** – business logic. Owns the domain model, coordinates infrastructure calls. Knows nothing about HTTP, headers, status codes, or templates.
3. **Infrastructure** – talks to the outside world: database (through the ORM), object store, external APIs, file system, secrets. Returns domain types upward.
4. **Policy / Config** – declarative rules: feature flags, per-environment limits, capability matrices. Read by the layers above; never reaches into them.

## Dependency direction (the cardinal rule)

```
HTTP    ->    Service    ->    Infrastructure
                 ^
               Policy
```

- HTTP imports Service; Service does NOT import HTTP.
- Service imports Infrastructure; Infrastructure does NOT import Service.
- Policy is read by any layer; Policy imports no layer.

`import flask`/`import express` in the service layer is a violation. Infrastructure knowing HTTP status codes is a violation. Defended by a fitness function, not review alone (see [evolutionary-architecture](evolutionary-architecture.md)): an `import-linter` layered contract that fails the build on a wrong-way dependency.

## Ports and adapters (why the seam exists)

The service depends on an interface (a port), not a concrete implementation; infrastructure provides the adapter. This makes the service unit-testable and the infrastructure swappable.

- **Repository** is the port for persistence. The service says `bugs.add(bug)`; it doesn't know there's SQL behind it.
- **The ORM is the adapter.** Repository implementations use the ORM (SQLAlchemy, Prisma, Drizzle) to reach the DB. Raw SQL lives ONLY inside repository implementations, and even there the ORM is the default.
- **Templating is a boundary adapter.** Jinja (or the language's testable equivalent) renders views in the HTTP layer. The service returns domain data; the boundary renders it.

Payoff: the persistence boundary is a single testable door. Point the repository at the paired Lakebase branch for real integration tests with no mocks, or substitute a fake at the port where no real resource exists.

## What goes in each layer

- **HTTP / Boundary:** request parsing, schema validation, auth header extraction, response shaping, template rendering, CORS / security headers, domain-error-to-status translation.
- **Service:** use-case orchestration (`createBug`, `assignBug`), domain rules and invariants, transaction boundaries, capability resolution, audit emission.
- **Infrastructure:** repository implementations (via ORM), external API clients, secret resolution, file system, queue producers/consumers.
- **Policy / Config:** feature flags, per-environment limits, capability matrices, validation schemas.

## Why this works

- **Testability:** the persistence port enables real-DB integration tests (paired branch) over mock-heavy units; the HTTP layer tests against a fake service.
- **Swappability:** moving backing services touches infrastructure only (a twelve-factor property, see [twelve-factor](twelve-factor.md)).
- **Reasoning:** a bug's symptom tells you which layer to inspect first.

## Enforcement

| Rule | Fitness function |
|---|---|
| Dependencies point inward | import-linter layered contract (CI + TDD cycle) |
| DB access only through repository + ORM | raw-SQL-location check; ORM-only check |
| No business logic in the boundary | review-assisted; keep handlers thin |

A layering rule without a fitness function is a wish. Name the test.
