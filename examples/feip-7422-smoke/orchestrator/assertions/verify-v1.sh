#!/usr/bin/env bash
# FEIP-7422 v1 verify: initial domain (Bug CRUD baseline).
#
# Confirms /build produced the expected artifacts for iteration v1.
# Called by run-smoke.sh after local tests pass; failure here means
# /build skipped or misshaped something the next iteration depends on.

set -e
set -u
set -o pipefail

# Resolve the assertions dir BEFORE cd-ing into the project, so the shared lib
# is sourced from here regardless of invocation cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${1:-$PWD}"
cd "$PROJECT_DIR"

fail() { echo "verify-v1: $*" >&2; exit 1; }
ok()   { echo "verify-v1: ✓ $*"; }

# shellcheck source=_assert-lib.sh
source "$SCRIPT_DIR/_assert-lib.sh"

# 1. A migration creates the bugs table. The revision is timestamp-named (so
#    its filename is not predictable) and the change may sit in any revision
#    file, so assert by content.
have_migration                  || fail "no alembic revision files under alembic/versions/"
migration_has "create_table"    || fail "no migration calls create_table"
migration_has "\"bugs\"|'bugs'" || fail "no migration creates the 'bugs' table"
ok "a migration creates the bugs table"

# 2. SQLAlchemy Bug model exists (flat app/models.py or a models package).
app_has "class Bug\b" || fail "no 'Bug' model class anywhere under app/"
ok "app/ defines a Bug model"

# 3. The app exposes create/read/update on the bugs resource. The build may use
#    a flat app/main.py or an app/routers/*.py APIRouter (prefix="/bugs"), and
#    FastAPI decorators are lowercase, so match methods + the /bugs resource
#    across the whole app tree rather than uppercase verbs in main.py.
app_has "@(app|router)\.post"  || fail "no POST handler under app/"
app_has "@(app|router)\.get"   || fail "no GET handler under app/"
app_has "@(app|router)\.patch" || fail "no PATCH handler under app/"
app_has "/bugs"                || fail "no '/bugs' route or APIRouter prefix under app/"
ok "app/ exposes POST/GET/PATCH on the bugs resource"

# 4. Per-story tests cover the ACs. The per-story pipeline names them
#    test_bugs_s<N>.py; a flat test_bugs.py is also accepted.
have_glob "tests/test_bugs*.py" || fail "no tests/test_bugs*.py"
test_count="$(count_tests 'tests/test_bugs*.py')"
[[ "$test_count" -ge 4 ]] || fail "tests/test_bugs*.py have $test_count test functions; expected >=4 (AC1-AC4)"
ok "tests/test_bugs*.py have $test_count test functions"

echo "verify-v1: PASS"
