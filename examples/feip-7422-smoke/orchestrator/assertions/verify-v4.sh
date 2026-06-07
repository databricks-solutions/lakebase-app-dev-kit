#!/usr/bin/env bash
# FEIP-7422 v4 verify: split bug entity (extract BugDetails).

set -e
set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${1:-$PWD}"
cd "$PROJECT_DIR"

fail() { echo "verify-v4: $*" >&2; exit 1; }
ok()   { echo "verify-v4: ✓ $*"; }

# shellcheck source=_assert-lib.sh
source "$SCRIPT_DIR/_assert-lib.sh"

# 1. bug_details table (FK to bugs) + dropped bugs.description + a backfill,
#    across revisions (the change may be spread over several revision files).
have_migration                  || fail "no alembic revision files under alembic/versions/"
migration_has "create_table"    || fail "no migration calls create_table"
migration_has "\"bug_details\"|'bug_details'" || fail "no migration creates the 'bug_details' table"
migration_has "ForeignKey\(.bugs\.id"          || fail "bug_details lacks a bugs.id ForeignKey"
migration_has "drop_column"     || fail "no migration calls drop_column"
migration_has "execute\(.*INSERT.*bug_details|bulk_insert.*bug_details" \
  || fail "no INSERT INTO bug_details data-migration step"
ok "migrations create bug_details + backfill from bugs.description + drop bugs.description"

# 2. SQLAlchemy BugDetails model exists.
app_has "class BugDetails\b" || fail "no 'BugDetails' model class under app/"
ok "app/ defines BugDetails"

# Bug.description was REMOVED from the Bug model (it now lives on BugDetails).
# `description` as a relation-loaded attribute is fine; as a Column on Bug it
# should be absent. Scope to the file that declares `class Bug` (not BugDetails)
# so this holds whether models are flat (app/models.py) or packaged.
bug_file="$(grep -rlE "class Bug\b" app --include='*.py' 2>/dev/null | head -1)"
[[ -n "$bug_file" ]] || fail "no file under app/ declares 'class Bug'"
if awk '/class Bug\b/,/^class [A-Za-z]/' "$bug_file" \
     | grep -qE "description[[:space:]]*=[[:space:]]*(sa\.|sqlalchemy\.|)Column"; then
  fail "app/: Bug still declares a 'description' Column; v4 moved it to BugDetails"
fi
ok "app/: Bug no longer declares its own description Column"

# 3. Tests (test_bug_details_s<N>.py or a flat test_bug_details.py).
have_glob "tests/test_bug_details*.py" || fail "no tests/test_bug_details*.py"
ok "tests/test_bug_details*.py present"

echo "verify-v4: PASS"
