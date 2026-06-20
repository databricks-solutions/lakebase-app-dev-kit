# /deploy : ship a built feature to a target and verify it is usable

Drives a built feature to a deployment target and verifies it is running and reachable, the per-sprint "working software" checkpoint the Product Owner reviews. This is the third phase of the per-feature loop: `/design` -> `/build` -> `/deploy` (the sprint's features run this loop after `/plan` authored their requests), the same path for real and headless runs.

## Usage

```
/deploy <feature-id> [--target <name>] [--story <story-id>]
```

Default target is `local`. `/deploy <feature-id>` deploys the merged FEATURE
(the working-software review). `/deploy <feature-id> --story <story-id>`
(re)deploys one story's experiment branch instead, with the same teeth; stories
also deploy automatically during `/build` for the PO's per-story acceptance, so
`--story` is for re-reviewing one on demand. A sprint is never deployed as a
unit, `/sprint` runs each feature's `/deploy`.

Requires the feature to be built: `.tdd/features/<feature-id>/test-list.json` with its TDD cycles green (what `/build` produces). If the build is absent, stop with a pointer back to `/build <feature-id>`.

## Targets

Targets are declared in the project's `deploy-targets.yaml`, each carrying a `type`. Only `type: local` is implemented today:

- **`local`** (default): runs the app on this machine (the target's `run` command) and polls `base_url` + `health_path` until it answers. This is the per-sprint working-software target , every iteration ends as running, reachable software the HIL can actually use, which is exactly what `product-overview.md` asks for ("working software I can use after each sprint").
- **Remote types** (`databricks-app`, ...): NOT yet implemented by `/deploy`. The remote release path already exists as the scaffolded **release-on-merge workflow** (`.github/workflows/merge.yml`: pre-migration snapshot -> migrate the target Lakebase branch -> verify schema -> cleanup) plus the per-PR CI (`pr.yml`) and the SCM CLIs (`lakebase-scm-prepare-pr` -> `wait-ci` -> `merge`). When a remote target lands, `/deploy` routes through that workflow rather than reinventing deploy. Until then, `lakebase-sftdd-deploy` exits cleanly with "unsupported target type."

## How it runs: the deterministic driver

`/deploy` delegates the deploy phase to the deterministic orchestrator driver,
bounded to `deploy`, with interactive gates so the Product Owner answers the
working-software gate (headless: the Human Proxy):

```bash
GATES=interactive; [ "${LAKEBASE_TDD_HUMAN_PROXY:-}" = "1" ] && GATES=proxy
./scripts/lk \
  lakebase-sftdd-drive --feature "<feature-id>" --only deploy --gates "$GATES" \
    --deploy-target "${DEPLOY_TARGET:-local}" --project-dir "$PWD"
```

The driver routes the deploy to the **release-engineer** agent, which runs
`lakebase-sftdd-deploy` (start the app + poll reachable) + the feature-verify
against the RUNNING app, writing `deploy-evidence.json` (reachable +
verify.passed, the teeth), then surfaces the **deploy gate** to the PO.
`--only deploy` REFUSES (stops at iteration 0) if the feature is not built, run
`/build <feature-id>` first.

For a single story, run the driver per-story instead (or, ad hoc,
`lakebase-sftdd-deploy --feature <id> --story <story-id> --project-dir "$PWD"`).

**Gate.** Interactive: the driver stops at the deploy gate + prints a `GATE`
marker. Surface the running URL + verify result to the PO; on approval record it
(`lakebase-sftdd-human-proxy --feature <id> --gate deploy --approver <human>`),
then re-run to finish (phase -> shipped). Headless (`--gates proxy`): the Human
Proxy confirms reachable + verify-green and approves; it NEVER approves a
non-reachable or failed-verify deploy. Teardown between iterations:
`lakebase-sftdd-deploy --target local --project-dir "$PWD" --stop`. The driver
emits the phase/gate log as code; tail with `lakebase-sftdd-log --read --feature <id>`.

## Project pre/post hooks

If `.claude/commands/deploy.pre-hook.md` / `deploy.post-hook.md` exist, they run before / after the deploy phase (e.g. refresh credentials beforehand; notify a channel that the increment is live afterward). One pre-hook plus one post-hook per command.

## Substrate version

Pinned to: `${KIT_VERSION_AT_SCAFFOLD}`

The future `lakebase-update-commands` bin re-pulls this command's canonical template while preserving your hooks.
