# `lakebase-ci-resolve-branch` test plan

Coverage plan for the new standalone CLI bin (FEIP-7494). Two layers:

- **Hermetic** at `tests/bdd/ci-resolve-branch.test.ts` for pure-function
  behavior (DSN encoding, sanitize-name, `--github-env` file format).
- **Live** at `tests/integration/scm-ci-resolve-branch-live.test.ts` for
  the full state machine against a real Lakebase workspace.

## State machine under test

Five `BRANCH_STATUS` outcomes:

- `CREATED`: branch did not exist; created from `--create-from`. Source recorded.
- `EXISTS`: branch existed; no `--create-from` was given so no source verification was performed.
- `VERIFIED`: branch existed; `--create-from` matched the recorded source.
- `UNVERIFIED`: branch existed; `--create-from` was given but the API did not record a source (rare; pre-tracking branches).
- `RECREATED`: branch existed but source mismatched; deleted + re-forked because `--recreate-on-source-mismatch` was set.

Decision table (does-it-exist x was-create-from-given):

| existing? | create-from? | extra | outcome |
|---|---|---|---|
| no  | no  |                                       | ERROR exit 1 |
| no  | yes |                                       | CREATED |
| yes | no  |                                       | EXISTS |
| yes | yes | source matches expected               | VERIFIED |
| yes | yes | source not recorded by API            | UNVERIFIED |
| yes | yes | source mismatched, no recreate flag   | ERROR exit 1 |
| yes | yes | source mismatched, recreate flag set  | RECREATED |

Hard errors (exit 1):

- branch missing AND `--create-from` not given
- source mismatched AND `--recreate-on-source-mismatch` NOT set
- `--ensure-endpoint` not set AND no endpoint exists
- credential mint failed

## Hermetic test cases (`tests/bdd/ci-resolve-branch.test.ts`)

These tests do NOT call the real Lakebase API. They cover deterministic
local behavior so a regression in encoding or output shape fails CI
without needing a workspace.

| # | Case | What it asserts |
|---|---|---|
| H1 | `urlEncodeDsnPart` encodes `@ : / ? #` to percent-escapes | DSN parses correctly under libpq / psycopg |
| H2 | `urlEncodeDsnPart` is idempotent on already-clean inputs | No double-encoding |
| H3 | Default (eval mode) emits `KEY='value'` lines for all 9 outputs in canonical order | Workflow YAML `eval $(...)` integrations stay valid |
| H4 | `--github-env` writes scalars + heredocs to the `$GITHUB_ENV` tempfile | GH Actions multi-line value contract honored |
| H5 | `--github-env` ALSO emits NON-SECRET KEY='value' lines to stdout, omits `LAKEBASE_PASSWORD` + `DATABASE_URL` | Same-step `eval` works without leaking the token via stdout logs |
| H6 | `escapeSingleQuotes` survives a value containing `'` | Values with apostrophes do not break shell eval |
| H7 | `parseArgs` rejects unknown flags with exit 2 + stderr | Catches typo bugs in workflow YAML |
| H8 | Missing `--git-branch` AND `--lakebase-name` exit 2 + helpful message | One-input invariant enforced |
| H9 | Missing `LAKEBASE_PROJECT_ID` env exit 2 | No accidental call with wrong instance |

These tests stub `listBranches` / `createBranch` / `deleteBranch` /
`ensureEndpoint` / `getCredential` via `vi.mock` so the state machine
runs against a deterministic fixture.

## Live test cases (`tests/integration/scm-ci-resolve-branch-live.test.ts`)

Gated on `LAKEBASE_TEST_E2E_GITHUB=1` + a reachable workspace, same as
the existing scm-workflow live tests. Single `beforeAll` creates the
project; each scenario reuses it. Teardown on all-pass; preserve on any-fail.

Setup (in `beforeAll`):

