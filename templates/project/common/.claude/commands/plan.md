# /plan : sprint planning, the precursor to each dev loop

Turns the project's intent into a prioritized set of feature requests for the next sprint. This is the activity that runs ABOVE the per-feature loop: `/plan` (once per sprint) -> then `/design` -> `/build` -> `/deploy` per feature it produced.

There is no feature request to begin with. A feature has to be teased out of the project overview: the Spec Author (acting as the business analyst) proposes how to divide the work into features, and the Product Owner prioritizes and authors the individual `feature-request.md` files that go into the sprint. The orchestrator coordinates these two, the PO (human) and the Spec Author (BA). The PO may pre-make a few requests for the sprint but deliberately does not run far ahead: they fold what they learn from each sprint's working software (the `/deploy` gate) into the next round of requests.

## Usage

```
/plan [--sprint <name>] [--ui]
```

`/plan` does NOT create branches and does NOT enter the TDD phases. It produces `feature-request.md` files; `/design <feature-id>` is what claims the paired branch (its Step 0) and consumes one request.

If `.tdd/` does not exist, this command hard-fails with the same setup hint `/design` gives: run the project's TDD adoption bin first, or `lakebase-create-project` when starting fresh. `/plan` does not lazy-initialize `.tdd/`.

## Step 0 (cannot skip): project intake is a precondition

Planning reads the HIL's intent from the PROJECT-level intake artifacts (`product-overview.md`, `nfrs.md`, and `design-brief.md` for UI projects). `/plan` is the first place project intake is needed, before any `/design`. These are the same project-level preconditions `/design` enforces; `/plan` enforces them too:

```bash
UI_FLAG=""; [ "${LAKEBASE_TDD_UI:-}" = "1" ] && UI_FLAG="--ui"
./scripts/lk lakebase-tdd-intake $UI_FLAG
```

Note: no `--feature`. `lakebase-tdd-intake` without a feature checks only the project-level artifacts (`product-overview.md` + `nfrs.md`, plus `design-brief.md` when `--ui`). It exits non-zero (5) and names what is missing or non-conformant if intake is incomplete. If it fails, the orchestrator facilitates project intake first (the interviews documented in `/design` Step 0.5: Product, NFR, and UX for UI projects), or, headless, the Human Proxy supplies the pre-recorded answers. Do not plan against missing intent.

## Phase 1: Spec Author proposes the feature breakdown (the BA)

The Spec Author reads `product-overview.md` + `nfrs.md` (and `design-brief.md` for UI projects) and proposes the candidate features for **the next sprint only**, the next coherent, usable increment, NOT the whole product. Do not decompose or spec features beyond this sprint: the team folds what each sprint's working software reveals into the next `/plan`, so proposing the entire roadmap up front wastes work and pre-commits decisions the PO has not made. Later sprints get their own `/plan`.

Invoke `@lakebase-tdd-workflows/agents/spec-author` in its planning mode. It writes a proposal to `.tdd/planning/feature-proposals.md`: a short list of **this sprint's** candidate features, each with a stable id, a one-line ask, the rationale (which part of the overview / which NFR it serves), and a rough priority. The proposal is the PO's INPUT; it is not a gate deliverable and is never a feature-request itself.

## Phase 2: the Product Owner prioritizes and authors the requests

The orchestrator presents the Spec Author's proposals to the Product Owner. The PO decides which features go into THIS sprint and authors a `feature-request.md` for each, into `.tdd/features/<feature-id>/feature-request.md`. The orchestrator may draft each request from the matching proposal, but the PO owns the content and the prioritization: they keep, drop, reorder, and reword. They are encouraged to scope the sprint small and revisit after working software.

Each `feature-request.md` is the open-ended, plain-English ask in the PO's voice (an H1 title + a non-empty body, no rigid structure by design). It is what `/design`'s Spec Author later reads as input and never overwrites. Confirm each conforms:

```bash
./scripts/lk lakebase-tdd-intake --feature "<feature-id>"
```

