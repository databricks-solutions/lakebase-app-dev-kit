#!/usr/bin/env bash
# Shared workflow-state assertion for the TDD-workflow smoke.
#
# Reads .lakebase/workflow-state.json via `lakebase-scm-state --json`
# and confirms the SCM workflow has advanced to the expected state
# with the right invariants populated. Called at multiple checkpoints
# in the smoke pipeline (after /design, after prepare-pr, after wait-ci,
# after merge) so any transition that silently no-ops fails the smoke
# fast rather than at a confusing downstream step.
#
# Usage:
#   verify-workflow-state.sh <project-dir> <expected-state> [feature-id]
#
# Where <expected-state> is one of:
#   scaffold-complete, feature-claimed, pr-ready, ci-green, merged
#
# The optional [feature-id] cross-checks state.feature_id matches what
# the smoke is iterating on (e.g. F1-initial-domain). Skipped on
# scaffold-complete and merged states (where feature_id is irrelevant
# or in transition).

set -e
set -u
set -o pipefail

PROJECT_DIR="${1:?usage: verify-workflow-state.sh <project-dir> <expected-state> [feature-id]}"
EXPECTED_STATE="${2:?usage: verify-workflow-state.sh <project-dir> <expected-state> [feature-id]}"
EXPECTED_FEATURE_ID="${3:-}"

cd "$PROJECT_DIR"

fail() { echo "verify-workflow-state[$EXPECTED_STATE]: FAIL: $*" >&2; exit 1; }
ok()   { echo "verify-workflow-state[$EXPECTED_STATE]: ✓ $*"; }

# 1. The state file must exist + parse.
# Use the kit ref under test (run-smoke.sh exports LAKEBASE_KIT_NPX), not a
# hardcoded main, so the assertion validates the same build the smoke ran.
# Capture stdout ONLY: a cold npx install prints npm/prepare logs to stderr,
# and folding them into STATE_JSON (the old `2>&1`) breaks `jq` parsing and
# yields a spurious found=false.
STATE_JSON="$(
  "$PROJECT_DIR/scripts/lk" \
    lakebase-scm-state --project-dir "$PROJECT_DIR" --json 2>/dev/null
)"

# `lakebase-scm-state` exits 1 when no state file exists. The
# scaffold-complete check would expect 0, so handle both.
if ! echo "$STATE_JSON" | jq -e '.found == true' >/dev/null 2>&1; then
  fail "no .lakebase/workflow-state.json (lakebase-scm-state reported found=false). Phase A's scaffold seed did not run, or the file was deleted."
fi
ok "state file present + parseable"

# 2. Current state matches expected.
ACTUAL_STATE="$(echo "$STATE_JSON" | jq -r '.state.state')"
if [[ "$ACTUAL_STATE" != "$EXPECTED_STATE" ]]; then
  fail "expected state=$EXPECTED_STATE, got state=$ACTUAL_STATE"
fi
ok "state == $EXPECTED_STATE"

# 3. Tier topology recorded.
TIER="$(echo "$STATE_JSON" | jq -r '.state.tier_topology')"
[[ -n "$TIER" && "$TIER" != "null" ]] || fail "tier_topology missing from state row"
ok "tier_topology=$TIER recorded"

# 4. Per-state invariants.
require_field() {
  local field="$1"
  local val
  val="$(echo "$STATE_JSON" | jq -r ".state.${field} // \"\"")"
  [[ -n "$val" && "$val" != "null" ]] || fail "$field missing from state row at state=$ACTUAL_STATE"
  echo "$val"
}

case "$EXPECTED_STATE" in
  scaffold-complete)
    require_field project_id >/dev/null
    ok "scaffold-complete invariants satisfied"
    ;;
  feature-claimed)
    fid="$(require_field feature_id)"
    branch="$(require_field branch)"
    require_field parent_branch >/dev/null
    require_field lakebase_branch_uid >/dev/null
    require_field claimed_at >/dev/null
    if [[ -n "$EXPECTED_FEATURE_ID" && "$fid" != "$EXPECTED_FEATURE_ID" ]]; then
      fail "feature_id=$fid does not match expected=$EXPECTED_FEATURE_ID"
    fi
    # Verify the branch is the CANONICAL name the substrate sanitizer produces
    # for this feature, derived from the kit (single source of truth) rather
    # than a hardcoded prefix. The feature_id match above guarantees fid ==
    # canon_id here, so the canonical branch the state report ALREADY carries
    # (.canonical_branch, computed by the same sanitizer) is exactly what we
    # would re-derive , reuse it instead of spawning a SECOND CLI process per
    # check (the redundant inter-phase boot P7 removes). Fall back to the
    # dedicated CLI when an older kit's report omits the field.
    canon_id="${EXPECTED_FEATURE_ID:-$fid}"
    EXPECTED_BRANCH="$(echo "$STATE_JSON" | jq -r '.canonical_branch // ""')"
    if [[ -z "$EXPECTED_BRANCH" ]]; then
      EXPECTED_BRANCH="$(
        "$PROJECT_DIR/scripts/lk" \
          lakebase-scm-feature-branch "$canon_id" 2>/dev/null
      )"
    fi
    if [[ -z "$EXPECTED_BRANCH" ]]; then
      fail "could not derive canonical branch for feature_id=$canon_id (no .canonical_branch in state + lakebase-scm-feature-branch failed)"
    fi
    if [[ "$branch" != "$EXPECTED_BRANCH" ]]; then
      fail "branch=$branch does not match the canonical sanitized name=$EXPECTED_BRANCH for feature_id=$canon_id"
    fi
    ok "feature-claimed invariants satisfied (feature_id=$fid, branch=$branch)"
    ;;
  pr-ready)
    require_field feature_id >/dev/null
    require_field branch >/dev/null
    pr_url="$(require_field pr_url)"
    require_field pushed_at >/dev/null
    [[ "$pr_url" == https://github.com/*/pull/* ]] || fail "pr_url=$pr_url does not look like a GitHub PR URL"
    ok "pr-ready invariants satisfied (pr_url=$pr_url)"
    ;;
  ci-green)
    require_field pr_url >/dev/null
    require_field ci_run_url >/dev/null
    require_field ci_green_at >/dev/null
    ok "ci-green invariants satisfied"
    ;;
  merged)
    require_field merged_at >/dev/null
    # migrate_run_url + migrate_completed_at are populated only when
    # scm-merge ran with --wait-migrate. The smoke runs --wait-migrate
    # by default, so we treat their absence as a failure here.
    require_field migrate_run_url >/dev/null
    require_field migrate_completed_at >/dev/null
    ok "merged invariants satisfied (migrate confirmed)"
    ;;
  *)
    fail "unknown expected-state value '$EXPECTED_STATE'"
    ;;
esac

echo "verify-workflow-state[$EXPECTED_STATE]: PASS"
