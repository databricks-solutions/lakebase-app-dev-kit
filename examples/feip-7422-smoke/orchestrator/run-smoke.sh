#!/usr/bin/env bash
# FEIP-7422 TDD-workflow smoke.
#
# Drives a real bug-tracker project through 5 evolution iterations
# (v1..v5), grouped into TWO SPRINTS, to exercise the TDD substrate:
# /plan + /design + /build + /deploy + HITL gates (spec / plan /
# test_list / promote / deploy) + per-iteration local tests. The
# human-proxy replaces a human approver so the smoke runs headless.
#
# Scope: this smoke validates TDD-workflow behavior. The SCM workflow
# CLIs (lakebase-scm-prepare-pr / wait-ci / merge --wait-migrate) are
# tested separately by tests/integration/scm-workflow-e2e-live.test.ts,
# discovered by scripts/run-all-live-tests.sh.
#
# Sprints (the /plan cadence; features are NOT pre-planned all at once):
#   sprint-1 = v1..v3   sprint-2 = v4..v5
# /plan runs once per sprint (run_plan_sprint), ABOVE the per-feature loop:
# the Spec Author proposes the breakdown and the Product Owner authors the
# sprint's feature-requests. Headless, the human-proxy SUPPLIES the recorded
# backlog. sprint-2 is planned only AFTER sprint-1's features have shipped
# working software (their /deploy gates), modeling the feedback loop: the PO
# folds what they saw into the next sprint's requests. The sprint backlog is
# committed to trunk (main) so each feature branch (forked from main HEAD by
# /design Step 0) inherits its feature-request.md.
#
# What /plan does per sprint (run_plan_sprint):
#   a. Enforce the project-intake precondition (lakebase-tdd-intake, no
#      --feature: product-overview.md + nfrs.md + design-brief.md present).
#   b. human-proxy supplies each sprint item's feature-request.md.
#   b2. Run the actual /plan command via claude -p (parity); the command
#      delegates to product-owner + spec-author and is idempotent over the
#      staged backlog (sprint membership is the smoke orchestrator's call).
#   c. Commit the sprint backlog to trunk.
#
# What each iteration does (the per-feature loop, after its request exists):
#   1. Abandon prior feature (substrate CLI) if state is mid-flight.
#   3. /design <id>  – gates drained by human-proxy.
#   4. /build <id>   – gates drained by human-proxy.
#   5. Local tests (./scripts/run-tests.sh).
#   6. Per-iteration verify (assertions/verify-vN.sh).
#   6.5 /deploy <id> --target local via claude -p: the command delegates to the
#      release-engineer (deploy + poll reachable + verify) and records the PO
#      deploy gate (Human Proxy headless), then the smoke tears the app down.
#   7. Commit the iteration's work on the feature branch.
#   8. SCM doctor (advisory cross-check; warning-only).
#
# Project intake (product-overview.md + nfrs.md + design-brief.md) is staged
# once before the sprints via human-proxy (stage_project_intake) and committed
# to trunk; LAKEBASE_TDD_UI=1 turns on the UX track.
#
# Other flags:
#   --resume <iter>      skip earlier iterations + start at <iter>
#                        (v1 / v2 / v3 / v4 / v5). Useful when iterating
#                        on the smoke itself.
#   --project-dir <dir>  override the scaffold target. Default:
#                        $SMOKE_ROOT_DEFAULT/bug-tracker
#   --skip-scaffold      assume bug-tracker is already scaffolded; jump
#                        straight to the iteration loop.
#   --keep-on-failure    leave the project + Lakebase branches in place
#                        on failure (default: yes; tear-down is manual).
#   -h, --help           print this help.
#
# Prerequisites:
#   - lakebase-create-project on PATH (npx with the kit pin works)
#   - claude CLI on PATH (for /design + /build skill invocations)
#   - DATABRICKS_HOST + DATABRICKS_TOKEN env vars set (or a CLI profile)
#
# Exit codes:
#   0  smoke completed
#   1  scaffold failed
#   2  an iteration's design/build/tests/verify failed
#  10  prereq missing (CLI not found, env var unset)

set -e
set -u
set -o pipefail

# ─── defaults + arg parse ────────────────────────────────────────

