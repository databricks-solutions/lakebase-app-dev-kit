#!/usr/bin/env bash
# Sanitize a git branch name into a Lakebase-compatible branch ID.
#
# Substrate-only: delegates to `lakebase-branch sanitize-name` (TS) so
# the kit's canonical sanitizer is the single source of truth. The shell
# stays for backward compatibility with callers that source it from
# their PATH (CI YAML, ad-hoc dev scripts).
#
# Usage:
#   ./scripts/sanitize-branch-name.sh "feature/My-Branch_Name"
#   # Output: feature-my-branch-name
#
#   SANITIZED=$(./scripts/sanitize-branch-name.sh "$GIT_BRANCH")
set -euo pipefail

INPUT="${1:?Usage: sanitize-branch-name.sh <git-branch-name>}"

WORK_TREE="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$WORK_TREE" ]; then
  # Fallback: no git context (CI step before clone), resolve relative
  # to this script's directory which the scaffold installs alongside
  # the kit's node_modules.
  WORK_TREE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

BIN="$WORK_TREE/node_modules/.bin/lakebase-branch"
if [ -x "$BIN" ]; then
  exec "$BIN" sanitize-name "$INPUT"
fi
ALT="$WORK_TREE/node_modules/@databricks-solutions/lakebase-app-dev-kit/dist/scripts/lakebase/branch.cli.js"
if [ -f "$ALT" ]; then
  exec node "$ALT" sanitize-name "$INPUT"
fi
# No node_modules (a Python project never has one; a fresh CI checkout has none
# either). Fall back to the canonical kit resolver scripts/lk, which finds the
# kit via .lakebase/kit-ref + the shared cache (or LAKEBASE_KIT_DIR). This is the
# substrate's standard resolution; node_modules is just the fast path when present.
LK="$WORK_TREE/scripts/lk"
if [ -f "$LK" ]; then
  exec bash "$LK" lakebase-branch sanitize-name "$INPUT"
fi
echo "sanitize-branch-name: kit not resolvable (no node_modules and no scripts/lk)." >&2
exit 1
