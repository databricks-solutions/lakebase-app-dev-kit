#!/usr/bin/env bash
# FEIP-7422 end-to-end SCM-workflow smoke.
#
# Drives a real bug-tracker project through 5 evolution iterations
# (v1..v5), each touching the kit's full SCM + (optionally) CI loop.
# See ./00-domain.md for the project + iteration overview and
# ./iterations/*.md for the per-iteration specs.
#
# Run modes (mutually exclusive):
#   --fast       scaffold + /design + /build + local tests + local commit
#                for every iteration. NO push, NO PR, NO CI. ~5 min total.
#   --standard   (default) iterations v1-v4 are --fast semantics; v5 runs
#                the full PR + CI green + merge + Playwright [E2E] cycle.
#                Proves SCM + CI + FEIP-7423 wiring at least once. ~15 min.
#   --full       Every iteration's PR + CI + merge runs end-to-end; v5
#                also asserts Playwright [E2E] / LAKEBASE_APP_ENDPOINT.
#                ~45 min.
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
#   - gh authenticated for PR + CI watch operations (standard / full modes)
#
# Exit codes:
#   0  smoke completed; v5 [E2E] passed if mode != --fast
#   1  scaffold failed
#   2  an iteration's design/build/tests failed
#   3  an iteration's PR / CI / merge failed (standard or full modes)
#   4  v5 [E2E] failed (BASE_URL never resolved or Playwright exited non-zero)
#  10  prereq missing (CLI not found, env var unset)

set -e
set -u
set -o pipefail

# ─── defaults + arg parse ────────────────────────────────────────

SMOKE_ROOT_DEFAULT="${HOME}/code/feip-7422-smoke"
MODE="standard"
RESUME_AT=""
PROJECT_NAME="bug-tracker"
PROJECT_DIR=""
SKIP_SCAFFOLD=0
KEEP_ON_FAILURE=1
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
    --fast)              MODE="fast"; shift ;;
    --standard)          MODE="standard"; shift ;;
    --full)              MODE="full"; shift ;;
    --resume)            RESUME_AT="$2"; shift 2 ;;
    --project-name)      PROJECT_NAME="$2"; shift 2 ;;
    --project-dir)       PROJECT_DIR="$2"; shift 2 ;;
    --skip-scaffold)     SKIP_SCAFFOLD=1; shift ;;
    --keep-on-failure)   KEEP_ON_FAILURE=1; shift ;;
    --no-keep-on-failure) KEEP_ON_FAILURE=0; shift ;;
    -h|--help)           print_help ;;
    *) echo "Unknown arg: $1" >&2; print_help ;;
  esac
done

PROJECT_DIR="${PROJECT_DIR:-${SMOKE_ROOT_DEFAULT}/${PROJECT_NAME}}"

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
if [[ "$MODE" != "fast" ]]; then
  require_cmd gh
fi
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

# Whether THIS iteration should run the full PR + CI + merge cycle in the
# current mode. fast: never. standard: only v5. full: always.
is_full_cycle() {
  local iter="$1"
  case "$MODE" in
    fast)     return 1 ;;
    standard) [[ "$iter" == v5-* ]] ;;
    full)     return 0 ;;
  esac
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
  # Headless scaffold: language=python, github-hosted runner, e2e enabled.
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
      --package=github:databricks-solutions/lakebase-app-dev-kit \
      lakebase-create-project \
      --project-name "$PROJECT_NAME" \
      --parent-dir "$(dirname "$PROJECT_DIR")" \
      --databricks-host "$DATABRICKS_HOST" \
      --github-owner "$GITHUB_OWNER" \
      --language python \
      --runner github-hosted \
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

  log "▸ iteration $iter  (branch: $branch, mode: $MODE)"

  if [[ ! -f "$spec" ]]; then
    err "missing iteration spec: $spec"
    exit 2
  fi

  cd "$PROJECT_DIR"

  local feature_id
  feature_id="$(iteration_feature_id "$iter")"

  # 1. branch (kit's post-checkout hook creates the paired Lakebase branch)
  log "  step 1: checkout -b $branch (post-checkout hook will pair Lakebase)"
  git checkout main >/dev/null 2>&1 || git checkout master >/dev/null 2>&1
  git pull --ff-only origin "$(git branch --show-current)" || true
  git checkout -b "$branch"

  # 2. Stage the .tdd/features/<feature-id>/feature.md from the iteration
  # spec. /design + /build read this directory; the kit's TDD workflow
  # contract is .tdd/features/<id>/{feature.md,feature.json}+ subtree.
  log "  step 2: stage .tdd/features/${feature_id}/feature.md"
  local feature_dir=".tdd/features/${feature_id}"
  mkdir -p "$feature_dir"
  if [[ ! -f "$feature_dir/feature.md" ]]; then
    cp "$spec" "$feature_dir/feature.md"
  fi

  # 3. /design <feature-id>: the skill expects a positional feature id,
  # NOT the spec text. It reads $feature_dir/feature.md from disk.
  log "  step 3: claude -p '/design ${feature_id}'"
  claude -p "/design ${feature_id}"

  # 4. /build <feature-id>: same shape; reads test-list.json that /design
  # produced.
  log "  step 4: claude -p '/build ${feature_id}'"
  claude -p "/build ${feature_id}"

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

  # 7. mode-dependent gate
  if is_full_cycle "$iter"; then
    log "  step 7: full cycle (push + PR + CI + merge)"
    git push -u origin "$branch"
    local pr_url
    pr_url="$(gh pr create --title "$iter" --body "FEIP-7422 smoke iteration $iter. See orchestrator/iterations/${iter}.md for ACs.")"
    log "  PR opened: $pr_url"
    log "  waiting for CI..."
    gh pr checks --watch "$pr_url" || { err "CI failed for $iter"; exit 3; }

    if [[ "$iter" == v5-* ]]; then
      log "  v5 special: asserting Playwright [E2E] saw a real BASE_URL"
      bash "${ASSERT_DIR}/verify-v5-e2e.sh" "$pr_url" || { err "v5 [E2E] verification failed"; exit 4; }
    fi

    log "  merging $pr_url..."
    gh pr merge --squash --delete-branch "$pr_url" || { err "merge failed for $iter"; exit 3; }
  else
    log "  step 6: fast mode (local commit only)"
    git add -A
    git commit -m "smoke $iter: local commit"
  fi

  log "✓ $iter complete"
}

# ─── main ─────────────────────────────────────────────────────

log "FEIP-7422 smoke starting (mode=$MODE, project=$PROJECT_DIR)"
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

log "FEIP-7422 smoke COMPLETED (mode=$MODE)"
exit 0
