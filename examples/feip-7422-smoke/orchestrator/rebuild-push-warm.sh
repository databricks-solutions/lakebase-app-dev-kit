#!/usr/bin/env bash
# rebuild-push-warm , publish the current kit branch + warm the shared lk cache.
#
# Run this when you want the PUBLISHED GitHub path to reflect your local changes
# (to share the branch, let CI run it, or test a real `--kit-ref` resolution).
# It does ONE thing: rebuild + commit dist + push + warm. It does NOT run a smoke
# , the smokes (run-smoke / run-to-navigator / run-to-release-engineer) run
# independently. By default those smokes use THIS checkout's built dist, so you
# only need this script when you specifically want the pushed/published bits.
#
# It removes every way to validate against stale dist:
#   1. build + commit dist (only if it changed),
#   2. push the branch, then WAIT until GitHub actually serves the new commit,
#   3. resolve the branch to its immutable SHA + install THAT into the shared lk
#      cache (content-addressed, so a stale ref-keyed cache cannot be served),
#   4. GUARD: assert the new code is present in the warmed cache (grep a marker),
#      and print the SHA + the LAKEBASE_KIT_DIR a smoke can pin to.
#
# Push is a real external action: this script performs it. Run it only when you
# intend to push the current branch HEAD. Pass --no-push to skip the push (e.g.
# the branch is already pushed) and just re-warm the cache for HEAD.
#
# Usage:
#   rebuild-push-warm.sh [--marker <string>] [--no-push]
set -euo pipefail

ORCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT_DIR="$(cd "$ORCH_DIR/../../.." && pwd)"   # examples/feip-7422-smoke/orchestrator -> kit root
PKG="@databricks-solutions/lakebase-app-dev-kit"
GH="github:databricks-solutions/lakebase-app-dev-kit"
GH_URL="https://github.com/databricks-solutions/lakebase-app-dev-kit.git"
MARKER="stopBeforeMilestone"               # a string the NEW dist must contain
DO_PUSH=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --marker) MARKER="$2"; shift 2 ;;
    --no-push) DO_PUSH=0; shift ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

log() { printf '\n\033[1;36m[rebuild-push-warm]\033[0m %s\n' "$*" >&2; }
die() { printf '\n\033[1;31m[rebuild-push-warm ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

cd "$KIT_DIR"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" != "HEAD" ] || die "detached HEAD , check out the branch you want to publish."
log "kit=$KIT_DIR branch=$BRANCH"

# ── 1. build + commit dist (only if it changed) ───────────────────────────────
log "npm run build"
npm run build >/dev/null 2>&1 || die "build failed"
git add -f dist
if ! git diff --cached --quiet -- dist; then
  log "committing rebuilt dist"
  git commit -q -m "build(dist): rebuild for ${BRANCH}

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

# ── 3. install the SHA into the shared lk cache + GUARD the new code is there ──
# A SHA committish is content-addressed: npm fetches exactly this commit, so no
# stale ref-keyed cache can be served. Assert the marker is present before
# declaring success , the whole point is to never validate against stale dist.
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
  die "GUARD FAILED: the warmed cache for ${HEAD_SHA} does NOT contain '${MARKER}'. dist is stale."
fi
log "GUARD ok , cache @ ${HEAD_SHA} contains '${MARKER}' (fresh dist confirmed)"

# Also re-warm the branch-keyed cache to the current SHA, so a later
# `--kit-ref <branch>` run resolves THIS commit (lk's warm step is SHA-aware).
LAKEBASE_KIT_REF="$BRANCH" bash "${KIT_DIR}/templates/project/common/scripts/lk" --rewarm >/dev/null 2>&1 || true

log "✓ published $BRANCH @ $HEAD_SHA and warmed the cache."
log "  run a smoke against THESE pushed bits with: --kit-ref ${HEAD_SHA}"
log "  (or pin: export LAKEBASE_KIT_DIR=${KIT_INSTALL})"
