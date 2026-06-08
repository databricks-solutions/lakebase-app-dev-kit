---
name: lakebase-scm-workflows
description: "Opinionated git-Lakebase branch-pairing workflows. Use when scaffolding a Lakebase-paired project, creating/deleting Lakebase branches in lockstep with git branches, diffing parent-aware schemas, opening or merging PRs that touch Lakebase, or running the same operations the lakebase-scm-extension exposes in VS Code."
compatibility: Requires databricks CLI (>= v0.294.0), git (>= 2.30), Node.js (>= 20), and @databricks-solutions/lakebase-app-dev-kit
metadata:
  version: "0.1.0"
parent: databricks-lakebase
---

# lakebase-scm-workflows – agent contract

Agent-facing contract: operating rules (`.env`, git hooks, credential single-seam), concrete code patterns for each substrate primitive, and reference pointers.

For the human-facing overview (prerequisites, installation, prompts, journey, CLI cheat sheet) see [`README.md`](README.md).

**FIRST**: load the parent `databricks-lakebase` skill for Lakebase Postgres CLI basics (project / branch / endpoint shapes, name formats, "never delete the production branch" rule). This skill composes on top of it.

## Project state – when `.env` matters

The substrate API takes explicit args (`instance`, `branch`, etc.) on every public function – agents can drive every operation without a project `.env` at all. **But** when an agent is acting AS the developer in a checked-out paired project, the project's `.env` is the source of truth for "which Lakebase branch is this workspace currently paired with."

