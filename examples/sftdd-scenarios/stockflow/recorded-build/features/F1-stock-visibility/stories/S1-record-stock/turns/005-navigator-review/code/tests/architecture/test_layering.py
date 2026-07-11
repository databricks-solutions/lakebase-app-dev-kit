"""AC2-file-new-stock-confirmed / T2: architectural fitness for the canonical
layering contract (architecture.json): the api boundary (app/routes/) must
NOT import the DB session, and persistence must be confined to the
repository (app/repositories/), the ONLY ORM/session layer.
"""

import ast
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ROUTES_DIR = REPO_ROOT / "app" / "routes"
REPOSITORIES_DIR = REPO_ROOT / "app" / "repositories"

_FORBIDDEN_DB_SESSION_NAMES = {"Session", "SessionLocal", "db", "get_db", "session"}


def _imported_names(py_file: Path) -> set[str]:
    tree = ast.parse(py_file.read_text(), filename=str(py_file))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                names.add(alias.asname or alias.name)
    return names


def test_repository_module_exists_for_persistence():
    assert REPOSITORIES_DIR.is_dir(), (
        "app/repositories/ must exist; persistence is confined to the "
        "repository layer per architecture.json"
    )
    modules = [f for f in REPOSITORIES_DIR.glob("*.py") if f.name != "__init__.py"]
    assert modules, "app/repositories/ exists but has no repository module"


def test_boundary_module_does_not_import_db_session():
    assert ROUTES_DIR.is_dir(), "app/routes/ must exist as the api boundary layer"
    modules = [f for f in ROUTES_DIR.glob("*.py") if f.name != "__init__.py"]
    assert modules, "app/routes/ exists but has no boundary module"

    for py_file in modules:
        offending = _imported_names(py_file) & _FORBIDDEN_DB_SESSION_NAMES
        assert not offending, (
            f"{py_file.relative_to(REPO_ROOT)} imports {offending}; the "
            "boundary must not import the DB session directly, persistence "
            "belongs in app/repositories/"
        )
