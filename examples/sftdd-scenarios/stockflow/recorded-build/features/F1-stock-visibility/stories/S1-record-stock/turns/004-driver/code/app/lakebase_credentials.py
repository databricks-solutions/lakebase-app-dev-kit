"""Runtime Lakebase credential minting for the app + migrations.

No DB token is stored in .env. Instead the app mints a short-lived Postgres
credential ON DEMAND from the connection METADATA in the environment
(LAKEBASE_PROJECT_ID, LAKEBASE_BRANCH_ID, LAKEBASE_ENDPOINT), caches it
in-process, and re-mints before it expires. This mirrors the kit's
get-connection.ts / mintCredential seam (the databricks CLI is the single
credential source), so the pattern is identical across languages.
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
import time

# Re-mint a token this many seconds after it was minted. Lakebase database
# credentials live ~1h; 40 min keeps a comfortable margin so a pooled
# connection never presents an expired token (paired with pool_recycle in
# database.py).
_MINT_TTL_SECONDS = 40 * 60

_DEFAULT_ENDPOINT = "primary"

_lock = threading.Lock()
_cached_token: str | None = None
_minted_at: float = 0.0


def endpoint_path_from_env() -> str | None:
    """Build the Lakebase endpoint resource path from env METADATA, or None when
    the metadata needed to mint is absent (so a caller can fall back)."""
    instance = os.getenv("LAKEBASE_PROJECT_ID")
    branch = os.getenv("LAKEBASE_BRANCH_ID")
    if not instance or not branch:
        return None
    endpoint = os.getenv("LAKEBASE_ENDPOINT", _DEFAULT_ENDPOINT)
    return f"projects/{instance}/branches/{branch}/endpoints/{endpoint}"


def _profile_args() -> list[str]:
    profile = os.getenv("DATABRICKS_CONFIG_PROFILE")
    return ["--profile", profile] if profile else []


def _run_databricks(args: list[str]) -> str:
    proc = subprocess.run(
        ["databricks", *args, *_profile_args()],
        capture_output=True,
        text=True,
        check=True,
    )
    return proc.stdout


def mint_token(*, force: bool = False) -> str:
    """Return a valid Lakebase DB token, minting a fresh one via the databricks
    CLI when the cache is empty or near expiry. Thread-safe + cached."""
    global _cached_token, _minted_at
    endpoint = endpoint_path_from_env()
    if endpoint is None:
        raise RuntimeError(
            "Cannot mint a Lakebase credential: LAKEBASE_PROJECT_ID / "
            "LAKEBASE_BRANCH_ID are not set. The post-checkout hook sets them; "
            "otherwise provide DATABASE_URL explicitly."
        )
    with _lock:
        fresh_enough = (
            _cached_token is not None
            and (time.monotonic() - _minted_at) < _MINT_TTL_SECONDS
        )
        if fresh_enough and not force:
            return _cached_token
        raw = _run_databricks(
            ["postgres", "generate-database-credential", endpoint, "-o", "json"]
        )
        token = (json.loads(raw) or {}).get("token")
        if not token:
            raise RuntimeError(
                f"generate-database-credential returned no token for {endpoint}"
            )
        _cached_token = token
        _minted_at = time.monotonic()
        return token


def current_user() -> str:
    """The Lakebase user (email). Prefer the DB_USERNAME metadata; fall back to
    `databricks current-user me`."""
    user = os.getenv("DB_USERNAME")
    if user:
        return user
    raw = _run_databricks(["current-user", "me", "-o", "json"])
    me = json.loads(raw) or {}
    emails = me.get("emails") or []
    return me.get("userName") or (emails[0].get("value") if emails else "") or ""