(With `--feature`, the precondition additionally requires that feature's `feature-request.md` to exist and conform, the same check `/design <feature-id>` runs at its Step 0.5.)

### Headless (`LAKEBASE_TDD_HUMAN_PROXY=1`)

There is no human to interview. The Human Proxy stands in for the PO and SUPPLIES each sprint item's `feature-request.md` from the pre-recorded sprint backlog (`$LAKEBASE_TDD_RECORDED_INTAKE_DIR`): the recorded files ARE the PO's groomed, prioritized sprint. Validate-then-place; it refuses a missing or non-conformant recording.

```bash
./scripts/lk lakebase-tdd-human-proxy supply \
  --from "$LAKEBASE_TDD_RECORDED_INTAKE_DIR/<feature-id>.md" \
  --to ".tdd/features/<feature-id>/feature-request.md" \
  --artifact feature-request.md --feature "<feature-id>"
```

The Spec Author's proposal step may still run headless (it is deterministic from the overview) or be skipped when the recorded backlog already encodes the breakdown.

## The feedback loop

`/plan` is not run once for the whole project. It is run per sprint. After a sprint's features go through `/design` -> `/build` -> `/deploy`, the `/deploy` gate puts working software in front of the PO. The PO carries what they learn into the NEXT `/plan`: new requests, reprioritized ones, scope they now know to cut. This is why the PO does not pre-author the entire backlog up front.

## Human Proxy (headless) mode

Headless, the Human Proxy plays the PO at this activity: it supplies the sprint's `feature-request.md` files from the recorded backlog and refuses anything missing or non-conformant, so planning never silently produces an empty or malformed sprint. See `@lakebase-tdd-workflows/SKILL.md` "Headless / Human Proxy mode".

## How it runs: the deterministic driver

After Step 0 (project intake), `/plan` delegates planning to the deterministic
orchestrator driver, bounded to planning only (`--plan-only`), with interactive
gates so YOU answer the sprint plan gate (headless: the Human Proxy):

```bash
GATES=interactive; [ "${LAKEBASE_TDD_HUMAN_PROXY:-}" = "1" ] && GATES=proxy
./scripts/lk \
  lakebase-tdd-drive --sprint "<sprint-name>" --plan-only --gates "$GATES" --project-dir "$PWD"
```

The driver routes planning to the role agents, at their resolved per-role models:
- **spec-author** proposes the feature breakdown (`.tdd/sprints/<name>/feature-proposals.md`).
- **product-owner** prioritizes + authors the sprint's `feature-request.md` files
  (headless: the Human Proxy supplies them from the recorded backlog, above).

Then it surfaces the **sprint plan gate** (the HITL checkpoint between planning
and execution). `--plan-only` STOPS there, it does not enter design/build/deploy.

**Gate.** Interactive: the driver stops at the plan gate + prints a `GATE` marker.
Surface the proposed backlog to the human; on approval record it
(`lakebase-tdd-human-proxy --sprint <name> --gate plan --approver <human>`), then
re-run to confirm planning complete. Headless (`--gates proxy`): the Human Proxy
approves once `feature-proposals.md` exists + conforms. "Passing" on a re-plan =
approving the standing backlog as-is. The driver emits the planning log as code.

## Next

When the plan gate is approved, suggest the next step: **`/sprint <name>`** to
drive the whole backlog (plan -> per feature design/build/deploy, all gates
HITL), or **`/design <feature-id>`** to take one feature through manually.

## Project pre/post hooks

If `.claude/commands/plan.pre-hook.md` / `plan.post-hook.md` exist, they run before / after planning (e.g. pull the sprint goal from a tracker beforehand; open tracker tickets for the authored requests afterward). One pre-hook plus one post-hook per command.

## Substrate version

Pinned to: `${KIT_VERSION_AT_SCAFFOLD}`

The future `lakebase-update-commands` bin re-pulls this command's canonical template while preserving your hooks.
