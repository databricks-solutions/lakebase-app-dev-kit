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
#   # Against an existing scaffolded project (design may be replayed if a corpus
#   # is staged; otherwise live):
#   capture-scenario.sh --scenario <name> --project-dir <dir> --feature <id> [...]
#                       [--pause-before navigator|release-engineer]
#
#   # Fully automated: create a fresh project, stage the scenario's intake, and
#   # run the FULL LIVE design lane (no replay) + build, recorded end to end:
#   capture-scenario.sh --scenario <name> --create --project-name <n> \
#     --databricks-host <url> --github-owner <o> --tiers 2 [--ui] \
#     --inputs-from <corpus-dir> --feature <id> [--feature <id> ...] \
#     [--pause-before release-engineer]
#   # --inputs-from reads intake/{product-overview,nfrs,design-brief}.md +
#   # recorded-artifacts/features/<id>/feature-request.md from that dir (the
#   # scenario's own inputs); recording still goes to <this scenario>/.
#
#   # Sprint mode: drive the PLANNING lane too (emits backlog.json) with the
#   # backlog scoped to EXACTLY the --feature ids, instead of the per-feature loop:
#   capture-scenario.sh --scenario <name> --create ... \
#     --sprint <sprint-name> --feature F1-... --feature F6-...
#   # The whole-sprint orchestrator plans to the plan gate (sync-backlog projects
#   # backlog.json from just these features), then claims + drives each. The
#   # feature-requests are supplied to planning via LAKEBASE_SFTDD_SPRINT_REQUESTS.
# Env: DATABRICKS_HOST, DATABRICKS_CONFIG_PROFILE, GITHUB_OWNER.
#      LAKEBASE_SFTDD_AUTO_CONTINUE=1 to run headless (required for --create).
#      Do NOT set LAKEBASE_KIT_DIR: the script refuses it (it would split-brain
#      the orchestrator vs the claude -p agents). The script instead pins one dev
#      ref (CAPTURE_KIT_REF, default sftdd-capture-local) symlinked to THIS kit
#      checkout for both, and asserts the project resolves it. See CAPTURE-RUNBOOK.md.
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
# --sprint <name>: drive the whole-sprint orchestrator (planning -> plan gate ->
# per-feature claim+drive) instead of the per-feature loop, so the capture
# exercises the PLANNING lane and emits backlog.json. The backlog is scoped to
# EXACTLY the --feature ids (see the drive section).
SPRINT=""
# --create: scaffold a fresh project + stage the scenario's own intake (the FULL
# LIVE design lane, no replay), so one command does create -> stage -> claim ->
# drive+record. Intake lives at <scenario>/intake/{product-overview,nfrs,design-brief}.md
# and per-feature <scenario>/recorded-artifacts/features/<id>/feature-request.md.
CREATE=""
PROJECT_NAME=""
DATABRICKS_HOST_ARG=""
GITHUB_OWNER_ARG=""
TIERS=2
UI=""
INPUTS_FROM=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scenario)       SCENARIO="$2"; shift 2 ;;
    --project-dir)    PROJECT_DIR="$2"; shift 2 ;;
    --feature)        FEATURES+=("$2"); shift 2 ;;
    --sprint)         SPRINT="$2"; shift 2 ;;
    --pause-before)   PAUSE_BEFORE="$2"; shift 2 ;;
    --create)         CREATE=1; shift ;;
    --project-name)   PROJECT_NAME="$2"; shift 2 ;;
    --databricks-host) DATABRICKS_HOST_ARG="$2"; shift 2 ;;
    --github-owner)   GITHUB_OWNER_ARG="$2"; shift 2 ;;
    --tiers)          TIERS="$2"; shift 2 ;;
    --ui)             UI=1; shift ;;
    # Where the intake + per-feature feature-request INPUTS come from (a scenario
    # dir with intake/ + recorded-artifacts/features/<id>/feature-request.md).
    # Defaults to the record scenario dir; point at an existing corpus to record
    # a fresh live run from the SAME inputs into a NEW scenario dir.
    --inputs-from)    INPUTS_FROM="$2"; shift 2 ;;
    -h|--help)        sed -n '1,47p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "capture-scenario: unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$SCENARIO" ]]    || { echo "capture-scenario: --scenario <name> is required" >&2; exit 2; }
