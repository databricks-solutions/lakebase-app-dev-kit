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
# Fall back to the lk resolver shim (the canonical, npm-install-free path the rest
# of the scaffold uses post-npx-kill). CI checks out the project , which has
# scripts/lk + .lakebase/kit-ref , but does NOT `npm install` the kit, so the
# node_modules lookups above miss and this is the path that actually fires in CI.
LK="$WORK_TREE/scripts/lk"
if [ -x "$LK" ]; then
  exec "$LK" lakebase-ci-resolve-branch "$@"
fi
echo "resolve-lakebase-branch: lakebase-app-dev-kit not resolvable (no node_modules/.bin/lakebase-ci-resolve-branch, no on-disk dist, and no scripts/lk shim)." >&2
exit 1
