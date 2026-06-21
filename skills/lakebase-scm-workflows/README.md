# lakebase-scm-workflows

Opinionated git-to-Lakebase branch-pairing workflows. The agent surface for the same Node.js scripts that the [`databricks-solutions/lakebase-scm-extension`](https://github.com/databricks-solutions/lakebase-scm-extension) calls from its VS Code/Cursor commands – one canonical executable surface, two presentation layers.

This README is the human-facing overview. The agent's operating contract – when `.env` matters, how the git hooks behave, the credential single-seam, concrete code patterns – lives in [`SKILL.md`](SKILL.md).

> Composes on top of the dev-hub skill [`databricks-lakebase`](https://github.com/databricks/databricks-agent-skills) (Lakebase Postgres CLI basics). It does not shadow it.

## Prerequisites

The control plane and data plane are owned by other Databricks artifacts. Install/configure them once before using this skill:

- `databricks postgres ...` CLI – documented by the dev-hub skill [`databricks-lakebase`](https://github.com/databricks/databricks-agent-skills). Install via `databricks aitools install databricks-lakebase`.
- `@databricks/lakebase` npm package – drop-in `pg.Pool` with OAuth refresh.
- `@databricks/appkit` npm package – Lakebase plugin and OBO (`asUser(req)`).

## Installing the substrate

For a JS/TS host (extension, Node service) that imports substrate functions, depend on this repo via a git URL:

```jsonc
// host package.json
"dependencies": {
  "@databricks-solutions/lakebase-app-dev-kit":
    "github:databricks-solutions/lakebase-app-dev-kit#<commit-sha-or-tag>"
}
```

Pin to a sha or release tag. `prepare` builds `dist/` on install so consumers can import from the package name. Once the npm scope admin step lands, `npm i -g @databricks-solutions/lakebase-app-dev-kit` becomes the canonical install path for the CLI bins.

For agent use (running the bins directly), clone the repo and run `npm install` once. The bins land in `node_modules/.bin/` and are also available as `node dist/scripts/.../<verb>.cli.js` for environments where adding to PATH is awkward.

## Operations

Each operation has a CLI bin AND a matching MCP tool. JS/TS callers can also import the same functions from the package. The MCP server covers full parity with the CLI bins; the precise tool inventory is generated from `apps/mcp-server/tools.ts`.

**Branch lifecycle** (`lakebase-branch` / `lakebase_branch_*`)
- `list` / `show` – enumerate or inspect branches on a project
- `create` / `delete` – Lakebase branch only (no git side-effects)
- `create-paired` / `delete-paired` – Lakebase + git + `.env` in lockstep
- `create-tier feature|test|uat|perf` – convention-tier branches with PSA TTL defaults
- `checkout-paired` / `sync-env` – recovery / drift-fix when `.env` lags

**Schema + migrations** (`lakebase-schema-diff`, `lakebase-schema-migrate`)
- `lakebase-schema-diff` – parent-aware diff between any branch and its parent
- `lakebase-schema-migrate apply|rollback|status|list` – Flyway / Alembic / Knex migrations against a branch

**PR flow** (`lakebase-pr` / `lakebase_pr_*`)
- `open` / `merge` / `merge-paired` (Lakebase feature-branch cleanup baked into the merge)
- `status` (by head branch) / `files` / `reviews` / `comments`

**Project lifecycle** (`lakebase-create-project`, `lakebase-doctor`)
- `lakebase-create-project` – end-to-end Lakebase + GitHub bootstrap
- `lakebase-doctor` – health check the local env (CLI version, auth, `.env` shape, project reachability, git remote, language, hooks). Exit codes 0/1/2 = OK/WARN/FAIL for CI use.

**Connection + auth** (`lakebase-get-connection`, `lakebase-github-token`)
- `lakebase-get-connection` – mint DSN or pg.Pool against a branch (single-seam credential mint)
- `lakebase-github-token` – resolve / diagnose the GitHub token (single-seam GitHub auth)

**Backup** (`lakebase-cut-backup`)
- Cut a no-expiry backup branch off a source branch

**TDD adoption** (`lakebase-adopt-sftdd`)
- Brownfield-only sibling to `lakebase-create-project`. Drops the `.sftdd/` workflow tree into an existing repo, reports drift on re-runs (`--update`), and can overwrite drifted templates (`--force`) or preview without writing (`--dry-run`).

**Infra test runner** (`lakebase-infra-runner`)
- Runs the `[Infra]`-tag suite for a Lakebase branch (schema-diff, migration status, endpoint readiness). Reads `--instance` / `--branch` flags first, then falls back to `LAKEBASE_PROJECT_ID` / `LAKEBASE_BRANCH_ID` so the same invocation works in a fresh dev shell (env set by the post-checkout hook) and in CI (env set by the resolve-credentials step). Exit codes: 0 = pass, 1 = check failed, 2 = input-validation. `--junit-output <path>` emits a JUnit XML report.

**Feature status** (`lakebase-feature-status`)
- One-screen snapshot of a feature's TDD workflow state. Reads `.sftdd/<feature-id>/...` and renders either human-readable or `--json` output. The TDD-paired companion command for `lakebase-sftdd-workflows` consumers; see that skill for the experiment / cycle / synthesis surface this drives.

**Workflow drift** (`lakebase_workflow_drift` MCP tool, `verifyProject` JS export)
- Checks that a project's `.githooks/` and `.github/workflows/*.yml` match the templates `lakebase-create-project` would lay down today. Exposed as an MCP tool and via `verifyProject(projectDir)` / `verifyHooks(projectDir)` / `verifyWorkflows(projectDir)` from the package; `lakebase-doctor` rolls this into its overall health check.

**Scaffolded-file drift** (`detectScaffoldedDrift` JS export, `detectCommandDrift` JS export)
- One umbrella primitive that reports drift across every scaffolded surface that stamps a kit version pin: `.github/workflows/*.yml` (via `detectWorkflowDrift`) and `.claude/commands/*.md` (via `detectCommandDrift`). Each command entry carries the project's pinned version (`Pinned to:`) plus the kit's current version, with the placeholder substitution re-applied so version-pin updates alone never register as drift. Hook files (`<name>.{pre,post}-hook.md`) are excluded from the walk: substrate doesn't own them.

**Slash-command refresh** (`lakebase-update-commands`)
- Refresh a scaffolded project's `.claude/commands/{design,build}.md` from the kit's current templates. Interactive per-file confirm by default; `--force` skips the prompt for unattended use; `--dry-run` previews without writing; `--json` emits a structured report. Hook files are NEVER touched. Sibling to `updateWorkflows` for the workflow surface; both consume the matching drift detector's vocabulary.

Run any bin with `--help` for the full subcommand + flag reference.

## Under the covers

What the substrate does on your behalf, in user-journey order. You don't invoke these primitives directly – the agent does, in response to the prompts in [How to use](#how-to-use). The exception is `create-project`, which is a one-shot bootstrap you can also run yourself via the `lakebase-create-project` bin (see the CLI cheat sheet).

### 1. Create-project

End-to-end project bootstrap – the first thing you'll touch. This is the one operation you may also run yourself via the `lakebase-create-project` bin; the agent prompt in [How to use](#how-to-use) flow 1 is the conversational equivalent.

When create-project finishes you get a scaffolded layout shaped like:

```
~/code/proj-checkout/                      ← local clone (parent dir is your choice)
  src/                                     ← language-specific scaffold (Java/Kotlin/Python/Node)
  db/migrations/                           ← Flyway / Alembic migrations land here
  .env.example                             ← committed; .env never is
  .githooks/                               ← post-checkout (refresh DSN), prepare-commit-msg (embed schema diff)
  .github/workflows/
    pr.yml                                 ← schema diff + tests on every PR
    merge.yml                              ← migrate parent on merge
  playwright.config.ts                     ← Playwright config (only with --enable-e2e; default-on for nodejs)
  tests/e2e/smoke.spec.ts                  ← Playwright smoke fixture, same gate as the config
  .claude/commands/                        ← /design + /build slash commands (opt-out via --skip-commands)
  .sftdd/                                    ← lakebase-sftdd-workflows scaffold (opt-out via --enable-tdd false)
  README.md, .gitignore, package.json/pom.xml/pyproject.toml, ...
```

Eleven steps run in order: GitHub repo creation, repo-visibility wait, clone or git-init, Lakebase project creation, default-branch resolution, language scaffold (Spring Initializr for Java/Kotlin, static templates for Python/Node), CI secrets sync, self-hosted runner setup (or GitHub-hosted), initial commit + push, and a health check. The non-fatal steps (secrets sync, runner setup, hook verification) collect into a warnings list rather than aborting. Hard-fatal errors (GitHub repo creation, Lakebase project creation, git push) abort and roll nothing back – manual cleanup is on you.

### 2. Branch lifecycle

Once the project exists, every piece of feature work starts by cutting a paired branch. Git-side operations (`git branch`, `git checkout`) stay with you and your IDE; this is the matching Lakebase-side that gives the branch its own database.

**Parent resolution.** When the agent creates a branch, it picks the parent in this order: an explicit override you specified ("branch from prod for this hotfix"), then a "branch I'm currently on" hint (git-like fork semantics), then the project's default branch (usually `production`). The "current branch" hint is ignored if it equals the target.

**Names.** Whatever you call the branch in conversation gets sanitized to a Lakebase id – lowercase, alphanumeric + hyphens, 3–63 chars. The substrate accepts a uid, the sanitized name, or the full resource path interchangeably when looking the branch up later.

**Idempotency.** Asking to create a branch that already exists returns the existing one unchanged. Deletion is not idempotent – asking to delete a branch that doesn't exist surfaces an error to you rather than silently succeeding.

### 3. Endpoint + credential

With a branch in hand, the next step is to connect to its database. The agent mints a Lakebase credential for that branch on demand – short-lived OAuth token, scoped to that branch only.

When it needs a DSN string (for `psql`, Flyway, Alembic, etc.) it gets one shaped like `postgresql://...`. When it needs a connection pool from JS/TS code, it gets a `pg.Pool` with auto-refresh built in. When it needs raw endpoint metadata (host + provisioning state), it gets that without touching credentials.

All of this funnels through one substrate helper – the single credential-minting seam – so a CI grep guard can detect any second code path trying to bypass it. You don't need to think about this; it just means there's exactly one place to look when credential issues arise.

### 4. Schema introspection

Once you're connected, you may want to see the current shape of the branch. The agent queries `information_schema` over the branch's DSN and returns the live tables and columns.

Skips `flyway_schema_history` by default – that table is migration metadata, not schema content. Returns an empty list when the branch is still provisioning (the endpoint has no host yet); the agent polls until it's ready.

### 5. Schema-diff

When you're ready to share work, the agent compares your branch against its parent – the branch's `sourceBranchId` in Lakebase metadata – so a feature branch forked from `staging` diffs against `staging`, not against `production`. When the source can't be resolved, falls back to the project's default branch.

The diff comes back as a structured summary: tables added / removed / modified, columns added / removed / type-changed, and an `inSync` boolean for the whole branch. You'd ask: "show me the diff" or "what changed since I forked." The `prepare-commit-msg` hook calls this automatically on a feature branch's first commit so the diff lands in the PR body for review.

## How to use

Four flows – shown as what you'd prompt your agent to do, using a running cart-checkout example (a project called `proj-checkout`, branch `feature-add-orders`). The bins listed in the CLI cheat sheet are also valid direct entry points; the prompts here are how you'd ask without remembering flags.

### 1. Bootstrap a new Lakebase-paired project

> "Create a new Lakebase-paired project called `proj-checkout` for the checkout flow. Use Java, a self-hosted runner, my GitHub org `my-org`, and the Databricks workspace at `https://<workspace>.cloud.databricks.com`."

The agent runs `lakebase-create-project` under the hood. When it returns you have a GitHub repo at `my-org/proj-checkout`, a Lakebase project with `production` as the default branch, a local clone with the language scaffold, `.github/workflows/{pr,merge}.yml`, `.githooks/` (post-checkout + prepare-commit-msg), `.env.example`, and `.sftdd/` (the TDD workflow scaffold). Initial commit pushed, CI auth secrets synced, runner registered.

Add "skip the .sftdd scaffold" to the prompt to opt out for projects that won't use `lakebase-sftdd-workflows`.

### 2. Cut a feature branch and inspect schema-diff against the parent

> "Cut a Lakebase feature branch off `staging` called `feature-add-orders`, switch git to it, apply the new migration at `db/migrations/V003__add_orders.sql`, and show me the schema diff against staging."

The agent cuts the paired Lakebase branch, runs `git checkout -b feature-add-orders` (the post-checkout hook refreshes `.env`), pipes the migration through `lakebase-get-connection --output dsn`, and prints the diff from `lakebase-schema-diff`. The diff is JSON: tables added/removed/modified, columns added/removed/changed, an `inSync` boolean.

### 3. Open a PR with the schema-diff embedded in the body

> "Open a PR from `feature-add-orders` to `staging` for `my-org/proj-checkout` titled 'Add orders table'. Include the schema diff in the body."

In most cases you don't even need to ask – the `prepare-commit-msg` hook (installed by `create-project`) already writes the schema diff into the first commit on a feature branch, so `gh pr create` or the GitHub UI picks it up automatically. The prompt above is for when you want the agent to do it programmatically (catching drift between PR-open and PR-merge by re-running the diff is the job of CI's `pr.yml`).

### 4. Recover when a checkout left the DSN pointing at the wrong branch

Happens when the post-checkout hook is missing, disabled, or you switched branches outside git (e.g. via an IDE that skipped hooks). The DSN in `.env` still points at the previous branch.

> "My `.env` DSN looks stale – refresh it to point at the Lakebase branch matching the git branch I'm currently on."

The agent reads the current git branch, calls `lakebase-get-connection --output dsn --write-env` for that branch, and confirms the new `DATABASE_URL`. If you hit this often, ask: "Reinstall the git hooks" – that runs `bash .githooks/install.sh`.

### 5. Catch drifted scaffold files and refresh them safely

The kit's scaffolded surfaces (`.github/workflows/*.yml`, `.claude/commands/{design,build}.md`) stamp a kit version pin at scaffold time. As the kit evolves those project-side files lag. The drift detector surfaces the gap; the refresher closes it without touching project-owned hook files.

> "Are my Lakebase scaffolded files in sync with the current kit?"

The agent runs `detectScaffoldedDrift({ projectDir })` (or `lakebase-update-commands --dry-run` for the command surface specifically) and shows a report grouped by file. For the workflow surface, `updateWorkflows()` fast-forwards; for the command surface, `lakebase-update-commands` defaults to an interactive per-file confirm so a project that customised `/design` deliberately gets to keep its edits.

**End-to-end verification recipe** (use this when validating a substrate change, not just the kit's hermetic BDD):

```bash
# 1. Scaffold a fresh project (any language).
lakebase-create-project \
  --project-name drift-smoke \
  --parent-dir /tmp \
  --databricks-host https://your-workspace.cloud.databricks.com \
  --no-github \
  --language nodejs

# 2. Baseline: should be all-unchanged.
lakebase-update-commands --project-dir /tmp/drift-smoke --dry-run

# 3. Introduce drift in design.md (project customization).
sed -i.bak 's/^# \/design/# \/design (project-customized)/' \
  /tmp/drift-smoke/.claude/commands/design.md

# 4. Detector should flag design.md as `updated` (in dry-run); build.md `unchanged`.
lakebase-update-commands --project-dir /tmp/drift-smoke --dry-run

# 5. Refresh; --force skips the per-file confirm.
lakebase-update-commands --project-dir /tmp/drift-smoke --force

# 6. Add a project-owned hook and confirm the refresher does NOT touch it.
echo '# project hook' > /tmp/drift-smoke/.claude/commands/design.pre-hook.md
lakebase-update-commands --project-dir /tmp/drift-smoke --force
diff <(echo '# project hook') /tmp/drift-smoke/.claude/commands/design.pre-hook.md
```

The same flow applies to the `--enable-e2e`-scaffolded `playwright.config.ts` + `tests/e2e/smoke.spec.ts`: a future drift on those files will surface here once they're brought under the detector's umbrella. For the `[E2E]`-tag agent contract (which connects an `[E2E]` AC's outcome back to `outcomes.json`), see [`../lakebase-sftdd-workflows/`](../lakebase-sftdd-workflows/) under "Comparison, promote, synthesize".

## CLI cheat sheet

| Bin | Purpose |
|---|---|
| `lakebase-create-project` | End-to-end Lakebase + GitHub project bootstrap (see flow 1). |
| `lakebase-branch` | Branch lifecycle: list / show / create / create-paired / create-tier / delete / delete-paired / checkout-paired / sync-env. Paired ops keep git + Lakebase + `.env` in lockstep. |
| `lakebase-pr` | PR flow: open / merge / merge-paired / status (by --head) / files / reviews / comments. `merge-paired` deletes the matching Lakebase feature branch on merge. |
| `lakebase-doctor` | Health-check the local env. Run first when something looks off. Exit codes 0/1/2 = OK/WARN/FAIL for CI. |
| `lakebase-get-connection` | Mint a DSN string (`--output dsn`) or pg.Pool (`--output pool`) against any branch. Add `--write-env` to refresh `.env`. |
| `lakebase-schema-diff` | Parent-aware schema diff between any branch and its parent (or a comparison override). |
| `lakebase-schema-migrate` | Apply / rollback / status / list schema migrations against a branch (Flyway / Alembic / Knex). |
| `lakebase-cut-backup` | Cut a no-expiry backup branch off a source branch. |
| `lakebase-detect-language` | Detect project language for CI step outputs (`java` / `kotlin` / `python` / `nodejs`). |
| `lakebase-github-token` | Resolve / diagnose the GitHub token via the same auth chain CI uses. |
| `lakebase-adopt-sftdd` | Drop the `.sftdd/` workflow tree into an existing repo. Supports `--update`, `--force`, `--dry-run`. |
| `lakebase-infra-runner` | Run the `[Infra]`-tag suite (schema-diff + migration status + endpoint readiness) for a branch. Used by scaffolded `test:infra` scripts. |
| `lakebase-update-commands` | Refresh a scaffolded project's `.claude/commands/{design,build}.md` from the kit's current templates. Interactive per-file confirm by default; `--force` skips prompts, `--dry-run` previews, `--json` emits a structured report. Hook files (`<name>.{pre,post}-hook.md`) are NEVER touched. |
| `lakebase-feature-status` | One-screen snapshot of a TDD feature's workflow state. Pairs with `lakebase-sftdd-workflows`. |
| `lakebase-mcp-server` | Stdio MCP server exposing the full tool surface (parity with the CLI bins). For Claude Desktop / OpenAI Codex / Cursor-via-MCP / Genie Code consumers. |

## JS/TS exports

Every CLI bin is a thin wrapper around a substrate function published from `@databricks-solutions/lakebase-app-dev-kit`. Hosts that embed the substrate (the `lakebase-scm-extension` VS Code/Cursor extension, custom Node services, agent tools) import these directly instead of shelling out. The full list comes from `dist/scripts/index.d.ts`; the most-used entry points by area:

**Branch lifecycle** (`./lakebase` subpath or root):
- `createBranch`, `deleteBranch`, `waitForBranchReady` (Lakebase-only CRUD)
- `createPairedBranch`, `deletePairedBranch`, `checkoutPaired`, `syncEnvToCurrentBranch` (git + Lakebase + `.env` lockstep)
- `createFeatureBranch`, `createTestBranch`, `createUatBranch`, `createPerfBranch` plus `CONVENTION_TIER_DEFAULTS` (tier conventions with PSA TTLs)
- `asBranchName`, `asBranchUid`, `looksLikeBranchUid`, `branchNameFromResourcePath` (id parsing; the substrate accepts uid, sanitized name, or resource path interchangeably)

**Connection + endpoint**:
- `getConnection({ output: "dsn" | "pool", ... })` (single-seam credential mint, overloaded return type)
- `getEndpoint`, `ensureEndpoint`, `resolveEndpointHost`, `endpointPath` (raw endpoint metadata without minting credentials)
- `mintCredential`, `getCredential`, `waitForBranchAuthReady`, `resolveCurrentUser` (OAuth + auth-readiness primitives)
- `POSTGRES_PORT`, `DEFAULT_DATABASE`, `DEFAULT_ENDPOINT` (constants)

**Schema**:
- `getSchemaDiff` (parent-aware structured diff; returns `SchemaDiffResult` with `tablesAdded` / `tablesRemoved` / `tablesModified` / `inSync`)
- `queryBranchSchema`, `queryBranchTables` (live `information_schema` introspection over a branch's DSN)

**Migrations**:
- `applySchemaMigrations`, `rollbackSchemaMigration`, `schemaMigrationStatus`, `listSchemaMigrations` (Flyway / Alembic / Knex via a shared adapter)
- `detectLanguage(projectDir)`, `toolForLanguage(language)` (language to migration tool mapping)
- `FlywayAdapter`, `AlembicAdapter`, `KnexAdapter` (per-tool adapter values, for custom orchestration)

**Project bootstrap**:
- `createProject(args, onProgress?)` (the orchestrator behind `lakebase-create-project`; returns `CreateProjectResult` with the warnings list non-fatal steps collect into)
- `layDownTddScaffold(targetDir)` and `adoptTdd(args)` (greenfield + brownfield TDD scaffolds)
- `deployLanguageProject`, `deploySpringStarter`, `SpringInitializrClient`, `resolveLatestBootVersion`, `resolveLatestLtsJavaVersion`, `isPrereleaseBootVersion`, `isLtsJavaVersion` (language scaffolds; Spring Initializr for Java / Kotlin, static templates for Python / Node)

**Project verification**:
- `verifyProject`, `verifyHooks`, `verifyWorkflows` (drift checks against the templates `create-project` would lay down today; `lakebase-doctor` consumes these)
- `runDoctor(args)` (the orchestrator behind `lakebase-doctor`; returns `DoctorReport` with per-check `ok` / `warn` / `fail` / `skip` status)

**Scaffolded-file drift + refresh**:
- `detectWorkflowDrift`, `detectCommandDrift`, `detectScaffoldedDrift` (per-surface + umbrella drift reports. Command entries carry pinned + current kit version; placeholder substitution is re-applied so version-pin updates do not register as drift. Hook files are excluded from the walk.)
- `updateWorkflows`, `updateCommands` (in-place refresh primitives. `updateCommands({ force: false })` leaves drifted files alone and reports them as `preserved` so a per-file confirm flow can decide one at a time.)

**GitHub** (from `./github` subpath or root):
- `resolveGitHubToken`, `diagnoseGitHubAuth`, `tryVsCodeSession`, `tryGhAuthToken`, `GITHUB_SCOPES` (token resolution chain: env → VS Code session → `gh auth token`)
- `createPullRequest`, `getPullRequest`, `mergePullRequest`, `mergePairedPullRequest`, `getPullRequestReviews`, `getPullRequestFiles`, `getPullRequestComments`, `listIssueComments`, `listWorkflowRuns`, `fastForwardBranch` (PR flow primitives behind `lakebase-pr`)
- `createRepo`, `deleteRepo`, `repoExists`, `getRepoFullName`, `getCurrentUser` (GitHub repo CRUD used by `create-project`)
- `createRegistrationToken`, `listRepoRunners`, `getRunnerIdByName`, `getRunnerStatus`, `deleteRunner` (self-hosted runner management)
- `setRepoSecret`, `setRepoSecrets`, `listSecretNames` (CI secrets sync)

**Env file** (`./lakebase`):
- `writeEnvFile`, `updateEnvConnection` (the `.env` writes behind `--write-env` and the post-checkout hook)

**Infra runner**:
- `runInfraSuite(args)` returning `InfraSuiteResult`, plus `formatJUnit(result)` for CI report emission. This is what `lakebase-infra-runner` and the scaffolded `test:infra` script call.

**Backup**:
- `cutBackup(args)` returning `CutBackupResult` (the substrate behind `lakebase-cut-backup`)

Typical call sites:

```ts
import {
  getConnection,
  getSchemaDiff,
  createPairedBranch,
} from "@databricks-solutions/lakebase-app-dev-kit";

const { dsn } = await getConnection({
  output: "dsn",
  instance: "proj-checkout",
  branch: "feature-add-orders",
});

const diff = await getSchemaDiff({
  instance: "proj-checkout",
  branch: "feature-add-orders",
});
```

Subpath imports (`@databricks-solutions/lakebase-app-dev-kit/lakebase`, `/github`, `/git`, `/util`) are available for hosts that want narrower bundles.

## Composition

- **TDD on Lakebase-paired projects**: paired with [`lakebase-sftdd-workflows`](../lakebase-sftdd-workflows/README.md). This skill owns branch + schema + PR plumbing; TDD-workflows layers experiment / cycle / synthesis on top.
- **Inside VS Code/Cursor**: the [`lakebase-scm-extension`](https://github.com/databricks-solutions/lakebase-scm-extension) consumes the same substrate via npm dep – same operations, different presentation layer.
