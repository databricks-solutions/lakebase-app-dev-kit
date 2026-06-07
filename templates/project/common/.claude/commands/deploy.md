# /deploy : ship a built feature to a target and verify it is usable

Drives a built feature to a deployment target and verifies it is running and reachable, the per-sprint "working software" checkpoint the Product Owner reviews. This is the third phase of the per-feature loop: `/design` -> `/build` -> `/deploy` (the sprint's features run this loop after `/plan` authored their requests), the same path for real and headless runs.

## Usage

```
/deploy <feature-id> [--target <name>]
```

Default target is `local`. Requires the feature to be built: `.tdd/features/<feature-id>/test-list.json` with its TDD cycles green (what `/build` produces). If the build is absent, stop with a pointer back to `/build <feature-id>`.

## Targets

Targets are declared in the project's `deploy-targets.yaml`, each carrying a `type`. Only `type: local` is implemented today:

- **`local`** (default): runs the app on this machine (the target's `run` command) and polls `base_url` + `health_path` until it answers. This is the per-sprint working-software target , every iteration ends as running, reachable software the HIL can actually use, which is exactly what `product-overview.md` asks for ("working software I can use after each sprint").
- **Remote types** (`databricks-app`, ...): NOT yet implemented by `/deploy`. The remote release path already exists as the scaffolded **release-on-merge workflow** (`.github/workflows/merge.yml`: pre-migration snapshot -> migrate the target Lakebase branch -> verify schema -> cleanup) plus the per-PR CI (`pr.yml`) and the SCM CLIs (`lakebase-scm-prepare-pr` -> `wait-ci` -> `merge`). When a remote target lands, `/deploy` routes through that workflow rather than reinventing deploy. Until then, `lakebase-tdd-deploy` exits cleanly with "unsupported target type."

## Steps

1. **Precondition**: confirm the feature is built (test-list present, cycles green). Else stop and point to `/build <feature-id>`.
2. **Deploy to the target**:

   ```bash
   KIT_PKG="github:databricks-solutions/lakebase-app-dev-kit${LAKEBASE_KIT_REF:+#${LAKEBASE_KIT_REF}}"
   npx --yes --package="$KIT_PKG" lakebase-tdd-deploy --target "${DEPLOY_TARGET:-local}" --project-dir "$PWD"
   ```

   For `local` this starts the app and polls until it is reachable (exit `6` if it never answers). A non-reachable app is NOT working software , do not approve the deploy gate.
3. **Verify usable**: run the feature's verification against the RUNNING app , the API answers the new endpoints; for UI features, Playwright against the local server (the same `webServer`-boots-locally pattern `pr.yml` uses when no remote endpoint exists). This proves the increment works end to end, not just in unit tests.
4. **Deploy gate (HITL , the working-software review)**: surface the running app URL + the verify result to the Product Owner. The sprint is not done until they confirm the increment is acceptable.
   - **Headless (`LAKEBASE_TDD_HUMAN_PROXY=1`)**: the Human Proxy performs this review. It confirms the app was reachable AND the verify passed, then records the approval. It never approves a non-reachable or failed-verify deploy , that hard-blocks exactly as a missing gate artifact would.
5. **Teardown (local)**: when the increment no longer needs to stay up, `lakebase-tdd-deploy --target local --project-dir "$PWD" --stop`. The orchestrator stops it between iterations; an interactive user may leave it running to keep using it.

## Human Proxy (headless) mode

The deploy gate is the per-sprint working-software approval. Headless, `human-proxy` stands in: it validates the expected elements (app reachable + feature verify green) and approves only then; it never skips the gate and never approves a deploy that did not come up. See `@lakebase-tdd-workflows/SKILL.md` "Headless / Human Proxy mode".

## Agents + state machine

You (the orchestrator, the Scrum-Master) coordinate the `deploy` phase and do not run the deploy yourself. Delegate to the **release-engineer** agent: it deploys to the target, polls reachable, and runs the feature verify against the running app, then hands the evidence to the **product-owner** for the deploy gate. Resolve its model first: `npx --yes --package="$KIT_PKG" lakebase-tdd-agent-model --role release-engineer --project-dir "$PWD"` (`override ?? recommended ?? inherit`). On the PO's approval (headless: the Human Proxy, only after reachable + verify green), record the gate and transition the phase to `shipped`.

## Logging

Emit `phase.start` / `phase.end` (`--role scrum-master`) around the deploy. Record the deploy gate as a HITL decision: `--role product-owner --event gate.approved --data '{"gate":"deploy","target":"local","validated":true}'` on approval (headless: the Human Proxy records it), or `--event gate.refused` when the app was not reachable / verify failed. Tail with `lakebase-tdd-log --read --feature <id>`.

## Project pre/post hooks

If `.claude/commands/deploy.pre-hook.md` / `deploy.post-hook.md` exist, they run before / after the deploy phase (e.g. refresh credentials beforehand; notify a channel that the increment is live afterward). One pre-hook plus one post-hook per command.

## Substrate version

Pinned to: `${KIT_VERSION_AT_SCAFFOLD}`

The future `lakebase-update-commands` bin re-pulls this command's canonical template while preserving your hooks.
