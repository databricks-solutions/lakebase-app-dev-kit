#!/usr/bin/env bash
# FEIP-7422 smoke , run UP TO the Release Engineer handoff (just before).
#
# Scaffolds a REAL project, stages intake, claims the paired feature branch,
# REPLAYS the design lane AND RESTORES the recorded build (the whole code tree +
# GREEN/reviewed cycles + experiment) from recorded-build/ , so no Navigator or
# Driver runs , then STOPS cleanly the moment the deterministic driver would hand
# the built + reviewed story to the Release Engineer to deploy + verify. Use it to
# inspect the state at the deploy handoff, or to run/observe the Release Engineer
# deploy yourself against a real, fully-built project.
#
# Continue (run the deploy + the PO acceptance gate) from where it stopped:
#   (cd <project> && ./scripts/lk lakebase-tdd-drive --feature F1-file-bug)
#
# Determinism is in code: with no --kit-ref, the kit resolves to this checkout's
# built dist (offline, stable). See _replay-smoke.sh.
#
# Usage:
#   run-to-release-engineer.sh --tiers 2 [--kit-ref <ref>] [--project-name <n>]
#                              [--project-dir <dir>] [--feature <id>] [--corpus <dir>]
# Env: DATABRICKS_HOST, GITHUB_OWNER, a CLI profile. Override the build corpus
#      with LAKEBASE_TDD_REPLAY_BUILD_DIR.
# Exit: 0 ok (stopped at the handoff); 1 scaffold failed; 2 a step failed.

SMOKE_NAME="run-to-release-engineer"
STOP_BEFORE="release-engineer"
REPLAY_BUILD="1"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_replay-smoke.sh"
replay_smoke "$@"