SMOKE_ROOT_DEFAULT="${HOME}/code/feip-7422-smoke"
RESUME_AT=""
# Unique per-run project name so every smoke scaffolds a FRESH project and can
# never silently reuse a stale dir / collide with a prior run's Lakebase project
# + GitHub repo. Override with --project-name for --resume / --skip-scaffold.
RUN_ID="$(date +%Y%m%d-%H%M%S)"
PROJECT_NAME="bug-tracker-${RUN_ID}"
PROJECT_DIR=""
SKIP_SCAFFOLD=0
KEEP_ON_FAILURE=1
TIERS=""                      # 2 or 3; required architectural choice, no default
# Default to kit @ main; smoke can validate a feature branch via --kit-ref.
# Exported so the kit's templated /design + /design.pre-hook (which both
# invoke `npx ... lakebase-scm-claim-feature-branch`) can read the same ref.
KIT_REF="${LAKEBASE_KIT_REF:-}"
ITERATIONS=(v1-initial-domain v2-add-owners v3-status-table v4-split-bug-entity v5-list-view)
# Sprints are slices of ITERATIONS (DRY: the canonical order lives in one place).
# sprint-1 = v1..v3, sprint-2 = v4..v5. sprint-2 is planned only after sprint-1
# ships working software, modeling the PO folding feedback into the next sprint.
SPRINT1_ITERS=("${ITERATIONS[@]:0:3}")
SPRINT2_ITERS=("${ITERATIONS[@]:3:2}")

ORCHESTRATOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FEATURE_REQ_DIR="${ORCHESTRATOR_DIR}/feature-requests"
ASSERT_DIR="${ORCHESTRATOR_DIR}/assertions"

print_help() {
  sed -n '2,/^set -e/p' "${BASH_SOURCE[0]}" | sed -E 's/^# ?//' | head -n -1
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fast|--standard|--full)
      # Legacy run-mode flags. Accepted-but-ignored for backwards-compat
      # with prior invocations. The smoke is TDD-only now; SCM workflow
      # validation lives in tests/integration/scm-workflow-e2e-live.test.ts.
      echo "smoke: '$1' is deprecated and ignored (smoke is TDD-only; SCM workflow is tested separately)" >&2
      shift ;;
    --resume)            RESUME_AT="$2"; shift 2 ;;
    --project-name)      PROJECT_NAME="$2"; shift 2 ;;
    --project-dir)       PROJECT_DIR="$2"; shift 2 ;;
    --tiers)             TIERS="$2"; shift 2 ;;
    --kit-ref)           KIT_REF="$2"; shift 2 ;;
    --skip-scaffold)     SKIP_SCAFFOLD=1; shift ;;
    --keep-on-failure)   KEEP_ON_FAILURE=1; shift ;;
    --no-keep-on-failure) KEEP_ON_FAILURE=0; shift ;;
    -h|--help)           print_help ;;
    *) echo "Unknown arg: $1" >&2; print_help ;;
  esac
done

PROJECT_DIR="${PROJECT_DIR:-${SMOKE_ROOT_DEFAULT}/${PROJECT_NAME}}"

# The kit npx URL. When KIT_REF is set, suffix the GitHub ref so npx
# clones that branch / tag / sha. Empty KIT_REF means "kit main" (the
# default-published-pin behavior). Exported so any subprocess + the
# templated /design pre-hook can pick the same ref.
KIT_PACKAGE_BASE="github:databricks-solutions/lakebase-app-dev-kit"
if [[ -n "$KIT_REF" ]]; then
  KIT_NPX="${KIT_PACKAGE_BASE}#${KIT_REF}"
  export LAKEBASE_KIT_REF="$KIT_REF"
else
  KIT_NPX="$KIT_PACKAGE_BASE"
fi
# Exported so the per-iteration assertions/*.sh scripts use the same
# kit pin. Without this they would default to "main", which has no
# dist/ committed and yields "command not found" when invoking bins.
export LAKEBASE_KIT_NPX="$KIT_NPX"

