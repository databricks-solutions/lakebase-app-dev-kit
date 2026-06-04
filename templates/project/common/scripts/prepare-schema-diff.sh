#!/usr/bin/env bash
# Build .tmp/schema-diff.md describing what this branch changes versus
# production.
#
# Substrate-only: delegates the actual diff to `lakebase-schema-diff
# --format markdown` (TS), which queries Lakebase branches directly via
# information_schema (no pg_dump dependency) and emits the canonical
# "SCHEMA CHANGES (Lakebase diff)" block. The shell keeps just the
# orchestration around it: detect git branch, write the "Migrations
# applied" header (read from the repo's Flyway / alembic / knex source
# files), append the diff block, output the file.
#
# Usage: ./scripts/prepare-schema-diff.sh [branch-name]
#   Argument defaults to the current git branch.
set -euo pipefail

WORK_TREE="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$WORK_TREE" ]; then
  echo "prepare-schema-diff: run from a git repo." >&2
  exit 1
fi
cd "$WORK_TREE"

if [ ! -f .env ]; then
  echo "prepare-schema-diff: .env not found. Copy .env.example to .env and set LAKEBASE_PROJECT_ID." >&2
  exit 1
fi
set -a
# shellcheck source=/dev/null
source .env 2>/dev/null || true
set +a

PROJ_ID="${LAKEBASE_PROJECT_ID:-}"
if [ -z "$PROJ_ID" ]; then
  echo "prepare-schema-diff: set LAKEBASE_PROJECT_ID in .env." >&2
  exit 1
fi

# Resolve the schema-diff bin.
BIN="$WORK_TREE/node_modules/.bin/lakebase-schema-diff"
if [ ! -x "$BIN" ]; then
  ALT="$WORK_TREE/node_modules/@databricks-solutions/lakebase-app-dev-kit/dist/scripts/lakebase/schema-diff.cli.js"
  if [ ! -f "$ALT" ]; then
    echo "prepare-schema-diff: lakebase-app-dev-kit not installed. Run 'npm install'." >&2
    exit 1
  fi
  BIN="node $ALT"
fi

BRANCH="${1:-$(git branch --show-current 2>/dev/null)}"
BRANCH="${BRANCH:-current-branch}"
BRANCH_LABEL="$(echo "$BRANCH" | tr '/' '-')"

mkdir -p .tmp
MD=".tmp/schema-diff.md"

# Header + migrations table (read from on-disk migration files; no
# Lakebase calls needed).
{
  echo "## Schema (Lakebase branch \`${BRANCH_LABEL}\`)"
  echo ""
  echo "### Migrations applied on this branch (CI)"
  echo "| Version | Migration |"
  echo "|---------|-----------|"
} > "$MD"

if [ -d src/main/resources/db/migration ]; then
  # Flyway / Java
  for f in src/main/resources/db/migration/V*.sql; do
    [ -f "$f" ] || continue
    base="$(basename "$f")"
    ver="$(echo "$base" | sed -n 's/^V\([0-9.]*\)__.*/\1/p')"
    desc="$(echo "$base" | sed -n 's/^V[0-9.]*__\(.*\)\.sql$/\1/p' | tr '_' ' ')"
    [ -n "$ver" ] && echo "| V$ver | $desc |" >> "$MD"
  done
elif [ -d alembic/versions ]; then
  # Alembic / Python
  for f in alembic/versions/*.py; do
    [ -f "$f" ] || continue
    base="$(basename "$f")"
    echo "| ${base%.py} | (alembic) |" >> "$MD"
  done
elif [ -d migrations ] && [ -n "$(ls migrations/*.js migrations/*.ts 2>/dev/null || true)" ]; then
  # knex / Node
  for f in migrations/*.js migrations/*.ts; do
    [ -f "$f" ] || continue
    base="$(basename "$f")"
    echo "| ${base%.*} | (knex) |" >> "$MD"
  done
fi
echo "" >> "$MD"

# Schema diff via the TS substrate. --against tells it to diff against
# the project's default leaf explicitly so the comparison is "vs
# production" regardless of what the branch was forked from.
echo "### Schema diff: \`${BRANCH_LABEL}\` vs production" >> "$MD"
echo "" >> "$MD"
if ! $BIN --instance "$PROJ_ID" --branch "$BRANCH" --format markdown >> "$MD" 2>>"$MD.err"; then
  {
    echo ""
    echo "Schema diff could not be computed:"
    if [ -s "$MD.err" ]; then
      sed 's/^/  > /' "$MD.err"
    fi
  } >> "$MD"
fi
rm -f "$MD.err"

echo "Wrote $MD"
echo "---"
cat "$MD"
