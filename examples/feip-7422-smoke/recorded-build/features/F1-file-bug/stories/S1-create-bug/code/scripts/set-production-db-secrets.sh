#!/usr/bin/env bash
# Resolve production (default) Lakebase branch URL + credentials, then
# set DATABASE_URL / DB_USERNAME / DB_PASSWORD / SPRING_DATASOURCE_* as
# GitHub repository secrets so the Merge workflow can run migrations
# against production.
#
# Substrate-only: delegates resolution to `lakebase-ci-resolve-branch
# --git-branch main` (TS) which handles default-branch lookup, endpoint
# ensure, and credential mint. The shell keeps just the gh-secret-set
# orchestration on top.
#
# Usage: ./scripts/set-production-db-secrets.sh
#   Requires: .env with LAKEBASE_PROJECT_ID, databricks auth, gh auth.
set -euo pipefail

WORK_TREE="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$WORK_TREE" ] && cd "$WORK_TREE"
[ -f .env ] && set -a && source .env 2>/dev/null && set +a

if [ -z "${LAKEBASE_PROJECT_ID:-}" ]; then
  echo "set-production-db-secrets: set LAKEBASE_PROJECT_ID in .env or environment." >&2
  exit 1
fi
if ! command -v gh >/dev/null 2>&1; then
  echo "set-production-db-secrets: gh CLI required. Install gh and run 'gh auth login'." >&2
  exit 1
fi

BIN="${WORK_TREE:-$PWD}/node_modules/.bin/lakebase-ci-resolve-branch"
if [ ! -x "$BIN" ]; then
  ALT="${WORK_TREE:-$PWD}/node_modules/@databricks-solutions/lakebase-app-dev-kit/dist/scripts/lakebase/ci-resolve-branch.cli.js"
  if [ ! -f "$ALT" ]; then
    echo "set-production-db-secrets: lakebase-app-dev-kit not installed. Run 'npm install'." >&2
    exit 1
  fi
  BIN="node $ALT"
fi

# Resolve the production branch + endpoint + credentials.
# eval form emits KEY='value' lines; safe single-quoted for shell eval.
EVAL_OUT="$($BIN --git-branch main --ensure-endpoint 2>&1)" || {
  echo "set-production-db-secrets: failed to resolve production branch:" >&2
  echo "$EVAL_OUT" >&2
  exit 1
}
# shellcheck disable=SC2154
eval "$EVAL_OUT"

# Sanity. After eval, these variables come from the bin's stdout.
: "${DATABASE_URL:?bin did not emit DATABASE_URL}"
: "${LAKEBASE_USERNAME:?bin did not emit LAKEBASE_USERNAME}"
: "${LAKEBASE_PASSWORD:?bin did not emit LAKEBASE_PASSWORD}"
: "${JDBC_URL:?bin did not emit JDBC_URL}"

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
if [ -z "$REPO" ]; then
  echo "set-production-db-secrets: could not detect repo (gh repo view failed). Run from a git repo with a github remote." >&2
  exit 1
fi

echo "Setting production DB secrets on $REPO..."
gh secret set DATABASE_URL --body "$DATABASE_URL" --repo "$REPO" >/dev/null
gh secret set DB_USERNAME --body "$LAKEBASE_USERNAME" --repo "$REPO" >/dev/null
gh secret set DB_PASSWORD --body "$LAKEBASE_PASSWORD" --repo "$REPO" >/dev/null
gh secret set SPRING_DATASOURCE_URL --body "$JDBC_URL" --repo "$REPO" >/dev/null
gh secret set SPRING_DATASOURCE_USERNAME --body "$LAKEBASE_USERNAME" --repo "$REPO" >/dev/null
gh secret set SPRING_DATASOURCE_PASSWORD --body "$LAKEBASE_PASSWORD" --repo "$REPO" >/dev/null

echo "Set: DATABASE_URL, DB_USERNAME, DB_PASSWORD, SPRING_DATASOURCE_URL, SPRING_DATASOURCE_USERNAME, SPRING_DATASOURCE_PASSWORD"
echo "Done."
