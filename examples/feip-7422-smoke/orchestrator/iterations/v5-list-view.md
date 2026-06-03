# v5: List View + [E2E]

**Branch**: `feature/list-view`
**Lakebase parent**: `staging`
**Migration**: none (no schema change)

## Story

Up to v4 the app has only had a JSON API. v5 adds the first
user-facing surface: a server-rendered HTML page at `GET /bugs`
that lists every bug with title, status name (joined from
`statuses`), and owner display name (joined from `users`).

This iteration carries the **`[E2E]` AC row** that hits FEIP-7423's
`LAKEBASE_APP_ENDPOINT` wiring. Playwright runs against the
paired-branch deployment of this PR's CI app, navigates to `/bugs`,
and asserts the rendered list contains the seed bugs.

## Acceptance Criteria

| ID | Given | When | Then |
|----|-------|------|------|
| AC1 | three bugs exist (via test seed) with different statuses + owners | GET /bugs | the response is 200, `Content-Type: text/html`, and the body includes the title of each bug |
| AC2 | a bug has a non-null `owner_id` | GET /bugs | the rendered row shows `users.display_name`, not the raw `owner_id` |
| AC3 | a bug's `status_id` references the `in_progress` status | GET /bugs | the rendered row shows the status name `in_progress`, not the raw `status_id` |
| AC4 | three bugs exist with `sort_order` 10, 20, 30 on their statuses | GET /bugs?sort=status | the rows are ordered by `statuses.sort_order` ascending |
| **AC5** **[E2E]** | the PR's CI deployed app is reachable at `$LAKEBASE_APP_ENDPOINT` (exported by pr.yml) | Playwright navigates `page.goto("/bugs")` | the page responds 200, `page.locator("table tbody tr")` returns at least one row, and the smoke seed bug's title appears in the rendered DOM |

## Files /build is expected to produce or change

- Update: `app/main.py` (add `GET /bugs` HTML handler; reuse the existing JSON endpoint at `GET /api/bugs` if desired)
- New: `app/templates/bugs.html` (Jinja2 template)
- Update: `app/models.py` no change required, but the list query loads `statuses` + `users` via joinedload
- New: `tests/test_bugs_list_view.py` (server-side test for AC1-AC4 via httpx)
- New: `tests/e2e/bugs_list.spec.ts` (Playwright [E2E] test for AC5)
- Update: `playwright.config.ts` if needed (kit's template already handles BASE_URL from env)

## Refactor type

**Frontend addition + E2E wiring.** No DB schema changes. This is
the iteration that exercises the kit's full PR pipeline:

1. CI creates the paired Lakebase branch (`ci-pr-N`)
2. CI deploys the app to a paired Databricks Apps endpoint
3. FEIP-7423's `Resolve CI app endpoint` step exports
   `LAKEBASE_APP_ENDPOINT` to `$GITHUB_ENV`
4. The project-root Playwright step picks up `BASE_URL = $LAKEBASE_APP_ENDPOINT`
5. `page.goto("/bugs")` reaches the paired-branch deployment, not localhost
6. AC5 passes only when ALL of (1)-(5) work end-to-end

The smoke's v5 verification asserts the Playwright run logs the
resolved `BASE_URL` (proving it's not the webServer fallback) AND
that the test exited 0.

## Out of scope for v5

- Authenticated views (no login)
- Bug detail page (only the list)
- HTMX / dynamic interactions (a plain `<table>` is enough)
- Visual regression testing (we assert structure, not pixels)
- Multi-browser Playwright matrix (Chromium only, per FEIP-7094)

## Why this iteration is special

In the `--standard` mode this is the ONLY iteration whose PR
actually runs through CI + Playwright. Iterations v1-v4 are all
fast-mode (local commit, no CI), so v5 is where the
"is the kit-emitted pr.yml actually wired correctly?" question
gets answered. In `--full` mode all 5 iterations run through CI,
but v5 is still the only one with the `[E2E]` AC.
