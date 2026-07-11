"""SQLAlchemy database engine and session.

Connection credentials are minted at RUNTIME, never stored in .env: the engine
is built from connection METADATA (LAKEBASE_HOST, LAKEBASE_PROJECT_ID,
LAKEBASE_BRANCH_ID, DB_USERNAME) and a `do_connect` event injects a freshly
minted, short-lived Lakebase token as the password on every physical
connection. Pooled connections are recycled well under the token lifetime, so
a connection never carries an expired credential.

An explicit DATABASE_URL (a CI secret, Docker, or the ephemeral-verify DSN the
deploy substrate exports) OVERRIDES this and is used verbatim.
"""

import os
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app import lakebase_credentials

# Load .env from repo root so the connection metadata is available regardless of
# how the process is started (uvicorn directly, pytest, etc.). override=False
# means explicitly-set env vars (CI secrets, Docker --env) always win.
load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)

DB_NAME = os.getenv("DB_NAME", "databricks_postgres")
# Recycle pooled connections well under the Lakebase token lifetime (~1h) so a
# pooled connection never presents an expired credential; do_connect re-mints
# a fresh token on each new physical connect.
_POOL_RECYCLE_SECONDS = 30 * 60


def _normalize_url(url: str) -> str:
    """Force the psycopg driver + sslmode=require on a postgresql URL."""
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    if "sslmode" not in url:
        url += "?sslmode=require" if "?" not in url else "&sslmode=require"
    return url


def resolved_url() -> str:
    """A connection URL STRING for tools that want one (alembic offline mode +
    logging). Never contains a token: it is the explicit DATABASE_URL override,
    or the password-less metadata URL."""
    explicit = os.getenv("DATABASE_URL")
    if explicit:
        return _normalize_url(explicit)
    host = os.getenv("LAKEBASE_HOST") or os.getenv("DB_HOST") or "localhost"
    user = os.getenv("DB_USERNAME", "")
    userpart = f"{quote_plus(user)}@" if user else ""
    return f"postgresql+psycopg://{userpart}{host}:5432/{DB_NAME}?sslmode=require"


def make_engine(**kwargs) -> Engine:
    """Build the SQLAlchemy engine.

    Priority:
      1. Explicit DATABASE_URL (verbatim; CI / Docker / ephemeral-verify) , no minting.
      2. Metadata + runtime token minting (the default for a scaffolded project).
      3. Local fallback (localhost) for pure-local dev with no Lakebase metadata.
    """
    explicit = os.getenv("DATABASE_URL")
    if explicit:
        return create_engine(_normalize_url(explicit), pool_pre_ping=True, **kwargs)

    host = os.getenv("LAKEBASE_HOST") or os.getenv("DB_HOST")
    endpoint = lakebase_credentials.endpoint_path_from_env()
    if host and endpoint:
        user = os.getenv("DB_USERNAME") or lakebase_credentials.current_user()
        # Password-less URL; do_connect injects a freshly-minted token per connect.
        url = f"postgresql+psycopg://{quote_plus(user)}@{host}:5432/{DB_NAME}?sslmode=require"
        engine = create_engine(
            url, pool_pre_ping=True, pool_recycle=_POOL_RECYCLE_SECONDS, **kwargs
        )

        @event.listens_for(engine, "do_connect")
        def _inject_token(_dialect, _conn_rec, _cargs, cparams):
            cparams["password"] = lakebase_credentials.mint_token()

        return engine

    # Local fallback: no Lakebase metadata and no explicit URL.
    return create_engine(
        _normalize_url(f"postgresql+psycopg://{host or 'localhost'}:5432/{DB_NAME}"),
        pool_pre_ping=True,
        **kwargs,
    )


# Back-compat export: a connection URL string with NO token (see resolved_url).
DATABASE_URL = resolved_url()
engine = make_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
