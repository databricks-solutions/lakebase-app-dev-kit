#!/usr/bin/env bash
# rebuild-push-resmoke , the reliable "validate a kit change live" runner.
#
# WHY THIS EXISTS: re-smoking a moving BRANCH ref silently ran STALE dist twice
# (the lk/npm cache served an old commit), so a fix looked validated when the old
# code actually ran. This script removes every way to get that wrong:
#
#   1. build + commit dist + push the branch,
#   2. WAIT until GitHub actually serves the new commit (poll git ls-remote),
#   3. resolve the branch to its immutable commit SHA and run the smoke pinned to
#      that SHA , a SHA committish is content-addressed, so npm/npx fetch THAT
#      exact commit and a stale ref-keyed cache cannot be served,
#   4. GUARD: install the SHA into the shared lk cache and assert the new code is
#      actually present (grep a marker) BEFORE running , abort loudly if not.
#
# Push is a real external action: this script performs it. Run it only when you
# intend to push the current branch HEAD.
#
# Usage:
#   rebuild-push-resmoke.sh [--marker <string>] [--env <config>] [--no-push]
#                           [-- <extra args to run-fastforward-smoke.sh>]
# Env config (sourced for DATABRICKS_HOST / GITHUB_OWNER / CLI profile):
#   default ~/code/feip-7422-smoke/.env.local.test.config  (override with --env)
set -euo pipefail

ORCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT_DIR="$(cd "$ORCH_DIR/../../.." && pwd)"   # examples/feip-7422-smoke/orchestrator -> kit root
PKG="@databricks-solutions/lakebase-app-dev-kit"
GH="github:databricks-solutions/lakebase-app-dev-kit"
GH_URL="https://github.com/databricks-solutions/lakebase-app-dev-kit.git"
MARKER="ensureDeployedAndVerify"           # a string the NEW dist must contain
ENV_CONFIG="$HOME/code/feip-7422-smoke/.env.local.test.config"
DO_PUSH=1
EXTRA=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --marker) MARKER="$2"; shift 2 ;;
    --env)    ENV_CONFIG="$2"; shift 2 ;;
    --no-push) DO_PUSH=0; shift ;;
    --) shift; EXTRA=("$@"); break ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

log() { printf '\n\033[1;36m[resmoke]\033[0m %s\n' "$*" >&2; }
die() { printf '\n\033[1;31m[resmoke ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

cd "$KIT_DIR"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" != "HEAD" ] || die "detached HEAD , check out the branch you want to validate."
log "kit=$KIT_DIR branch=$BRANCH"

# ── 1. build + commit dist (only if it changed) ───────────────────────────────
log "npm run build"
npm run build >/dev/null 2>&1 || die "build failed"
git add -f dist
if ! git diff --cached --quiet -- dist; then
  log "committing rebuilt dist"
  git commit -q -m "build(dist): rebuild for live re-smoke of ${BRANCH}

Co-authored-by: Isaac" || die "dist commit failed"
else
  log "dist unchanged , nothing to commit"
fi

# ── 2. push + wait until GitHub serves THIS commit ────────────────────────────
HEAD_SHA="$(git rev-parse HEAD)"
if [ "$DO_PUSH" -eq 1 ]; then
  log "pushing $BRANCH ($HEAD_SHA)"
  git push origin "$BRANCH" || die "push failed"
fi
log "waiting for GitHub to serve $HEAD_SHA on $BRANCH ..."
for i in $(seq 1 60); do
  remote="$(git ls-remote "$GH_URL" "$BRANCH" 2>/dev/null | awk 'NR==1{print $1}')"
  [ "$remote" = "$HEAD_SHA" ] && { log "GitHub has $HEAD_SHA"; break; }
  [ "$i" -eq 60 ] && die "GitHub still does not serve $HEAD_SHA after ~5min (remote=$remote)"
  sleep 5
done

# ── 3. resolve to the immutable SHA + GUARD the cache holds the new code ───────
# Pin the smoke to the SHA (content-addressed): npm/npx fetch exactly this commit,
# so no stale ref-keyed cache can be served. Then install it into the shared lk
# cache and ASSERT the marker is present before running , the whole point is to
# never validate against stale dist again.
CACHE_ROOT="${XDG_CACHE_HOME:-$HOME/.cache}/lakebase-app-dev-kit"
CACHE="${CACHE_ROOT}/${HEAD_SHA}"
KIT_INSTALL="${CACHE}/node_modules/${PKG}"
log "warming shared cache for SHA ${HEAD_SHA}"
rm -rf "$CACHE"
mkdir -p "$CACHE_ROOT"
npm install --no-save --prefer-online --prefix "$CACHE" "${GH}#${HEAD_SHA}" >/dev/null 2>&1 \
  || die "could not install kit @ ${HEAD_SHA} into the cache"
[ -d "${KIT_INSTALL}/dist" ] || die "installed kit @ ${HEAD_SHA} has no dist/"
if ! grep -rq "$MARKER" "${KIT_INSTALL}/dist" 2>/dev/null; then
  die "GUARD FAILED: the warmed cache for ${HEAD_SHA} does NOT contain '${MARKER}'. Refusing to run a stale smoke."
fi
log "GUARD ok , cache @ ${HEAD_SHA} contains '${MARKER}' (fresh dist confirmed)"

# Pin the ENTIRE run to this one guarded, content-addressed install. lk honors
# LAKEBASE_KIT_DIR first (no ref resolution, no npm, no network, no `npx pack`
# bug), so the bootstrap scaffold, the scaffolded project's scripts/lk, and every
# drive turn all execute these EXACT bits. Determinism is in code: nothing here
# depends on remembering to set an env var at the prompt.
export LAKEBASE_KIT_DIR="$KIT_INSTALL"
log "pinned LAKEBASE_KIT_DIR=${KIT_INSTALL}"

# ── 4. run the fast-forward smoke pinned to the SHA ───────────────────────────
[ -f "$ENV_CONFIG" ] || die "env config not found: $ENV_CONFIG (pass --env)"
set -a; # shellcheck source=/dev/null
source "$ENV_CONFIG"; set +a
: "${DATABRICKS_HOST:?env config must set DATABRICKS_HOST}"
: "${GITHUB_OWNER:?env config must set GITHUB_OWNER}"
log "HOST=$DATABRICKS_HOST OWNER=$GITHUB_OWNER PROFILE=${DATABRICKS_CONFIG_PROFILE:-<unset>}"
log "running fast-forward smoke pinned to ${HEAD_SHA}"
exec bash "${ORCH_DIR}/run-fastforward-smoke.sh" --tiers 2 --kit-ref "$HEAD_SHA" ${EXTRA[@]+"${EXTRA[@]}"}
