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

PROJECT_DIR="${1:-$PWD}"
cd "$PROJECT_DIR"

fail() { echo "verify-v5: $*" >&2; exit 1; }
ok()   { echo "verify-v5: ✓ $*"; }

shopt -s nullglob

# 1. No new migration (v5 is no-schema-change by spec).
unexpected=(alembic/versions/0005_*.py)
[[ ${#unexpected[@]} -eq 0 ]] || fail "v5 spec is no-schema-change but found ${unexpected[*]}"
ok "no new migration (as specified)"

# 2. HTML GET /bugs route + Jinja2 template.
grep -qE 'GET.*/bugs(\b|"|\047)' app/main.py || fail "app/main.py missing GET /bugs HTML route"
grep -qE 'TemplateResponse|HTMLResponse' app/main.py || \
  fail "app/main.py has no TemplateResponse / HTMLResponse import; can it render HTML?"
ok "app/main.py renders HTML for GET /bugs"

[[ -f app/templates/bugs.html ]] || fail "app/templates/bugs.html (Jinja2 template) missing"
ok "app/templates/bugs.html exists"

# 3. Playwright [E2E] test.
[[ -f tests/e2e/bugs_list.spec.ts ]] || fail "tests/e2e/bugs_list.spec.ts missing"
grep -qE "page\.goto\(['\"]/bugs" tests/e2e/bugs_list.spec.ts || \
  fail "tests/e2e/bugs_list.spec.ts has no page.goto('/bugs') call"
ok "tests/e2e/bugs_list.spec.ts has the [E2E] AC5 fixture"

# 4. playwright.config.ts at project root (kit's template, used by pr.yml).
[[ -f playwright.config.ts ]] || fail "playwright.config.ts (project root) missing"
ok "playwright.config.ts present at project root"

echo "verify-v5: PASS (local artifacts)"
