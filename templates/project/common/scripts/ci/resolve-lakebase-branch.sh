#!/usr/bin/env bash
# Resolve a Lakebase branch paired with a git branch, plus its endpoint
# and credentials, for use in CI.
#
# Substrate-only: delegates to `lakebase-ci-resolve-branch` (TS) which
# implements the full state machine (CREATED / EXISTS / VERIFIED /
# RECREATED / UNVERIFIED) and emits byte-compatible output:
#   - shell-eval form on stdout (KEY='value') for `eval $(...)`
#   - GH Actions $GITHUB_ENV heredoc form when --github-env is set
#
# Flag surface matches the legacy shell exactly so existing GH Actions
# YAML steps that consumed this script continue to work without edits.
#
# Usage / flags: see `lakebase-ci-resolve-branch --help`.
set -euo pipefail

# Resolve the bin. Prefer the kit's bin symlink (post-npm-install);
# fall back to the on-disk dist file when the .bin/ symlink is missing
# (CI containers that install via a different node_modules layout, or
# tests that run pre-install).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_TREE="$(cd "$SCRIPT_DIR/../.." && pwd)"

BIN="$WORK_TREE/node_modules/.bin/lakebase-ci-resolve-branch"
if [ -x "$BIN" ]; then
  exec "$BIN" "$@"
fi
ALT="$WORK_TREE/node_modules/@databricks-solutions/lakebase-app-dev-kit/dist/scripts/lakebase/ci-resolve-branch.cli.js"
if [ -f "$ALT" ]; then
  exec node "$ALT" "$@"
fi
echo "resolve-lakebase-branch: lakebase-app-dev-kit not installed (no node_modules/.bin/lakebase-ci-resolve-branch and no on-disk dist). Run 'npm install'." >&2
exit 1
