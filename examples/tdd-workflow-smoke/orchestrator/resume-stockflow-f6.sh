#!/usr/bin/env bash
# RESUME just F6-split-tracking-code after the F6/S3 driver GREEN turn overflowed
# the model window mid-turn ("Prompt is too long"). The kit now retries such a
# turn on a FRESH session (bounded), so this re-drive of F6 picks up at S3's GREEN
# on the clean on-disk state (S3 experiment cut + RED tests written), continues
# S3 -> S4, then promotes F6 to staging. Finally reconstitutes the agent-log.
#
# F1 is NOT re-driven here (it is complete + merged to staging) and F6's preamble
# (claim / feature-request) is NOT re-run (F6 is already claimed and mid-build);
# re-running either would collide with the in-progress experiment branch.
set -euo pipefail

ORCH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORPUS_DIR="${ORCH}/../recorded-artifacts"
KIT_ROOT="$(cd "${ORCH}/../../.." && pwd)"
KIT_LK="${KIT_ROOT}/templates/project/common/scripts/lk"

PARENT="$HOME/code/tdd-workflow-smoke"
PROJECT_NAME="stockflow-cap-20260624-072956"
PROJECT_DIR="${PARENT}/${PROJECT_NAME}"

C='\033[1;34m'; R='\033[1;31m'; Z='\033[0m'
log() { printf "\n${C}[sf-resume-f6]${Z} %s\n" "$*" >&2; }
err() { printf "\n${R}[sf-resume-f6 ERROR]${Z} %s\n" "$*" >&2; }
[[ -d "$PROJECT_DIR/.git" ]] || { err "project not found: $PROJECT_DIR"; exit 1; }

# --- workspace / auth (same target as the original run) -----------------------
export DATABRICKS_HOST="${DATABRICKS_HOST:-https://fevm-serverless-stable-ecparr.cloud.databricks.com}"
export DATABRICKS_CONFIG_PROFILE="${DATABRICKS_CONFIG_PROFILE:-fevm-serverless-stable-ecparr}"
export GITHUB_OWNER="${GITHUB_OWNER:-kevin-hartman}"

# --- recording env (IDENTICAL to the original capture) ------------------------
export LAKEBASE_KIT_DIR="${LAKEBASE_KIT_DIR:-$KIT_ROOT}"          # use the freshly-built dist (mid-turn retry)
export LAKEBASE_SFTDD_RECORD_DIR="${PARENT}/_capture-stockflow"     # continue the SAME record dir
export LAKEBASE_SFTDD_RECORD_BUILD_DIR="${LAKEBASE_SFTDD_RECORD_DIR}/recorded-build"
export LAKEBASE_SFTDD_REPLAY_DIR="${CORPUS_DIR}"                    # design replays from the corpus
# (Build cadence is a PROJECT setting: build.loopGranularity in the resumed
# project's sftdd-config.json, "story" by default. Not an env door.)
# Ephemeral verify DB: run each verify's migrations + tests on a disposable
# child branch forked off the story's experiment branch (then deleted), so a
# contract/cleanup story's migration up/down fixtures can't leave the shared DB
# half-migrated for the next run , the thrash that ground F6/S3's GREEN turn.
export LAKEBASE_SFTDD_EPHEMERAL_VERIFY=1
export LAKEBASE_SFTDD_HUMAN_PROXY=1
export LAKEBASE_SFTDD_AUTO_CONTINUE=1
export LAKEBASE_SFTDD_RECORDED_INTAKE_DIR="${ORCH}"

cd "$PROJECT_DIR"
lk() { "$PROJECT_DIR/scripts/lk" "$@"; }
SFTDD_DIR="$(lk lakebase-resolve-sftdd-dir --project-dir "$PROJECT_DIR")"

log "kit=$LAKEBASE_KIT_DIR  project=$PROJECT_DIR  (F6 resume @ S3 GREEN)"
bash "$KIT_LK" --warm || { err "kit lk --warm failed"; exit 1; }

log "=== F6-split-tracking-code: RESUME drive (S3 GREEN -> S4 -> promote) ==="
lk lakebase-sftdd-drive --feature "F6-split-tracking-code" --project-dir "$PROJECT_DIR" \
  --pause-before navigator --gates proxy || { err "resume drive F6 failed"; exit 2; }
log "=== F6-split-tracking-code complete ==="

log "reconstituting agent-log (design verbatim + costs; build re-dated to the capture timeline)"
lk lakebase-sftdd-log --reconstitute --design-log "${CORPUS_DIR}/agent-log.design.jsonl" --tdd-dir "$SFTDD_DIR" \
  || err "reconstitute-log failed (non-fatal)"
cp "${SFTDD_DIR}/agent-log.jsonl" "${CORPUS_DIR}/agent-log.jsonl" 2>/dev/null || true

log "✓ stockflow capture (F6) RESUMED + complete. project=$PROJECT_DIR  record=$LAKEBASE_SFTDD_RECORD_DIR"
