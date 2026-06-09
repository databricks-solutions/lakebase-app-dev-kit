#!/usr/bin/env bash
# Advisory per-story pipeline assertion for the TDD-workflow smoke.
#
# After /design + /build, if the orchestrator drove the streaming per-story
# pipeline (.tdd/features/<F>/pipeline.json with one or more stories), confirm
# it reached a clean terminal state: the single build lane is idle, the FIFO
# ready queue is drained, and every story is `done` with an `approved` spec
# gate. This is the live counterpart to the hermetic
# tdd-per-story-pipeline-e2e vitest.
#
# Advisory by design: anomalies are WARNINGs and the smoke continues (the hard
# per-story guarantees are unit-tested; the per-state SCM asserts are the
# smoke's hard gates). A feature with no pipeline.json (single-story, or the
# orchestrator did not use the pipeline) is a clean no-op.
#
# Usage: verify-story-pipeline.sh <project-dir> <feature-id>

set -u
set -o pipefail

PROJECT_DIR="${1:?usage: verify-story-pipeline.sh <project-dir> <feature-id>}"
FEATURE_ID="${2:?usage: verify-story-pipeline.sh <project-dir> <feature-id>}"

warn() { echo "verify-story-pipeline: WARNING: $*" >&2; }
ok()   { echo "verify-story-pipeline: ✓ $*"; }

# lakebase-tdd-pipeline status --json returns an empty pipeline (stories={})
# when no pipeline.json exists, so absence manifests as a zero-story payload.
PIPELINE_JSON="$(
  "$PROJECT_DIR/scripts/lk" \
    lakebase-tdd-pipeline status --feature "$FEATURE_ID" --tdd-dir "$PROJECT_DIR/.tdd" --json 2>/dev/null
)"

if [[ -z "$PIPELINE_JSON" ]] || ! echo "$PIPELINE_JSON" | jq -e . >/dev/null 2>&1; then
  ok "no readable pipeline.json for $FEATURE_ID; skipping (advisory)"
  exit 0
fi

STORY_COUNT="$(echo "$PIPELINE_JSON" | jq '.stories | length')"
if [[ "$STORY_COUNT" -eq 0 ]]; then
  ok "pipeline has no stories for $FEATURE_ID (single-story or pipeline unused); skipping (advisory)"
  exit 0
fi
ok "pipeline present with $STORY_COUNT story/stories for $FEATURE_ID"

ACTIVE="$(echo "$PIPELINE_JSON" | jq -r '.build_active // "null"')"
[[ "$ACTIVE" == "null" ]] || warn "build lane not idle at end: build_active=$ACTIVE"

QUEUE_LEN="$(echo "$PIPELINE_JSON" | jq '.build_queue | length')"
[[ "$QUEUE_LEN" -eq 0 ]] || warn "ready queue not drained: $QUEUE_LEN story/stories still queued"

NOT_DONE="$(echo "$PIPELINE_JSON" | jq -r '[.stories | to_entries[] | select(.value.status != "done") | .key] | join(", ")')"
[[ -z "$NOT_DONE" ]] || warn "stories not done: $NOT_DONE"

UNGATED="$(echo "$PIPELINE_JSON" | jq -r '[.stories | to_entries[] | select((.value.gate.status // "open") != "approved") | .key] | join(", ")')"
[[ -z "$UNGATED" ]] || warn "stories built without an approved spec gate: $UNGATED"

if [[ "$ACTIVE" == "null" && "$QUEUE_LEN" -eq 0 && -z "$NOT_DONE" && -z "$UNGATED" ]]; then
  echo "verify-story-pipeline: PASS (all $STORY_COUNT stories gated + built, lane idle, queue drained)"
fi
exit 0