# Headless run: the human reviewer at each HITL gate is performed by
# human-proxy, which validates the gate's artifacts exist + carry their
# expected elements (format-conformant) and approves only then. This lets
# /design run through to test-list.json (and /build) without a human, while
# conformance still hard-blocks a missing/malformed artifact. See SKILL
# "Headless / Human Proxy mode".
export LAKEBASE_TDD_HUMAN_PROXY=1

# Where the Human Proxy reads pre-recorded HIL intake answers in headless mode.
# /design's intake precondition (lakebase-tdd-intake) facilitates from here when
# an artifact is missing; this smoke also pre-supplies them (stage_project_intake)
# for determinism. Same directory the recorded product-overview.md / nfrs.md live in.
export LAKEBASE_TDD_RECORDED_INTAKE_DIR="${ORCHESTRATOR_DIR}"

# This smoke is a UI project (v5 ships a bug-list view). LAKEBASE_TDD_UI=1 tells
# /design to run the UX Designer phase and require design-brief.md at intake, so
# the UX track (design-guide.{md,json} + ia.md + token adherence) is exercised.
export LAKEBASE_TDD_UI=1

log_kit_ref() { echo "smoke: kit ref = ${KIT_REF:-main} (npx package: ${KIT_NPX})"; }

# --tiers is required when scaffolding (architectural choice). The
# bug-tracker iteration specs all declare `Lakebase parent: staging`,
# so this smoke is 2-tier (prod + staging) by definition. --tiers 1
# (prod only) and --tiers 3 (prod + staging + dev) are rejected because
# either would break the staging-as-parent assumption.
#
# Tier semantics (features are NOT tiers; they are branches):
#   1 = prod only        (features fork from prod)
#   2 = prod + staging   (features fork from staging)
#   3 = prod + staging + dev (features fork from dev)
if [[ "$SKIP_SCAFFOLD" -eq 0 ]]; then
  if [[ "$TIERS" != "2" ]]; then
    echo "smoke: --tiers 2 is required for this smoke. Got: '${TIERS:-<unset>}'." >&2
    echo "       The bug-tracker iteration specs declare 'Lakebase parent: staging'," >&2
    echo "       so the project must be 2-tier (prod + staging). 1-tier would have" >&2
    echo "       features forking from prod; 3-tier would add a dev layer and require" >&2
    echo "       rewriting every iteration spec." >&2
    exit 10
  fi
fi

# ─── HITL human-proxy loop ──────────────────────────────────
#
# /design and /build pause at HITL gates (spec / plan / test_list /
# promote). In an automated smoke we mock the human approver with
# `lakebase-tdd-human-proxy`, which records every open gate as
# approved by "human-proxy". `claude -p` runs one phase per
# invocation: it drafts an artifact, opens a gate, and exits. So we
# loop: invoke claude, drain whatever gates just opened, repeat until
# claude reports no new gate-opens (or we hit the safety bound). The
# loop bound is 5 (max gate count per slash command is 3-4; 5 leaves
# headroom).
GATE_DRAIN_MAX_ITERATIONS=5

run_claude_with_gate_drain() {
  local slash_cmd="$1"   # e.g. "/design F1-initial-domain" or "/build F1-..."
  local feature_id="$2"  # e.g. "F1-initial-domain"
  local attempt
  for attempt in $(seq 1 "$GATE_DRAIN_MAX_ITERATIONS"); do
    log "    claude -p '${slash_cmd}' --agent scrum-master (attempt ${attempt}/${GATE_DRAIN_MAX_ITERATIONS})"
    # Run the orchestrator AS the scrum-master agent so its Agent(<roles>)
    # allowlist scopes which role subagents may be spawned (only the
    # scrum-master invokes the role agents). The role defs are discoverable
    # because the scaffold wrote them into .claude/agents/.
    claude -p "$slash_cmd" --agent scrum-master
    # Drain any gates that opened during this pass. Mock-approver is
    # idempotent: returns 0 even when no gates are open.
    local approved
    approved="$(
      npx --yes --package="${KIT_NPX}" \
        lakebase-tdd-human-proxy --feature "$feature_id" --json --pretty \
      | jq -r '.approved | length'
    )"
    log "    human-proxy: approved ${approved} gate(s) this pass"
    # No new gates to approve → claude is done with this slash command.
    if [[ "$approved" == "0" ]]; then
      return 0
    fi
  done
  err "${slash_cmd} did not converge after ${GATE_DRAIN_MAX_ITERATIONS} attempts; gates still open."
  return 2
}