- `createProject` with `tiers=2` (yields `production` + `staging`).
- Capture `LAKEBASE_PROJECT_ID = projectName` in the test env.

| # | Case | Setup | Invocation | Asserts |
|---|---|---|---|---|
| L1 | `CREATED` from staging | `ci-pr-99` does not exist | `--git-branch ci-pr-99 --create-from staging --ensure-endpoint --github-env` (env file = tempfile) | exit 0; status=CREATED; source=staging; ci-pr-99 exists on Lakebase, READY, forked from staging; tempfile contains `LAKEBASE_BRANCH_NAME=ci-pr-99` + heredoc-wrapped `LAKEBASE_PASSWORD`; stdout has non-secrets only |
| L2 | `EXISTS` re-run (no create-from) | After L1 (ci-pr-99 exists) | `--git-branch ci-pr-99 --ensure-endpoint --github-env` | exit 0; status=EXISTS; source = staging (carried from L1); no Lakebase mutations |
| L3 | `VERIFIED` re-run | After L1 (ci-pr-99 exists, forked from staging) | `--git-branch ci-pr-99 --create-from staging --ensure-endpoint --github-env` | exit 0; status=VERIFIED; no Lakebase mutations |
| L4 | mismatch without flag exits non-zero | ci-pr-99 forked from staging | `--git-branch ci-pr-99 --create-from main --ensure-endpoint` (no `--recreate-on-source-mismatch`) | exit 1; stderr names actual source (staging) vs expected (production); branch unchanged |
| L5 | `RECREATED` from production | ci-pr-99 forked from staging | `--git-branch ci-pr-99 --create-from main --recreate-on-source-mismatch --ensure-endpoint --github-env` | exit 0; status=RECREATED; source=production; ci-pr-99 deleted + re-forked; new uid; READY |
| L6 | trunk mapping (`main` resolves to default leaf) | n/a | `--git-branch main --ensure-endpoint --github-env` | exit 0; status=EXISTS (production exists by default); LAKEBASE_BRANCH_NAME=production; verified host + non-empty token |
| L7 | endpoint missing without `--ensure-endpoint` exits non-zero | freshly created branch with no endpoint | `--git-branch ci-pr-100 --create-from staging` (no `--ensure-endpoint`) | exit 1; stderr names the branch and recommends the flag; branch exists but no endpoint created |
| L8 | `--lakebase-name` override | n/a | `--lakebase-name ci-pr-special --create-from staging --ensure-endpoint --github-env` | exit 0; status=CREATED; LAKEBASE_BRANCH_NAME=ci-pr-special (no sanitize applied) |
| L9 | DSN bytes parse | After any successful run | Direct connect via `pg.Client({connectionString: result.databaseUrl})` | `SELECT 1` returns 1; proves URL encoding survives a round-trip |

Teardown (in `afterAll`, gated on all scenarios passing):

- `databricks postgres delete-branch` for each Lakebase branch created
  (`ci-pr-99`, `ci-pr-100`, `ci-pr-special`).
- Project removed via the kit teardown helper.
- Local tempfiles + project dir removed.

## What NOT to test live

- Anything `vi.mock` can simulate (see hermetic table). Don't burn
  workspace minutes on URL-encoding.
- The thin wrapper shell that calls this bin: that is covered by the
  existing scm-workflow live tests once Phase 3 lands (the shell is
  invoked indirectly by `prepare-commit-msg.sh` and the GH Actions PR
  workflow).

## How to run

Hermetic:

```
npx vitest run tests/bdd/ci-resolve-branch.test.ts
```

Live (after env config from `~/code/feip-7422-smoke/.env.local.test.config`):

```
LAKEBASE_TEST_E2E_GITHUB=1 npx vitest run \
  tests/integration/scm-ci-resolve-branch-live.test.ts
```

Estimate: 5 to 8 minutes wallclock for the full live suite (project
create ~60s, each state transition ~30 to 60s, teardown ~30s).
