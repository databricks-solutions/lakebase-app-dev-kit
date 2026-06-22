---
description: Launch the Lakebase SFTDD (Spec-First Test-Driven Development) workflow. In a scaffolded .sftdd/ project, takes stock and resumes the /plan -> /design -> /build -> /deploy loop; elsewhere, guides you through creating a project, then resumes.
---

# /lakebase-app-dev-kit:sftdd : launch the SFTDD workflow

You are the entry point to the kit's SFTDD (Spec-First Test-Driven Development) state-machine workflow. First detect where you are, then branch.

**Check the current project root for a `.sftdd/` directory.**
- If `.sftdd/` exists, go to **A. Resume**.
- If it does not, go to **B. Create**.

---

## A. Resume an existing SFTDD project

Drive the workflow through the **deterministic orchestrator** (`lakebase-sftdd-drive`), invoked by the slash commands below. You coordinate only: run the right command for the project's state, and surface every gate to the human. The driver spawns the role agents (`product-owner`, `spec-author`, `ux-designer`, `architect-reviewer`, `test-strategist`, `navigator`, `driver`, or `release-engineer`), which are scaffolded into the project's `.claude/agents/` and invoked as `claude --agent <role>`, and obeys the state machine; the orchestrator is not an LLM agent. You write no spec, code, test, or deploy yourself.

1. **Take stock** (read, then summarize back): `.sftdd/product-overview.md` (what the product is), `.sftdd/nfrs.md`, `.sftdd/design/design-brief.md` (if UI), `.sftdd/workflow-state.json` (current `phase` + locus, your source of truth), `.sftdd/planning/feature-proposals.md`, and each `.sftdd/features/*/` (feature-request, feature-spec, architecture, test-list, gates.json). Confirm SCM state via `lakebase-scm-state`. Give the human a short situation report: what the project is about, the current phase, and each feature's status.
2. **Continue the loop.** Offer the human the autonomous path or a single step:
   - **Whole sprint (autonomous):** **`/sprint [name]`** flows plan -> per feature `design` -> `build` -> `deploy`, pausing only at gates. Resumable; re-invoke to continue past an approved gate.
   - Or one phase at a time (lowest-ready first):
     - No sprint backlog (or the last sprint shipped) -> **`/plan`** (Spec Author proposes; the PO authors the next sprint's requests, folding in what the last working software revealed).
     - A feature has a `feature-request.md` but no conformant `test-list.json` -> **`/design <feature-id>`**.
     - Designed but not built -> **`/build <feature-id>`**.
     - Built but not deployed/reviewed -> **`/deploy <feature-id> --target local`** (the working-software gate).
   - Need to explore an unknown first? **`/spike <slug> [--for <feature>]`** (throwaway, outside the loop).
   - Confirm the chosen step with the human, invoke that project-scaffolded command (it runs the deterministic driver, which spawns the role agents + pauses at gates), then loop.

The commands (`/sprint`, `/plan`, `/design`, `/build`, `/deploy`, `/spike`) are scaffolded into the project (version-pinned); you invoke them, you do not reimplement them. You write no spec, code, test, or deploy yourself.

---

## B. Create a new project, then resume

There is no `.sftdd/` here, so bootstrap one. Walk the user through it (ask, do not assume; offer the noted defaults):

- **Project name** (kebab-case, the Lakebase id + dir name); **parent directory** (default: parent of cwd or `~/code`); **Databricks host** (offer `DATABRICKS_HOST` / `~/.databrickscfg` if present); **GitHub owner** (or `--no-github`); **tiers** (`1` prod / `2` prod+staging / `3` prod+staging+dev, surface this, do not pick silently); **language** (`python`/`nodejs`/`java`/`kotlin`); **E2E/Infra** (default on for nodejs); **model profile** (see "Per-role model profile" just below).

### Per-role model profile

Offer the user one of three paths (default to **Full**):

1. **Full (recommended).** Highest-quality specs, architecture, tests, and code; the tradeoff is slower runs and higher token spend. Best for real feature work you intend to keep and ship.
2. **Lean.** Faster and cheaper; the tradeoff is rougher planning and design output (specs, architecture, and review may need more human correction at the gates). Best for quick experiments, demos, throwaway spikes, or cost/latency-sensitive runs.
3. **Custom (cherry-pick).** Tune the model per role yourself when you want a specific mix.

Realize the choice through `lakebase-create-project`'s per-role overrides (below): **Full** uses each role's recommended model; **Lean** runs every role on `haiku` except `navigator` and `driver`, which stay on `sonnet`. The selection is persisted to `.lakebase/agent-config.json` and can be edited there later.

Then run the kit's creator (surface the exact command first; report its output, which prints a `Next:` hint):

```bash
KIT_PKG="github:databricks-solutions/lakebase-app-dev-kit${LAKEBASE_KIT_REF:+#${LAKEBASE_KIT_REF}}"
npx --yes --package="$KIT_PKG" lakebase-create-project \
  --project-name "<name>" --parent-dir "<parent-dir>" \
  --databricks-host "<host>" --github-owner "<owner>" \
  --language "<language>" --tiers "<1|2|3>" \
  [--no-github] [--enable-e2e|--no-e2e] [--enable-infra|--no-infra] \
  [--agent-model <role>=<model> ...]
```

On success, tell the user to enter the new project and resume:

```
cd <parent-dir>/<name>
```

then re-run **`/lakebase-app-dev-kit:sftdd`** there (it will find `.sftdd/` and resume at `/plan`), or `./scripts/sftdd.sh plan` to open the orchestrator session directly. Do not start the workflow from the current directory, the project is elsewhere.

---

## Note on the orchestrator

The orchestrator is the deterministic driver (`lakebase-sftdd-drive`), not an LLM agent: the slash commands invoke it, and IT spawns the role agents + pauses at gates. `/lakebase-app-dev-kit:sftdd` (this command) helps you pick + run the right command from your session; the project's `./scripts/sftdd.sh` is the equivalent local launcher.
