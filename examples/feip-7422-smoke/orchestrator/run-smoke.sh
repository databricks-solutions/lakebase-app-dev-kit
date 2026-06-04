#!/usr/bin/env bash
# FEIP-7422 TDD-workflow smoke.
#
# Drives a real bug-tracker project through 5 evolution iterations
# (v1..v5) to exercise the TDD substrate: /design + /build + HITL
# gates (spec / plan / test_list / promote) + per-iteration local
# tests. The mock-approver replaces a human approver so the smoke
# runs headless.
#
# Scope: this smoke validates TDD-workflow behavior. The SCM workflow
# CLIs (lakebase-scm-prepare-pr / wait-ci / merge --wait-migrate) are
# tested separately by tests/integration/scm-workflow-e2e-live.test.ts,
# discovered by scripts/run-all-live-tests.sh.
#
# What each iteration does:
#   1. Abandon prior feature (substrate CLI) if state is mid-flight.
#   2. Stage .tdd/features/<id>/feature.md from the iteration spec.
#   3. /design <id>  – gates drained by mock-approver.
#   4. /build <id>   – gates drained by mock-approver.
#   5. Local tests (./scripts/run-tests.sh).
#   6. Per-iteration verify (assertions/verify-vN.sh).
#   7. Commit the iteration's work on the feature branch.
#   8. SCM doctor (advisory cross-check; warning-only).
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
PROJECT_NAME="bug-tracker"
PROJECT_DIR=""
SKIP_SCAFFOLD=0
KEEP_ON_FAILURE=1
TIERS=""                      # 2 or 3; required architectural choice, no default
# Default to kit @ main; smoke can validate a feature branch via --kit-ref.
# Exported so the kit's templated /design + /design.pre-hook (which both
# invoke `npx ... lakebase-scm-claim-feature-branch`) can read the same ref.
KIT_REF="${LAKEBASE_KIT_REF:-}"
ITERATIONS=(v1-initial-domain v2-add-owners v3-status-table v4-split-bug-entity v5-list-view)

ORCHESTRATOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ITER_DIR="${ORCHESTRATOR_DIR}/iterations"
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

# ─── HITL mock-approver loop ──────────────────────────────────
#
# /design and /build pause at HITL gates (spec / plan / test_list /
# promote). In an automated smoke we mock the human approver with
# `lakebase-tdd-mock-approver`, which records every open gate as
# approved by "ci-mock-approver". `claude -p` runs one phase per
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
    log "    claude -p '${slash_cmd}' (attempt ${attempt}/${GATE_DRAIN_MAX_ITERATIONS})"
    claude -p "$slash_cmd"
    # Drain any gates that opened during this pass. Mock-approver is
    # idempotent: returns 0 even when no gates are open.
    local approved
    approved="$(
      npx --yes --package="${KIT_NPX}" \
        lakebase-tdd-mock-approver --feature "$feature_id" --json --pretty \
      | jq -r '.approved | length'
    )"
    log "    mock-approver: approved ${approved} gate(s) this pass"
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
  echo "${ITER_DIR}/${iter}.md"
}

iteration_verify() {
  local iter="$1"
  local short="${iter%%-*}"   # v1
  echo "${ASSERT_DIR}/verify-${short}.sh"
}

# Feature id used by /design + /build. The kit's TDD workflow expects
# .tdd/features/<feature-id>/feature.md + feature.json to exist; we
# stage feature.md from the iteration spec and let /design fill in the
# JSON + downstream artifacts. F<N>-<slug> matches the kit's example
# id shape ("F1-partner-submits-assets").
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
    log "project dir already exists with a .git/ subdir at $PROJECT_DIR. Use --skip-scaffold to reuse, or remove and re-run."
    return 0
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

  # 2. Stage the .tdd/features/<feature-id>/feature.md from the iteration
  # spec. /design reads this; the kit's TDD workflow contract is
  # .tdd/features/<id>/{feature.md,feature.json,...}.
  log "  step 2: stage .tdd/features/${feature_id}/feature.md"
  local feature_dir=".tdd/features/${feature_id}"
  mkdir -p "$feature_dir"
  if [[ ! -f "$feature_dir/feature.md" ]]; then
    cp "$spec" "$feature_dir/feature.md"
  fi

  # 3. /design <feature-id>: the kit-shipped pre-hook claims the paired
  # feature branch via the substrate BEFORE phase 1 runs. The
  # orchestrator never touches `git checkout -b`. /design pauses at
  # HITL gates (spec / plan / test_list); the gate-drain loop mocks
  # the human approver so the smoke can run headless.
  log "  step 3: /design ${feature_id} (pre-hook claims branch via substrate, gates auto-approved)"
  run_claude_with_gate_drain "/design ${feature_id}" "${feature_id}" || exit 2

  # 3.5 (FEIP-7458 phase A+): assert the SCM workflow state advanced
  # to feature-claimed via the claim CLI. This catches the case where
  # /design ran but Step 0's substrate call silently failed.
  log "  step 3.5: verify-workflow-state feature-claimed ${feature_id}"
  "${ASSERT_DIR}/verify-workflow-state.sh" "$PROJECT_DIR" feature-claimed "$feature_id"

  # 4. /build <feature-id>: reads test-list.json that /design produced.
  # /build pauses at the promote gate (and any earlier gates if it
  # re-opens them); same gate-drain loop applies.
  log "  step 4: /build ${feature_id} (gates auto-approved)"
  run_claude_with_gate_drain "/build ${feature_id}" "${feature_id}" || exit 2

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

# ─── main ─────────────────────────────────────────────────────

log "FEIP-7422 smoke starting (project=$PROJECT_DIR)"
scaffold_project

started=0
for iter in "${ITERATIONS[@]}"; do
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

log "FEIP-7422 smoke COMPLETED"
exit 0
