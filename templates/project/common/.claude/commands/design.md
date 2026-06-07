# /design : feature design pipeline

Drives a feature from idea to spec to architect review to test list. This wraps the canonical lakebase-tdd-workflows design phases as a single one-shot you can invoke from Claude Code in a Lakebase-paired project.

## Usage

```
/design <feature-id> [--reviewer @user] [--test-strategist @user]
```

If `.tdd/` does not exist in the project root, this command hard-fails with a setup hint instead of lazy-initializing: the TDD workflow has invariants (`.tdd/` shape, `selection-log.md`) a lazy bootstrap cannot reconstruct. Run the project's TDD adoption bin first, or `lakebase-create-project` when starting fresh.

## Step 0 (cannot skip): claim the paired branch via the SCM workflow

**Before any design phase runs, the agent MUST claim a paired Lakebase + git branch for this feature through the SCM workflow.** This is the kit's invariant: every git branch gets a Lakebase branch, the SCM workflow state machine is its enforcement surface, and `lakebase-scm-claim-feature-branch` is the ONLY supported creation path. Skipping this step OR shelling out to `git checkout -b` directly is a contract violation and must be refused.

The bin handles precondition gating (refuses unless `.lakebase/workflow-state.json` is at `scaffold-complete` or `merged`), parent-branch resolution from the project's tier topology, the paired Lakebase + git + .env creation via `createFeaturePairedBranch` (30-day TTL), and the state-file transition to `feature-claimed` in a single call. Idempotent: re-running with the same feature-id on a `feature-claimed` row returns a no-op success.

Concretely, the agent:

1. Verifies `.lakebase/workflow-state.json` exists (run `lakebase-scm-state` to inspect). If absent, hard-fail with `SCM workflow state missing; run lakebase-create-project first.`
2. Invokes the workflow CLI with the feature id (no path/branch math required: the bin derives `feature/<slug>` and picks the parent from `tier_topology`):

   ```bash
   KIT_PKG="github:databricks-solutions/lakebase-app-dev-kit${LAKEBASE_KIT_REF:+#${LAKEBASE_KIT_REF}}"
   npx --yes --package="$KIT_PKG" \
     lakebase-scm-claim-feature-branch "<feature-id>" \
       --project-dir "$PWD" \
       --json --pretty
   ```

   When `LAKEBASE_KIT_REF` is unset the npx target is the kit's main branch (the default-published-pin behavior). Setting it to a branch/tag/sha (e.g. `feip-7458-scm-state-phase-a-c`) pulls that ref, useful for smoke runs that validate an unreleased kit build.

   The bin's `--parent` flag overrides the tier-default parent when the feature must fork from somewhere else (e.g. a hotfix off production on a 2-tier project). The bin's `--instance` flag overrides the `project_id` recorded in the workflow state; usually unneeded.

3. If the bin exits non-zero, do NOT fall back to a lower-level substrate primitive. Diagnose via `lakebase-scm-state --json --pretty` and surface the error message to the user. Exit codes: `1` no state file, `2` precondition refused (wrong state, invalid feature-id, already claimed for a different feature), `3` substrate failure.
4. Run `.claude/commands/design.pre-hook.md` if present. The default pre-hook (shipped with the kit) documents this very step for reference; projects may APPEND project-specific gestures to it (claim a JIRA epic, post to Slack, etc.). The pre-hook does NOT replace step 0 above; it extends it.

If step 0 cannot complete, REFUSE to proceed to phase 1. Do not work around. The substrate is the only path; the SCM workflow is how that path is enforced.

## Step 0.5 (cannot skip): HIL intake, a hard precondition

The design phases READ the HIL's intent from intake artifacts (`product-overview.md`, `nfrs.md`, the feature's `feature-request.md`, and `design-brief.md` for UI projects). These are not gate deliverables, they are PRECONDITIONS: `/design` MUST NOT enter phase 1 until they exist and conform. `product-overview.md` and `nfrs.md` are PROJECT-level (`.tdd/`), living, and refined across features; `feature-request.md` is per-feature; `design-brief.md` is project-level under `.tdd/design/`.

The per-feature `feature-request.md` is NOT authored here. It is the Product Owner's prioritized ask, authored upstream by `/plan` (sprint planning, where the Spec Author proposes the feature breakdown and the PO authors the requests for the sprint). `/design <feature-id>` only REQUIRES that feature's request to already exist and conform; if it is missing, run `/plan` first. The project-level intake (`product-overview.md` / `nfrs.md` / `design-brief.md`) is facilitated below by whoever reaches it first, `/plan` or `/design`.

**The orchestrator owns facilitating intake from the human.** Before phase 1, for each required artifact that is absent or non-conformant, the orchestrator obtains it:

