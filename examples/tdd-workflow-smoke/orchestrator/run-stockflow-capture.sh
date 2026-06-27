#!/usr/bin/env bash
# Stockflow F1+F6 reference capture (option 1): the DESIGN lane is REPLAYED from
# recorded-artifacts/ (stockflow's faithful staging + feature-f6 design), the
# BUILD lane runs LIVE and is RECORDED per turn (recorded-artifacts + recorded-build).
# One fresh project, F1-stock-visibility then F6-split-tracking-code in sequence
# (F6 builds on F1), so the recording spans both features continuously.
#
# Design replayed => only the BUILD agents (navigator/driver/test-strategist/PO/
# release-engineer) run live; F6's missing feature-spec is the one design stage
# that falls back to a live Spec Author breakdown (captured into the corpus).
#
# Env required: DATABRICKS_HOST, GITHUB_OWNER, a CLI profile (DATABRICKS_CONFIG_PROFILE).
# Optional: LAKEBASE_KIT_DIR (default: this kit checkout), AGENT_MODELS, RECORD_DIR.
set -euo pipefail

ORCH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORPUS_DIR="${ORCH}/../recorded-artifacts"
KIT_ROOT="$(cd "${ORCH}/../../.." && pwd)"
KIT_LK="${KIT_ROOT}/templates/project/common/scripts/lk"
ASSERT_DIR="${ORCH}/assertions"
FEATURES=(F1-stock-visibility F6-split-tracking-code)
TIERS=2
TS="$(date +%Y%m%d-%H%M%S)"
PROJECT_NAME="stockflow-cap-${TS}"
PARENT="$HOME/code/tdd-workflow-smoke"
PROJECT_DIR="${PARENT}/${PROJECT_NAME}"

C='\033[1;34m'; R='\033[1;31m'; Z='\033[0m'
log() { printf "\n${C}[sf-capture]${Z} %s\n" "$*" >&2; }
err() { printf "\n${R}[sf-capture ERROR]${Z} %s\n" "$*" >&2; }

: "${DATABRICKS_HOST:?DATABRICKS_HOST required}"
: "${GITHUB_OWNER:?GITHUB_OWNER required}"
[[ -z "${LAKEBASE_KIT_DIR:-}" ]] && export LAKEBASE_KIT_DIR="$KIT_ROOT"
mkdir -p "$PARENT"
[[ -d "$PROJECT_DIR/.git" ]] && { err "project exists: $PROJECT_DIR"; exit 1; }
[[ -d "$CORPUS_DIR/features/${FEATURES[0]}" ]] || { err "design corpus missing ${FEATURES[0]}"; exit 2; }

# Capture: record the design mirror AND the per-turn build corpus.
export LAKEBASE_SFTDD_RECORD_DIR="${LAKEBASE_SFTDD_RECORD_DIR:-${PARENT}/_capture-sf-${TS}}"
export LAKEBASE_SFTDD_RECORD_BUILD_DIR="${LAKEBASE_SFTDD_RECORD_DIR}/recorded-build"
mkdir -p "$LAKEBASE_SFTDD_RECORD_DIR"
# Design REPLAYED from the faithful stockflow corpus; build runs LIVE.
export LAKEBASE_SFTDD_REPLAY_DIR="${CORPUS_DIR}"
# Build STORY-by-story (one RED writes the whole story's tests, one GREEN, one
# REVIEW/REFACTOR per story), NOT per-AC. The resolver honors this env over the
# scaffolded tdd-config, so the cadence is correct even if a config drifts.
export LAKEBASE_SFTDD_LOOP=story
# Headless: human-proxy approves gates; UI track on (full-stack SPA).
export LAKEBASE_SFTDD_UI=1
export LAKEBASE_SFTDD_HUMAN_PROXY=1
export LAKEBASE_SFTDD_AUTO_CONTINUE=1
export LAKEBASE_SFTDD_RECORDED_INTAKE_DIR="${ORCH}"
LOG_FILE="${PARENT}/_capture-sf-${TS}.log"

# Models: kit DEFAULTS (each role's recommended model); design is replayed so the
# design roles' model is moot, and the build roles run on their recommended model
# backed by the deterministic gates + honest-GREEN. Set AGENT_MODELS (space-
# separated role=model pairs) to override for a perf experiment; empty = defaults.
AGENT_MODELS="${AGENT_MODELS:-}"
AGENT_MODEL_FLAGS=""; for _p in $AGENT_MODELS; do AGENT_MODEL_FLAGS="$AGENT_MODEL_FLAGS --agent-model $_p"; done