# ─── prereqs ──────────────────────────────────────────────────

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "smoke: required command '$cmd' not found on PATH." >&2
    exit 10
  fi
}

require_cmd git
require_cmd npx
require_cmd claude
require_cmd jq
if [[ "${DATABRICKS_HOST:-}" == "" && ! -f "${HOME}/.databrickscfg" ]]; then
  echo "smoke: DATABRICKS_HOST not set + no ~/.databrickscfg found." >&2
  exit 10
fi

# ─── helpers ──────────────────────────────────────────────────

log() { printf '\n\033[1;34m[smoke]\033[0m %s\n' "$*" >&2; }
err() { printf '\n\033[1;31m[smoke ERROR]\033[0m %s\n' "$*" >&2; }

iteration_branch() {
  # v1-initial-domain -> feature/initial-domain
  local iter="$1"
  echo "feature/${iter#*-}"
}

iteration_spec() {
  local iter="$1"
  echo "${FEATURE_REQ_DIR}/${iter}.md"
}

iteration_verify() {
  local iter="$1"
  local short="${iter%%-*}"   # v1
  echo "${ASSERT_DIR}/verify-${short}.sh"
}

# Feature id used by /design + /build. The kit's TDD workflow expects
# .tdd/features/<feature-id>/feature-request.md (the Feature Requester's
# original ask) to exist as /design's Spec Author input; we stage
# feature-request.md from the iteration spec and let /design's Spec Author
# produce feature-spec.{md,json} + downstream artifacts. F<N>-<slug>
# matches the kit's example id shape ("F1-partner-submits-assets").
iteration_feature_id() {
  # v1-initial-domain -> F1-initial-domain
  local iter="$1"
  local num="${iter%%-*}"   # v1
  num="${num#v}"            # 1
  echo "F${num}-${iter#*-}"
}

# ─── scaffold ─────────────────────────────────────────────────

scaffold_project() {
  if [[ "$SKIP_SCAFFOLD" -eq 1 ]]; then
    log "skipping scaffold (--skip-scaffold)."
    return 0
  fi
  if [[ -d "$PROJECT_DIR/.git" ]]; then
    # Hard stop: never silently reuse a stale scaffold (an older kit's project
    # dir lacks the current commands/agents and fails mid-run with confusing
    # "Unknown command: /design"). The default project name is unique per run,
    # so this only fires on an explicit --project-name collision; the operator
    # must pass --skip-scaffold to intentionally reuse it.
    err "project dir already exists with a .git/ subdir at $PROJECT_DIR. Pass --skip-scaffold to reuse it intentionally, or remove it / use a fresh --project-name."
    exit 1
  fi

  : "${DATABRICKS_HOST:?smoke: DATABRICKS_HOST env var required for scaffold (or pass --skip-scaffold)}"
  : "${GITHUB_OWNER:?smoke: GITHUB_OWNER env var required for scaffold (or pass --skip-scaffold)}"

  log "scaffolding $PROJECT_NAME into $PROJECT_DIR via lakebase-create-project..."
  # Headless scaffold: language=python, self-hosted runner (kit default),
  # e2e enabled. Self-hosted is required because the Databricks workspace
  # IP ACL blocks github-hosted runners; the kit's setupRunner registers
  # a runner on this machine which can reach the workspace.
  # /design + /build commands scaffold by default (no --skip-commands).
  # Subshell-isolated so a non-zero exit surfaces our scaffold-failed code.
  #
  # Project name collision note: Lakebase keeps deleted projects in a
  # soft-delete state for 7 days (until purge_time), and rejects creates
  # against the same name during that window. If a smoke run fails after
  # the Lakebase project is created, re-run with --project-name <other>
  # rather than waiting for the purge.
  (
    npx --yes \
      --package=${KIT_NPX} \
      lakebase-create-project \
      --project-name "$PROJECT_NAME" \
      --parent-dir "$(dirname "$PROJECT_DIR")" \
      --databricks-host "$DATABRICKS_HOST" \
      --github-owner "$GITHUB_OWNER" \
      --language python \
      --runner self-hosted \
      --tiers "$TIERS" \
      --enable-e2e
  ) || { err "scaffold failed"; exit 1; }

  log "scaffold complete. Project at $PROJECT_DIR."
}

