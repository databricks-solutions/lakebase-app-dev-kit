#!/usr/bin/env bash
# Capture a new SFTDD replay scenario: drive a real feature live with the per-turn
# recorder on, recording straight into examples/sftdd-scenarios/<name>/ so the
# result is immediately a committable, replayable integration-test corpus. This
# is the "record once" half of the loop whose "replay forever" half is
# replay-scenario.sh; see SCENARIOS.md.
#
# It is a thin wrapper around the kit drive (lakebase-sftdd-drive) with the
# recorder env pointed at the scenario dir:
#   LAKEBASE_SFTDD_RECORD_DIR        = <scenario>/            (turns/ + recorded-artifacts/)
#   LAKEBASE_SFTDD_RECORD_BUILD_DIR  = <scenario>/recorded-build
# The recorder (scripts/sftdd/turn-recorder.ts) writes every state-machine turn;
# at the end the agent-log is reconstituted (lakebase-sftdd-log --reconstitute).
#
# Usage:
#   capture-scenario.sh --scenario <name> --project-dir <dir> --feature <id> [--feature <id> ...]
#                       [--pause-before navigator|release-engineer]
# Env: DATABRICKS_HOST, DATABRICKS_CONFIG_PROFILE, GITHUB_OWNER, LAKEBASE_KIT_DIR.
#      LAKEBASE_SFTDD_AUTO_CONTINUE=1 to run headless.
# Exit: 0 ok; 2 bad args.
#
# NOTE: a capture is a full live drive (real agents + workspace); it is the
# expensive authoring step, not a CI test. The cheap always-on guard is
# tests/bdd/sftdd-scenarios.test.ts; the live replay is replay-scenario.sh.
set -euo pipefail

SCEN_DIR_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCENARIO=""
PROJECT_DIR=""
PAUSE_BEFORE=""
FEATURES=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scenario)      SCENARIO="$2"; shift 2 ;;
    --project-dir)   PROJECT_DIR="$2"; shift 2 ;;
    --feature)       FEATURES+=("$2"); shift 2 ;;
    --pause-before)  PAUSE_BEFORE="$2"; shift 2 ;;
    -h|--help)       sed -n '1,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "capture-scenario: unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$SCENARIO" ]]    || { echo "capture-scenario: --scenario <name> is required" >&2; exit 2; }
[[ -n "$PROJECT_DIR" ]] || { echo "capture-scenario: --project-dir <dir> is required" >&2; exit 2; }
[[ ${#FEATURES[@]} -gt 0 ]] || { echo "capture-scenario: at least one --feature <id> is required" >&2; exit 2; }

SCEN="${SCEN_DIR_ROOT}/${SCENARIO}"
mkdir -p "$SCEN"
export LAKEBASE_SFTDD_RECORD_DIR="$SCEN"
export LAKEBASE_SFTDD_RECORD_BUILD_DIR="${SCEN}/recorded-build"

cd "$PROJECT_DIR"
lk() { "$PROJECT_DIR/scripts/lk" "$@"; }
SFTDD_DIR="$(lk lakebase-resolve-sftdd-dir --project-dir "$PROJECT_DIR")"

pause_args=(); [[ -n "$PAUSE_BEFORE" ]] && pause_args=( --pause-before "$PAUSE_BEFORE" )
for FID in "${FEATURES[@]}"; do
  echo "[capture-scenario] recording ${SCENARIO} feature ${FID} into ${SCEN}" >&2
  lk lakebase-sftdd-drive --feature "$FID" --project-dir "$PROJECT_DIR" --gates proxy "${pause_args[@]}"
done

echo "[capture-scenario] reconstituting agent-log onto the recorded timeline" >&2
lk lakebase-sftdd-log --reconstitute --tdd-dir "$SFTDD_DIR" || echo "[capture-scenario] reconstitute skipped" >&2
echo "[capture-scenario] ${SCENARIO} captured -> ${SCEN} (add scenario.json, then commit)" >&2
