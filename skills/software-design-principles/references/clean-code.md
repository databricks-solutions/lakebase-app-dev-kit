# Clean code

Naming, function shape, comments, error handling. Function-level rules (SOLID covers the module level).

## Names carry the design
The name is the API; a reader who must read the body to understand it is now coupled to the implementation.
- Pronounceable, searchable, intention-revealing. No type encoding (`strName`), no abbreviations to "save typing" (`customerOrderProcessor` > `custOrdProc`).
- Boundary names match the domain vocabulary, not the internal model.
- After GREEN: "would a fresh reader infer the right concept?" If not, rename before the next test.

## Functions are small
- One screen (ideally <20 lines), one level of abstraction. Don't mix orchestration with low-level parsing in one body.
- "Does one thing" – if you can extract a named section, it was doing two.
- Args: 0 ideal, 1-2 fine, 3+ group into an object. No output args (mutating inputs); return new values.

## Comments rot; code doesn't
Comment only: a non-obvious *why* (a workaround, a hidden invariant, a caller contract); public API docs that show in tooling; TODO/FIXME with a ticket.
Never comment to explain *what* (rename) or *how* (extract a named helper), to narrate process, to restate the obvious, or to mark removed code (use git).

## Error handling at boundaries
- Validate at the system boundary (HTTP handler, CLI entry, message consumer); trust your types past it.
- Never silently swallow – log, or re-throw with context. No `try/catch` for control flow.
- Keep the happy path visually obvious; error handling is the guarded path. Guard clauses beat nested ifs:

```ts
// good
if (!user) return errorResponse(401);
if (!user.active) return errorResponse(403);
return doTheWork(user);
```

## Module shape
- Small public surface, internals as large as needed. One concept per file.
- Order: types/constants -> public functions (top-down) -> private helpers -> exports.
- Cyclic imports are a smell – break the cycle with a third module.

## Tests are code
Spec-like names (`it("rejects login when the password is wrong")`); ideally one assertion; no magic numbers; visible Arrange/Act/Assert. Test fixtures are data – repeat freely, don't over-factor.

## The question
"Could I delete this and the system still works?" If yes, delete it.
