# SOLID

Five rules for the module / class boundary (not for code inside a function).

## SRP – Single Responsibility
One reason to change per module. Name its responsibility in one sentence without "and"; if you can't, split it.
- Smell: `UserService` does auth + profile + audit + email. Better: `Authenticator`, `ProfileEditor`, `AuditLogger`, `Notifier`.

## OCP – Open-Closed
Extend by adding code, not editing existing code – shrinks the blast radius of change.
- Smell: a `switch (payment.type)` that grows a case per method. Better: a `PaymentProcessor` interface, one impl per method, dispatch by registration.

## LSP – Liskov Substitution
Every subtype must substitute for its base without breaking correctness. A failure means the hierarchy modeled taxonomy, not behavior.
- Smell: `Penguin extends Bird` but `fly()` throws. Better: `Bird` vs `FlyingBird`.

## ISP – Interface Segregation
Clients depend only on what they use; a fat interface forces unrelated consumers to share a vocabulary.
- Smell: `IRepository<T>` with 30 methods, each consumer uses 3. Better: `IReadable` / `IWritable` / `IQueryable`.

## Dependency Inversion
High- and low-level modules both depend on abstractions; details depend on abstractions, not the reverse. Wire concretes at the composition root.
- Smell: `OrderService` imports `PostgresOrderRepository`. Better: depend on an `OrderRepository` interface, wire the Postgres impl at the root. This is what enables test doubles, swappable backends, and flag-routed implementations.

## Scope
Module-level, not function-level – functions get the [clean-code](clean-code.md) rules.

## Apply when
- Two stakeholders edit one module for unrelated reasons -> Single Responsibility.
- A switch / if-tree grows every quarter -> Open-Closed.
- A subclass throws "not supported" for an inherited method -> Liskov rethink.
- A consumer uses 10% of an interface -> Interface Segregation.
- A high-level module names a concrete low-level one -> invert the dependency.
