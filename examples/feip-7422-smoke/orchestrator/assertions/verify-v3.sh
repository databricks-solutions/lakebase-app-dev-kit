#!/usr/bin/env bash
# FEIP-7422 v3 verify: status table (promote enum to its own table).

set -e
set -u
set -o pipefail

PROJECT_DIR="${1:-$PWD}"
cd "$PROJECT_DIR"

fail() { echo "verify-v3: $*" >&2; exit 1; }
ok()   { echo "verify-v3: ✓ $*"; }

shopt -s nullglob

# 1. Migration 0003: creates statuses, adds status_id, backfills, drops status.
migrations=(alembic/versions/0003_*.py)
[[ ${#migrations[@]} -ge 1 ]] || fail "no alembic/versions/0003_*.py migration"
m="${migrations[0]}"

grep -qE "create_table" "$m" || fail "0003 migration does not create_table"
grep -qE "\"statuses\"|'statuses'" "$m" || fail "0003 migration does not create 'statuses'"
grep -qE "add_column" "$m" || fail "0003 migration does not add_column"
grep -qE "status_id" "$m" || fail "0003 migration does not reference status_id"
grep -qE "drop_column" "$m" || fail "0003 migration does not drop_column"
grep -qE "execute\(|bulk_insert\(" "$m" || fail "0003 migration has no data-migration step (execute() or bulk_insert())"
ok "alembic 0003 creates statuses + adds bugs.status_id + drops bugs.status + carries data migration"

# 2. SQLAlchemy Status model exists; Bug.status_id replaced Bug.status.
grep -qE "class Status\b" app/models.py || fail "app/models.py has no 'Status' class"
grep -qE "status_id" app/models.py || fail "app/models.py Bug has no status_id field"
if grep -qE "^\s+status\s*[:=]" app/models.py; then
  # The literal string "status" might appear in column names / docstrings,
  # but as a SQLAlchemy field declaration (status : Type or status = Column)
  # it shouldn't be there post-v3.
  grep -E "^\s+status\s*[:=]" app/models.py | grep -qvE "status_id|status_name|^.*#" && \
    fail "app/models.py still declares a 'status' field; v3 should have removed it"
fi
ok "app/models.py: Status model present, Bug.status replaced by status_id"

# 3. /statuses GET route.
grep -qE 'GET.*/statuses\b' app/main.py || fail "app/main.py missing GET /statuses route"
ok "app/main.py declares GET /statuses"

# 4. Tests.
[[ -f tests/test_statuses.py ]] || fail "tests/test_statuses.py missing"
ok "tests/test_statuses.py exists"

echo "verify-v3: PASS"
