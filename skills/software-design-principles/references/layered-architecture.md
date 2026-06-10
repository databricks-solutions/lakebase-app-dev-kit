# Layered architecture

> **Moved.** Layering is a system-level (architectural) concern, so its canonical
> home is now the `architectural-design-principles` skill:
> [architectural-design-principles/references/layered-architecture.md](../../architectural-design-principles/references/layered-architecture.md).
> That document is the authoritative, prominent treatment: the four layers, the
> cardinal dependency rule, ports and adapters (repository / ORM-as-adapter),
> and the fitness function that enforces each rule.

The one-line reminder, so this code-level canon is self-contained:

**Dependencies point inward.** HTTP -> Service -> Infrastructure; Policy is read by any layer. Service never imports HTTP; Infrastructure never imports Service. An `import flask` (or `import express`) in the service layer is a violation, and it is defended by a layering fitness function, not by good intentions.

For cross-cutting concern ownership per layer, see [cross-cutting-concerns.md](cross-cutting-concerns.md). For everything else about layering, read the architectural skill above.
