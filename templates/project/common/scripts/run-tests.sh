#!/usr/bin/env bash
# Run tests using the branch URL from .env (post-checkout hook writes it).
# Detects project language and calls the appropriate test runner.
# Usage: ./scripts/run-tests.sh [extra args]
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
if [ ! -f .env ]; then
  echo "No .env found. Run 'git checkout <branch>' so the hook creates/updates .env, or copy .env.example to .env."
  exit 1
fi
set -a
# shellcheck source=/dev/null
source .env 2>/dev/null || true
set +a

# Build DATABASE_URL from SPRING_DATASOURCE_* if not already set (backward compat).
# URL-encode both username and password – the email-style username always
# contains '@' which otherwise confuses libpq/psycopg DSN parsing.
if [ -z "${DATABASE_URL:-}" ] && [ -n "${SPRING_DATASOURCE_URL:-}" ]; then
  DATABASE_URL="$(echo "$SPRING_DATASOURCE_URL" | sed 's|^jdbc:postgresql://|postgresql://|')"
  if [ -n "${SPRING_DATASOURCE_USERNAME:-}" ] && [ -n "${SPRING_DATASOURCE_PASSWORD:-}" ]; then
    ENCODED_USER="$(printf '%s' "$SPRING_DATASOURCE_USERNAME" | sed 's/@/%40/g; s/:/%3A/g; s/\//%2F/g; s/?/%3F/g; s/#/%23/g')"
    ENCODED_PASS="$(printf '%s' "$SPRING_DATASOURCE_PASSWORD" | sed 's/@/%40/g; s/:/%3A/g; s/\//%2F/g; s/?/%3F/g; s/#/%23/g')"
    DATABASE_URL="$(echo "$DATABASE_URL" | sed "s|postgresql://|postgresql://${ENCODED_USER}:${ENCODED_PASS}@|")"
  fi
  export DATABASE_URL
fi

# Ephemeral verify DB: when the kit's deploy substrate provides a disposable
# CHILD branch DSN, run migrations + tests against IT instead of the shared
# branch. A contract/cleanup story's tests carry migration up/down fixtures; run
# against the shared branch they leave it half-migrated for the next run and the
# build thrashes fighting DB state. Forked off the experiment branch at its
# committed schema, the child gives every verify a clean, isolated DB and is
# deleted after. (Python + Node read DATABASE_URL directly; Java/Spring would
# also need SPRING_DATASOURCE_* overridden , tracked follow-up.)
if [ -n "${VERIFY_DATABASE_URL:-}" ]; then
  echo "Verify DB: running migrations + tests against the ephemeral child branch (isolating migration fixtures)."
  export DATABASE_URL="$VERIFY_DATABASE_URL"
fi

# Detect project language and run pending migrations before tests
if [ -f "$REPO_ROOT/pom.xml" ]; then
  # Java / Maven – export SPRING_DATASOURCE_* for Maven/Spring
  if [ -z "${SPRING_DATASOURCE_URL:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
    SPRING_DATASOURCE_URL="jdbc:$(echo "$DATABASE_URL" | sed 's|^postgresql://[^@]*@|postgresql://|')"
    SPRING_DATASOURCE_USERNAME="${DB_USERNAME:-}"
    SPRING_DATASOURCE_PASSWORD="${DB_PASSWORD:-}"
  fi
  export SPRING_DATASOURCE_URL SPRING_DATASOURCE_USERNAME SPRING_DATASOURCE_PASSWORD
  echo "Running Flyway migrations..."
  if [ -f "$REPO_ROOT/scripts/flyway-migrate.sh" ]; then
    "$REPO_ROOT/scripts/flyway-migrate.sh"
  else
    ./mvnw -q flyway:migrate
  fi
  ./mvnw test "$@"
elif [ -f "$REPO_ROOT/requirements.txt" ] || [ -f "$REPO_ROOT/pyproject.toml" ]; then
  # Python / Alembic + pytest
  if [ -d ".venv" ]; then
    source .venv/bin/activate
  fi
  echo "Running Alembic migrations..."
  uv run alembic upgrade head
  # pytest + httpx live in [project.optional-dependencies].dev in the
  # Python scaffold, so they aren't installed by a default `uv run` /
  # `uv sync`. Without --extra dev, uv falls back to a system pytest
  # that can't see the venv's fastapi etc., and test collection crashes
  # with ModuleNotFoundError. Pass --extra dev so uv resolves against
  # the dev extras for the test invocation.
  #
  # E2E (tests/e2e) is owned by the dedicated Playwright block that enable-e2e
  # appends below (it runs `playwright install chromium` first, then
  # `pytest tests/e2e`). The base full run (no positional args, e.g. the deploy
  # gate's `run-tests.sh`) must NOT collect tests/e2e, or pytest tries to launch
  # a browser before that install ran and the run dies with "Failed to spawn:
  # playwright" before the e2e block is reached. An explicit path arg is honored
  # verbatim (the per-cycle layer runner).
  if [ "$#" -eq 0 ]; then
    # SFTDD_PYTEST_MARKER lets the verify split the suite across ISOLATED ephemeral
    # branches: the main pass runs `not migration`, then a second pass runs
    # `migration`-marked tests on their OWN branch, so a reversibility test's
    # downgrade cannot corrupt the shared verify DB for its siblings. When a marker
    # selects zero tests pytest exits 5 (nothing collected); that is not a failure.
    if [ -n "${SFTDD_PYTEST_MARKER:-}" ]; then
      set +e
      uv run --extra dev pytest --ignore=tests/e2e -m "$SFTDD_PYTEST_MARKER"
      rc=$?
      set -e
      [ "$rc" -eq 5 ] && rc=0
      exit "$rc"
    fi
    uv run --extra dev pytest --ignore=tests/e2e
  else
    uv run --extra dev pytest "$@"
  fi
elif [ -f "$REPO_ROOT/package.json" ]; then
  # Node.js / Knex + Jest
  echo "Running Knex migrations..."
  npx knex migrate:latest
  npm test "$@"
else
  echo "Could not detect project language. Expected pom.xml (Java), pyproject.toml/requirements.txt (Python), or package.json (Node.js)."
  exit 1
fi
