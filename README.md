# lakebase-app-dev-kit

Lakebase-backed application development kit. The shared foundation that the [`lakebase-scm-extension`](https://github.com/databricks-solutions/lakebase-scm-extension) (VS Code/Cursor) and coding agents – Claude Code (terminal), Claude Desktop, OpenAI Foundry, Cursor, and Databricks Genie Code – all consume. One canonical implementation; multiple presentation layers and workflow-domain skills.

**Workflow domains** (kit-authored, one skill each, hosted under `skills/`):
- **[`lakebase-scm-workflows`](skills/lakebase-scm-workflows/README.md)** – paired-branch source control, schema diff, PR flow, runner setup.
- **[`lakebase-release-workflows`](skills/lakebase-release-workflows/SKILL.md)** – branching + release methodology for Lakebase-paired projects.
- **[`lakebase-sftdd-workflows`](skills/lakebase-sftdd-workflows/README.md)** – Spec-First Test-Driven Development (SFTDD) with evolutionary design, against paired branches: Spec Driven Development (SDD) for the design lane (`/design`) and Test Driven Development (TDD) for the build lane (`/build`), with a deterministic orchestrator and HITL gates at every phase boundary. Specs, architecture, and database all evolve increment over increment.
- Future domains include deploying to Databricks Apps and beyond.

**Shared canon** (kit-authored, unprefixed because not Lakebase-specific):
- **[`software-design-principles`](skills/software-design-principles/SKILL.md)** – SOLID, DRY, clean code, layered architecture, cross-cutting concerns, NFRs. Imported by the workflow domain skills.

**Vendored upstream skills** (also under `skills/`, synced from [`databricks/devhub`](https://github.com/databricks/devhub/tree/main/.agents/skills)):
- **[`databricks-core`](https://github.com/databricks/devhub/blob/main/.agents/skills/databricks-core/SKILL.md)** – CLI basics, authentication, profile selection. Parent skill referenced by `databricks-lakebase`.
- **[`databricks-lakebase`](https://github.com/databricks/devhub/blob/main/.agents/skills/databricks-lakebase/SKILL.md)** – canonical agent reference for the `databricks postgres` CLI surface (project / branch / endpoint / database resource shapes, name formats, "never delete the production branch" rule, discovery via `-h`).

The vendored skills are read-only mirrors of upstream. To pull the latest, run `npm run sync:devhub` (check drift with `npm run check:devhub`) and commit any diff in a focused PR. Kit-authored skills wrap the operations; vendored skills document the CLI surface those operations are built on. Agents that consume the kit (e.g. via `install.sh`) inherit both layers.

The "app dev" framing covers applications, services, libraries, and any other software that uses Lakebase – including projects deployed to Databricks Apps.

## What this is

- **`scripts/`** – Node/TypeScript modules that implement the operations: GitHub auth + repo + runner + secrets, Lakebase get-connection + branch lifecycle + schema-diff + create-project + scaffold, git wrappers, and shared utilities. Each has CLI and module entry points.
- **`skills/<domain>/SKILL.md`** – Per-workflow-domain agent surface. A coding agent reads this and drives the same scripts the extension does.
- **`apps/mcp-server/`** – Single MCP server exposing every skill's tools to MCP-capable agents (Claude Desktop, OpenAI Codex, Cursor-via-MCP).
- **`tools/openai-foundry/`** – Pre-rendered OpenAI Foundry / Codex tool spec covering the same tool surface.
- **`templates/`** – Project templates the kit ships into newly-bootstrapped Lakebase-paired projects.
- **`tests/`** – Vitest BDD tests. Live Lakebase paths skip cleanly when `LAKEBASE_TEST_*` env vars aren't set.

## Single-seam credential handoff

Two narrow auth seams, both enforced by CI grep guards:

- **`scripts/lakebase/get-connection.ts`** is the only path that mints Lakebase credentials. Every other workflow op calls `getConnection()`. See [skills/lakebase-scm-workflows/references/get-connection.md](skills/lakebase-scm-workflows/references/get-connection.md).
- **`scripts/github/auth.ts`** is the only path that resolves a GitHub token. Fallback chain: `GITHUB_TOKEN` env → VS Code `getSession` (in the extension host only) → `gh auth token`. See [skills/lakebase-scm-workflows/references/github-auth.md](skills/lakebase-scm-workflows/references/github-auth.md).

## Install

### Prerequisites

- **Node.js 20+** and npm
- **Databricks CLI v1.0.0 or later**, authenticated to a workspace with Lakebase enabled. Earlier versions fail `databricks bundle deploy` on the expired-Terraform-GPG-key issue. macOS: `brew upgrade databricks/tap/databricks`. Per-platform install: [docs.databricks.com/dev-tools/cli/install.html](https://docs.databricks.com/dev-tools/cli/install.html).
- **Python 3.10+** (for `scripts/openai-foundry.py` and the live-driver-managed alembic venv)
- **GitHub CLI (`gh`)** authenticated, for the self-hosted-runner live test (opt out via `--no-github-runner` if you don't need it)
- **JDK 17+** for the migrate-live-flyway live test (Flyway CLI itself is auto-downloaded by the live driver if not already on PATH)

Contributors should also read [CONTRIBUTING.md](CONTRIBUTING.md) for the full live-test prerequisites + the `.env.template.test.config` / `.env.local.test.config` configuration pattern.

### For agent use (running `node scripts/lakebase/<verb>.js` directly)

```bash
git clone https://github.com/databricks-solutions/lakebase-app-dev-kit
cd lakebase-app-dev-kit
npm install   # prepare script builds dist/
```

For a JS/TS host (extension, Node service) that imports substrate functions, depend on this repo via a git URL:

```jsonc
// host package.json
"dependencies": {
  "@databricks-solutions/lakebase-app-dev-kit":
    "github:databricks-solutions/lakebase-app-dev-kit#<commit-sha-or-tag>"
}
```

Pin to a sha or release tag for reproducibility. `prepare` builds `dist/` on install.

Package.json is publish-ready (`private: false`, `files` allow-list, `prepublishOnly` typecheck+test+build); npm publish lands once @databricks-solutions scope admin access is configured. After publish, `npm i -g @databricks-solutions/lakebase-app-dev-kit` becomes the canonical install path for the CLI bins.

### For coding agents

`install.sh` at the repo root copies the kit's skill trees under `skills/` into the path each agent reads from. It first pulls the latest vendored skills via `npm run sync:devhub` (best-effort; skipped offline). Auto-detects installed agents; `--tools` overrides. Mirrors the pattern in [`databricks-solutions/ai-dev-kit`](https://github.com/databricks-solutions/ai-dev-kit).

```bash
# Auto-detect installed agents, prompt to pick
bash <(curl -sL https://raw.githubusercontent.com/databricks-solutions/lakebase-app-dev-kit/main/install.sh)

# Specific targets
./install.sh --tools claude,cursor

# Upload skill into a Databricks workspace for Genie Code
./install.sh --install-to-genie --profile DEFAULT
```

Supported targets today: **Claude Code (terminal)** via `.claude/skills/`, **Cursor** via `.cursor/skills/`, and **Databricks Genie Code** via workspace upload. **Claude Desktop / OpenAI Codex** consume the same surface via the MCP manifest at `.mcp.json` – the server lives at `apps/mcp-server/` (built to `dist/apps/mcp-server/index.js`, also exposed as the `lakebase-mcp-server` bin). **OpenAI Foundry** consumes a pre-rendered tool-spec JSON at [`tools/openai-foundry/lakebase-app-dev-kit.tools.json`](tools/openai-foundry/lakebase-app-dev-kit.tools.json), regenerated by `python3 scripts/openai-foundry.py` from the same `apps/mcp-server/tools.ts` registry. Per-agent display metadata for OpenAI runtimes lives at `skills/lakebase-scm-workflows/agents/openai.yaml` (dev-hub convention).

The MCP server and the Foundry tool-spec generator are two presentations of one source: `apps/mcp-server/tools.ts`. Drift between them is caught by `python3 scripts/openai-foundry.py validate` in CI.

`@modelcontextprotocol/sdk` is declared as an **optional peer dependency** of this package, not a regular `dependency`. Consumers that only import the substrate's TypeScript modules (like `lakebase-scm-extension`) won't drag the MCP runtime into their `node_modules`. Anyone running the `lakebase-mcp-server` bin from a dev clone gets it via `devDependencies`; standalone bin users install it into their own project.

`manifest.json` at the repo root is a machine-readable index of every skill + its files, regenerated by `python3 scripts/skills.py` (validate in CI with `python3 scripts/skills.py validate`). Matches the shape used by [`databricks/databricks-agent-skills`](https://github.com/databricks/databricks-agent-skills).

### As a Claude Code plugin (the TDD workflow)

The kit is also a Claude Code plugin. Installing it gives you the `/lakebase-app-dev-kit:tdd` launcher plus the workflow skills:

```bash
claude plugin marketplace add databricks-solutions/lakebase-app-dev-kit
claude plugin install lakebase-app-dev-kit@lakebase-app-dev-kit
```

Install is user-scoped and persists across sessions (one-time). Then, in any session:

```
/lakebase-app-dev-kit:tdd
```

In a folder with a `.tdd/` directory this resumes the `/plan -> /design -> /build -> /deploy` loop; elsewhere it guides you through creating a project, then resumes. The workflow is driven by the deterministic orchestrator (`lakebase-sftdd-drive`), which spawns the role agents (product-owner, spec-author, ux-designer, architect-reviewer, test-strategist, navigator, driver, release-engineer) scaffolded into the project's `.claude/agents/` and invoked as `claude --agent <role>`, and pauses at every HITL gate. The plugin ships the command + skills + MCP server; the role agents come from the scaffolded project, not the plugin.

## Imports

```ts
import { resolveGitHubToken } from "@databricks-solutions/lakebase-app-dev-kit/github";
import { getConnection, createBranch, deleteBranch } from "@databricks-solutions/lakebase-app-dev-kit/lakebase";
import { commitAndPush } from "@databricks-solutions/lakebase-app-dev-kit/git";
```

The root barrel `@databricks-solutions/lakebase-app-dev-kit` re-exports everything; sub-paths (`/github`, `/lakebase`, `/git`, `/util`) and individual modules (`/lakebase/branch-create`, etc.) are also exposed via the `exports` map.

## CLIs

The package exposes many bins (the full set is the `bin` map in `package.json`; the groups below are representative, not exhaustive , the `lakebase-scm-*` SCM-workflow and `lakebase-sftdd-*` TDD-workflow families are bins too). Run any of them with `--help` for full subcommand + flag reference.

**Project + connection**
- `lakebase-create-project` – end-to-end Lakebase-paired project bootstrap (10-step QuickPick equivalent)
- `lakebase-get-connection` – mint a DSN or pg.Pool against a branch (single-seam credential handoff)
- `lakebase-doctor` – health check the local env: CLI version, auth, `.env` shape, project reachability, git remote, language, hooks. Exit codes 0/1/2 = OK/WARN/FAIL.

**Branch lifecycle**
- `lakebase-branch` – list / show / create / create-paired / create-tier (feature/test/uat/perf) / delete / delete-paired / checkout-paired / sync-env. Paired ops keep git + Lakebase + `.env` in lockstep.

**PR flow**
- `lakebase-pr` – open / merge / merge-paired (deletes Lakebase feature branch on merge) / status / files / reviews / comments

**Schema + migrations**
- `lakebase-schema-diff` – parent-aware schema diff between two Lakebase branches
- `lakebase-schema-migrate` – apply / rollback / status / list schema migrations against a branch
- `lakebase-detect-language` – detect project language (java / kotlin / python / nodejs) for CI step outputs

**Operations**
- `lakebase-cut-backup` – cut a no-expiry backup branch off a source branch
- `lakebase-github-token` – print / diagnose the resolved GitHub token (single-seam GitHub auth)

**Agents**
- `lakebase-mcp-server` – stdio MCP server exposing 24 tools to MCP-capable agents (Claude Desktop, OpenAI Codex, Cursor-via-MCP, Genie Code)

## Contributing

Maintainer-facing docs (development setup, build, test tiers, the single-seam contributor rule, release flow, and the pull-request checklist) live in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Support

Databricks does not offer official support for content in this repository. For questions or bugs, please open a GitHub issue and the team will help on a best-effort basis.

## License

See [LICENSE.md](LICENSE.md).
