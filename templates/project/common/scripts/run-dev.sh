#!/usr/bin/env bash
# Run the application locally so a human can open it in a browser and review it.
# Detects the project language, applies pending migrations against the current
# branch's database (from .env, written by the post-checkout hook), then starts
# the dev server with hot-reload. Ctrl-C to stop.
#
# Usage: ./scripts/run-dev.sh [extra args passed to the server]
#   PORT  override the listen port (default 8000 for Python/Node, 8080 for Java)
#   HOST  override the bind host (default 127.0.0.1)
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

HOST="${HOST:-127.0.0.1}"

# Detect project language, migrate, then serve with hot-reload.
if [ -f "$REPO_ROOT/pom.xml" ]; then
  # Java / Maven + Spring Boot
  PORT="${PORT:-8080}"
  echo "Serving on http://${HOST}:${PORT}  (Ctrl-C to stop). Open it in your browser."
  ./mvnw spring-boot:run -Dspring-boot.run.arguments="--server.port=${PORT} --server.address=${HOST}" "$@"
elif [ -f "$REPO_ROOT/requirements.txt" ] || [ -f "$REPO_ROOT/pyproject.toml" ]; then
  # Python / Alembic + FastAPI (uvicorn)
  PORT="${PORT:-8000}"
  if [ -d ".venv" ]; then
    # shellcheck source=/dev/null
    source .venv/bin/activate
  fi
  echo "Running Alembic migrations..."
  uv run alembic upgrade head
  echo "Serving on http://${HOST}:${PORT}  (Ctrl-C to stop). Open it in your browser."
  uv run uvicorn app.main:app --reload --host "$HOST" --port "$PORT" "$@"
elif [ -f "$REPO_ROOT/package.json" ]; then
  # Node.js – prefer a "dev" script, fall back to "start".
  PORT="${PORT:-8000}"
  export PORT HOST
  echo "Serving (PORT=${PORT})  (Ctrl-C to stop). Open it in your browser."
  if node -e "process.exit(require('./package.json').scripts && require('./package.json').scripts.dev ? 0 : 1)" 2>/dev/null; then
    npm run dev -- "$@"
  else
    npm start -- "$@"
  fi
else
  echo "Could not detect project language. Expected pom.xml (Java), pyproject.toml/requirements.txt (Python), or package.json (Node.js)."
  exit 1
fi
