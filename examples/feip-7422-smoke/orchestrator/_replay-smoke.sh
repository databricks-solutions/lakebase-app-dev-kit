#!/usr/bin/env bash
# Shared core for the two REPLAY smokes (sourced, not run directly , like
# assertions/_assert-lib.sh). It scaffolds a REAL project, stages intake, claims
# the paired feature branch, replays the DESIGN lane from recorded-artifacts/,
# optionally restores the recorded BUILD, then drives the deterministic
# orchestrator to a chosen handoff and STOPS just before it.
#
# The two entry scripts set three vars, then call `replay_smoke "$@"`:
#   SMOKE_NAME    label for logs + the usage line (e.g. run-to-navigator.sh)
#   STOP_BEFORE   navigator | release-engineer  (lakebase-tdd-drive --stop-before)
#   REPLAY_BUILD  0 | 1  (1 also restores the recorded code tree + green cycles,
#                 so the run skips the live build and lands at the RE handoff)
#
# Determinism (in code): the create-project bootstrap, the scaffolded project's
# scripts/lk, and every drive turn all resolve the kit through the SAME committed
# lk resolver. With no explicit --kit-ref / $LAKEBASE_KIT_DIR, the run defaults to
# THIS checkout's freshly-built dist (offline, content-stable), so a plain run is
# deterministic without a push. Pass --kit-ref <ref> to resolve a published ref
# instead, or export LAKEBASE_KIT_DIR to pin a pre-built install.
#
# Env: DATABRICKS_HOST, GITHUB_OWNER, a CLI profile (same as run-smoke.sh).
# Exit: 0 ok (incl. the clean stop-before-handoff); 1 scaffold; 2 a step failed.