- **Interactive (a human is present):** run the intake interview, draft the artifact, and present it for the HIL to review and edit. The interviews:
  1. **Product -> `.tdd/product-overview.md`** (Product Owner): what the product is + who uses it; what users need to accomplish; first usable version vs later; how it grows; non-goals; what they want to see after each sprint. Open-ended product intent, no implementation detail.
  2. **NFR -> `.tdd/nfrs.md`** (the Architect's intake): walk the NFR categories (performance, scalability, security, observability, operability, resilience); for each the HIL gives a hard requirement, a preference, "N/A", or "out of bounds". Write `## Required` (each item a stable `R<n>` id) / `## Preferences` / `## Out of bounds`. Every `## Required` item must later be covered by the Architect via `architecture.json` `brief_ref`.
  3. **UX -> `.tdd/design/design-brief.md`** (UI projects only; skip for API / CLI / Infra): name 1-3 reference websites and, for each, what to take (brand, color, layout, tone); plus brand constraints, interaction/feedback expectations, accessibility targets. Write the required `## References` section.
- **Headless (`LAKEBASE_TDD_HUMAN_PROXY=1`):** there is no human to interview, so the orchestrator has the **Human Proxy supply** each missing artifact from the pre-recorded answers directory `$LAKEBASE_TDD_RECORDED_INTAKE_DIR` (validate-then-place; refuses a missing/non-conformant recording):

  ```bash
  npx --yes --package="$KIT_PKG" lakebase-tdd-human-proxy supply \
    --from "$LAKEBASE_TDD_RECORDED_INTAKE_DIR/nfrs.md" --to ".tdd/nfrs.md" --artifact nfrs.md
  ```

**UI projects:** a project is UI when `LAKEBASE_TDD_UI=1` (set by the orchestrator / smoke) or the feature has a user-facing surface. For UI projects, also facilitate `design-brief.md` (interview track 3, or Human Proxy supply headless) and pass `--ui` to the precondition so it requires the brief; the UX Designer phase then runs. For API / CLI / Infra projects, skip the UX track entirely.

**Then enforce the precondition (the hard gate):**

```bash
UI_FLAG=""; [ "${LAKEBASE_TDD_UI:-}" = "1" ] && UI_FLAG="--ui"
npx --yes --package="$KIT_PKG" lakebase-tdd-intake --feature "<feature-id>" $UI_FLAG
```

`lakebase-tdd-intake` exits non-zero (5) if any required intake artifact is missing or non-conformant, naming each. If it fails, **REFUSE to proceed to phase 1** and report what intake is missing. Do not work around it: the precondition is what makes intake un-skippable in both real and headless runs, exactly as Step 0's claim is un-skippable.

## Phases (HITL-gated)

1. **Spec Author** drafts `feature-spec.{md,json}` from the Feature Requester's `feature-request.md` + the PO's `product-overview.md`.
2. **UX Designer** (UI projects only) extracts `design-guide.{md,json}` + `ia.md` from `design-brief.md`.
3. **Architect Reviewer** challenges scope and boundaries, and carries every `## Required` NFR from `nfrs.md` into `architecture.json` via `brief_ref`. Gate 1 stops the pipeline until the human signs off.
4. **Test Strategist** writes `test-list.json`. Gate 2 stops the pipeline until the human signs off.

**Human Proxy (headless) mode:** if `LAKEBASE_TDD_HUMAN_PROXY=1` (set by CI / the smoke; check with `[ "$LAKEBASE_TDD_HUMAN_PROXY" = "1" ]`), the human review at each gate is performed by `human-proxy`, a diligent automated reviewer that validates the gate's artifacts EXIST and carry their EXPECTED ELEMENTS (schema fields / required sections) and approves only then. Each role records its recommended resolutions INSIDE its artifacts (not as open questions), hands them to the gate, and the Human Proxy validates + approves, so the phases run through and `test-list.json` is produced for `/build`. The gate is never skipped, and a missing or malformed artifact hard-blocks exactly as it would for a human. See `@lakebase-tdd-workflows/SKILL.md` "Headless / Human Proxy mode".

Each phase is implemented by the substrate agent of the same name:
- `@lakebase-tdd-workflows/agents/spec-author`
- `@lakebase-tdd-workflows/agents/ux-designer` (UI projects only)
- `@lakebase-tdd-workflows/agents/architect-reviewer`
- `@lakebase-tdd-workflows/agents/test-strategist`

References resolve through Claude Code's `@skill-name/agent-name` lookup, so agent renames inside the substrate skill stay safe.

## Agents + state machine

You (the orchestrator, the Scrum-Master, the main session) coordinate `/design` and do none of the roles' work yourself. Delegate each phase to its named role agent, and record the phase in `.tdd/workflow-state.json` as you go:

- **spec-author** , phase `discovery` (draft spec).
- **ux-designer** , between discovery and architectural-review, **UI projects only**.
- **architect-reviewer** , phase `architectural-review`.
- **test-strategist** , phase `test-list-construction`.

Before spawning each role, resolve its model: `npx --yes --package="$KIT_PKG" lakebase-tdd-agent-model --role <role> --project-dir "$PWD"` (`override ?? recommended ?? inherit`). The **product-owner** approves every gate (headless: the Human Proxy). You never author an artifact a role owns.

## Logging

Each phase agent emits structured events via `lakebase-tdd-log` (see its agent
prompt + `@lakebase-tdd-workflows/references/agent-logging.md`) to the
centralized `.tdd/agent-log.jsonl`. As the orchestrator, emit a `phase.start` /
`phase.end` (`--role scrum-master`) around each phase and a `handoff` at each
role boundary, so the run reads as a clean relay timeline. `debug` captures
reasoning; `info` captures artifacts written + gates surfaced. Tail it with
`lakebase-tdd-log --read --feature <id> --min-level info`.

## Project post-hook

If `.claude/commands/design.post-hook.md` exists in this project, it runs after phase 3. Common uses: notify a Slack channel, assign reviewers, link the spec into a tracking doc.

The post-hook is owned by the project, not the substrate: this command file only consults it when present. Author the markdown file freely; one post-hook per command (no chains in v1).

## Substrate version

Pinned to: `${KIT_VERSION_AT_SCAFFOLD}`

Bumping the kit may shift agent prompts. The future `lakebase-update-commands` bin will re-pull canonical templates while preserving the post-hook file above.