log "kit=$LAKEBASE_KIT_DIR  project=$PROJECT_NAME  tiers=$TIERS"
log "design REPLAYED <- $CORPUS_DIR ; build LIVE + recorded -> $LAKEBASE_SFTDD_RECORD_DIR"
log "features: ${FEATURES[*]}  models: ${AGENT_MODELS:-kit defaults}"

bash "$KIT_LK" --warm || { err "kit lk --warm failed"; exit 1; }
log "scaffolding ${PROJECT_NAME}..."
bash "$KIT_LK" lakebase-create-project \
  --project-name "$PROJECT_NAME" --parent-dir "$PARENT" \
  --databricks-host "$DATABRICKS_HOST" --github-owner "$GITHUB_OWNER" \
  --language python --runner self-hosted --tiers "$TIERS" \
  $AGENT_MODEL_FLAGS --enable-e2e || { err "scaffold failed"; exit 1; }
cd "$PROJECT_DIR"
lk() { "$PROJECT_DIR/scripts/lk" "$@"; }

# Intake on trunk (product-overview + nfrs + design-brief via human-proxy).
git checkout main >/dev/null 2>&1 || git checkout master >/dev/null 2>&1 || true
SFTDD_DIR="$(lk lakebase-resolve-sftdd-dir --project-dir "$PROJECT_DIR")"
SFTDD_REL="$(basename "$SFTDD_DIR")"
proxy_supply() { lk lakebase-sftdd-human-proxy supply --from "$1" --to "$2" --artifact "$3"; }
log "staging project intake"
proxy_supply "${ORCH}/product-overview.md" "${SFTDD_DIR}/product-overview.md" "product-overview.md"
proxy_supply "${ORCH}/nfrs.md" "${SFTDD_DIR}/nfrs.md" "nfrs.md"
proxy_supply "${ORCH}/design-brief.md" "${SFTDD_DIR}/design/design-brief.md" "design-brief.md"
git add "${SFTDD_REL}/product-overview.md" "${SFTDD_REL}/nfrs.md" "${SFTDD_REL}/design/design-brief.md" 2>/dev/null || true
git commit -m "intake: project product-overview + nfrs + design-brief" >/dev/null 2>&1 || true

# Drive each feature: design replays, build runs live + recorded, accept+deploy+promote.
for FID in "${FEATURES[@]}"; do
  log "=== feature ${FID}: feature-request -> trunk, claim, drive ==="
  git checkout main >/dev/null 2>&1 || git checkout master >/dev/null 2>&1 || true
  mkdir -p "${SFTDD_DIR}/features/${FID}"
  cp "${CORPUS_DIR}/features/${FID}/feature-request.md" "${SFTDD_DIR}/features/${FID}/feature-request.md"
  git add "${SFTDD_REL}/features/${FID}/feature-request.md" 2>/dev/null || true
  git commit -m "plan: feature-request for ${FID}" >/dev/null 2>&1 || true
  lk lakebase-scm-claim-feature-branch "${FID}" --project-dir "$PROJECT_DIR" --json || { err "claim ${FID} failed"; exit 2; }
  lk lakebase-sftdd-drive --feature "${FID}" --project-dir "$PROJECT_DIR" --pause-before navigator --gates proxy \
    || { err "drive ${FID} failed"; exit 2; }
  log "=== feature ${FID} complete ==="
done

# Reconstitute the agent-log into ONE coherent recording: design entries verbatim
# from the recorded design log (original token counts + cost, original capture
# date), the live build + the one live F6 breakdown re-dated onto that timeline,
# synthetic "reconciled" placeholders dropped. Then store the reconstituted log in
# the corpus so a future replay reproduces it verbatim.
log "reconstituting agent-log (design verbatim + costs; build re-dated to the capture timeline)"
lk lakebase-sftdd-log --reconstitute --design-log "${CORPUS_DIR}/agent-log.design.jsonl" --tdd-dir "$SFTDD_DIR" \
  || err "reconstitute-log failed (non-fatal)"
cp "${SFTDD_DIR}/agent-log.jsonl" "${CORPUS_DIR}/agent-log.jsonl" 2>/dev/null || true

log "✓ stockflow capture complete. project=$PROJECT_DIR  record=$LAKEBASE_SFTDD_RECORD_DIR"
echo "LOG_FILE=$LOG_FILE" >&2
