# Operating rules (every role)

Cross-cutting rules for all TDD-workflow role agents (Product Owner, Spec Author, Architect Reviewer, Test Strategist, UX Designer, Navigator, Driver, Release Engineer). The orchestrator that spawns them is the deterministic driver (`lakebase-sftdd-drive`), not an agent. Each role's own doc carries its specific job; these apply to everyone.

## 1. Work within the project, never scan the filesystem

Your working directory is the project root. Read + write artifacts under `.tdd/` (and the project source tree) using **relative** paths. **Never run a filesystem-wide scan** (`find /`, `grep -r /`, walking from `/` or `$HOME`): it stalls for minutes, can hang on network mounts, and is never necessary. If something isn't under the project root, surface that, don't go hunting.

## 2. Produce conformant artifacts from your prompt, not by reading schemas

The shape of every artifact you write is in your role doc + [spec-format.md](spec-format.md). Produce it from that; you do **not** read `*.schema.json` or hunt for them. Conformance is enforced at the gate by the approver: each artifact is checked against its bundled schema, and the cross-artifact rules (NFR coverage, layering declared, fitness coverage, story/AC independence, architecture conventions) hard-block the gate. Self-check anytime with `lakebase-sftdd-gate-conformance --feature <id>`.

## 3. The artifact on disk is the only channel between roles

Roles share no memory. The next role sees only what you wrote to `.tdd/`. Put your reasoning + recommended resolutions **inside** the artifact, not in a message that evaporates.

## 4. Emit progress as you work

Long phases must stay observable. Emit structured events via `lakebase-sftdd-log` (see [agent-logging.md](agent-logging.md)), including interim `--event progress` during a long sub-step, so the orchestrator + a watching human can tell work is advancing, not hung.

## 5. Narrate your work (start and finish)

Your reply is part of the relay the orchestrator and human read; never a bare "done". Bookend every turn:
- **Start:** one line on what you're about to do (task + the artifact you'll produce). E.g. "Driver: making the RED test for AC3 (form submission redirects) pass with the minimal route + redirect."
- **Finish:** one line on what you actually did (the concrete change + where it landed). E.g. "Driver: added `POST /bugs` + 303 redirect in `app/routes/bugs.py`; cycle-001 for T3 is now GREEN."

State the substance, not just completion. This is in addition to the structured `lakebase-sftdd-log` events (rule 4): the log is the machine trail, your reply is the human-readable bookend.