# ─── per-iteration loop ───────────────────────────────────────

run_iteration() {
  local iter="$1"
  local branch
  branch="$(iteration_branch "$iter")"
  local spec
  spec="$(iteration_spec "$iter")"
  local verify
  verify="$(iteration_verify "$iter")"

  log "▸ iteration $iter  (branch: $branch)"

  if [[ ! -f "$spec" ]]; then
    err "missing iteration spec: $spec"
    exit 2
  fi

  cd "$PROJECT_DIR"

  local feature_id
  feature_id="$(iteration_feature_id "$iter")"

  # 0.5. If a prior feature is mid-flight (state past scaffold-complete
  # and not merged), abandon it so the kit's claim CLI lets us start a
  # fresh feature. The SCM state machine refuses concurrent claims by
  # design; in this TDD-only smoke iterations are local-only (never merged), so
  # without an abandon step v2 would fail to claim F2.
  current_state_before_iter="$(
    npx --yes --package="${KIT_NPX}" \
      lakebase-scm-state --project-dir "$PROJECT_DIR" --json 2>/dev/null \
    | jq -r '.state.state // ""' 2>/dev/null || echo ""
  )"
  if [[ "$current_state_before_iter" != "" \
        && "$current_state_before_iter" != "scaffold-complete" \
        && "$current_state_before_iter" != "merged" ]]; then
    log "  step 0.5: abandon prior feature (state=$current_state_before_iter)"
    npx --yes --package="${KIT_NPX}" \
      lakebase-scm-abandon-feature --project-dir "$PROJECT_DIR" \
      || { err "abandon-feature failed; cannot start $iter on top of $current_state_before_iter"; exit 2; }
  fi

  # 1. Return to trunk before staging the feature spec. The orchestrator
  # does NOT do branch creation itself: that's the kit's responsibility
  # via /design's mandatory Step 0 (see
  # templates/project/common/.claude/commands/design.md). /design's
  # body enforces the substrate-only-path invariant at the kit level;
  # the smoke just invokes /design and trusts the contract.
  log "  step 1: return to trunk; /design's Step 0 claims the paired branch via substrate"
  git checkout main >/dev/null 2>&1 || git checkout master >/dev/null 2>&1
  git pull --ff-only origin "$(git branch --show-current)" || true

  # 2. feature-request.md is NOT staged here: it was authored at /plan
  # (run_plan_sprint) and committed to trunk, so /design's Step 0 branch
  # (forked from main HEAD) already carries .tdd/features/<id>/feature-request.md.
  # /design's Spec Author reads it as input and produces feature-spec.{md,json}.

  # 3. /design <feature-id>: the kit-shipped pre-hook claims the paired
  # feature branch via the substrate BEFORE phase 1 runs. The
  # orchestrator never touches `git checkout -b`. /design pauses at
  # HITL gates (spec / plan / test_list); the gate-drain loop mocks
  # the human approver so the smoke can run headless.
  log "  step 3: /design ${feature_id} (pre-hook claims branch via substrate, gates approved by human-proxy)"
  run_claude_with_gate_drain "/design ${feature_id}" "${feature_id}" || exit 2

  # 3.5 (FEIP-7458 phase A+): assert the SCM workflow state advanced
  # to feature-claimed via the claim CLI. This catches the case where
  # /design ran but Step 0's substrate call silently failed.
  log "  step 3.5: verify-workflow-state feature-claimed ${feature_id}"
  "${ASSERT_DIR}/verify-workflow-state.sh" "$PROJECT_DIR" feature-claimed "$feature_id"

  # 4. /build <feature-id>: reads test-list.json that /design produced.
  # /build pauses at the promote gate (and any earlier gates if it
  # re-opens them); same gate-drain loop applies.
  log "  step 4: /build ${feature_id} (gates approved by human-proxy)"
  run_claude_with_gate_drain "/build ${feature_id}" "${feature_id}" || exit 2

  # 4.5 (FEIP-7565): advisory per-story pipeline check. If the orchestrator
  # drove the streaming per-story pipeline (feature decomposed into >1 story),
  # confirm it ended clean: single build lane idle, ready queue drained, every
  # story done with an approved spec gate. Advisory (WARNINGs, never aborts):
  # the hard per-story guarantees are unit-tested (tdd-per-story-pipeline-e2e);
  # a single-story feature is a no-op.
  log "  step 4.5: verify-story-pipeline ${feature_id} (advisory)"
  "${ASSERT_DIR}/verify-story-pipeline.sh" "$PROJECT_DIR" "$feature_id" || \
    log "  WARNING: verify-story-pipeline reported anomalies (advisory; smoke continues)."

  # 5. local tests
  log "  step 5: ./scripts/run-tests.sh"
  if [[ -x "./scripts/run-tests.sh" ]]; then
    ./scripts/run-tests.sh
  else
    uv run pytest || python -m pytest
  fi

  # 6. per-iteration verification (asserts the right files / migration shape exist)
  if [[ -x "$verify" ]]; then
    log "  step 6: $verify"
    "$verify" "$PROJECT_DIR"
  else
    log "  step 6: no verify script for $iter (skipping)."
  fi

  # 6.5 /deploy --target local via the ACTUAL command (parity with a real run):
  # the orchestrator runs /deploy, which delegates to the release-engineer agent
  # (deploy to target + poll reachable + run the feature verify against the
  # running app) and records the PO deploy gate via the Human Proxy. This is the
  # per-sprint "working software" check (product-overview asks for "working
  # software I can use after each sprint"). local is the only implemented target;
  # the prod release path is merge.yml (SCM workflow), tested separately. /deploy
  # opens no gates.json gate, so it is a plain claude -p invocation (not a
  # gate-drain). A safety teardown follows in case the command left the app up.
  log "  step 6.5: claude -p '/deploy ${feature_id} --target local' --agent scrum-master (working-software check, via release-engineer)"
  if ! claude -p "/deploy ${feature_id} --target local" --agent scrum-master; then
    npx --yes --package="${KIT_NPX}" lakebase-tdd-deploy --target local --project-dir "$PROJECT_DIR" --stop >/dev/null 2>&1 || true
    echo "smoke: /deploy failed for ${feature_id} (app not reachable / verify failed)" >&2
    exit 2
  fi
  # Safety teardown before the next iteration (idempotent if already stopped).
  npx --yes --package="${KIT_NPX}" lakebase-tdd-deploy --target local --project-dir "$PROJECT_DIR" --stop >/dev/null 2>&1 || true

  # 7. local commit on the feature branch. The FEIP-7422 smoke is a
  # TDD-workflow validation harness; the SCM-workflow CLIs
  # (prepare-pr / wait-ci / merge --wait-migrate) belong to the SCM
  # workflow live tests in tests/integration/scm-workflow-e2e-live.test.ts
  # (discovered by scripts/run-all-live-tests.sh). Iterations stay at
  # feature-claimed locally; step 0.5 of the next iteration abandons
  # this feature so the SCM state machine lets the next claim proceed.
  log "  step 7: local commit on feature branch (TDD-only smoke; SCM cycle lives in scm-workflow-e2e-live)"
  git add -A
  git commit -m "smoke $iter: local commit"

  # 8. SCM doctor check at iteration end. Advisory: doctor failures
  # surface as warnings rather than aborting the smoke (the per-state
  # asserts above are the hard gates).
  log "  step 8: lakebase-scm-doctor (advisory cross-check)"
  local doctor_exit=0
  npx --yes --package=${KIT_NPX} \
    lakebase-scm-doctor --project-dir "$PROJECT_DIR" --json --pretty \
    || doctor_exit=$?
  if [[ "$doctor_exit" -ne 0 ]]; then
    log "  WARNING: doctor exited $doctor_exit (1=warn, 2=fail). Findings above. Smoke continues."
  fi

  log "✓ $iter complete"
}

