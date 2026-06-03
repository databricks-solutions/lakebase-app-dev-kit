#!/usr/bin/env bash
# FEIP-7422 v4 verify: split bug entity (extract BugDetails).

set -e
set -u
set -o pipefail

PROJECT_DIR="${1:-$PWD}"
cd "$PROJECT_DIR"

fail() { echo "verify-v4: $*" >&2; exit 1; }
ok()   { echo "verify-v4: ✓ $*"; }

shopt -s nullglob

# 1. Migration 0004: creates bug_details, backfills from bugs.description, drops bugs.description.
migrations=(alembic/versions/0004_*.py)
[[ ${#migrations[@]} -ge 1 ]] || fail "no alembic/versions/0004_*.py migration"
m="${migrations[0]}"

grep -qE "create_table" "$m" || fail "0004 migration does not create_table"
grep -qE "\"bug_details\"|'bug_details'" "$m" || fail "0004 migration does not create 'bug_details'"
grep -qE "ForeignKey\(.bugs\.id" "$m" || fail "0004 migration's bug_details lacks bugs.id ForeignKey"
grep -qE "drop_column" "$m" || fail "0004 migration does not drop_column"
grep -qE "execute\(.*INSERT.*bug_details" "$m" || \
  grep -qE "bulk_insert.*bug_details" "$m" || \
  fail "0004 migration has no INSERT INTO bug_details data-migration step"
ok "alembic 0004 creates bug_details + backfills from bugs.description + drops bugs.description"

# 2. SQLAlchemy BugDetails model + relation.
grep -qE "class BugDetails\b" app/models.py || fail "app/models.py has no 'BugDetails' class"
ok "app/models.py defines BugDetails"

# Bug.description was REMOVED from the model (now lives on BugDetails).
# Allow "description" as a relation-loaded attribute in the API layer,
# but as a Column declaration on Bug it should be absent.
if awk '/class Bug\b/,/^class /' app/models.py | grep -qE "description\s*=\s*(sa\.|sqlalchemy\.|)Column"; then
  fail "app/models.py: Bug still declares a 'description' Column. v4 moved it to BugDetails."
fi
ok "app/models.py: Bug no longer declares its own description Column"

# 3. Tests.
[[ -f tests/test_bug_details.py ]] || fail "tests/test_bug_details.py missing"
ok "tests/test_bug_details.py exists"

echo "verify-v4: PASS"
