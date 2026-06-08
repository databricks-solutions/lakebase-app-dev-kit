#!/usr/bin/env bash
# FEIP-7422 FAST-FORWARD-TO-RELEASE smoke: replay BOTH the design lane AND the
# build, so the real work begins at the Release Engineer deploy + the PO
# acceptance gate. The build-stage analog of run-fastforward-smoke.sh (which
# replays design only and builds live "until the navigator"); this also restores
# the recorded build "until the release engineer".
#
# It sets LAKEBASE_TDD_REPLAY_BUILD_DIR (the build corpus) and delegates to
# run-fastforward-smoke.sh (which sets LAKEBASE_TDD_REPLAY_DIR for design). The
# deterministic driver then, right after cut-experiment for a story the build
# corpus covers, restores the whole recorded code tree + GREEN/reviewed cycles +
# experiment onto the experiment branch, so the next readState lands on
# await-acceptance , the orchestration-run deploy + verify + the PO gate. No
# Navigator/Driver are spawned for a covered story. A story the corpus does NOT
# cover (e.g. S2) falls back to the real navigator/driver build automatically.
#
# Usage: same as run-fastforward-smoke.sh, e.g.
#   run-fastforward-to-release-smoke.sh --tiers 2 --kit-ref <ref>
set -euo pipefail

ORCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The build corpus recorded from a real build (recorded-build/), overridable.
export LAKEBASE_TDD_REPLAY_BUILD_DIR="${LAKEBASE_TDD_REPLAY_BUILD_DIR:-${ORCH_DIR}/../recorded-build}"
printf '\n\033[1;34m[ff-to-release]\033[0m build corpus: %s\n' "$LAKEBASE_TDD_REPLAY_BUILD_DIR" >&2

exec bash "${ORCH_DIR}/run-fastforward-smoke.sh" "$@"
