#!/usr/bin/env bash
# RESUME the stockflow F1+F6 capture after a mid-run halt (no scaffold, no intake).
#
# Context: the original capture (run-stockflow-capture.sh) reached F1/S1's
# Release Engineer step, which transiently tripped the deploy foreign-port guard
# on its OWN prior await-acceptance app and raised to HIL. With the deploy
# self-heal fix now in dist, this resumes from the RE step:
#   - F1 is mid-drive (on its experiment branch, S1 built+green+refactored, the
#     RE turn + its escalation surgically removed): we just RE-DRIVE F1, which
#     re-runs the RE deploy cleanly (self-heal frees the port), PO-accepts,
#     merges the experiment, builds S2 + S3, then promotes F1 to staging.
#   - F6 then runs with the full preamble (feature-request -> claim -> drive).
# Finally the agent-log is reconstituted (design verbatim + costs; build re-dated)
# and copied into the corpus. Same env as the original so the recording continues
# seamlessly into the SAME record dir.
set -euo pipefail

ORCH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORPUS_DIR="${ORCH}/../recorded-artifacts"
KIT_ROOT="$(cd "${ORCH}/../../.." && pwd)"
KIT_LK="${KIT_ROOT}/templates/project/common/scripts/lk"

PARENT="$HOME/code/tdd-workflow-smoke"
PROJECT_NAME="stockflow-cap-20260624-072956"
PROJECT_DIR="${PARENT}/${PROJECT_NAME}"

C='\033[1;34m'; R='\033[1;31m'; Z='\033[0m'
log() { printf "\n${C}[sf-resume]${Z} %s\n" "$*" >&2; }
err() { printf "\n${R}[sf-resume ERROR]${Z} %s\n" "$*" >&2; }

[[ -d "$PROJECT_DIR/.git" ]] || { err "project not found: $PROJECT_DIR"; exit 1; }

# --- workspace / auth (same target as the original run) -----------------------
export DATABRICKS_HOST="${DATABRICKS_HOST:-https://fevm-serverless-stable-ecparr.cloud.databricks.com}"
export DATABRICKS_CONFIG_PROFILE="${DATABRICKS_CONFIG_PROFILE:-fevm-serverless-stable-ecparr}"
export GITHUB_OWNER="${GITHUB_OWNER:-kevin-hartman}"

# --- recording env (IDENTICAL to the original capture) ------------------------
export LAKEBASE_KIT_DIR="${LAKEBASE_KIT_DIR:-$KIT_ROOT}"          # use the freshly-built dist
export LAKEBASE_SFTDD_RECORD_DIR="${PARENT}/_capture-stockflow"     # continue the SAME record dir
export LAKEBASE_SFTDD_RECORD_BUILD_DIR="${LAKEBASE_SFTDD_RECORD_DIR}/recorded-build"
export LAKEBASE_SFTDD_REPLAY_DIR="${CORPUS_DIR}"                    # design replays from the corpus
# Build cadence (story) + UI track are PROJECT settings in the resumed project's
# sftdd-config.json (single source), not env doors, so no LOOP / UI export here.
export LAKEBASE_SFTDD_HUMAN_PROXY=1
export LAKEBASE_SFTDD_AUTO_CONTINUE=1
export LAKEBASE_SFTDD_RECORDED_INTAKE_DIR="${ORCH}"

LOG_FILE="${PARENT}/_resume-stockflow.log"
cd "$PROJECT_DIR"
lk() { "$PROJECT_DIR/scripts/lk" "$@"; }
SFTDD_DIR="$(lk lakebase-resolve-sftdd-dir --project-dir "$PROJECT_DIR")"
SFTDD_REL="$(basename "$SFTDD_DIR")"

log "kit=$LAKEBASE_KIT_DIR  project=$PROJECT_DIR"
log "record(continue)=$LAKEBASE_SFTDD_RECORD_DIR  replay=$CORPUS_DIR  loop=story"

bash "$KIT_LK" --warm || { err "kit lk --warm failed"; exit 1; }

# --- F1: resume mid-drive (it is already claimed + on its experiment branch) ---
log "=== F1-stock-visibility: RESUME drive (RE deploy -> accept -> S2/S3 -> promote) ==="
lk lakebase-sftdd-drive --feature "F1-stock-visibility" --project-dir "$PROJECT_DIR" \
  --pause-before navigator --gates proxy || { err "resume drive F1 failed"; exit 2; }
log "=== F1-stock-visibility complete ==="

# --- F6: full preamble (feature-request -> claim) then drive -------------------
FID="F6-split-tracking-code"
log "=== ${FID}: feature-request -> trunk, claim, drive ==="
git checkout main >/dev/null 2>&1 || git checkout master >/dev/null 2>&1 || true
mkdir -p "${SFTDD_DIR}/features/${FID}"
cp "${CORPUS_DIR}/features/${FID}/feature-request.md" "${SFTDD_DIR}/features/${FID}/feature-request.md"
git add "${SFTDD_REL}/features/${FID}/feature-request.md" 2>/dev/null || true
git commit -m "plan: feature-request for ${FID}" >/dev/null 2>&1 || true
lk lakebase-scm-claim-feature-branch "${FID}" --project-dir "$PROJECT_DIR" --json || { err "claim ${FID} failed"; exit 2; }
lk lakebase-sftdd-drive --feature "${FID}" --project-dir "$PROJECT_DIR" --pause-before navigator --gates proxy \
  || { err "drive ${FID} failed"; exit 2; }
log "=== ${FID} complete ==="

# --- reconstitute the agent-log (design verbatim + costs; build re-dated) ------
log "reconstituting agent-log (design verbatim + costs; build re-dated to the capture timeline)"
lk lakebase-sftdd-log --reconstitute --design-log "${CORPUS_DIR}/agent-log.design.jsonl" --tdd-dir "$SFTDD_DIR" \
  || err "reconstitute-log failed (non-fatal)"
cp "${SFTDD_DIR}/agent-log.jsonl" "${CORPUS_DIR}/agent-log.jsonl" 2>/dev/null || true

log "✓ stockflow capture RESUMED + complete. project=$PROJECT_DIR  record=$LAKEBASE_SFTDD_RECORD_DIR"
echo "LOG_FILE=$LOG_FILE" >&2
