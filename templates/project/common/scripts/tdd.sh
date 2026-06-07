#!/usr/bin/env bash
# Convenient launcher for the TDD workflow.
#
# Opens a Claude Code session AS the scrum-master orchestrator, so its
# Agent(<roles>) allowlist applies and only the orchestrator spawns the role
# agents (product-owner, spec-author, architect-reviewer, test-strategist,
# ux-designer, navigator, driver, release-engineer). Optionally seeds the first
# turn with a workflow phase so you land straight in it.
#
# Run from the project root:
#   ./scripts/tdd.sh                  open the orchestrator (then type /plan, etc.)
#   ./scripts/tdd.sh plan             start sprint planning
#   ./scripts/tdd.sh design <id>      design a feature
#   ./scripts/tdd.sh build  <id>      build it through the TDD cycles
#   ./scripts/tdd.sh deploy <id>      deploy + the per-sprint working-software gate
#
# The role agents must be discoverable under .claude/agents/ (lakebase-create-project
# scaffolds them). Requires the `claude` CLI on PATH.
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
  # Open the orchestrator interactively; type /plan, /design <id>, etc.
  exec claude --agent scrum-master
fi
shift
# Seed the first turn with the chosen phase, then drop into the interactive
# orchestrator session for the HITL gates.
exec claude --agent scrum-master "/$phase $*"
