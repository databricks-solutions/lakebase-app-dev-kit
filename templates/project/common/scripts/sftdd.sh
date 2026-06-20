#!/usr/bin/env bash
# Convenient launcher for the TDD workflow.
#
# Opens a Claude Code session in the project. The orchestrator is the
# deterministic driver (lakebase-sftdd-drive), invoked by the slash commands, not
# an LLM agent; the session just runs those commands, which spawn the role
# agents and pause at gates. Optionally seeds the first turn with a command so
# you land straight in it.
#
# Run from the project root:
#   ./scripts/sftdd.sh                  open a session (then type /sprint, /plan, etc.)
#   ./scripts/sftdd.sh sprint [name]    run the whole sprint (plan -> per feature design/build/deploy)
#   ./scripts/sftdd.sh plan             sprint planning only (to the plan gate)
#   ./scripts/sftdd.sh design <id>      design a feature
#   ./scripts/sftdd.sh build  <id>      build it through the TDD cycles
#   ./scripts/sftdd.sh deploy <id>      deploy + the working-software gate
#   ./scripts/sftdd.sh spike  <slug>    throwaway exploration (outside the loop)
#
# The role agents must be discoverable under .claude/agents/ (lakebase-create-project
# scaffolds them; the driver spawns them). Requires the `claude` CLI on PATH.
set -euo pipefail

if ! command -v claude >/dev/null 2>&1; then
  echo "tdd: the 'claude' CLI is not on PATH. Install Claude Code, then re-run." >&2
  exit 1
fi
if [[ ! -d ".claude/agents" ]]; then
  echo "tdd: no .claude/agents/ in $(pwd). Run this from a lakebase-create-project root." >&2
  exit 1
fi

phase="${1:-}"
if [[ -z "$phase" ]]; then
  # Open an interactive session; type /sprint, /plan, /design <id>, etc.
  exec claude
fi
shift
# Seed the first turn with the chosen slash command, then drop into the
# interactive session for the HITL gates.
exec claude "/$phase $*"
