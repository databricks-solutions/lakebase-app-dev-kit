# Per-role agent runtime + /plan & /deploy parity + state-machine phases

**Status**: Design proposal, 2026-06-06
**Umbrella FEIP**: FEIP-7461 (workflows as executable state machines)
**Primary FEIP**: FEIP-7510 (per-role agent runtime: isolated memory + own system prompt with a relay header; artifact-as-API + conformance gate as its type-check). Relay headers landed 2026-06-05; the isolating runtime is what this document designs.
**Related**: FEIP-7508 (model tiers as a parent-linked hierarchy), the SCM/TDD state-machine doc (`scm-tdd-workflow-state-machines.md`).

---

## Why this exists

The TDD workflow has eight conceptual roles, but seven of them live only as markdown prompt docs in `skills/lakebase-tdd-workflows/agents/*.md` that the slash commands `@`-reference inline. They are not separately-invokable actors. There is no per-task selection criteria, no per-role tool scoping, no isolated context, and no per-project model choice. The eighth role (Product Owner) and a shipping role (Release Engineer) do not exist as agents at all.

The user's direction:
- Each role is a **real, separately-invokable agent** with its **own system prompt**, auto-selected by **predefined criteria based on the task** it performs.
- The roles **live separately** (the artifact is the inter-agent API).
- Each agent carries a **strongly-recommended model**; the HIL **overrides per project**, asked at project setup.
- The **Scrum-Master is a pure coordinator** (no substantive work) and **obeys the workflow state machine**.
- `/plan` and `/deploy` should run as **real `claude -p` invocations** in the smoke (parity), not be emulated by the orchestrator.
- The **Release Engineer leverages `lakebase-release-workflows`**; audit the substrate and file tickets for gaps.

## The model

```
project intake (once)        Product Owner facilitates; Human Proxy headless
   │
   ▼
/plan  (per sprint)          Spec Author proposes -> PO authors the backlog
   │
   ▼
/design -> /build -> /deploy (per feature)
   │         │         │
 Spec Author Navigator Release Engineer        each a separate agent,
 Architect   Driver    (+ PO deploy gate)      auto-selected by its description,
 Test Strat                                    with a recommended (HIL-overridable) model
 UX Designer
   ▲                              │
   └──────── working software ────┘   (PO folds feedback into the next /plan)

Scrum-Master = the MAIN SESSION. Coordinates only: hands each phase to the
right role agent, carries the artifact forward, surfaces gates, obeys the
state machine. Writes no spec / code / test / deploy.
```

### Mechanism (Claude Code subagents, 2026 conventions)

`.claude/agents/<name>.md` with YAML frontmatter:
- `name` (required), `description` (required; the auto-delegation criteria, <=1536 chars; also enables explicit `@`-invocation), `tools` (optional, least-privilege; omit = inherit all), `model` (`opus`/`sonnet`/`haiku`/full-id/`inherit`, default `inherit`), `memory: project` (isolated cross-session memory), `color`.
- Body = the system prompt.
- **Subagents cannot spawn subagents.** So the orchestrator (Scrum-Master) is the main session, not a spawned subagent. The role agents are spawned from the main session, do their phase, and return their artifact.

