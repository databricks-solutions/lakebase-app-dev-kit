#!/usr/bin/env bash
# FEIP-7422 v3 verify: status table (promote enum to its own table).

set -e
set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${1:-$PWD}"
cd "$PROJECT_DIR"

fail() { echo "verify-v3: $*" >&2; exit 1; }
ok()   { echo "verify-v3: ✓ $*"; }

# shellcheck source=_assert-lib.sh
source "$SCRIPT_DIR/_assert-lib.sh"

# 1. statuses table + bugs.status_id + dropped status + a data migration, across
#    revisions (a story split may spread these across several revision files).
have_migration                         || fail "no alembic revision files under alembic/versions/"
migration_has "create_table"           || fail "no migration calls create_table"
migration_has "\"statuses\"|'statuses'" || fail "no migration creates the 'statuses' table"
migration_has "add_column"             || fail "no migration calls add_column"
migration_has "status_id"              || fail "no migration references status_id"
migration_has "drop_column"            || fail "no migration calls drop_column"
migration_has "execute\(|bulk_insert\(" || fail "no data-migration step (execute() or bulk_insert())"
ok "migrations create statuses + add bugs.status_id + drop bugs.status + carry a data migration"

# 2. Status model present; Bug.status replaced by status_id.
app_has "class Status\b" || fail "no 'Status' model class under app/"
app_has "status_id"      || fail "no 'status_id' field under app/"
# The old enum-ish bare `status` Column should be gone (status_id/status_name OK).
residual="$(grep -rhE "^[[:space:]]+status[[:space:]]*[:=]" app --include='*.py' 2>/dev/null \
              | grep -vE "status_id|status_name|#" || true)"
[[ -z "$residual" ]] || fail "app/ still declares a bare 'status' field; v3 should replace it with status_id"
ok "app/: Status model present, Bug.status replaced by status_id"

# 3. The app exposes GET /statuses, wherever it is routed.
app_has "@(app|router)\.get" || fail "no GET handler under app/"
app_has "/statuses"          || fail "no '/statuses' route or APIRouter prefix under app/"
ok "app/ exposes GET /statuses"

# 4. Tests (test_statuses_s<N>.py or a flat test_statuses.py).
have_glob "tests/test_statuses*.py" || fail "no tests/test_statuses*.py"
ok "tests/test_statuses*.py present"

echo "verify-v3: PASS"
