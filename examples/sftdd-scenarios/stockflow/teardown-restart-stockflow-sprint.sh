#!/usr/bin/env bash
# Stockflow replay coordination (SPRINT variant): tear down EVERY stockflow-live-cap-*
# capture (all four resources per project: runner, Lakebase project, GitHub repo,
# local dir + recordings), pattern-based so orphans from prior restarts are swept
# too, then rebuild the kit dist and relaunch ONE fresh capture driven from a SPRINT
# PLAN (the whole-sprint orchestrator: planning to the plan gate + backlog.json,
# then per-feature claim+drive), with the backlog scoped to EXACTLY F1 + F6. Run in
# YOUR terminal (the capture must outlive an assistant's background-task cap).
#
#   bash teardown-restart-stockflow-sprint.sh
#
# Sibling of teardown-restart-stockflow.sh; the ONLY difference is the relaunch adds
# --sprint (so the planning lane runs and backlog.json is emitted) instead of the
# per-feature loop. Workspace/owner/profile default to the stockflow smoke target
# and are overridable via DATABRICKS_HOST / GITHUB_OWNER / DATABRICKS_CONFIG_PROFILE
# / CAPTURE_PARENT_DIR. Teardown is best-effort (|| true); the relaunch fails loud.
set -uo pipefail

# Kit root is three levels up from this script (examples/sftdd-scenarios/stockflow).
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OWNER="${GITHUB_OWNER:-kevin-hartman}"
PROFILE="${DATABRICKS_CONFIG_PROFILE:-fevm-serverless-stable-ecparr}"
HOST="${DATABRICKS_HOST:-https://fevm-serverless-stable-ecparr.cloud.databricks.com}"
PARENT="${CAPTURE_PARENT_DIR:-$HOME/code/tdd-workflow-smoke}"
SCENARIO="stockflow-live"
INPUTS="${KIT}/examples/sftdd-scenarios/stockflow"
RECORD_DIR="${KIT}/examples/sftdd-scenarios/${SCENARIO}"
PATTERN="stockflow-live-cap-"
SPRINT="${SPRINT_NAME:-stockflow-s1}"   # the sprint name (arbitrary; scopes the backlog + run-config)

echo "=== discovering every ${PATTERN}* project (local + Lakebase + GitHub + runner) ==="
# Union of slugs from all four sources, so a resource orphaned on any one is caught.
{
  ls -d "${PARENT}/${PATTERN}"*/ 2>/dev/null | xargs -n1 basename 2>/dev/null
  ls -d "${HOME}/.lakebase/runners/${PATTERN}"*/ 2>/dev/null | xargs -n1 basename 2>/dev/null
  gh repo list "$OWNER" --limit 200 --json name --jq '.[].name' 2>/dev/null | grep "^${PATTERN}"
  databricks postgres list-projects --profile "$PROFILE" 2>/dev/null \
    | sed -nE 's/.*"project_id": "('"${PATTERN}"'[^"]*)".*/\1/p'
} | sort -u > /tmp/stockflow-sprint-slugs.txt
echo "slugs to tear down:"; cat /tmp/stockflow-sprint-slugs.txt

while read -r P; do
  [[ -z "$P" ]] && continue
  echo "=== TEARDOWN ${P} ==="
  # 1. Kill any live process for this project (capture + runner).
  pkill -f "$P" 2>/dev/null || true
  # 2. Deregister the self-hosted runner from its repo (before the repo is deleted).
  RID="$(gh api "repos/${OWNER}/${P}/actions/runners" --jq ".runners[] | select(.name==\"${P}\") | .id" 2>/dev/null || true)"
  [[ -n "${RID}" ]] && gh api -X DELETE "repos/${OWNER}/${P}/actions/runners/${RID}" 2>/dev/null || true
  rm -rf "${HOME}/.lakebase/runners/${P}"
  # 3. Lakebase project (hard delete so the slug is released).
  databricks postgres delete-project "projects/${P}" --purge --profile "$PROFILE" 2>/dev/null || true
  # 4. GitHub repo.
  gh repo delete "${OWNER}/${P}" --yes 2>/dev/null || true
  # 5. Local project dir.
  rm -rf "${PARENT}/${P}"
done < /tmp/stockflow-sprint-slugs.txt

# Recordings from prior runs.
echo "=== removing recordings ${RECORD_DIR} ==="
rm -rf "$RECORD_DIR"
# Sweep the stale home .sftdd tree a discovery misfire can glob into (harmless but
# noisy; the live state always lives in the project dir).
rm -rf "${HOME}/.sftdd" 2>/dev/null || true
echo "=== teardown done ==="

# ── rebuild dist so the fresh run carries the current kit fixes ──────────────
echo "=== rebuilding kit dist ==="
( cd "$KIT" && npm run build ) || { echo "kit build failed; fix before relaunch" >&2; exit 1; }

# Pre-plant the local-only capture kit ref (cache symlink -> this worktree) via the
# shared helper BEFORE relaunch. capture-scenario --create also does this, but doing
# it here makes the coordinator self-sufficient; and if the symlink is ever lost
# mid-run, the scaffolded scripts/lk self-heals from .lakebase/kit-local-dir (which
# capture-scenario records into the project), so a sprint capture cannot be bricked
# by a vanished local ref.
echo "=== pinning local kit ref (cache symlink) ==="
source "${KIT}/examples/sftdd-scenarios/lib/pin-local-kit.sh"
pin_local_kit_cache "$KIT" || { echo "failed to pin local kit ref; fix before relaunch" >&2; exit 1; }

# ── relaunch one fresh capture, driven from a SPRINT PLAN (backlog = F1 + F6) ──
# --sprint runs the whole-sprint orchestrator: planning -> plan gate (sync-backlog
# projects backlog.json from just these two features) -> claim + drive each.
LOG="/tmp/stockflow-sprint-capture-$(date +%Y%m%d-%H%M%S).log"
echo "=== relaunching SPRINT capture '${SPRINT}' -> ${LOG} ==="
LAKEBASE_SFTDD_AUTO_CONTINUE=1 DATABRICKS_CONFIG_PROFILE="$PROFILE" \
  bash "${KIT}/examples/sftdd-scenarios/capture-scenario.sh" \
    --scenario "$SCENARIO" --create \
    --databricks-host "$HOST" --github-owner "$OWNER" \
    --tiers 2 --ui \
    --inputs-from "$INPUTS" \
    --sprint "$SPRINT" \
    --feature F1-stock-visibility --feature F6-split-tracking-code \
  2>&1 | tee "$LOG"
