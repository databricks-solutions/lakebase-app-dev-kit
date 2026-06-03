#!/usr/bin/env bash
# FEIP-7422 v1 verify: initial domain (Bug CRUD baseline).
#
# Confirms /build produced the expected artifacts for iteration v1.
# Called by run-smoke.sh after local tests pass; failure here means
# /build skipped or misshaped something the next iteration depends on.

set -e
set -u
set -o pipefail

PROJECT_DIR="${1:-$PWD}"
cd "$PROJECT_DIR"

fail() { echo "verify-v1: $*" >&2; exit 1; }
ok()   { echo "verify-v1: ✓ $*"; }

# 1. Alembic migration exists with the expected version + creates bugs.
shopt -s nullglob
migrations=(alembic/versions/0001_*.py)
[[ ${#migrations[@]} -ge 1 ]] || fail "no alembic/versions/0001_*.py migration"
grep -q "create_table" "${migrations[0]}" || fail "0001 migration does not call create_table"
grep -q "\"bugs\"\|'bugs'" "${migrations[0]}" || fail "0001 migration does not create 'bugs'"
ok "alembic 0001 migration creates bugs"

# 2. SQLAlchemy Bug model exists.
[[ -f app/models.py ]] || fail "app/models.py missing"
grep -qE "class Bug\b" app/models.py || fail "app/models.py has no 'Bug' class"
ok "app/models.py defines Bug"

# 3. FastAPI app exists with the 4 routes.
[[ -f app/main.py ]] || fail "app/main.py missing"
for route_pattern in 'POST.*/bugs' 'GET.*/bugs/' 'PATCH.*/bugs/'; do
  grep -qE "$route_pattern" app/main.py || fail "app/main.py missing route matching: $route_pattern"
done
ok "app/main.py declares POST/GET/PATCH /bugs routes"

# 4. Tests file exists with at least one of each AC.
[[ -f tests/test_bugs.py ]] || fail "tests/test_bugs.py missing"
test_count="$(grep -cE '^def test_' tests/test_bugs.py || true)"
[[ "$test_count" -ge 4 ]] || fail "tests/test_bugs.py only has $test_count test functions; expected >=4 (one per AC1-AC4)"
ok "tests/test_bugs.py has $test_count test functions"

echo "verify-v1: PASS"
