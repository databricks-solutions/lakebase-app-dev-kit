#!/usr/bin/env bash
# FEIP-7422 generic deploy-gate verify (replaces the bespoke per-iteration
# verify-vN.sh scripts).
#
# Asserts, for ANY feature the smoke drives, that it reached its deploy gate
# with working software, without hard-coding the feature's specific shape:
#   1. the build produced a schema migration (an Alembic revision),
#   2. the app exposes route handlers under app/,
#   3. per-story tests exist,
#   4. the feature carries at least one E2E (browser) acceptance criterion (the
#      UI track is on, so every user-facing capability must ship an E2E story),
#   5. the Release Engineer produced deploy-evidence.json and the PO deploy gate
#      is approved (the "working software" gate the product overview asks for).
#
# This is intentionally feature-agnostic: the seed feature-requests can evolve
# (or be replaced by what the Spec Author proposes) without rewriting an
# assertion script. It asserts the workflow's net effect, not a hand-coded
# per-feature schema/endpoint shape.
#
# Usage: verify-deploy-gate.sh <project-dir> <feature-id>

set -e
set -u
set -o pipefail

# Resolve the assertions dir BEFORE cd-ing into the project, so the shared lib
# is sourced from here regardless of invocation cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${1:?usage: verify-deploy-gate.sh <project-dir> <feature-id>}"
FEATURE_ID="${2:?usage: verify-deploy-gate.sh <project-dir> <feature-id>}"
cd "$PROJECT_DIR"

fail() { echo "verify-deploy-gate[$FEATURE_ID]: $*" >&2; exit 1; }
ok()   { echo "verify-deploy-gate[$FEATURE_ID]: ✓ $*"; }

# shellcheck source=_assert-lib.sh
source "$SCRIPT_DIR/_assert-lib.sh"

# 1. A schema migration exists (the build applied a schema change). The revision
#    is timestamp-named, so assert presence, not a predictable filename.
have_migration || fail "no Alembic revision files under alembic/versions/"
ok "a schema migration exists"

# 2. The app exposes route handlers. The build may use a flat app/main.py or a
#    packaged app/routers/*.py APIRouter; FastAPI decorators are lowercase.
app_has "@(app|router)\.(get|post|patch|put|delete)" \
  || fail "no route handler (@app/@router .get/.post/...) under app/"
ok "app/ exposes route handlers"

# 3. Per-story tests exist (the per-story pipeline names them <slug>_s<N>.py; a
#    flat test_*.py also matches).
have_glob "tests/test_*.py" || fail "no tests/test_*.py"
test_count="$(count_tests 'tests/test_*.py')"
[[ "$test_count" -ge 1 ]] || fail "no test functions found under tests/"
ok "tests present ($test_count test functions)"

# 4. The feature carries at least one E2E (browser) acceptance criterion. The UI
#    track is on (LAKEBASE_TDD_UI=1), so every user-facing capability must be
#    deliverable end to end as an E2E story. Resolve the feature dir (the kit
#    uses either <id> or <id>-<slug>) and scan its on-disk ACs.
feature_dir="$(ls -d .tdd/features/"${FEATURE_ID}"* 2>/dev/null | head -1)"
[[ -n "$feature_dir" ]] || fail "no .tdd/features/${FEATURE_ID}* directory"
if grep -rqlE '"layer"[[:space:]]*:[[:space:]]*"E2E"' "$feature_dir"/stories/*/acs/ 2>/dev/null; then
  ok "feature has an E2E acceptance criterion (UI track)"
else
  fail "no E2E-layer AC under $feature_dir (UI track requires an E2E story)"
fi

# 5. Deploy gate: the Release Engineer produced deploy-evidence.json (the deploy
#    actually ran + reached the app) and the PO deploy gate is approved.
[[ -f "$feature_dir/deploy-evidence.json" ]] \
  || fail "no $feature_dir/deploy-evidence.json (deploy did not run)"
ok "deploy-evidence.json present"
gate_status="$(jq -r '.gates.deploy.status // ""' "$feature_dir/gates.json" 2>/dev/null || echo "")"
[[ "$gate_status" == "approved" ]] \
  || fail "PO deploy gate not approved (gates.json deploy.status='$gate_status')"
ok "PO deploy gate approved"

echo "verify-deploy-gate[$FEATURE_ID]: PASS"