| Agent context | `.env` contract |
|---|---|
| In a checked-out paired project (Claude Code / Cursor / Genie Code on a developer's machine) | **Respect it.** Read `LAKEBASE_PROJECT_ID` to derive `instance`. After `git checkout`, call `syncEnvToCurrentBranch({ cwd })` so `.env` matches the new branch – otherwise the bundled CI scripts (`refresh-token.sh`, `flyway-migrate.sh`) and the git hooks operate on stale credentials. |
| Sandbox / no workspace (Claude Desktop, OpenAI Agent Builder, exploratory) | **Ignore it.** Pass `instance` and `branch` explicitly per call. Substrate never requires `.env`. |
| Bootstrapping a new project | **N/A.** `createProject` creates the `.env` for you as step 7. No `.env` exists before that. |

**Connection-block keys** (managed by `syncEnvToCurrentBranch` / `updateEnvConnection` / `post-checkout.sh`):

```
LAKEBASE_BRANCH_ID=feature-x
DATABASE_URL=postgresql://user%40databricks.com:tok@host:5432/databricks_postgres?sslmode=require
DB_USERNAME=user@databricks.com
DB_PASSWORD=tok
```

These four are the rewritten set on every branch switch. Anything else in `.env` is preserved verbatim.

**Project-level keys** (written once by `writeEnvFile` during project bootstrap, never rewritten):

```
DATABRICKS_HOST=https://workspace.cloud.databricks.com
LAKEBASE_PROJECT_ID=my-app
```

If you're an agent dropping into a project mid-session, read these first to know what `instance` to pass to every subsequent operation.

## Workflow state surface – `.lakebase/workflow-state.json`

The SCM workflow is a five-state machine: `scaffold-complete` → `feature-claimed` → `pr-ready` → `ci-green` → `merged`. Its gate surface is a single JSON file at the project root, validated against [`scm-workflow-state.schema.json`](../../scripts/lakebase/scm-workflow-state.schema.json). The current state plus its invariants (feature id, branch, parent branch, Lakebase UID, PR URL, CI URL) are persisted there.

Inspect it via:

```bash
lakebase-scm-state                          # human-readable, with gate ladder
lakebase-scm-state --json --pretty          # machine-readable report
lakebase-scm-state --project-dir ~/repos/x  # different project root
```

Read / write programmatically:

```ts
import {
  readWorkflowState,
  writeWorkflowState,
  initWorkflowState,
  describeGates,
} from "@databricks-solutions/lakebase-app-dev-kit";

const s = readWorkflowState(projectDir);    // ScmWorkflowState | null
writeWorkflowState(projectDir, {            // validates first; atomic write
  ...initWorkflowState({ projectId: "demo", tierTopology: 2 }),
});
const gates = describeGates(s!);            // gate ladder for tooling
```

Phase A (advisory data layer): `lakebase-create-project` seeds the `scaffold-complete` row at end-of-scaffold and `lakebase-scm-state` reads it. A seed failure surfaces as a project warning, not a scaffold abort.

Phase B (first blocking transition): `lakebase-scm-claim-feature-branch` is the canonical "start a new feature" verb. It enforces its precondition in code (state must be `scaffold-complete` or `merged`), calls the substrate primitive `createFeaturePairedBranch` (Lakebase branch + git branch + .env sync, 30-day TTL), and advances the state file to `feature-claimed`. /design's pre-hook invokes it; the substrate-only-path invariant is enforced through this bin.

```bash
lakebase-scm-claim-feature-branch initial-domain          # claim
lakebase-scm-claim-feature-branch initial-domain --json   # machine-readable
lakebase-scm-claim-feature-branch hotfix-x --parent main  # override tier-default parent
lakebase-scm-claim-feature-branch initial-domain          # idempotent re-run = no-op
```

Exit codes: `0` success (incl. idempotent no-op), `1` no state file, `2` precondition refused, `3` substrate failure.

Programmatic equivalent:

```ts
import { claimFeatureBranch } from "@databricks-solutions/lakebase-app-dev-kit";

const { state, paired, alreadyClaimed } = await claimFeatureBranch({
  projectDir,
  featureId: "initial-domain",
});
```

### Full SCM CLI surface (alpha.45, phase C)

The workflow is driven entirely by CLI bins, one per transition. Each enforces its precondition in code, calls the underlying substrate primitives, and writes the new state row.

| Bin | Transition | Substrate it wraps |
|-----|------------|--------------------|
| `lakebase-scm-state` | inspect (read-only) | (reads `.lakebase/workflow-state.json`) |
| `lakebase-scm-doctor` | diagnose (read-only) | cross-checks state + git + Lakebase + .env |
| `lakebase-scm-adopt-state` | seed for existing projects | listBranches + getBranchByName + getCurrentBranch |
| `lakebase-scm-recover-orphans [--claim]` | retroactively pair orphan git branches | createFeaturePairedBranch per orphan |
| `lakebase-scm-claim-feature-branch <id>` | scaffold-complete \| merged -> feature-claimed | createFeaturePairedBranch |
| `lakebase-scm-abandon-feature` | feature-claimed -> scaffold-complete | deletePairedBranch + git checkout |
| `lakebase-scm-prepare-pr` | feature-claimed -> pr-ready | git push + createPullRequest |
| `lakebase-scm-wait-ci [--timeout-sec N]` | pr-ready -> ci-green | getPullRequest poll loop |
| `lakebase-scm-merge [--method squash\|merge\|rebase]` | ci-green -> merged | mergePairedPullRequest + git cleanup |

All bins support `--project-dir <dir>` (default cwd), `--json`, `--pretty`, and `--help`.

End-to-end usage (alpha.45):

```bash
# Scaffold a fresh project (Step 8c seeds scaffold-complete).
lakebase-create-project --tiers 2 ...

# Existing projects opt in once.
lakebase-scm-adopt-state
# Or, if they have pre-phase-C orphan branches:
lakebase-scm-recover-orphans          # detect-only
lakebase-scm-recover-orphans --claim  # pair every orphan via the substrate

# Per-feature cycle.
lakebase-scm-claim-feature-branch initial-domain
# ... write code, run tests ...
lakebase-scm-prepare-pr
lakebase-scm-wait-ci
lakebase-scm-merge
# state is now merged; the next claim returns from merged to feature-claimed.

# Inspect / diagnose at any point.
lakebase-scm-state --json --pretty
lakebase-scm-doctor
```

Exit-code conventions across all bins: `0` success / idempotent no-op / clean doctor report, `1` no state file (or doctor warnings only), `2` precondition refused (or doctor failures), `3` substrate failure. `lakebase-scm-wait-ci` adds `3` for CI failure (state unchanged) and `4` for timeout (state unchanged).

### Phase C: substrate-only-path is now enforced

The post-checkout git hook (`templates/project/common/scripts/post-checkout.sh`) used to silently create Lakebase branches as a fallback for orphan git branches. Phase C retires that fallback: a `git checkout -b feature/foo` with no prior substrate call leaves `.env` untouched and the hook prints a clear error pointing the user at `lakebase-scm-claim-feature-branch` or `lakebase-scm-recover-orphans`. The substrate is the only path; the SCM workflow is how that path is enforced in code.

Future work past phase C: downstream-CI wait in `lakebase-scm-merge` (block until merge.yml applies migrations to production) and `lakebase-scm-doctor --fix <id>` for targeted remediations.

## Sync without an IDE – the git hooks

The construct that keeps a Lakebase branch and a git branch in sync in a plain terminal session (no extension, no explicit substrate call) is the **bundled git hooks** that `scaffoldAll` / `installHooks` drops into `.git/hooks/` during project bootstrap. They are the default-on automatic sync mechanism. Agents driving raw `git` commands inherit them for free.

| Hook | Fires on | What it does |
|---|---|---|
| `post-checkout` | `git checkout <branch>` | Reads new current branch → finds matching Lakebase branch → mints fresh credential → rewrites `.env` connection block. **The primary sync mechanism.** |
| `post-merge` | `git merge` | Runs Flyway migrations against the now-current Lakebase branch so schema catches up. |
| `pre-push` | `git push` | Schema-diff guard – surfaces unmigrated changes before remote sees them. |
| `prepare-commit-msg` | `git commit` | Embeds Lakebase branch context in commit messages so the schema-diff CI workflow can find them. |

**Practical implications for an agent:**

1. **Don't fight the hooks.** If you run `git checkout feature-x` in a paired project, `.env` auto-updates. Don't also call `syncEnvToCurrentBranch` defensively – let the hook own that side of the workflow.
2. **Hooks don't create branches.** They sync state after-the-fact. To CREATE a Lakebase branch (which has no git equivalent), use the substrate's `createPairedBranch` – it creates the Lakebase side first, then `git checkout -b` triggers the hook to populate credentials.
3. **If hooks aren't installed, re-arm them.** Some workflows clone a paired project without scaffolding (e.g. cloning someone else's checkout). The substrate's `installHooks(projectDir)` is the recovery – copies `scripts/post-checkout.sh` and siblings into `.git/hooks/` with the right permissions.
4. **For pure-API sessions (no checkout) the hooks are irrelevant.** A Claude Desktop sandbox or OpenAI Agent Builder session that just calls `getConnection({ instance, branch })` doesn't have a `.git/` to install hooks into – and doesn't need them. The hooks only matter when an agent (or human) is driving a working tree with `git` commands.

