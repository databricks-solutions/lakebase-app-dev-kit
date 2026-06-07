---
description: Launch the Lakebase TDD workflow. In a scaffolded .tdd/ project, takes stock and resumes the /plan -> /design -> /build -> /deploy loop; elsewhere, guides you through creating a project, then resumes.
---

# /lakebase-app-dev-kit:tdd : launch the TDD workflow

You are the entry point to the kit's TDD state-machine workflow. First detect where you are, then branch.

**Check the current project root for a `.tdd/` directory.**
- If `.tdd/` exists, go to **A. Resume**.
- If it does not, go to **B. Create**.

---

## A. Resume an existing TDD project

Drive the workflow through the **deterministic orchestrator** (`lakebase-tdd-drive`), invoked by the slash commands below. You coordinate only: run the right command for the project's state, and surface every gate to the human. The driver spawns the role agents (each namespaced `lakebase-app-dev-kit:<role>`, where role is `product-owner`, `spec-author`, `ux-designer`, `architect-reviewer`, `test-strategist`, `navigator`, `driver`, or `release-engineer`) and obeys the state machine; the orchestrator is not an LLM agent. You write no spec, code, test, or deploy yourself.

1. **Take stock** (read, then summarize back): `.tdd/product-overview.md` (what the product is), `.tdd/nfrs.md`, `.tdd/design/design-brief.md` (if UI), `.tdd/workflow-state.json` (current `phase` + locus, your source of truth), `.tdd/planning/feature-proposals.md`, and each `.tdd/features/*/` (feature-request, feature-spec, architecture, test-list, gates.json). Confirm SCM state via `lakebase-scm-state`. Give the human a short situation report: what the project is about, the current phase, and each feature's status.
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

There is no `.tdd/` here, so bootstrap one. Walk the user through it (ask, do not assume; offer the noted defaults):

- **Project name** (kebab-case, the Lakebase id + dir name); **parent directory** (default: parent of cwd or `~/code`); **Databricks host** (offer `DATABRICKS_HOST` / `~/.databrickscfg` if present); **GitHub owner** (or `--no-github`); **tiers** (`1` prod / `2` prod+staging / `3` prod+staging+dev, surface this, do not pick silently); **language** (`python`/`nodejs`/`java`/`kotlin`); **E2E/Infra** (default on for nodejs); **per-role models** (advanced, optional, default accept the recommendations, or override e.g. `driver=haiku`).

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

then re-run **`/lakebase-app-dev-kit:tdd`** there (it will find `.tdd/` and resume at `/plan`), or `./scripts/tdd.sh plan` to open the orchestrator session directly. Do not start the workflow from the current directory, the project is elsewhere.

---

## Note on the orchestrator

The orchestrator is the deterministic driver (`lakebase-tdd-drive`), not an LLM agent: the slash commands invoke it, and IT spawns the role agents + pauses at gates. `/lakebase-app-dev-kit:tdd` (this command) helps you pick + run the right command from your session; the project's `./scripts/tdd.sh` is the equivalent local launcher.
