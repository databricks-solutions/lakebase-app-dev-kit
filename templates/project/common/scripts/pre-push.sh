#!/usr/bin/env bash
# Pre-push hook: provision the CI credential + sync it to GitHub secrets before
# every push, so a CI rerun / downstream migrate that fires long after the push
# still authenticates.
#
# Delegates to create-token-and-sync-secrets.sh, which prefers a DURABLE
# (90-day) PAT over the ~1h OAuth session token (FEIP-8020) , the old inline
# `databricks auth token` refresh baked a token into the CI secret that expired
# (~1h) before reruns / the downstream migrate could use it , and falls back to
# OAuth only where PATs are disabled, then syncs DATABRICKS_TOKEN + DATABRICKS_HOST
# + LAKEBASE_PROJECT_ID to GitHub repo secrets.
#
# NEVER blocks the push: a mint/sync failure only affects the downstream CI
# secret sync (offline work, docs, or a fix to the auth itself must still push).
#
# Install: ./scripts/install-hook.sh

set -e
# Resolve the repo root via git, not via BASH_SOURCE/.., so this works both when
# invoked directly from scripts/ and when installed at .git/hooks/pre-push.
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
HELPERS_DIR="$REPO_ROOT/scripts"
SYNC="$HELPERS_DIR/create-token-and-sync-secrets.sh"

# Delegate to the durable-credential provisioner. Wrapped in an `if` so a
# non-zero exit (PAT disabled + no OAuth, no jq/gh, missing LAKEBASE_PROJECT_ID)
# WARNS instead of aborting the push (set -e is suspended for an `if` condition).
if [ -x "$SYNC" ]; then
  if "$SYNC"; then
    echo "Pre-push: CI credential minted + repository secrets synced."
  else
    echo "Pre-push: WARNING , could not mint/sync the CI credential; pushing anyway." >&2
    echo "Pre-push: if CI fails on auth, run 'databricks auth login' then './scripts/create-token-and-sync-secrets.sh'." >&2
  fi
else
  echo "Pre-push: WARNING , scripts/create-token-and-sync-secrets.sh not found; skipping CI secret sync." >&2
fi

exit 0
