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
    --project-dir)       PROJECT_DIR="$2"; shift 2 ;;
    --skip-scaffold)     SKIP_SCAFFOLD=1; shift ;;
    --keep-on-failure)   KEEP_ON_FAILURE=1; shift ;;
    --no-keep-on-failure) KEEP_ON_FAILURE=0; shift ;;
    -h|--help)           print_help ;;
    *) echo "Unknown arg: $1" >&2; print_help ;;
  esac
done

PROJECT_DIR="${PROJECT_DIR:-${SMOKE_ROOT_DEFAULT}/bug-tracker}"

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

  log "scaffolding bug-tracker into $PROJECT_DIR via lakebase-create-project..."
  # Headless scaffold: language=python, github-hosted runner, e2e enabled.
  # /design + /build commands scaffold by default (no --skip-commands).
  # Subshell-isolated so a non-zero exit surfaces our scaffold-failed code.
  (
    npx --yes \
      --package=github:databricks-solutions/lakebase-app-dev-kit \
      lakebase-create-project \
      --project-name "bug-tracker" \
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

  # 1. branch (kit's post-checkout hook creates the paired Lakebase branch)
  log "  step 1: checkout -b $branch (post-checkout hook will pair Lakebase)"
  git checkout main >/dev/null 2>&1 || git checkout master >/dev/null 2>&1
  git pull --ff-only origin "$(git branch --show-current)" || true
  git checkout -b "$branch"

  # 2. /design
  log "  step 2: claude -p '/design <spec>'"
  claude -p "/design $(cat "$spec")"

  # 3. /build
  log "  step 3: claude -p '/build'"
  claude -p "/build"

  # 4. local tests
  log "  step 4: ./scripts/run-tests.sh"
  if [[ -x "./scripts/run-tests.sh" ]]; then
    ./scripts/run-tests.sh
  else
    uv run pytest || python -m pytest
  fi

  # 5. per-iteration verification (asserts the right files / migration shape exist)
  if [[ -x "$verify" ]]; then
    log "  step 5: $verify"
    "$verify" "$PROJECT_DIR"
  else
    log "  step 5: no verify script for $iter (skipping)."
  fi

  # 6. mode-dependent gate
  if is_full_cycle "$iter"; then
    log "  step 6: full cycle (push + PR + CI + merge)"
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