# ─── HIL intake supply (Human Proxy) ──────────────────────────
#
# In the orchestrated pipeline the /design intake interviews capture the HIL's
# intent into product-overview.md / nfrs.md / design-brief.md. Headless, there
# is no human to interview, so the Human Proxy SUPPLIES the pre-recorded answers
# (the md files committed next to this script): it validates each against its
# declared format and places it under .tdd/, refusing a missing/malformed one.
# This is the identical path a real run takes, with the proxy standing in for
# the human at the intake step.
proxy_supply() {
  local from="$1" to="$2" artifact="$3" feature="${4:-}"
  local feat_flag=()
  [[ -n "$feature" ]] && feat_flag=(--feature "$feature")
  # Expand the optional array bash-3.2-safe: on macOS /bin/bash (3.2) with
  # `set -u`, "${arr[@]}" on an EMPTY array throws "unbound variable". The
  # ${arr[@]+...} guard yields nothing when empty. (stage_project_intake calls
  # this with no feature, so feat_flag is empty for project-level intake.)
  npx --yes --package="${KIT_NPX}" lakebase-tdd-human-proxy supply \
    --from "$from" --to "$to" --artifact "$artifact" \
    --tdd-dir "${PROJECT_DIR}/.tdd" ${feat_flag[@]+"${feat_flag[@]}"}
}

