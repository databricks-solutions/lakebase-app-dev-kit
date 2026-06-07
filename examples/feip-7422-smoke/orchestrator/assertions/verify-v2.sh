#!/usr/bin/env bash
# FEIP-7422 v2 verify: add owners (User entity + FK from bugs).

set -e
set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${1:-$PWD}"
cd "$PROJECT_DIR"

fail() { echo "verify-v2: $*" >&2; exit 1; }
ok()   { echo "verify-v2: ✓ $*"; }

# shellcheck source=_assert-lib.sh
source "$SCRIPT_DIR/_assert-lib.sh"

# 1. The users table + the bugs.owner_id FK exist across the migrations. A
#    story-split iteration may place create-users and add-owner_id in different
#    revisions, so assert each piece by content rather than expecting one file.
have_migration                    || fail "no alembic revision files under alembic/versions/"
migration_has "create_table"      || fail "no migration calls create_table"
migration_has "\"users\"|'users'" || fail "no migration creates the 'users' table"
migration_has "add_column"        || fail "no migration calls add_column"
migration_has "owner_id"          || fail "no migration adds 'owner_id'"
migration_has "ForeignKey\(.users\.id" || fail "owner_id is added without a users.id ForeignKey"
ok "migrations create users + add bugs.owner_id FK"

# 2. SQLAlchemy User model exists; Bug now relates to it.
app_has "class User\b" || fail "no 'User' model class under app/"
app_has "owner_id"     || fail "no 'owner_id' field under app/ (Bug<->User relation)"
ok "app/ defines User + Bug.owner_id"

# 3. The app exposes the users resource (create + read), wherever it is routed.
app_has "@(app|router)\.post" || fail "no POST handler under app/"
app_has "@(app|router)\.get"  || fail "no GET handler under app/"
app_has "/users"              || fail "no '/users' route or APIRouter prefix under app/"
ok "app/ exposes the users resource"

# 4. Per-story tests cover users (test_users_s<N>.py or a flat test_users.py).
have_glob "tests/test_users*.py" || fail "no tests/test_users*.py"
test_count="$(count_tests 'tests/test_users*.py')"
[[ "$test_count" -ge 2 ]] || fail "tests/test_users*.py have $test_count test functions; expected >=2"
ok "tests/test_users*.py have $test_count test functions"

echo "verify-v2: PASS"