[[ ${#FEATURES[@]} -gt 0 ]] || { echo "capture-scenario: at least one --feature <id> is required" >&2; exit 2; }
[[ -n "$PROJECT_DIR" || -n "$CREATE" ]] || { echo "capture-scenario: --project-dir <dir> OR --create is required" >&2; exit 2; }

SCEN="${SCEN_DIR_ROOT}/${SCENARIO}"

# ── Single-source kit resolution (makes the stale-shim / split-brain impossible) ──
# The orchestrator (this script + lakebase-sftdd-drive) and the `claude -p` role
# agents resolve the kit SEPARATELY: agents do NOT inherit env, so they read the
# ref from the project's .lakebase/kit-ref and load it from the shared cache,
# while LAKEBASE_KIT_DIR only redirects the orchestrator. Setting only
# LAKEBASE_KIT_DIR therefore runs the agents on a DIFFERENT (often stale `main`)
# kit than the driver. To force EVERYONE onto ONE kit , this working tree , we pin
# a dev ref whose cache slot is a symlink to this checkout, export it for the
# orchestrator, and write it into the project for the agents. Never LAKEBASE_KIT_DIR.
KIT_ROOT="$(cd "${SCEN_DIR_ROOT}/../.." && pwd)"
CAPTURE_KIT_REF="${CAPTURE_KIT_REF:-sftdd-capture-local}"
CACHE_ROOT="${XDG_CACHE_HOME:-$HOME/.cache}/lakebase-app-dev-kit"
KIT_CACHE_LINK="${CACHE_ROOT}/${CAPTURE_KIT_REF}/node_modules/@databricks-solutions/lakebase-app-dev-kit"

if [[ -n "${LAKEBASE_KIT_DIR:-}" ]]; then
  echo "capture-scenario: refuse to run with LAKEBASE_KIT_DIR set , it redirects only the orchestrator and leaves the claude -p agents on the stale cache (split-brain). Unset it; this script pins ref '${CAPTURE_KIT_REF}' for everyone." >&2
  exit 2
fi
[[ -d "${KIT_ROOT}/dist" ]] || { echo "capture-scenario: kit dist missing at ${KIT_ROOT}/dist , run 'npm run build' in the kit first (the shim runs dist/, not source)." >&2; exit 2; }
# Point the ref's cache slot at THIS working tree: a bin run then finds dist with
# no GitHub install, and because this ref is not a remote ref a moved-branch
# reinstall can never apply and clobber it. Idempotent.
mkdir -p "$(dirname "$KIT_CACHE_LINK")"
rm -rf "$KIT_CACHE_LINK"
ln -s "$KIT_ROOT" "$KIT_CACHE_LINK"
export LAKEBASE_KIT_REF="$CAPTURE_KIT_REF"
echo "[capture-scenario] kit pinned , ref '${CAPTURE_KIT_REF}' -> ${KIT_ROOT} (cache symlink + LAKEBASE_KIT_REF; LAKEBASE_KIT_DIR unset)" >&2

# Write the ref into the project (so the env-less agents resolve it too) and
# assert the shim will load THIS working tree. Fails loud on any drift so a run
# can never silently execute a stale/other kit.
assert_kit_single_source() {
  local project_dir="$1"
  mkdir -p "${project_dir}/.lakebase"
  printf '%s\n' "$CAPTURE_KIT_REF" > "${project_dir}/.lakebase/kit-ref"
  local want got
  want="$(cd "$KIT_ROOT" && pwd -P)"
  got="$(cd "$KIT_CACHE_LINK" 2>/dev/null && pwd -P || true)"
  [[ "$got" == "$want" ]] || { echo "capture-scenario: kit resolution drift , ref '${CAPTURE_KIT_REF}' resolves to '${got:-<missing>}', expected '${want}'. Aborting so the run cannot use a stale/other kit." >&2; exit 2; }
  echo "[capture-scenario] verified: ${project_dir} resolves kit ref '${CAPTURE_KIT_REF}' -> ${want}" >&2
}

# ── --create: scaffold a fresh project + stage this scenario's intake, then run
#    the FULL LIVE design lane (no replay) so the design roles + the pre-build
#    reflection gate all run live and are recorded. ─────────────────────────────
if [[ -n "$CREATE" ]]; then
  KIT_LK="${KIT_ROOT}/templates/project/common/scripts/lk"
  HOST="${DATABRICKS_HOST_ARG:-${DATABRICKS_HOST:?--databricks-host or DATABRICKS_HOST required}}"
  OWNER="${GITHUB_OWNER_ARG:-${GITHUB_OWNER:?--github-owner or GITHUB_OWNER required}}"
  PROJECT_NAME="${PROJECT_NAME:-${SCENARIO}-cap-$(date +%Y%m%d-%H%M%S)}"
  PARENT="${CAPTURE_PARENT_DIR:-$HOME/code/tdd-workflow-smoke}"
  PROJECT_DIR="${PARENT}/${PROJECT_NAME}"
  INPUTS="${INPUTS_FROM:-$SCEN}"
  INTAKE_DIR="${INPUTS}/intake"
  [[ -f "${INTAKE_DIR}/product-overview.md" ]] || { echo "capture-scenario: missing ${INTAKE_DIR}/product-overview.md (inputs from ${INPUTS})" >&2; exit 2; }
  [[ -d "$PROJECT_DIR/.git" ]] && { echo "capture-scenario: project exists: $PROJECT_DIR" >&2; exit 1; }
  mkdir -p "$PARENT"
  # The scenario MANIFEST (scenario.json) is the single source for this project's
  # conditions. Read them via the tested reader and funnel them into create-project
  # as flags , the ONE way in. uiTrack (persisted to sftdd-config.json) drives BOTH
  # the drive's UX lane AND the e2e harness (create-project derives e2e from it);
  # language/runner come from the manifest, not a harness hardcode. Degrades to the
  # --ui flag when the reader bin is absent (stale dist).
  SCENARIO_MANIFEST="${INPUTS}/scenario.json"
  sc() { node "${KIT_ROOT}/dist/scripts/sftdd/scenario-conditions.cli.js" --manifest "$SCENARIO_MANIFEST" --field "$1" 2>/dev/null || true; }
  SC_UI="$(sc uiTrack)"; SC_LANG="$(sc language)"; SC_RUNNER="$(sc runner)"; SC_TIERS="$(sc tiers)"
  create_flags=(--tiers "${SC_TIERS:-$TIERS}")
  [[ "$SC_UI" == "true" || -n "$UI" ]] && create_flags+=(--ui-track)
  [[ -n "$SC_LANG" ]] && create_flags+=(--language "$SC_LANG")
  [[ -n "$SC_RUNNER" ]] && create_flags+=(--runner "$SC_RUNNER")

  echo "[capture-scenario] create ${PROJECT_NAME} on ${HOST} (owner ${OWNER}; conditions ${SCENARIO_MANIFEST}: uiTrack=${SC_UI:-false} lang=${SC_LANG:-<default>} runner=${SC_RUNNER:-<default>} tiers=${SC_TIERS:-$TIERS})" >&2
  bash "$KIT_LK" --warm || { echo "capture-scenario: kit --warm failed" >&2; exit 1; }
  bash "$KIT_LK" lakebase-create-project \
    --project-name "$PROJECT_NAME" --parent-dir "$PARENT" \
    --databricks-host "$HOST" --github-owner "$OWNER" \
    "${create_flags[@]}" \
    || { echo "capture-scenario: create-project failed" >&2; exit 1; }

  cd "$PROJECT_DIR"
  clk() { "$PROJECT_DIR/scripts/lk" "$@"; }
  # Stage the intake on the ENTRY TIER , the branch features fork from , not main.
  # A feature git branch is forked from `origin/<entry-tier>` (staging by default,
  # per convention-branches), so intake committed on main NEVER reaches the feature
  # branch (main was already diverged when the tiers were cut), and the spec-author
  # correctly refuses to draft with no feature-request.md on the feature branch.
  # Commit intake on the entry tier and PUSH it so the fork inherits it.
  ENTRY_TIER="${CAPTURE_ENTRY_TIER:-staging}"
  git rev-parse --verify "$ENTRY_TIER" >/dev/null 2>&1 \
    || { ENTRY_TIER="main"; git rev-parse --verify main >/dev/null 2>&1 || ENTRY_TIER="master"; }
  git checkout "$ENTRY_TIER" >/dev/null 2>&1 || { echo "capture-scenario: cannot checkout entry tier '${ENTRY_TIER}'" >&2; exit 1; }
  SFTDD_DIR="$(clk lakebase-resolve-sftdd-dir --project-dir "$PROJECT_DIR")"
  SFTDD_REL="$(basename "$SFTDD_DIR")"
  # Stage the project intake (the "3 original inputs") via the Human Proxy, then
  # each feature's feature-request (the per-feature design input).
  clk lakebase-sftdd-human-proxy supply --from "${INTAKE_DIR}/product-overview.md" --to "${SFTDD_DIR}/product-overview.md" --artifact product-overview.md
  clk lakebase-sftdd-human-proxy supply --from "${INTAKE_DIR}/nfrs.md" --to "${SFTDD_DIR}/nfrs.md" --artifact nfrs.md
  [[ -f "${INTAKE_DIR}/design-brief.md" ]] && clk lakebase-sftdd-human-proxy supply --from "${INTAKE_DIR}/design-brief.md" --to "${SFTDD_DIR}/design/design-brief.md" --artifact design-brief.md
  git add "${SFTDD_REL}" >/dev/null 2>&1 || true
  git commit -m "intake: project product-overview + nfrs + design-brief" >/dev/null 2>&1 || true
  for FID in "${FEATURES[@]}"; do
    FR="${INPUTS}/recorded-artifacts/features/${FID}/feature-request.md"
    [[ -f "$FR" ]] || { echo "capture-scenario: missing feature-request for ${FID} at ${FR}" >&2; exit 2; }
    mkdir -p "${SFTDD_DIR}/features/${FID}"
    cp "$FR" "${SFTDD_DIR}/features/${FID}/feature-request.md"
    git add "${SFTDD_REL}/features/${FID}/feature-request.md" >/dev/null 2>&1 || true
    git commit -m "plan: feature-request for ${FID}" >/dev/null 2>&1 || true
  done
  # Push the entry tier so the feature branch (forked from origin/<entry-tier>)
  # inherits the intake. This is the throwaway capture project's OWN remote.
  # Retry with backoff: a transient DNS/network blip (github.com briefly
  # unresolvable) must not abort a whole capture setup that already provisioned
  # the project + tiers. Fail loud only after the retries are exhausted.
  push_ok=""
  for attempt in 1 2 3 4 5; do
    if git push origin "$ENTRY_TIER" >/dev/null 2>&1; then push_ok=1; break; fi
    echo "capture-scenario: push to origin/${ENTRY_TIER} failed (attempt ${attempt}/5); retrying in $((attempt * 5))s..." >&2
    sleep $((attempt * 5))
  done
  [[ -n "$push_ok" ]] || { echo "capture-scenario: failed to push intake to origin/${ENTRY_TIER} after 5 attempts (check network/VPN to github.com)" >&2; exit 1; }
  # NOTE: do NOT claim here. Only ONE feature may be claimed at a time, so each
  # feature is claimed right before its own drive (in the drive loop below) and
  # released when that drive finishes, then the next is claimed.
  echo "[capture-scenario] created + staged intake on '${ENTRY_TIER}' (pushed) ${PROJECT_DIR}; design lane runs LIVE" >&2
fi

mkdir -p "$SCEN"
export LAKEBASE_SFTDD_RECORD_DIR="$SCEN"
export LAKEBASE_SFTDD_RECORD_BUILD_DIR="${SCEN}/recorded-build"

cd "$PROJECT_DIR"
# Pin + verify the project resolves the SAME kit as the orchestrator BEFORE any
# agent runs (both --create and --project-dir modes). Aborts on drift.
assert_kit_single_source "$PROJECT_DIR"
lk() { "$PROJECT_DIR/scripts/lk" "$@"; }
SFTDD_DIR="$(lk lakebase-resolve-sftdd-dir --project-dir "$PROJECT_DIR")"

pause_args=(); [[ -n "$PAUSE_BEFORE" ]] && pause_args=( --pause-before "$PAUSE_BEFORE" )

if [[ -n "$SPRINT" ]]; then
  # ── Sprint mode: drive the whole-sprint orchestrator ONCE (planning -> plan
  #    gate -> per-feature claim+drive), so the capture exercises the PLANNING lane
  #    and emits backlog.json. The backlog is scoped to EXACTLY the --feature ids:
  #      - each feature-request is already committed on the entry tier + pushed
  #        (the --create staging above), so the fork inherits it; AND
  #      - LAKEBASE_SFTDD_SPRINT_REQUESTS supplies each to the planning
  #        author-requests step, so sync-backlog projects the backlog from just
  #        these features (a request the harness did not list is never committed).
  #    The sprint driver claims each backlog feature itself, so do NOT claim per
  #    feature here. Planning reads the intake from the working tree, which in
  #    --create is the entry tier (where intake was staged); stay on it.
  REQ_SRC="${INPUTS_FROM:-$SCEN}"
  reqs=""
  for FID in "${FEATURES[@]}"; do
    FR="${REQ_SRC}/recorded-artifacts/features/${FID}/feature-request.md"
    [[ -f "$FR" ]] || { echo "capture-scenario: --sprint needs a recorded feature-request for ${FID} at ${FR}" >&2; exit 2; }
    reqs+="${FID}"$'\t'"${FR}"$'\n'
  done
  export LAKEBASE_SFTDD_SPRINT_REQUESTS="$reqs"
  echo "[capture-scenario] recording ${SCENARIO} SPRINT '${SPRINT}' (backlog scoped to: ${FEATURES[*]}) into ${SCEN}" >&2
  lk lakebase-sftdd-drive --sprint "$SPRINT" --project-dir "$PROJECT_DIR" --gates proxy ${pause_args[@]+"${pause_args[@]}"}
else
  for FID in "${FEATURES[@]}"; do
    # In --create mode each feature is claimed HERE (from trunk), right before its
    # own drive, so only one feature is ever claimed at a time; the prior feature's
    # drive released its claim. (In --project-dir mode the caller owns claiming.)
    if [[ -n "$CREATE" ]]; then
      git checkout main >/dev/null 2>&1 || git checkout master >/dev/null 2>&1 || true
      lk lakebase-scm-claim-feature-branch "${FID}" --project-dir "$PROJECT_DIR" --json \
        || { echo "capture-scenario: claim ${FID} failed" >&2; exit 2; }
    fi
    echo "[capture-scenario] recording ${SCENARIO} feature ${FID} into ${SCEN}" >&2
    lk lakebase-sftdd-drive --feature "$FID" --project-dir "$PROJECT_DIR" --gates proxy ${pause_args[@]+"${pause_args[@]}"}
  done
fi

echo "[capture-scenario] reconstituting agent-log onto the recorded timeline" >&2
lk lakebase-sftdd-log --reconstitute --tdd-dir "$SFTDD_DIR" || echo "[capture-scenario] reconstitute skipped" >&2
echo "[capture-scenario] ${SCENARIO} captured -> ${SCEN} (add scenario.json, then commit)" >&2
