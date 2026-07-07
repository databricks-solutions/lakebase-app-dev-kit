# Operating rules (every role)

Cross-cutting rules for all TDD-workflow role agents (Product Owner, Spec Author, Architect Reviewer, Test Strategist, UX Designer, Navigator, Driver, Release Engineer). The orchestrator that spawns them is the deterministic driver (`lakebase-sftdd-drive`), not an agent. Each role's own doc carries its specific job; these apply to everyone.

## 1. Work within the project, never scan the filesystem

Your working directory is the project root. Read + write artifacts under `.sftdd/` (and the project source tree) using **relative** paths. **Never run a filesystem-wide scan** (`find /`, `grep -r /`, walking from `/` or `$HOME`): it stalls for minutes, can hang on network mounts, and is never necessary. If something isn't under the project root, surface that, don't go hunting.

## 2. Produce conformant artifacts from your prompt, not by reading schemas

The shape of every artifact you write is in your role doc + [spec-format.md](spec-format.md). Produce it from that; you do **not** read `*.schema.json` or hunt for them. Conformance is enforced at the gate by the approver: each artifact is checked against its bundled schema, and the cross-artifact rules (NFR coverage, layering declared, fitness coverage, story/AC independence, architecture conventions) hard-block the gate. Self-check anytime with `lakebase-sftdd-gate-conformance --feature <id>`.

## 3. The artifact on disk is the only channel between roles

Roles share no memory. The next role sees only what you wrote to `.sftdd/`. Put your reasoning + recommended resolutions **inside** the artifact, not in a message that evaporates.

## 4. Emit progress as you work

Long phases must stay observable. Emit structured events via `lakebase-sftdd-log` (see [agent-logging.md](agent-logging.md)), including interim `--event progress` during a long sub-step, so the orchestrator + a watching human can tell work is advancing, not hung.

## 5. Reply with the OUTCOME only, never the deliberation

Your entire reply is **one finish line**: what you actually did + where it landed (plus, when your role calls for it, a short decision or the list the next role needs). Never a bare "done". E.g. "Driver: added `POST /bugs` + 303 redirect in `app/routes/bugs.py`; cycle-001 for T3 is GREEN." State the substance of the result, then stop.

**Do NOT narrate what you are ABOUT to do or how you got there.** No "now I'll write the artifacts...", no "the ACs already look valid so I'll...", no "let me check...", no options you weighed, files you skimmed, or step-by-step account of your thinking. There is **no reader** for that: the orchestrator routes on the artifact + the gate, the next role sees only the artifact, and the turn recorder captures every reply into the corpus, so a "what I'm about to do" preamble or a wall of thinking-out-loud is pure noise that bloats the recording and spends tokens for nobody. Think as much as you need internally; the reasoning that matters goes **inside the artifact** (rule 3); the reply carries only the outcome.

This is separate from the structured `lakebase-sftdd-log` events (rule 4): the log is the machine progress trail, your reply is the single human-readable result line.
