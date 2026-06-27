"""Shared fixtures for E2E (Playwright) tests , the canonical `live_server`.

Starts the app with `uvicorn app.main:app` on a local port and yields its base
URL, tearing it down after the session.

Two things this fixture gets right, because hand-rolled versions get them wrong
and break in CI (every `page.goto` then fails with ERR_CONNECTION_REFUSED):

1. It inherits the PROCESS environment and does NOT pass `--env-file .env`. In CI
   the database connection (DATABASE_URL / LAKEBASE_*) is provided by the
   workflow as real env vars; the app loads its own `.env` when one is present
   (see app.database). Forcing `--env-file .env` would let a stale or absent
   committed `.env` shadow the CI creds, so the app crashes on startup and
   nothing listens on the port. Inheriting the env makes the CI creds win
   locally-and-in-CI alike (dev/prod parity).
2. It POLLS for readiness (HTTP GET until the server answers) instead of a fixed
   `time.sleep`, and surfaces the server's own stdout/stderr when it never comes
   up , so a startup failure is diagnosable instead of a bare connection error.

Override the port with E2E_PORT and the readiness timeout with E2E_READY_TIMEOUT.
Write your E2E specs against the `live_server` fixture; do not replace this file.
"""

import os
import subprocess
import tempfile
import time
import urllib.request

import pytest

_HOST = "127.0.0.1"
_PORT = int(os.environ.get("E2E_PORT", "8765"))
_READY_TIMEOUT_S = float(os.environ.get("E2E_READY_TIMEOUT", "30"))


def _is_up(url: str) -> bool:
    """True once the server answers (any HTTP status < 500 means it's listening)."""
    try:
        with urllib.request.urlopen(url, timeout=1) as resp:
            return resp.status < 500
    except urllib.error.HTTPError as exc:  # noqa: PERF203 - a 4xx still means it's up
        return exc.code < 500
    except Exception:
        return False


@pytest.fixture(scope="session")
def live_server():
    base = f"http://{_HOST}:{_PORT}"
    # Capture the server's output to a temp file (NOT a PIPE: a long-lived server
    # with a full PIPE buffer would deadlock). We read it back only on failure.
    log = tempfile.NamedTemporaryFile(
        prefix="e2e-uvicorn-", suffix=".log", mode="w+", delete=False
    )

    def _tail() -> str:
        try:
            log.flush()
            with open(log.name, encoding="utf-8", errors="replace") as fh:
                return fh.read()[-4000:]
        except OSError:
            return "(no server output captured)"

    # Inherit os.environ so CI's DATABASE_URL / LAKEBASE_* are used; deliberately
    # NO --env-file (see the module docstring). The app loads .env itself when present.
    proc = subprocess.Popen(
        ["uv", "run", "uvicorn", "app.main:app", "--host", _HOST, "--port", str(_PORT)],
        stdout=log,
        stderr=subprocess.STDOUT,
        env=os.environ.copy(),
    )

    deadline = time.monotonic() + _READY_TIMEOUT_S
    while True:
        if proc.poll() is not None:
            raise RuntimeError(
                f"live_server: uvicorn exited early (code {proc.returncode}) before "
                f"becoming reachable at {base}.\n--- server output ---\n{_tail()}"
            )
        if _is_up(base + "/"):
            break
        if time.monotonic() >= deadline:
            proc.terminate()
            raise RuntimeError(
                f"live_server: app not reachable at {base} within {_READY_TIMEOUT_S}s.\n"
                f"--- server output ---\n{_tail()}"
            )
        time.sleep(0.25)

    try:
        yield base
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        log.close()
