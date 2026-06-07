# Agent capability test bed

One replayable test per TDD role: **given a fixture (the role's inputs), invoke
that role headless and assert the artifact it produces conforms to its schema.**

This is the unit of "does this agent still do its job." Replay it to catch a
doc/schema drift or a model-tier regression in a single role, without a full
end-to-end smoke. (It is exactly what caught the spec-author shipping
`feature_id` instead of `id`: a stale doc led a role to emit a non-conformant
`feature-spec.json`, and the conformance gate refused it.)

## Layout

- `cases.ts` , the registry: one `AgentCapabilityCase` per role (`role`,
  `capability`, `fixture`, `task`, `produces`, `live`). The hermetic guard
  asserts **every** `AgentRole` has a case, so no agent goes untested.
- `harness.ts` , `runAgentCapability(case)`: builds a scratch project (the role
  defs + references under `.claude/`, the fixture's inputs at the root), runs
  `claude -p "<task>" --agent <role> --model <m> --strict-mcp-config`, then
  conformance-checks each produced artifact with `checkArtifactConformance`.
- `fixtures/<role>/` , the committed inputs for a case, laid out as the role
  expects (e.g. `.tdd/product-overview.md`, `.tdd/features/<F>/feature-request.md`).
- `agents-capability.test.ts` , the runner.

## Running

- **Hermetic (default, no tokens):** `npx vitest run tests/agent-capability` ,
  verifies the registry covers every role, cases are well-formed, and each live
  case has its fixture on disk. This always runs in CI.
- **Live (opt-in, invokes the model + kit CLIs):**
  `LAKEBASE_TEST_AGENTS=1 npx vitest run tests/agent-capability` , for each
  `live: true` case, actually invokes the role and asserts its artifact conforms.

## Coverage status

Live today: **spec-author** (proven: a haiku spec-author with the corrected doc
produces a conformant `feature-spec.json`).

Registered for coverage, fixtures/runtime still to build (each marked `live:
false` with a `note`): architect-reviewer, test-strategist, ux-designer (need a
conformant prior-artifact fixture), navigator + driver (produce project
code/tests, need a scaffolded project + runner), product-owner + release-engineer
(facilitation/deploy, covered today by the smoke), scrum-master (deterministic
routing, covered by `orchestrator-drive.test.ts`).

## Adding a role to the live set

1. Put the role's inputs under `fixtures/<dir>/` (laid out as it expects).
2. In `cases.ts` set `live: true`, the `task`, and the `produces[]` artifact path(s).
3. Run the live suite; the harness invokes the role and conformance-checks the output.