replay_smoke() {
  set -euo pipefail

  local ORCHESTRATOR_DIR ASSERT_DIR CORPUS_DIR BUILD_CORPUS_DIR
  ORCHESTRATOR_DIR="$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)"
  ASSERT_DIR="${ORCHESTRATOR_DIR}/assertions"
  CORPUS_DIR="${ORCHESTRATOR_DIR}/../recorded-artifacts"
  BUILD_CORPUS_DIR="${LAKEBASE_TDD_REPLAY_BUILD_DIR:-${ORCHESTRATOR_DIR}/../recorded-build}"

  local FEATURE_ID="F1-file-bug"
  local TIERS="${TIERS:-}"
  local KIT_REF="${LAKEBASE_KIT_REF:-}"
  local PROJECT_NAME="bug-tracker-ff-$(date +%Y%m%d-%H%M%S)"
  local PROJECT_DIR=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tiers)        TIERS="$2"; shift 2 ;;
      --kit-ref)      KIT_REF="$2"; shift 2 ;;
      --project-name) PROJECT_NAME="$2"; shift 2 ;;
      --project-dir)  PROJECT_DIR="$2"; shift 2 ;;
      --feature)      FEATURE_ID="$2"; shift 2 ;;
      --corpus)       CORPUS_DIR="$2"; shift 2 ;;
      -h|--help)      sed -n '1,40p' "${BASH_SOURCE[1]}"; return 0 ;;
      *) echo "${SMOKE_NAME}: unknown arg: $1" >&2; return 2 ;;
    esac
  done

  PROJECT_DIR="${PROJECT_DIR:-$HOME/code/feip-7422-smoke/${PROJECT_NAME}}"
  [[ -n "$TIERS" ]] || { echo "${SMOKE_NAME}: --tiers 2 is required (bug-tracker is prod+staging)." >&2; return 2; }
  [[ -d "$CORPUS_DIR/features/$FEATURE_ID" ]] || { echo "${SMOKE_NAME}: corpus missing $CORPUS_DIR/features/$FEATURE_ID" >&2; return 2; }

  local KIT_ROOT KIT_LK
  KIT_ROOT="$(cd "${ORCHESTRATOR_DIR}/../../.." && pwd)"
  KIT_LK="${KIT_ROOT}/templates/project/common/scripts/lk"

  # Deterministic kit resolution (in code): explicit $LAKEBASE_KIT_DIR wins; else
  # an explicit --kit-ref resolves via lk; else default to THIS checkout's dist.
  if [[ -z "${LAKEBASE_KIT_DIR:-}" && -z "$KIT_REF" ]]; then
    export LAKEBASE_KIT_DIR="$KIT_ROOT"
  fi
  [[ -n "$KIT_REF" ]] && export LAKEBASE_KIT_REF="$KIT_REF"

  # UI track on (browser-facing feature); headless gates via the Human Proxy.
  export LAKEBASE_TDD_UI=1
  export LAKEBASE_TDD_HUMAN_PROXY=1

  local C='\033[1;34m' R='\033[1;31m' Z='\033[0m'
  log() { printf "\n${C}[%s]${Z} %s\n" "$SMOKE_NAME" "$*" >&2; }
  err() { printf "\n${R}[%s ERROR]${Z} %s\n" "$SMOKE_NAME" "$*" >&2; }
  lk()  { "$PROJECT_DIR/scripts/lk" "$@"; }

  # ─── 1. scaffold a REAL project via the committed lk resolver ──
  log "kit = ${LAKEBASE_KIT_DIR:-ref ${KIT_REF:-main}}  (stop-before: ${STOP_BEFORE}, replay-build: ${REPLAY_BUILD})"
  if [[ -d "$PROJECT_DIR/.git" ]]; then
    err "project dir already exists: $PROJECT_DIR (use a fresh --project-name)"; return 1
  fi
  : "${DATABRICKS_HOST:?${SMOKE_NAME}: DATABRICKS_HOST required}"
  : "${GITHUB_OWNER:?${SMOKE_NAME}: GITHUB_OWNER required}"
  log "scaffolding ${PROJECT_NAME} (tiers=${TIERS})..."
  bash "$KIT_LK" --warm || { err "could not resolve the kit via lk"; return 1; }
  (
    bash "$KIT_LK" lakebase-create-project \
      --project-name "$PROJECT_NAME" --parent-dir "$(dirname "$PROJECT_DIR")" \
      --databricks-host "$DATABRICKS_HOST" --github-owner "$GITHUB_OWNER" \
      --language python --runner self-hosted --tiers "$TIERS" \
      --agent-model spec-author=haiku --agent-model architect-reviewer=haiku \
      --agent-model test-strategist=haiku --agent-model ux-designer=haiku \
      --agent-model product-owner=haiku --agent-model release-engineer=haiku \
      --enable-e2e
  ) || { err "scaffold failed"; return 1; }
  cd "$PROJECT_DIR"

  # ─── 2. project intake on trunk (REAL precondition) ───────────
  log "staging project intake (product-overview + nfrs + design-brief) via human-proxy"
  git checkout main >/dev/null 2>&1 || git checkout master >/dev/null 2>&1 || true
  proxy_supply() {
    lk lakebase-tdd-human-proxy supply --from "$1" --to "$2" --artifact "$3" --tdd-dir "${PROJECT_DIR}/.tdd"
  }
  proxy_supply "${ORCHESTRATOR_DIR}/product-overview.md" "${PROJECT_DIR}/.tdd/product-overview.md" "product-overview.md" \
    || { err "human-proxy refused product-overview.md"; return 2; }
  proxy_supply "${ORCHESTRATOR_DIR}/nfrs.md" "${PROJECT_DIR}/.tdd/nfrs.md" "nfrs.md" \
    || { err "human-proxy refused nfrs.md"; return 2; }
  proxy_supply "${ORCHESTRATOR_DIR}/design-brief.md" "${PROJECT_DIR}/.tdd/design/design-brief.md" "design-brief.md" \
    || { err "human-proxy refused design-brief.md"; return 2; }
  git add .tdd/product-overview.md .tdd/nfrs.md .tdd/design/design-brief.md 2>/dev/null || true
  git commit -m "intake: project product-overview + nfrs + design-brief" >/dev/null 2>&1 || true

  # ─── 3. feature-request on trunk, then claim the paired branch ─
  log "replay: feature-request.md -> trunk (the PO's committed ask)"
  mkdir -p ".tdd/features/${FEATURE_ID}"
  cp "${CORPUS_DIR}/features/${FEATURE_ID}/feature-request.md" ".tdd/features/${FEATURE_ID}/feature-request.md"
  git add ".tdd/features/${FEATURE_ID}/feature-request.md"
  git commit -m "plan: feature-request for ${FEATURE_ID}" >/dev/null 2>&1 || true

  log "claim the paired feature branch for ${FEATURE_ID} (REAL substrate)"
  lk lakebase-scm-claim-feature-branch "${FEATURE_ID}" --project-dir "$PROJECT_DIR" --json \
    || { err "claim-feature-branch failed"; return 2; }
  "${ASSERT_DIR}/verify-workflow-state.sh" "$PROJECT_DIR" feature-claimed "$FEATURE_ID"

  # ─── 4. drive in REPLAY mode, STOP just before the chosen handoff ─
  # LAKEBASE_TDD_REPLAY_DIR replays each DESIGN-lane role turn from the corpus.
  # When REPLAY_BUILD=1 the recorded code tree + GREEN cycles are restored too
  # (the build skips to the Release Engineer). --stop-before halts the driver
  # cleanly just before the handoff so the human can review / take over.
  export LAKEBASE_TDD_REPLAY_DIR="${CORPUS_DIR}"
  if [[ "$REPLAY_BUILD" == "1" ]]; then
    [[ -d "$BUILD_CORPUS_DIR" ]] || { err "build corpus missing: $BUILD_CORPUS_DIR"; return 2; }
    export LAKEBASE_TDD_REPLAY_BUILD_DIR="$BUILD_CORPUS_DIR"
    log "design REPLAYED + build RESTORED (corpus: ${BUILD_CORPUS_DIR}); driving to the ${STOP_BEFORE} handoff"
  else
    log "design REPLAYED (corpus: ${CORPUS_DIR}); driving to the ${STOP_BEFORE} handoff"
  fi
  lk lakebase-tdd-drive --feature "${FEATURE_ID}" --project-dir "$PROJECT_DIR" --stop-before "$STOP_BEFORE" \
    || { err "lakebase-tdd-drive failed for ${FEATURE_ID}"; return 2; }

  log "✓ stopped just before the ${STOP_BEFORE} handoff. Project: ${PROJECT_DIR}"
  log "  continue with: (cd '${PROJECT_DIR}' && ./scripts/lk lakebase-tdd-drive --feature ${FEATURE_ID})"
}
