#!/usr/bin/env bash
# Shared core for the two REPLAY smokes (sourced, not run directly , like
# assertions/_assert-lib.sh). It scaffolds a REAL project, stages intake, claims
# the paired feature branch, replays the DESIGN lane from recorded-artifacts/,
# optionally restores the recorded BUILD, then drives the deterministic
# orchestrator to a chosen handoff and STOPS just before it.
#
# The two entry scripts set three vars, then call `replay_smoke "$@"`:
#   SMOKE_NAME    label for logs + the usage line (e.g. run-to-navigator.sh)
#   PAUSE_BEFORE  navigator | release-engineer  (lakebase-sftdd-drive --pause-before)
#   REPLAY_BUILD  0 | 1  (1 also restores the recorded code tree + green cycles,
#                 so the run skips the live build and reaches the RE handoff)
#
# At the handoff the driver PAUSES (a HITL [Y/n] gate), waits for the human, and
# RESUMES the same run on Y , it never bails out of the state machine. Set
# LAKEBASE_SFTDD_AUTO_CONTINUE=1 to auto-confirm (non-interactive / CI).
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

  local ORCHESTRATOR_DIR ASSERT_DIR CORPUS_DIR BUILD_CORPUS_DIR INTAKE_DIR
  ORCHESTRATOR_DIR="$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)"
  # ASSERT_DIR + INTAKE_DIR default next to the sourcing script (the bug-tracker
  # smoke), but a generic caller (examples/sftdd-scenarios/replay-scenario.sh,
  # which lives at a different depth) overrides them so it can reuse the shared
  # assertions + supply a per-scenario intake set.
  ASSERT_DIR="${REPLAY_ASSERT_DIR:-${ORCHESTRATOR_DIR}/assertions}"
  INTAKE_DIR="${REPLAY_INTAKE_DIR:-${ORCHESTRATOR_DIR}}"
  CORPUS_DIR="${ORCHESTRATOR_DIR}/../recorded-artifacts"
  BUILD_CORPUS_DIR="${LAKEBASE_SFTDD_REPLAY_BUILD_DIR:-${ORCHESTRATOR_DIR}/../recorded-build}"

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

  PROJECT_DIR="${PROJECT_DIR:-$HOME/code/tdd-workflow-smoke/${PROJECT_NAME}}"
  # The scaffolder lands the project at <parent-dir>/<project-name>, so the project
  # NAME must equal PROJECT_DIR's basename , else create-project writes to a
  # different dir than the one we cd into next. Derive it from PROJECT_DIR (a no-op
  # when --project-dir was omitted, since PROJECT_DIR was built from PROJECT_NAME).
  PROJECT_NAME="$(basename "$PROJECT_DIR")"
  # Ensure the scaffold root exists; the scaffolder clones into PROJECT_DIR and
  # needs its parent present (a fresh checkout / renamed default may not have it).
  mkdir -p "$(dirname "$PROJECT_DIR")"
  [[ -n "$TIERS" ]] || { echo "${SMOKE_NAME}: --tiers 2 is required (bug-tracker is prod+staging)." >&2; return 2; }
  [[ -d "$CORPUS_DIR/features/$FEATURE_ID" ]] || { echo "${SMOKE_NAME}: corpus missing $CORPUS_DIR/features/$FEATURE_ID" >&2; return 2; }

  local KIT_ROOT KIT_LK
  # Depth-independent kit root (the git toplevel), so the engine is reusable from
  # any orchestrator depth; fall back to the historical 3-levels-up expression.
  # `||` + `&&` are equal precedence (left-assoc), so the fallback MUST be a
  # subshell , else `pwd` runs on BOTH paths and concatenates two lines into
  # KIT_ROOT. The subshell also keeps the cd local (doesn't move the caller's CWD).
  KIT_ROOT="$(git -C "${ORCHESTRATOR_DIR}" rev-parse --show-toplevel 2>/dev/null || (cd "${ORCHESTRATOR_DIR}/../../.." && pwd))"
  KIT_LK="${KIT_ROOT}/templates/project/common/scripts/lk"

  # Deterministic kit resolution (in code): explicit $LAKEBASE_KIT_DIR wins; else
  # an explicit --kit-ref resolves via lk; else default to THIS checkout's dist.
  if [[ -z "${LAKEBASE_KIT_DIR:-}" && -z "$KIT_REF" ]]; then
    export LAKEBASE_KIT_DIR="$KIT_ROOT"
  fi
  [[ -n "$KIT_REF" ]] && export LAKEBASE_KIT_REF="$KIT_REF"

  # UI track is a PROJECT setting (project.uiTrack, set at create by --ui-track
  # below), not an env door. Only the run-mode Human Proxy is env here.
  export LAKEBASE_SFTDD_HUMAN_PROXY=1

  # When recording a run (LAKEBASE_SFTDD_RECORD_DIR set), capture the BUILD corpus
  # too, not just the design mirror: default the per-turn build-record dir under
  # the same record root so recordBuildTurn fires for every Navigator/Driver turn.
  # Without this a capture produces recorded-artifacts/ but NOT recorded-build/,
  # so the build-replay (run-to-release-engineer) has nothing to restore. Mirrors
  # run-smoke.sh. Honor an explicit override.
  if [[ -n "${LAKEBASE_SFTDD_RECORD_DIR:-}" ]]; then
    export LAKEBASE_SFTDD_RECORD_BUILD_DIR="${LAKEBASE_SFTDD_RECORD_BUILD_DIR:-${LAKEBASE_SFTDD_RECORD_DIR}/recorded-build}"
  fi

  local C='\033[1;34m' R='\033[1;31m' Z='\033[0m'
  log() { printf "\n${C}[%s]${Z} %s\n" "$SMOKE_NAME" "$*" >&2; }
  err() { printf "\n${R}[%s ERROR]${Z} %s\n" "$SMOKE_NAME" "$*" >&2; }
  lk()  { "$PROJECT_DIR/scripts/lk" "$@"; }

  # ─── 1. scaffold a REAL project via the committed lk resolver ──
  # A multi-feature scenario reuses ONE project: only the FIRST feature scaffolds
  # + stages project intake; feature 2+ finds the project already there and goes
  # straight to its feature-request + claim + drive, so it builds on the earlier
  # features' MERGED state (the recorded DB + git lineage the capture recorded).
  log "kit = ${LAKEBASE_KIT_DIR:-ref ${KIT_REF:-main}}  (pause-before: ${PAUSE_BEFORE}, replay-build: ${REPLAY_BUILD})"
  : "${DATABRICKS_HOST:?${SMOKE_NAME}: DATABRICKS_HOST required}"
  : "${GITHUB_OWNER:?${SMOKE_NAME}: GITHUB_OWNER required}"
  local FRESH=1
  [[ -d "$PROJECT_DIR/.git" ]] && FRESH=0
  if [[ "$FRESH" == 1 ]]; then
    log "scaffolding ${PROJECT_NAME} (tiers=${TIERS})..."
    bash "$KIT_LK" --warm || { err "could not resolve the kit via lk"; return 1; }
    # Per-role models: kit DEFAULTS by default (no per-role pins). Design is
    # REPLAYED here so the design roles' model is moot anyway; the build roles run
    # on their recommended model, backed by the deterministic gates + honest-GREEN.
    # A caller that runs design LIVE (run-capture) or wants a perf experiment sets
    # AGENT_MODELS (space-separated role=model pairs) to override; empty = defaults.
    local AGENT_MODELS="${AGENT_MODELS:-}"
    local AGENT_MODEL_FLAGS="" _pair
    for _pair in $AGENT_MODELS; do AGENT_MODEL_FLAGS="$AGENT_MODEL_FLAGS --agent-model $_pair"; done
    log "agent models: ${AGENT_MODELS:-kit defaults}"
    (
      bash "$KIT_LK" lakebase-create-project \
        --project-name "$PROJECT_NAME" --parent-dir "$(dirname "$PROJECT_DIR")" \
        --databricks-host "$DATABRICKS_HOST" --github-owner "$GITHUB_OWNER" \
        --language python --runner self-hosted --tiers "$TIERS" \
        $AGENT_MODEL_FLAGS \
        --ui-track
    ) || { err "scaffold failed"; return 1; }
  else
    log "reusing existing project ${PROJECT_DIR} (multi-feature scenario , skip scaffold + intake)"
  fi
  cd "$PROJECT_DIR"

  # ─── 2. project intake on trunk (REAL precondition, once per project) ──
  # Resolve the runtime artifact dir through the kit's SINGLE point of entry,
  # never a hardcoded name: lakebase-resolve-sftdd-dir prints resolveTddDir() (the
  # one rule , prefer .sftdd, fall back to legacy .tdd). Defined ONCE + reused;
  # the CLIs below also default --tdd-dir to resolveTddDir, so we never pass it.
  # Back to trunk before each feature-request (the first feature's promote leaves
  # the project on the staging tier).
  git checkout main >/dev/null 2>&1 || git checkout master >/dev/null 2>&1 || true
  local SFTDD_DIR SFTDD_REL
  SFTDD_DIR="$(lk lakebase-resolve-sftdd-dir --project-dir "$PROJECT_DIR")" || { err "could not resolve the runtime artifact dir"; return 2; }
  SFTDD_REL="$(basename "$SFTDD_DIR")"
  proxy_supply() {
    lk lakebase-sftdd-human-proxy supply --from "$1" --to "$2" --artifact "$3"
  }
  if [[ "$FRESH" == 1 ]]; then
    log "staging project intake (product-overview + nfrs + design-brief) via human-proxy"
    proxy_supply "${INTAKE_DIR}/product-overview.md" "${SFTDD_DIR}/product-overview.md" "product-overview.md" \
      || { err "human-proxy refused product-overview.md"; return 2; }
    proxy_supply "${INTAKE_DIR}/nfrs.md" "${SFTDD_DIR}/nfrs.md" "nfrs.md" \
      || { err "human-proxy refused nfrs.md"; return 2; }
    proxy_supply "${INTAKE_DIR}/design-brief.md" "${SFTDD_DIR}/design/design-brief.md" "design-brief.md" \
      || { err "human-proxy refused design-brief.md"; return 2; }
    git add "${SFTDD_REL}/product-overview.md" "${SFTDD_REL}/nfrs.md" "${SFTDD_REL}/design/design-brief.md" 2>/dev/null || true
    git commit -m "intake: project product-overview + nfrs + design-brief" >/dev/null 2>&1 || true
  fi

  # ─── 3. feature-request on trunk, then claim the paired branch ─
  log "replay: feature-request.md -> trunk (the PO's committed ask)"
  mkdir -p "${SFTDD_DIR}/features/${FEATURE_ID}"
  cp "${CORPUS_DIR}/features/${FEATURE_ID}/feature-request.md" "${SFTDD_DIR}/features/${FEATURE_ID}/feature-request.md"
  git add "${SFTDD_REL}/features/${FEATURE_ID}/feature-request.md"
  git commit -m "plan: feature-request for ${FEATURE_ID}" >/dev/null 2>&1 || true

  log "claim the paired feature branch for ${FEATURE_ID} (REAL substrate)"
  lk lakebase-scm-claim-feature-branch "${FEATURE_ID}" --project-dir "$PROJECT_DIR" --json \
    || { err "claim-feature-branch failed"; return 2; }
  "${ASSERT_DIR}/verify-workflow-state.sh" "$PROJECT_DIR" feature-claimed "$FEATURE_ID"

  # ─── 4. drive, PAUSE just before the chosen handoff ─
  # By default LAKEBASE_SFTDD_REPLAY_DIR replays each DESIGN-lane role turn from the
  # corpus. With REPLAY_DESIGN=0 the design lane runs LIVE (real role agents) , the
  # CAPTURE path , and (when LAKEBASE_SFTDD_RECORD_DIR is set) every turn is recorded.
  # Live design needs an approver for its per-story spec/test_list gates: the Human
  # Proxy approves them headless (--gates proxy), the same path run-smoke uses.
  # When REPLAY_BUILD=1 the recorded code tree + GREEN cycles are restored too
  # (the build skips to the Release Engineer). --pause-before makes the driver
  # PAUSE at the handoff (a [Y/n] gate) so the human reviews, then RESUME the
  # same run on Y , it does NOT bail out of the state machine. The pause is
  # INTERNAL to this one drive process, so recording + the turn timeline span
  # design and build continuously (as if there were no pause).
  local GATES_FLAG=""
  if [[ "${REPLAY_DESIGN:-1}" == "1" ]]; then
    export LAKEBASE_SFTDD_REPLAY_DIR="${CORPUS_DIR}"
  else
    GATES_FLAG="--gates proxy"
  fi
  if [[ "$REPLAY_BUILD" == "1" ]]; then
    [[ -d "$BUILD_CORPUS_DIR" ]] || { err "build corpus missing: $BUILD_CORPUS_DIR"; return 2; }
    export LAKEBASE_SFTDD_REPLAY_BUILD_DIR="$BUILD_CORPUS_DIR"
  fi
  local DESIGN_MODE; [[ "${REPLAY_DESIGN:-1}" == "1" ]] && DESIGN_MODE="REPLAYED" || DESIGN_MODE="LIVE (recording)"
  local BUILD_NOTE=""; [[ "$REPLAY_BUILD" == "1" ]] && BUILD_NOTE=" + build RESTORED"
  log "design ${DESIGN_MODE}${BUILD_NOTE}; pausing at the ${PAUSE_BEFORE} handoff${LAKEBASE_SFTDD_RECORD_DIR:+ (recording -> ${LAKEBASE_SFTDD_RECORD_DIR})}"
  lk lakebase-sftdd-drive --feature "${FEATURE_ID}" --project-dir "$PROJECT_DIR" --pause-before "$PAUSE_BEFORE" $GATES_FLAG \
    || { err "lakebase-sftdd-drive failed for ${FEATURE_ID}"; return 2; }

  log "✓ ${SMOKE_NAME} complete (paused at the ${PAUSE_BEFORE} handoff, resumed on your Y). Project: ${PROJECT_DIR}"
}
