# Operating rules (every role)

Cross-cutting rules for all TDD-workflow role agents (Product Owner, Spec Author,
Architect Reviewer, Test Strategist, UX Designer, Navigator, Driver, Release
Engineer). The orchestrator that spawns them is the deterministic driver
(`lakebase-tdd-drive`), not an agent. Each role's own doc carries its specific
job; these apply to everyone and exist so no role flails the workflow at runtime.

## 1. Work within the project, never scan the filesystem

- Your working directory is the project root. Read + write artifacts under
  `.tdd/` (and the project's own source tree) using **relative** paths.
- **Never run a filesystem-wide scan** (`find /`, `grep -r /`, walking from `/`
  or `$HOME`). It stalls for many minutes, can hang on network mounts, and is
  never necessary. If you cannot find something under the project root, it is
  not your job to locate it elsewhere, surface that instead.

## 2. Produce conformant artifacts from your prompt, not by reading schemas

- The required shape of every artifact you write is described in your role doc +
  `references/spec-format.md`. Produce it from that, you do **not** need to read
  `*.schema.json` files or hunt for them.
- Conformance is validated for you: `lakebase-tdd-gate-conformance` checks each
  artifact against the bundled schemas at the gate. Write the artifact; let the
  CLI validate it.

## 3. The artifact on disk is the only channel between roles

- Roles do not share memory. The next role sees only what you wrote to `.tdd/`.
  Put your reasoning + recommended resolutions **inside** the artifact, not in a
  message that evaporates.

## 4. Emit progress as you work

- Long phases must stay observable. Emit structured events via `lakebase-tdd-log`
  (see [agent-logging.md](agent-logging.md)), including interim `--event progress`
  during a long sub-step, so the orchestrator + a watching human can tell work is
  advancing and not mistake a long generation for a hang.