The bundled hook scripts live in `templates/project/common/scripts/`.

## Credential handoff – two helpers, one pattern

Two narrow auth seams – one for Lakebase, one for GitHub. Both follow the same shape: single module, dynamic-runtime fallback chain, CI grep guard preventing any other file from resolving credentials directly.

### GitHub

```bash
lakebase-github-token                 # print token to stdout
lakebase-github-token --diagnose      # which sources are configured
```

```ts
import { resolveGitHubToken } from "@databricks-solutions/lakebase-app-dev-kit";
const token = await resolveGitHubToken();
```

Fallback: `GITHUB_TOKEN` env → VS Code `getSession` (extension host only, via dynamic `import('vscode')`) → `gh auth token` → clear error. Scopes: `['repo', 'workflow', 'delete_repo']`. Full docs: [`references/github-auth.md`](references/github-auth.md).

### Lakebase

Every workflow op that touches Lakebase resolves credentials through a single seam:

```bash
lakebase-get-connection --output dsn --instance <id> --branch <name>
# -> libpq URL string (use for Flyway, Alembic, psql)
```

```ts
import { getConnection } from "@databricks-solutions/lakebase-app-dev-kit";
const pool = await getConnection({ output: "pool", instance, branch });
// -> @databricks/lakebase pg.Pool with refresh-on-connect
```