# Project-level intake, staged once before the iteration loop. product-overview.md
# and nfrs.md are project-scoped (refined across features in a real run; recorded
# here). design-brief.md is also supplied: this smoke is a UI project (v5 ships a
# bug-list view), so LAKEBASE_TDD_UI=1 turns on the UX track and the intake
# precondition requires the brief.
stage_project_intake() {
  log "staging project HIL intake via human-proxy (product-overview.md + nfrs.md + design-brief.md)"
  cd "$PROJECT_DIR"
  git checkout main >/dev/null 2>&1 || git checkout master >/dev/null 2>&1 || true
  proxy_supply "${ORCHESTRATOR_DIR}/product-overview.md" "${PROJECT_DIR}/.tdd/product-overview.md" "product-overview.md" \
    || { echo "smoke: human-proxy refused product-overview.md (missing/non-conformant)" >&2; exit 2; }
  proxy_supply "${ORCHESTRATOR_DIR}/nfrs.md" "${PROJECT_DIR}/.tdd/nfrs.md" "nfrs.md" \
    || { echo "smoke: human-proxy refused nfrs.md (missing/non-conformant)" >&2; exit 2; }
  proxy_supply "${ORCHESTRATOR_DIR}/design-brief.md" "${PROJECT_DIR}/.tdd/design/design-brief.md" "design-brief.md" \
    || { echo "smoke: human-proxy refused design-brief.md (missing/non-conformant)" >&2; exit 2; }
  # Commit project intake to trunk so every feature branch (forked from main
  # HEAD by /design Step 0) inherits the HIL's project-level intent. The
  # .tdd/ planning corpus is version-controlled on trunk; product code +
  # migrations are what the SCM workflow keeps OFF main, not these artifacts.
  git add .tdd/product-overview.md .tdd/nfrs.md .tdd/design/design-brief.md 2>/dev/null || true
  git commit -m "intake: project product-overview + nfrs + design-brief" >/dev/null 2>&1 \
    || log "  project intake already committed (nothing new)"
}

