#!/usr/bin/env bash
# Delete Lakebase branches.
#
# Substrate-only: delegates each delete to `lakebase-branch delete`
# (TS) which handles path resolution + refuses the project's default
# branch automatically. This shell keeps the orchestration pieces only:
#   - argument / .env fanout (positional names OR LAKEBASE_PR_NUM/LAKEBASE_BRANCH)
#   - additional protected-name list (main/master/staging/production)
#     for extra safety beyond the TS guard
#   - child-before-parent ordering (feature branches first, then ci-pr-*)
#
# Usage:
#   ./scripts/delete-lakebase-branches.sh
#     Uses LAKEBASE_PR_NUM and LAKEBASE_BRANCH from .env.
#   ./scripts/delete-lakebase-branches.sh ci-pr-7 my-branch
#     Deletes those two branch names (ignores .env for names).
set -euo pipefail

WORK_TREE="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$WORK_TREE" ] && cd "$WORK_TREE"

if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  source .env 2>/dev/null || true
  set +a
fi

PROJ_ID="${LAKEBASE_PROJECT_ID:-}"
if [ -z "$PROJ_ID" ]; then
  echo "delete-lakebase-branches: set LAKEBASE_PROJECT_ID in .env or environment." >&2
  exit 1
fi

# Resolve the lakebase-branch bin. Fast path: node_modules (npm projects). A
# Python project never has node_modules (and a fresh CI checkout has none), so
# fall back to the canonical kit resolver scripts/lk, which finds the kit via
# .lakebase/kit-ref + the shared cache (or LAKEBASE_KIT_DIR). $BIN is used as a
# command prefix, so "bash <lk> lakebase-branch" composes with "delete ...".
BIN="${WORK_TREE:-$PWD}/node_modules/.bin/lakebase-branch"
if [ ! -x "$BIN" ]; then
  ALT="${WORK_TREE:-$PWD}/node_modules/@databricks-solutions/lakebase-app-dev-kit/dist/scripts/lakebase/branch.cli.js"
  LK="${WORK_TREE:-$PWD}/scripts/lk"
  if [ -f "$ALT" ]; then
    BIN="node $ALT"
  elif [ -f "$LK" ]; then
    BIN="bash $LK lakebase-branch"
  else
    echo "delete-lakebase-branches: kit not resolvable (no node_modules and no scripts/lk)." >&2
    exit 1
  fi
fi

# Resolve targets.
if [ $# -eq 0 ]; then
  PR_NUM="${LAKEBASE_PR_NUM:-}"
  BRANCH_NAME="${LAKEBASE_BRANCH:-}"
  if [ -z "$PR_NUM" ] && [ -z "$BRANCH_NAME" ]; then
    echo "With no args, set in .env: LAKEBASE_PR_NUM (e.g. 7) and LAKEBASE_BRANCH (e.g. customer-entity)." >&2
    echo "Or run: $0 ci-pr-<N> <branch-name>" >&2
    exit 1
  fi
  set --
  [ -n "$PR_NUM" ] && set -- "$@" "ci-pr-${PR_NUM}"
  [ -n "$BRANCH_NAME" ] && set -- "$@" "$BRANCH_NAME"
fi

# Extra protected list. The TS `lakebase-branch delete` already refuses
# the project's default Lakebase branch (e.g. production); this list
# guards additional named branches the project never wants deleted via
# this convenience script (typically the long-running tiers).
PROTECTED="${LAKEBASE_PROTECTED_BRANCHES:-main master staging production}"
is_protected() {
  local b="$1"
  for p in $PROTECTED; do
    [ "$b" = "$p" ] && return 0
  done
  return 1
}

# Order: feature branches first (children), then ci-pr-* (parents).
# Lakebase rejects a delete if children exist.
CI_BRANCHES=""
FEATURE_BRANCHES=""
for name in "$@"; do
  if is_protected "$name"; then
    echo "Refusing to delete protected branch: $name"
    continue
  fi
  case "$name" in
    ci-pr-*) CI_BRANCHES="${CI_BRANCHES:+$CI_BRANCHES }$name" ;;
    *)       FEATURE_BRANCHES="${FEATURE_BRANCHES:+$FEATURE_BRANCHES }$name" ;;
  esac
done

for name in $FEATURE_BRANCHES $CI_BRANCHES; do
  echo "Deleting Lakebase branch: $name"
  if $BIN delete --instance "$PROJ_ID" --branch "$name" 2>&1; then
    echo "Deleted $name."
  else
    echo "Failed to delete $name (see above)."
  fi
done

echo "Done."
