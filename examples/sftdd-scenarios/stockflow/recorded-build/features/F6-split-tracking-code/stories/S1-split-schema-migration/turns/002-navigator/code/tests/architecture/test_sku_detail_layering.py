"""AC1-detail-lists-all-locations / T20: architectural fitness for the SKU
detail read path layering contract (architecture.json). The WHERE
sku=:sku scoping and the per-location entry set must be produced by the
repository query alone (the (sku, location) UNIQUE constraint already
guarantees one row per location); the api boundary (app/routes/) must
contain no per-SKU filtering or location-grouping logic of its own.
"""

import ast
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ROUTES_DIR = REPO_ROOT / "app" / "routes"
REPOSITORY_FILE = REPO_ROOT / "app" / "repositories" / "stock_repository.py"

_FORBIDDEN_BOUNDARY_PATTERNS = ("sku ==", "sku==", "groupby", "defaultdict")


def _repository_module_source() -> str:
    return REPOSITORY_FILE.read_text()


def _function_filters_on_sku(tree: ast.Module, func_name: str) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == func_name:
            dumped = ast.dump(node)
            return "sku" in dumped and "Compare" in dumped
    return False


def test_sku_detail_layering_contract():
    assert REPOSITORY_FILE.is_file(), (
        "app/repositories/stock_repository.py must exist; persistence and "
        "read scoping are confined to the repository layer per "
        "architecture.json"
    )

    from app.repositories import stock_repository

    sku_scoped_candidates = [
        name
        for name in dir(stock_repository)
        if callable(getattr(stock_repository, name)) and "sku" in name.lower()
    ]
    assert sku_scoped_candidates, (
        "expected app/repositories/stock_repository.py to expose a "
        "sku-scoped query function (e.g. list_stock_records_for_sku); found "
        "none, so the WHERE sku=:sku scoping for the SKU detail read path "
        "is not yet owned by the repository"
    )

    tree = ast.parse(_repository_module_source())
    assert any(
        _function_filters_on_sku(tree, name) for name in sku_scoped_candidates
    ), (
        "the repository's sku-detail query function must filter on "
        "StockRecord.sku; the WHERE sku=:sku scoping belongs to the "
        "repository query alone, never the boundary or service"
    )

    assert ROUTES_DIR.is_dir(), "app/routes/ must exist as the api boundary layer"
    boundary_modules = [f for f in ROUTES_DIR.glob("*.py") if f.name != "__init__.py"]
    assert boundary_modules, "app/routes/ exists but has no boundary module"

    for py_file in boundary_modules:
        source = py_file.read_text()
        offending = [
            pattern for pattern in _FORBIDDEN_BOUNDARY_PATTERNS if pattern in source
        ]
        assert not offending, (
            f"{py_file.relative_to(REPO_ROOT)} contains {offending}; per-SKU "
            "filtering and per-location grouping belong to the repository "
            "query alone, not the boundary"
        )