### Decisions locked
- **Release Engineer** is a new role owning `/deploy`, composing on `lakebase-release-workflows` (+ `lakebase-scm-workflows`). `local` is the only target today; remote/release-on-merge is `merge.yml`.
- **Product Owner** is a facilitation agent (interview the human, draft artifacts, human approves). Already present in the `AgentRole` enum (`scripts/tdd/agent-log.ts`); only the doc is missing.
- Agent defs are **sourced centrally in the skill**, and **scaffolded into the project's `.claude/agents/`** so Claude Code can discover + spawn them (discoverability is a hard requirement: a skill's own folder is not a subagent location). Per-project **model overrides** live in the project (`.lakebase/agent-config.json`), recommended per role (sourced from each def's `model:`), asked at setup, HIL-overridable.
- **Discoverable, but only the Scrum-Master invokes the roles** (Phase I): the orchestrator runs as `claude --agent scrum-master`, whose `tools: Agent(<the 8 roles>)` allowlist scopes spawning to exactly those role agents. The role defs are discoverable for spawning; the allowlist + running-as-scrum-master is what restricts invocation to the orchestrator (Claude Code has no frontmatter flag to opt a subagent out of auto-delegation, so the narrow phase-scoped `description`s carry the rest).
- The Scrum-Master obeys the TDD state machine, which gains `planning` and `deploy` phases.

## Phases

- **A , Promote the 7 role docs to subagents** (central in the skill): frontmatter (name, description criteria, scoped tools, recommended model, `memory: project`, color); refresh each system prompt for current reality (orchestrator-coordinates-only, `/plan` + `/deploy`, nfrs coverage, Human Proxy, conformance); reframe Scrum-Master as the coordinating main session (not a `.claude/agents` subagent, can't nest), obeys `workflow-state.json`.
- **B , Two new roles**: `product-owner.md` (facilitation) + `release-engineer.md` (owns `/deploy`, composes the release skill). Add `release-engineer` to the `AgentRole` enum + `agent-log-event.schema.json`.
- **C , Per-project model overrides**: `scripts/tdd/agent-models.ts` (`readRecommendedModels()` parses def frontmatter = single source; `resolveModelForRole()` = override ?? recommended ?? inherit); `.lakebase/agent-config.json` + schema written by `scaffoldStaticAll`; `lakebase-create-project` asks the HIL (interactive prompt + `--agent-model <role>=<model>` flags + `--json-input`), defaulting to recommended.
- **D , State machine**: add `planning` (before `discovery`) and `deploy` (after `implementation`/`review`, before `shipped`) to the TDD phase enum (`scripts/tdd/schemas/workflow-state.schema.json`); update helpers/guards/tests. SCM state machine unchanged (`/plan` is pre-claim, `/deploy` is within `feature-claimed`).
- **E , Commands delegate to named subagents**: `/plan`, `/design`, `/build`, `/deploy` bodies hand each phase to the named role agent, read the resolved per-role model, record the state-machine transition, keep gates HITL. Update `SKILL.md`.
- **F , Smoke parity**: drive `claude -p "/plan ..."` and `claude -p "/deploy ..."` through `run_claude_with_gate_drain` instead of emulating them; Human Proxy stays the headless supply/approve; update `feip-7422-smoke.test.ts`.
- **G , Release substrate audit (gated)**: audit `lakebase-release-workflows` + `lakebase-scm-workflows` for Release Engineer gaps (local deploy/verify today; remote/release/rollback next); surface the list; file JIRA only after explicit go.
- **H , Conformance + docs + suite**: a vitest asserting each role def has required frontmatter (name, description non-empty + <=1536 chars, recommended model), a relay header, a non-empty system prompt, and that the role set matches the `AgentRole` enum; update `spec-format.md` + smoke README; full typecheck + vitest.

## Critical files
- Role defs: `skills/lakebase-tdd-workflows/agents/*.md` (+ new `product-owner.md`, `release-engineer.md`)
- Role enum/schema: `scripts/tdd/agent-log.ts`, `scripts/tdd/schemas/agent-log-event.schema.json`
- State machine: `scripts/tdd/schemas/workflow-state.schema.json` (+ helpers/tests)
- Model config: new `scripts/tdd/agent-models.ts` + `scripts/tdd/schemas/agent-models.schema.json`; `scripts/lakebase/create-project.ts` + `create-project.cli.ts` + `scripts/lakebase/scaffold.ts`
- Commands: `templates/project/common/.claude/commands/{plan,design,build,deploy}.md`; `skills/lakebase-tdd-workflows/SKILL.md`
- Smoke: `examples/feip-7422-smoke/orchestrator/run-smoke.sh`, `tests/bdd/feip-7422-smoke.test.ts`
- Release skill (compose + audit): `skills/lakebase-release-workflows/`

## Reuse (do not reinvent)
- `AgentRole` enum already lists `product-owner`; extend, don't re-declare.
- `run_claude_with_gate_drain` already drives `claude -p` + Human Proxy drain.
- `lakebase-release-workflows` already encodes the release flow; the Release Engineer composes on it.
- `scripts/tdd/deploy.ts` + `pollUntil` already exist; the Release Engineer drives them.

## Verification
- `npm run typecheck` clean; `npx vitest run` full suite green (new: agent-def conformance, model-resolver, state-machine phase, smoke-parity tests).
- `bash -n run-smoke.sh` clean; smoke BDD asserts `/plan` + `/deploy` go through `claude -p`.
- Manual: scaffold a throwaway project, confirm `.lakebase/agent-config.json` has recommended models + an applied override; `@`-invoke a role agent by name and confirm it picks up the resolved model.

## Plugin packaging (Phase K)

The kit is a Claude Code plugin (`.claude-plugin/plugin.json`, name `lakebase-app-dev-kit`, the broad umbrella, NOT rebranded to TDD). It exposes `skills/`, the role `agents` (pointed at `skills/lakebase-tdd-workflows/agents`, so the 8 role agents are plugin agents, no per-project copy needed for discoverability), and one launcher command `commands/tdd.md` -> **`/lakebase-app-dev-kit:tdd`**. A `.claude-plugin/marketplace.json` catalogs it so `/plugin marketplace add databricks-solutions/lakebase-app-dev-kit` + `/plugin install lakebase-app-dev-kit@lakebase-app-dev-kit` registers it.

`/lakebase-app-dev-kit:tdd` is one smart command: in a scaffolded `.tdd/` project it takes stock and resumes the `/plan -> /design -> /build -> /deploy` loop; elsewhere it guides project creation (`lakebase-create-project`), then resumes. The slash commands invoke the deterministic orchestrator (`lakebase-tdd-drive`), which spawns the role agents. (Superseded by `orchestrator-deterministic-driver.md`: the orchestrator is now a deterministic driver, not an `--agent scrum-master` session.) NOT validated live yet (`/plugin marketplace add` + install + cross-reference resolution in plugin agents) , that is a manual smoke.

## Launching the workflow (Phase J)

`scripts/tdd.sh` (scaffolded into every project) is the convenient entry point: it opens a plain `claude` session optionally seeded with a phase command. `./scripts/tdd.sh plan` starts sprint planning; `./scripts/tdd.sh design <id>` / `build <id>` / `deploy <id>` jump straight in; bare opens a session to type into. The slash commands invoke the deterministic orchestrator (`lakebase-tdd-drive`), which spawns the role agents. `lakebase-create-project` prints `Next: cd <dir> && ./scripts/tdd.sh plan` on completion. (Superseded by `orchestrator-deterministic-driver.md`: routing is code, not an `--agent scrum-master` session.)

## Release Engineer substrate audit (Phase G)

What the Release Engineer needs, vs what the substrate ships today:

**Present**
- Local target: `lakebase-tdd-deploy` (run + poll reachable + stop) + the deploy gate. Covers the `local` working-software check end to end.
- Remote building blocks exist as TS modules: `scripts/lakebase/deploy-app-endpoint.ts`, `deploy-app-yaml.ts`, `deploy-workspace-upload.ts`, `deploy-validate.ts`, `deploy-rollback.ts`; plus the `lakebase-cut-backup` bin and the release-on-merge `merge.yml` (snapshot -> migrate target -> verify) and the SCM CLIs (`prepare-pr` / `wait-ci` / `merge`).

**Gaps (the Release Engineer cannot yet ship to a remote target end to end)**
1. `lakebase-tdd-deploy` implements only `type: local`; `databricks-app` is recognized but refused. No routing from a `databricks-app` deploy-target to the existing `deploy-app-*` primitives.
2. The `deploy-app-*` + `deploy-rollback` modules are not exposed as bins / not composed into a single "deploy this feature to its remote target" surface the Release Engineer can call.
3. The release-orchestrator primitives the methodology expects (`cutRC`, `regressionTest`, `migrate`, `release`) are documented as future work (FEIP-7059 roadmap), not shipped. So a full RC -> regression -> backup -> migrate -> app-deploy release is still the manual procedure + `cut-backup` + `merge.yml`.
4. No rollback command surface wired for the Release Engineer (the module exists; no `/deploy --rollback` or bin).

**Filed tickets (children of FEIP-7059):**
- **FEIP-7560** , route `lakebase-tdd-deploy --target <databricks-app>` to the existing deploy-app-* primitives (remote-deploy surface for the Release Engineer).
- **FEIP-7561** , expose `deploy-rollback` as a Release Engineer rollback surface.
- **FEIP-7562** , ship the release orchestrator primitives (`cutRC` / `regressionTest` / `migrate` / `release`).

## Gates
- No version bump / push / PR unless explicitly asked.
- JIRA filing (Phase G) gated on explicit go: the gap list above is surfaced for the user to approve before any ticket is created.
- Landed phase-by-phase: a commit + green suite each.
