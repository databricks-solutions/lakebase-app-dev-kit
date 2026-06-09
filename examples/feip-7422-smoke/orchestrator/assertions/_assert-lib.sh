#!/usr/bin/env bash
# Shared assertion helpers for the FEIP-7422 per-iteration verify scripts.
#
# Why content/location-based, not filename-based:
#   - Migrations are named with a UTC timestamp version (YYYYMMDDHHMMSS) for
#     all three tools (the kit's collision-free scheme), so a migration's
#     filename is not predictable. The old 000N_ numbered glob is meaningless.
#   - The per-story pipeline (FEIP-7565) may split one iteration's schema change
#     across several revision files and names tests <slug>_s<N>.py.
#   - The build chooses its own app layout (a flat app/main.py or an
#     app/routers/*.py APIRouter), and FastAPI decorators are lowercase
#     (@router.post), not uppercase HTTP verbs.
# So every check asserts the iteration's NET effect across the whole app tree +
# every revision file, tolerant of where/how the build placed it.
#
# Sourced (not executed) by verify-vN.sh AFTER they capture SCRIPT_DIR but
# regardless of cwd. Each verify script defines fail()/ok().

VERSIONS_DIR="alembic/versions"

# True if at least one Alembic revision file exists.
have_migration() {
  shopt -s nullglob
  local m=("$VERSIONS_DIR"/*.py)
  [[ ${#m[@]} -ge 1 ]]
}

# True if ERE $1 appears in SOME revision file (a story-split iteration may
# place the change in any one of them).
migration_has() {
  shopt -s nullglob
  local m=("$VERSIONS_DIR"/*.py)
  [[ ${#m[@]} -ge 1 ]] || return 1
  grep -qE "$1" "${m[@]}"
}

# True if ERE $1 appears anywhere in the app source tree (flat app/main.py or a
# packaged app/routers/*.py split). Recursive grep, not a `**` glob: the verify
# scripts run under /usr/bin/env bash, which on macOS is 3.2 (no globstar).
app_has() {
  grep -rqE "$1" app --include='*.py' 2>/dev/null
}

# True if at least one file matches glob $1.
have_glob() {
  shopt -s nullglob
  local files=($1)
  [[ ${#files[@]} -ge 1 ]]
}

# Count `def test_*` / `async def test_*` functions across files matching glob
# $1 (per-story pipeline names them <slug>_s<N>.py; a flat <slug>.py also
# matches). Echoes 0 when nothing matches.
count_tests() {
  shopt -s nullglob
  local files=($1)
  [[ ${#files[@]} -ge 1 ]] || { echo 0; return; }
  grep -hE '^[[:space:]]*(async[[:space:]]+)?def test_' "${files[@]}" 2>/dev/null | wc -l | tr -d ' '
}
