#!/usr/bin/env bash
# FEIP-7422 v5 verify: list view + [E2E] AC artifacts present locally.
#
# This is the LOCAL artifact check; the actual CI-side [E2E] assertion
# (Playwright BASE_URL resolved to LAKEBASE_APP_ENDPOINT, page.goto
# succeeded) is verify-v5-e2e.sh, invoked from run-smoke.sh against
# the PR's CI logs only in --standard / --full modes.

set -e
set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${1:-$PWD}"
cd "$PROJECT_DIR"

fail() { echo "verify-v5: $*" >&2; exit 1; }
ok()   { echo "verify-v5: ✓ $*"; }

# shellcheck source=_assert-lib.sh
source "$SCRIPT_DIR/_assert-lib.sh"

# 1. v5 adds no schema. Revisions are timestamp-named, so a "no new migration"
#    check by filename is meaningless; instead assert no migration creates a
#    table outside the v1-v4 domain set. Content-based, catches a v5 that
#    sneaks in a table.
unexpected_tables="$(grep -rhoE "create_table\([\"'][a-z_]+[\"']" alembic/versions --include='*.py' 2>/dev/null \
  | sed -E "s/create_table\(['\"]([a-z_]+)['\"]/\1/" \
  | grep -vxE "bugs|users|statuses|bug_details|alembic_version" || true)"
[[ -z "$unexpected_tables" ]] || fail "v5 is no-schema-change but a migration creates: ${unexpected_tables//$'\n'/, }"
ok "no migration creates a table outside the v1-v4 domain (v5 adds no schema)"

# 2. An HTML bugs list view: a GET route on /bugs that renders a template,
#    wherever the build routed it (flat app/main.py or an APIRouter).
app_has "@(app|router)\.get" || fail "no GET handler under app/"
app_has "/bugs"              || fail "no '/bugs' route under app/"
app_has "TemplateResponse|HTMLResponse|Jinja2Templates" \
  || fail "app/ renders no HTML (no TemplateResponse / HTMLResponse / Jinja2Templates)"
ok "app/ renders an HTML bugs list view"

have_glob "app/templates/*.html" || fail "no Jinja2 template under app/templates/"
ok "app/templates/ has an HTML template"

# 3. Playwright [E2E] test that navigates to /bugs (name is the build's choice).
have_glob "tests/e2e/*.spec.ts" || fail "no Playwright spec under tests/e2e/"
grep -rqE "page\.goto\((['\"]).*/bugs" tests/e2e 2>/dev/null \
  || fail "no e2e spec navigates to /bugs (page.goto('/bugs'))"
ok "tests/e2e has the [E2E] AC5 fixture navigating to /bugs"

# 4. Playwright config at project root (kit's template, used by pr.yml).
have_glob "playwright.config.*" || fail "playwright.config.* missing at project root"
ok "playwright config present at project root"

echo "verify-v5: PASS (local artifacts)"
