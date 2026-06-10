# Layered architecture

The canonical home for layering in this kit. A way to decide where code lives, made enforceable. Dependencies point inward; cross-cutting concerns have one owner per layer; the persistence boundary is a single door.

> This supersedes the brief, code-level note in `software-design-principles`. That skill keeps a one-paragraph pointer here so layering has one authoritative source.

## The four layers

1. **HTTP / Boundary layer** , the outermost edge. Accepts requests (HTTP, CLI args, queue events, a rendered page request), validates input shape, returns responses or rendered views. Knows the wire format and the template engine. Does *not* contain business logic.
2. **Service layer** , business logic. Owns the domain model. Coordinates infrastructure calls. Knows nothing about HTTP, headers, status codes, or templates.
3. **Infrastructure layer** , talks to the outside world: database (through the ORM), object store, external APIs, file system, secrets. Returns domain types upward.
4. **Policy / Config layer** , declarative rules: feature flags, environment-specific limits, capability matrices. Read by the layers above; never reaches into them.

## Dependency direction (the cardinal rule)

```
HTTP    ->    Service    ->    Infrastructure
                 ^
               Policy
```

- HTTP imports Service. Service does NOT import HTTP.
- Service imports Infrastructure. Infrastructure does NOT import Service.
- Policy is read by any layer. Policy does NOT import any layer.

If `import flask` (or `import express`) appears in your service layer, that is a violation. If infrastructure code knows about HTTP status codes, that is a violation. This rule is **not** defended by code review alone, it is defended by a fitness function (see [evolutionary-architecture](evolutionary-architecture.md)): an `import-linter` layered contract that fails the build when a dependency points the wrong way.

## Ports and adapters (why the seam exists)

The service layer depends on an *interface* (a port), not a concrete implementation. The infrastructure layer provides the *adapter*. This is what makes the service unit-testable and the infrastructure swappable.

- **Repository** is the port for persistence. The service says `bugs.add(bug)`; it does not know there is SQL behind it.
- **The ORM is the adapter.** The repository implementation uses the ORM (SQLAlchemy, Prisma, Drizzle, etc.) to talk to the database. Raw SQL lives ONLY inside repository implementations, and even there the ORM is the default.
- **Templating is an adapter at the boundary.** Jinja (or the language's equivalent testable engine) renders views in the HTTP layer. The service returns domain data; the boundary renders it. See the UI design guide for the framework choice.

The payoff: the persistence boundary is a single, testable door. You can point the repository at the paired Lakebase branch and run real integration tests with no mocks, or, where a real resource genuinely does not exist, substitute a fake at the port.

## What goes in each layer

**HTTP / Boundary:** request parsing, schema validation, auth header extraction, response shaping, template rendering (Jinja), CORS / security headers, error translation (domain error -> status code).

**Service:** use-case orchestration ("createBug", "assignBug"), domain rules and invariants, transaction boundaries, capability resolution, audit event emission.

**Infrastructure:** repository implementations (through the ORM), external API clients, secret resolution, file system access, queue producers/consumers.

**Policy / Config:** feature flags, per-environment limits, capability matrices, schemas consumed by validation.

## Why this works

- **Testability:** the persistence port lets you run real-DB integration tests (paired branch) instead of mock-heavy unit tests. The HTTP layer can be tested with a fake service. Each layer has a narrow seam.
- **Swappability:** moving backing services touches infrastructure only (a twelve-factor property, see [twelve-factor](twelve-factor.md)).
- **Reasoning:** when a bug appears in a request flow, the symptom tells you which layer to inspect first.

## Enforcement

| Rule | Fitness function |
|---|---|
| Dependencies point inward | import-linter layered contract (CI + TDD cycle) |
| DB access only through repository + ORM | raw-SQL-location check; ORM-only check |
| No business logic in the boundary | review-assisted; keep handlers thin |

A layering rule without a fitness function is a wish. Name the test.
