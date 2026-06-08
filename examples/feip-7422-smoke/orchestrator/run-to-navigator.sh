#!/usr/bin/env bash
# FEIP-7422 smoke , run UP TO the Navigator handoff (just before).
#
# Scaffolds a REAL project, stages intake, claims the paired feature branch, and
# REPLAYS the design lane (Spec Author, Architect, Test Strategist, UX Designer,
# PO) from recorded-artifacts/ , then STOPS cleanly the moment the deterministic
# driver would hand off to the Navigator to write the first failing test. No code
# is built. Use it to inspect the state at the build handoff, or to take over the
# Navigator/Driver build yourself from a real, fully-set-up project.
#
# Continue the build from where it stopped (the script prints the exact command):
#   (cd <project> && ./scripts/lk lakebase-tdd-drive --feature F1-file-bug)
#
# Determinism is in code: with no --kit-ref, the kit resolves to this checkout's
# built dist (offline, stable). See _replay-smoke.sh.
#
# Usage:
#   run-to-navigator.sh --tiers 2 [--kit-ref <ref>] [--project-name <n>]
#                       [--project-dir <dir>] [--feature <id>] [--corpus <dir>]
# Env: DATABRICKS_HOST, GITHUB_OWNER, a CLI profile.
# Exit: 0 ok (stopped at the handoff); 1 scaffold failed; 2 a step failed.

SMOKE_NAME="run-to-navigator"
STOP_BEFORE="navigator"
REPLAY_BUILD="0"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_replay-smoke.sh"
replay_smoke "$@"