# ─── /plan: sprint planning (Human Proxy) ─────────────────────
#
# /plan is the precursor to each dev loop, run once per sprint ABOVE the
# per-feature loop. The Spec Author proposes how to divide the work into
# features and the Product Owner prioritizes + authors the sprint's
# feature-requests. Headless, there is no human: the Human Proxy SUPPLIES the
# recorded backlog (the iteration specs ARE the PO's groomed sprint). The
# backlog is committed to trunk so each feature branch inherits its request.
# This is the identical path a real run takes, with the proxy standing in for
# the PO at the authoring step.
run_plan_sprint() {
  local sprint_name="$1"; shift
  local iters=("$@")
  log "▸ /plan ${sprint_name}: sprint planning (Spec Author proposes; PO authors requests; human-proxy supplies headless)"
  cd "$PROJECT_DIR"
  git checkout main >/dev/null 2>&1 || git checkout master >/dev/null 2>&1 || true

  # a. /plan Step 0: project intake must be present + conformant (no --feature
  # means project-level only: product-overview.md + nfrs.md + design-brief.md).
  npx --yes --package="${KIT_NPX}" lakebase-tdd-intake \
    || { err "/plan ${sprint_name}: project-intake precondition failed"; exit 2; }

  # b. PROPOSAL FIRST. Run the actual /plan command (parity): the orchestrator
  # (as scrum-master) has the Spec Author propose the feature breakdown
  # (feature-proposals.md), then hand to the PO. /plan opens no gates.json gate,
  # so it is a plain claude -p invocation, not a gate-drain. Feature-requests must
  # NOT exist before this proposal is written, so the supply (step c) runs AFTER.
  log "  ${sprint_name}: claude -p '/plan --sprint ${sprint_name}' --agent scrum-master"
  claude -p "/plan --sprint ${sprint_name}" --agent scrum-master

  # c. ONLY AFTER the proposal: the PO authors each sprint item's
  # feature-request.md. Headless, the Human Proxy puts them out from the recorded
  # backlog (validate + place), the PO authoring step downstream of the Spec
  # Author proposal. Sprint membership is the smoke orchestrator's call;
  # idempotent if /plan already had the Proxy supply them.
  local iter feature_id spec feature_dir
  for iter in "${iters[@]}"; do
    feature_id="$(iteration_feature_id "$iter")"
    spec="$(iteration_spec "$iter")"
    if [[ ! -f "$spec" ]]; then err "missing iteration spec: $spec"; exit 2; fi
    feature_dir="${PROJECT_DIR}/.tdd/features/${feature_id}"
    mkdir -p "$feature_dir"
    log "  ${sprint_name}: human-proxy (PO) authors feature-request for ${feature_id} (after the proposal)"
    proxy_supply "$spec" "$feature_dir/feature-request.md" "feature-request.md" "$feature_id" \
      || { err "human-proxy refused feature-request.md for ${feature_id}"; exit 2; }
    # Confirm the per-feature precondition now passes (request present + conformant).
    npx --yes --package="${KIT_NPX}" lakebase-tdd-intake --feature "$feature_id" \
      || { err "feature-request.md for ${feature_id} is not conformant"; exit 2; }
  done

  # c. Commit the sprint backlog to trunk so each feature branch inherits its
  # request. Idempotent on resume: nothing to commit when already present.
  git add .tdd/features 2>/dev/null || true
  git commit -m "plan ${sprint_name}: author feature-requests (${iters[*]})" >/dev/null 2>&1 \
    || log "  ${sprint_name}: backlog already committed (nothing new)"

  # Record the planning activity (the PO authored the sprint's requests).
  npx --yes --package="${KIT_NPX}" lakebase-tdd-log \
    --role scrum-master --level info --event phase.end \
    --tdd-dir "$PROJECT_DIR/.tdd" \
    --message "/plan ${sprint_name}: ${#iters[@]} feature-request(s) authored for the sprint" \
    --data "{\"phase\":\"plan\",\"sprint\":\"${sprint_name}\"}" >/dev/null 2>&1 || true
}

# ─── main ─────────────────────────────────────────────────────

log "FEIP-7422 smoke starting (project=$PROJECT_DIR)"
scaffold_project
stage_project_intake

# A sprint = /plan (author the sprint's requests) then the per-feature loop
# over that sprint's iterations. sprint-2 is planned only after sprint-1's
# features have shipped working software (their /deploy gates), so the PO's
# sprint-2 requests can fold in what sprint-1 revealed (the feedback loop).
started=0
run_sprint() {
  local sprint_name="$1"; shift
  local sprint_iters=("$@")
  run_plan_sprint "$sprint_name" "${sprint_iters[@]}"
  local iter
  for iter in "${sprint_iters[@]}"; do
    if [[ -n "$RESUME_AT" && "$started" -eq 0 ]]; then
      if [[ "$iter" == "$RESUME_AT"* ]]; then
        started=1
      else
        log "skipping $iter (--resume $RESUME_AT)"
        continue
      fi
    fi
    run_iteration "$iter"
  done
}

run_sprint "sprint-1" "${SPRINT1_ITERS[@]}"
run_sprint "sprint-2" "${SPRINT2_ITERS[@]}"

log "FEIP-7422 smoke COMPLETED"
exit 0
