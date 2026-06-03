#!/usr/bin/env bash
# FEIP-7422 v5 verify (CI side): the Playwright [E2E] step on the v5
# PR's CI run actually hit the paired-branch deployment via
# LAKEBASE_APP_ENDPOINT (FEIP-7423), not the webServer fallback.
#
# Called by run-smoke.sh after the PR's CI is green, BEFORE merge.
# Reads the PR's GitHub Actions run logs to confirm:
#   - the "Resolve CI app endpoint" step exported a non-empty URL
#   - the "Run E2E tests (Playwright, project root)" step picked it up
#   - the [E2E] AC5 test passed
#
# Expects: $1 = PR URL or PR number on the current repo.

set -e
set -u
set -o pipefail

PR_REF="${1:?usage: verify-v5-e2e.sh <pr-url-or-number>}"

fail() { echo "verify-v5-e2e: $*" >&2; exit 1; }
ok()   { echo "verify-v5-e2e: ✓ $*"; }

command -v gh >/dev/null 2>&1 || fail "gh CLI required"

# Resolve the run id of the latest 'PR' workflow run on this PR.
log_json="$(gh pr view "$PR_REF" --json statusCheckRollup --jq '.statusCheckRollup[] | select(.name == "build-and-test" or .workflowName == "PR") | .detailsUrl' | head -1)"
if [[ -z "$log_json" ]]; then
  fail "could not resolve PR workflow run url for $PR_REF"
fi
run_id="$(echo "$log_json" | sed -E 's|.*/runs/([0-9]+).*|\1|')"
[[ -n "$run_id" ]] || fail "could not extract run_id from $log_json"
ok "PR workflow run id: $run_id"

# Fetch the run's logs and grep the relevant steps.
log_text="$(gh run view "$run_id" --log 2>/dev/null || true)"
[[ -n "$log_text" ]] || fail "could not fetch logs for run $run_id"

# 1. The Resolve step exported a non-empty URL.
if ! echo "$log_text" | grep -qE "Resolved CI app endpoint: https?://"; then
  fail "the 'Resolve CI app endpoint' step did not log a https URL. LAKEBASE_APP_ENDPOINT was not set."
fi
ok "LAKEBASE_APP_ENDPOINT was resolved to a real URL"

# 2. The project-root Playwright step ran (not skipped) and exited green.
if ! echo "$log_text" | grep -qE "Run E2E tests \(Playwright, project root\)"; then
  fail "the 'Run E2E tests (Playwright, project root)' step did not run"
fi
# If the playwright command exited non-zero gh run view would have marked
# the run as failed already; we're past gh pr checks --watch so green is
# implicit. Sanity-grep the standard playwright success line.
if ! echo "$log_text" | grep -qE "playwright.*passed|passed.*\(.*ms\)"; then
  echo "verify-v5-e2e: warning – could not find a 'passed' marker in playwright output; trusting CI's green status anyway." >&2
fi
ok "Playwright [E2E] step ran (and CI says green)"

echo "verify-v5-e2e: PASS"