DSN and Pool resolve to the same database via the same OAuth substrate. Never call `databricks postgres generate-database-credential` from anywhere else in your code – a CI grep guard fails the build if you do. Full docs: [`references/get-connection.md`](references/get-connection.md).

## Operations

Concrete invocations per primitive, in user-journey order. The agent reads these to know what to call; humans see the conversational equivalent in [`README.md`'s "How to use"](README.md#how-to-use).

### 1. Create-project

End-to-end project bootstrap.

```bash
lakebase-create-project \
  --project-name proj-checkout \
  --parent-dir ~/code \
  --databricks-host https://workspace.cloud.databricks.com \
  --github-owner my-org \
  --language java \
  --runner self-hosted
# -> JSON on stdout: { projectDir, githubRepoUrl, lakebaseProjectId, lakebaseDefaultBranch, warnings }

# Local-only (no GitHub side effects):
lakebase-create-project --project-name proj-checkout --parent-dir ~/code \
  --databricks-host https://workspace.cloud.databricks.com --no-github

# Wire Playwright into the project so [E2E]-tagged AC rows have a runner.
# Default-on for --language nodejs; opt in elsewhere with --enable-e2e or
# turn off with --no-e2e:
lakebase-create-project ... --language nodejs --enable-e2e

# Skip the .claude/commands/{design,build}.md scaffold (for projects
# that already have their own slash commands or non-Claude-Code consumers):
lakebase-create-project ... --skip-commands
```

```ts
import { createProject } from "@databricks-solutions/lakebase-app-dev-kit";
const result = await createProject({
  projectName: "proj-checkout",
  parentDir: process.env.HOME + "/code",
  databricksHost: "https://workspace.cloud.databricks.com",
  githubOwner: "my-org",
  language: "java",
  runnerType: "self-hosted",
  enableTdd: true,                // default: true – lays down .tdd/ scaffold
  enableE2e: undefined,           // default: true for nodejs, false otherwise.
                                  // Explicit boolean overrides the language default.
  skipCommands: false,            // default: false – writes .claude/commands/{design,build}.md
});
```

Eleven-step orchestration. Non-fatal failures (CI secrets sync, runner setup, hook/workflow verification) land in `result.warnings[]`. Hard-fatal errors (input validation, GitHub repo creation, Lakebase project creation, git operations, push rejection on workflow scope) throw.

### 2. Branch lifecycle

Lakebase branch CRUD plus paired git+Lakebase+.env ops. The `lakebase-branch` bin is the shell-friendly entrypoint; same operations import directly from the package for JS/TS hosts.

```bash
# Lakebase-only branch lifecycle
lakebase-branch list --instance proj-checkout
lakebase-branch show --instance proj-checkout --branch feature-add-orders
lakebase-branch create --instance proj-checkout --branch feature-add-orders --parent staging
lakebase-branch delete --instance proj-checkout --branch feature-add-orders

# Paired (Lakebase + git + .env in lockstep)
lakebase-branch create-paired --instance proj-checkout --branch feature-add-orders --cwd .
lakebase-branch delete-paired --instance proj-checkout --branch feature-add-orders --cwd .

# Recovery / drift fix when .env lags the current git branch
lakebase-branch checkout-paired --cwd .
lakebase-branch sync-env --cwd .

# Convention tiers (PSA branching methodology, TTL defaults per tier)
lakebase-branch create-tier feature --instance proj-checkout --branch feature-add-orders
lakebase-branch create-tier test    --instance proj-checkout --branch test-cycle-q3
```

All 9 subcommands have matching MCP tools (`lakebase_branch_list` / `_show` / `_create` / `_create_paired` / `_create_tier` / `_delete` / `_delete_paired` / `_checkout_paired` / `_sync_env`).

```ts
import { createBranch, deleteBranch, createPairedBranch, deletePairedBranch,
         checkoutPaired, syncEnvToCurrentBranch }
  from "@databricks-solutions/lakebase-app-dev-kit";

// Lakebase-only
const branch = await createBranch({
  instance: "proj-checkout",
  branch: "feature-add-orders",     // sanitized to Lakebase id (lowercase, alphanumeric+hyphen, 3-63 chars)
  parentBranch: "staging",            // optional – overrides default
});
await deleteBranch({ instance: "proj-checkout", branch: branch.uid });

// Paired (extension-style behavior)
await createPairedBranch({
  instance: "proj-checkout",
  branch: "feature-add-orders",
  cwd: process.cwd(),
  parentBranch: "staging",
});
// post-checkout-hook equivalent (rewrites .env)
await checkoutPaired({ cwd: process.cwd() });
```

**Parent resolution precedence:**
1. `parentBranch` arg (explicit override – "branch from prod" / "branch from staging" hotfix)
2. Project default branch (usually `production`)

**Idempotency.** `createBranch` returns the existing branch unchanged if one with the same sanitized name already exists. Delete is NOT idempotent – throws when the branch isn't found.

**Protected branches.** `deleteBranch` and `deleteLocalBranch` refuse `production` / `main` / `master` unless the caller explicitly passes `allowProtected: true`. The CLI doesn't expose that override on purpose – production deletion is a deliberate-action thing, not a flag.

### 3. Endpoint + credential

```bash
lakebase-get-connection --output dsn --instance proj-checkout --branch feature-add-orders
# -> postgresql://... DSN

lakebase-get-connection --output dsn --instance proj-checkout --branch feature-add-orders --write-env
# -> Same DSN, but also rewrites .env DATABASE_URL block (recovery from broken post-checkout hook)
```

```ts
import { getConnection, getEndpoint, getCredential }
  from "@databricks-solutions/lakebase-app-dev-kit";

// DSN string (for Flyway, Alembic, psql):
const { dsn } = await getConnection({ output: "dsn", instance, branch });

// Connection pool with OAuth refresh:
const pool = await getConnection({ output: "pool", instance, branch });

// Just the endpoint metadata (host + state):
const endpoint = await getEndpoint({ instance, branch });
// -> { host: "instance-...", state: "ACTIVE" } | undefined

// Just the raw token + email (resolves branch path, then mints via the single seam):
const { token, email } = await getCredential({ instance, branch });
```

### 4. Schema introspection

```bash
node -e "import('@databricks-solutions/lakebase-app-dev-kit').then(m => m.queryBranchSchema({instance:'proj-checkout', branch:'feature-add-orders'}).then(r => console.log(JSON.stringify(r, null, 2))))"
# -> [{ name: 'users', columns: [{ name: 'id', dataType: 'uuid' }, ...] }, ...]
```

```ts
import { queryBranchSchema, queryBranchTables }
  from "@databricks-solutions/lakebase-app-dev-kit";

const schema = await queryBranchSchema({ instance, branch });
const tables = await queryBranchTables({ instance, branch });
```

Skips `flyway_schema_history` by default. Returns `[]` when the endpoint has no host yet (branch still provisioning) – caller can poll.

### 5. Schema-diff

Parent-aware schema diff between two Lakebase branches. Compares the target branch against its parent (the branch's `sourceBranchId` in Lakebase metadata) – for a feature forked from `staging`, that means diff vs `staging`, not vs `production`. Falls back to the project's default branch when the source can't be resolved.

```bash
lakebase-schema-diff --instance proj-checkout --branch feature-add-orders
# -> SchemaDiffResult JSON

lakebase-schema-diff --instance proj-checkout --branch feature-add-orders --against staging --pretty
```

```ts
import { getSchemaDiff } from "@databricks-solutions/lakebase-app-dev-kit";

const diff = await getSchemaDiff({
  instance: "proj-checkout",
  branch: "feature-add-orders",
  // against: "staging",   // optional pin; otherwise auto-resolves from sourceBranchId
});
```

**Output shape** (matches the extension's modal data contract):

```json
{
  "branchName": "feature-add-orders",
  "comparisonBranchName": "staging",
  "timestamp": "2026-05-22T...",
  "migrations": [],
  "created":  [{ "type": "TABLE", "name": "...", "columns": [...] }],
  "modified": [
    { "type": "TABLE", "name": "...",
      "columns": [...], "addedColumns": [...], "removedColumns": [...],
      "prodColumns": [...] }
  ],
  "removed": [...],
  "branchTables": [...],
  "inSync": false
}
```

`migrations` is always empty in the script output – that's a workspace-file concern, not a Lakebase-side one. The extension layer fills it in locally when rendering. `prodColumns` is named for legacy modal compatibility; it carries the parent (comparison) columns regardless of whether the comparison target is production.

### PR flow

```bash
# Open + introspect + merge from a plain shell
lakebase-pr open --owner-repo my-org/proj-checkout --head feature-add-orders \
                 --base staging --title "Add orders table" --body "..."
lakebase-pr status --owner-repo my-org/proj-checkout --head feature-add-orders --pretty
lakebase-pr files --owner-repo my-org/proj-checkout --pull-number 42
lakebase-pr reviews --owner-repo my-org/proj-checkout --pull-number 42

# Merge variants
lakebase-pr merge --owner-repo my-org/proj-checkout --pull-number 42 --method squash
# merge-paired: also deletes the matching Lakebase feature branch
lakebase-pr merge-paired --owner-repo my-org/proj-checkout --pull-number 42 --instance proj-checkout
```

All 7 subcommands have matching MCP tools (`lakebase_pr_open` / `_merge` / `_merge_paired` / `_status` / `_files` / `_reviews` / `_comments`).

```ts
import {
  createPullRequest, getPullRequest, mergePullRequest, mergePairedPullRequest,
  getPullRequestReviews, getPullRequestFiles, getPullRequestComments,
} from "@databricks-solutions/lakebase-app-dev-kit";

// Open a PR with the current branch's schema diff embedded in the body.
const diff = await getSchemaDiff({ instance: "proj-checkout", branch: "feature-add-orders" });
await createPullRequest({
  ownerRepo: "my-org/proj-checkout",
  baseBranch: "staging",
  headBranch: "feature-add-orders",
  title: "Add orders table",
  body: [
    "## Summary",
    "Introduces the `orders` table to support the checkout flow.",
    "",
    "## Schema diff (vs staging)",
    "```json",
    JSON.stringify(diff, null, 2),
    "```",
  ].join("\n"),
});
```

`mergePairedPullRequest` merges the git PR AND tears down the Lakebase feature branch in lockstep. Use it for clean post-merge state on paired projects.

### Health check / doctor

Run `lakebase-doctor` first when something looks off. Eight checks: Databricks CLI presence + version, auth describe, workspace identity, `.env` shape, Lakebase project reachability, git remote, detected language, git hooks installation.

```bash
lakebase-doctor                                # human-readable table; exit 0/1/2 = OK/WARN/FAIL
lakebase-doctor --json --pretty                # machine-readable for CI / agent consumption
lakebase-doctor --project-dir ~/code/proj-checkout
```

Also reachable as the `lakebase_doctor` MCP tool. When an agent reports cryptic "auth failed" or ".env not found" symptoms, this is the first thing to run.

### Scaffolded-file drift detection and refresh

Scaffolded projects ship copies of the kit's templates at scaffold time. As the kit evolves, those project-side files lag behind. Two surfaces stamp a kit version pin and are eligible for the drift loop: `.github/workflows/*.yml` (via `{{LAKEBASE_KIT_VERSION}}`) and `.claude/commands/*.md` (via `${KIT_VERSION_AT_SCAFFOLD}`). Both report through one umbrella primitive.

```ts
import {
  detectWorkflowDrift,
  detectCommandDrift,
  detectScaffoldedDrift,
  updateWorkflows,
  updateCommands,
} from "@databricks-solutions/lakebase-app-dev-kit";

// One verdict across every scaffolded surface.
const report = detectScaffoldedDrift({ projectDir });
// report.overall: "ok" | "drift"
// report.workflows.files[]: WorkflowFileStatus with status drifted/missing/extra/unchanged + unified diff
// report.commands.files[]: CommandFileEntry with pinned_version, kit_version, diff. Hook files
//   (<name>.{pre,post}-hook.md) are excluded; substrate does not own them.

// Refresh per surface. updateCommands(force: false) leaves drifted files alone
// and reports them as "preserved" so a per-file confirm flow can decide one at a time.
updateWorkflows({ projectDir, dryRun: false });
updateCommands({ projectDir, dryRun: false, force: true });
```

```bash
# Refresh design.md + build.md from the current kit. Interactive per-file
# confirm by default; --force skips prompts for unattended use; --dry-run
# prints outcomes without writing.
lakebase-update-commands                              # human-readable summary
lakebase-update-commands --dry-run                    # preview without writing
lakebase-update-commands --force                      # unattended
lakebase-update-commands --json                       # structured report for CI
lakebase-update-commands --project-dir ~/code/proj    # explicit target
```

Hook files (`design.{pre,post}-hook.md`, `build.{pre,post}-hook.md`) are NEVER touched by either the detector or the refresher: substrate doesn't own them.

#### How to verify end-to-end on a real project

Hermetic BDD covers every code path; the end-to-end smoke is what proves the substrate-to-disk loop works against a real scaffolded tree:

1. Scaffold a fresh project: `lakebase-create-project --project-name drift-smoke --parent-dir /tmp --databricks-host https://your-workspace.cloud.databricks.com --no-github --language nodejs`.
2. Confirm baseline: `lakebase-update-commands --project-dir /tmp/drift-smoke --dry-run`. Expected: every command file reports `unchanged`.
3. Introduce drift: hand-edit `/tmp/drift-smoke/.claude/commands/design.md` so the first line reads `# /design (project-customized)`.
4. Detector: `lakebase-update-commands --project-dir /tmp/drift-smoke --dry-run`. Expected: `design.md` reports `updated`; `build.md` reports `unchanged`. No file content changed.
5. Refresh: `lakebase-update-commands --project-dir /tmp/drift-smoke --force`. Expected: `design.md` reports `updated`; the file body is now byte-identical to `templates/project/common/.claude/commands/design.md` with `${KIT_VERSION_AT_SCAFFOLD}` substituted to the kit's current version.
6. Add a hook file: `echo '# project hook' > /tmp/drift-smoke/.claude/commands/design.pre-hook.md`.
7. Re-run `lakebase-update-commands --project-dir /tmp/drift-smoke --force`. Expected: no entry for `design.pre-hook.md`; the file is byte-identical before and after.

For the `[E2E]`-tag testing story that ships alongside scaffolded Playwright projects, the drift loop matters because the same `--enable-e2e`-installed `playwright.config.ts` + smoke fixture could fall behind as the kit evolves; running `lakebase-update-commands --dry-run` in CI catches that surface drifting alongside `/design` and `/build`. See [`../lakebase-tdd-workflows/SKILL.md`](../lakebase-tdd-workflows/SKILL.md) for the runner contract that ties an `[E2E]` AC's outcome back to `outcomes.json`.

## References

- [`references/get-connection.md`](references/get-connection.md) – Lakebase credential seam (DSN + Pool, OAuth refresh, fallback chain).
- [`references/github-auth.md`](references/github-auth.md) – GitHub token seam (env → VS Code session → `gh auth token`).
- Parent skill: [`databricks-lakebase`](https://github.com/databricks/databricks-agent-skills) – Postgres CLI surface this skill composes on.
- Sibling skill: [`../lakebase-tdd-workflows/SKILL.md`](../lakebase-tdd-workflows/SKILL.md) – TDD workflow on paired branches; consumes `createBranch`, `getSchemaDiff`, `getConnection` from this skill.
