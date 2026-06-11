# Cross-cutting concerns

Concerns that span modules: auth, audit, rate limiting, schema validation, capability resolution, policy. Failure mode: the same concern implemented in two places, then the copies drift.

Rule: **one owner layer and one owner module per concern.** Everything else delegates.

## The mapping (default ownership)

| Concern | Owner layer | Typical module | Notes |
|---|---|---|---|
| Authentication | HTTP / boundary | `auth/authenticate.ts` | Extract identity (token, session, mTLS); set request context. |
| Authorization | Service | `authz/policy.ts` | "Can this identity do this action on this resource?" Lives next to business rules. |
| Capability resolution | Service | `capabilities/resolve.ts` | What the caller is allowed to do, independent of any action. |
| Audit logging | Cross-cutting (HTTP wraps service) | `audit/emit.ts` | Emit at the service-call boundary so the event captures domain meaning, not HTTP shape. |
| Rate limiting | HTTP / boundary | `ratelimit/middleware.ts` | Decided per-request at the edge. |
| Schema validation | HTTP / boundary | `schema/validate.ts` | Reject malformed input before the service layer. |
| Policy config | Policy layer | `policy/config.ts` | Read-only by HTTP, service, infrastructure. |
| Transactions | Service | use-case orchestrators | Use-case sets the boundary; infrastructure executes. |
| Caching | Infrastructure | `cache/` adapters | Cache at the repository, never at the service interface. |
| Tracing / metrics | Cross-cutting (HTTP wraps service) | `observability/` | Wrap service calls so spans align with use cases. |
| Secrets resolution | Infrastructure | `secrets/resolve.ts` | One seam for env / vault / KMS. |
| Feature flags | Policy layer | `flags/eval.ts` | Read at decision points by the service layer. |

## Where each concern must not live

- **Auth in service** reaches into HTTP-specific request shapes. Wrong layer.
- **Authz in HTTP**: the boundary can check a token is valid; it cannot know if an action is allowed.
- **Audit in infrastructure** sees `INSERT INTO orders`, not `createOrder`. Less useful.
- **Rate limit in service** forces services to know per-route policy. Wrong scope.
- **Schema validation in service** re-validates what the boundary already checked. Duplication.

## When a concern spans layers

One module owns it; others delegate through a narrow interface. Audit:
- HTTP wraps the service call and calls `audit.emit(event)` on return or throw.
- The audit module formats and writes; the service never calls `audit.emit()` directly.
- Result: a new destination touches one module; removing audit from a route touches one registration.

## The checklist (walk before merging)

- [ ] Authentication: needed on this route? Where enforced?
- [ ] Authorization: action gated? Where does the decision live?
- [ ] Capability resolution: does the caller need a capability check?
- [ ] Audit: should this emit an event? At which boundary?
- [ ] Rate limiting: does this route need a limit?
- [ ] Schema validation: input validated? Where?
- [ ] Policy config: configuration? Where does it live?
- [ ] Transactions: what's the atomicity boundary?
- [ ] Caching: does this read benefit from a cache?
- [ ] Tracing / metrics: traced?
- [ ] Secrets: any consumed?
- [ ] Feature flags: behind a flag?

An unanswered row is a smell. A row answered "two modules handle it" is a bug waiting to happen.

## When the mapping doesn't fit

For non-web shapes the boundary shifts, but each concern still has one owner at the layer with the right scope:
- **CLI:** "HTTP layer" is the arg parser; auth comes from the OS user / env.
- **Batch job:** "HTTP layer" is the job runner; auth from the runner identity; rate limit becomes concurrency limit.
- **MCP server:** "HTTP layer" is the transport (stdio / SSE); schema validation comes from the tool schema.
