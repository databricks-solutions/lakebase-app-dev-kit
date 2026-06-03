#!/usr/bin/env bash
# FEIP-7422 v2 verify: add owners (User entity + FK from bugs).

set -e
set -u
set -o pipefail

PROJECT_DIR="${1:-$PWD}"
cd "$PROJECT_DIR"

fail() { echo "verify-v2: $*" >&2; exit 1; }
ok()   { echo "verify-v2: ✓ $*"; }

shopt -s nullglob

# 1. Migration 0002 creates users + adds owner_id to bugs.
migrations=(alembic/versions/0002_*.py)
[[ ${#migrations[@]} -ge 1 ]] || fail "no alembic/versions/0002_*.py migration"
grep -q "create_table" "${migrations[0]}" || fail "0002 migration does not call create_table"
grep -qE "\"users\"|'users'" "${migrations[0]}" || fail "0002 migration does not create 'users'"
grep -qE "add_column" "${migrations[0]}" || fail "0002 migration does not add_column"
grep -qE "owner_id" "${migrations[0]}" || fail "0002 migration does not add 'owner_id'"
grep -qE "ForeignKey\(.users\.id" "${migrations[0]}" || fail "0002 migration adds owner_id without a users.id ForeignKey"
ok "alembic 0002 creates users + adds bugs.owner_id FK"

# 2. SQLAlchemy User model exists; Bug now relates to it.
grep -qE "class User\b" app/models.py || fail "app/models.py has no 'User' class"
grep -qE "owner_id" app/models.py || fail "app/models.py Bug has no owner_id field"
ok "app/models.py defines User + Bug.owner_id"

# 3. /users routes exist.
grep -qE 'POST.*/users\b' app/main.py || fail "app/main.py missing POST /users route"
grep -qE 'GET.*/users\b' app/main.py || fail "app/main.py missing GET /users route"
ok "app/main.py declares /users routes"

# 4. Tests cover users.
[[ -f tests/test_users.py ]] || fail "tests/test_users.py missing"
test_count="$(grep -cE '^def test_' tests/test_users.py || true)"
[[ "$test_count" -ge 2 ]] || fail "tests/test_users.py only has $test_count test functions; expected >=2"
ok "tests/test_users.py has $test_count test functions"

echo "verify-v2: PASS"
