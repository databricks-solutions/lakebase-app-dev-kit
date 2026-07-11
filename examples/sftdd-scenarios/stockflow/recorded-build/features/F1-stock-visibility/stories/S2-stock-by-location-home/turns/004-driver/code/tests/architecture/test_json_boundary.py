"""AC1-record-form-displayed / T4: NFR-F1-spa-json-boundary. Filing a stock
record returns a JSON response body from the api boundary, never
server-rendered HTML (boundary renders_via: react). Real-branch integration
(the SPA/JSON contract is only meaningful once the write actually succeeds).
"""

import uuid

from sqlalchemy import text


def test_filing_a_stock_record_returns_json_not_server_rendered_html(client, db_session):
    sku = f"SKU-JSON-{uuid.uuid4().hex[:8]}"
    location = f"LOC-JSON-{uuid.uuid4().hex[:8]}"

    try:
        response = client.post(
            "/api/stock-records",
            json={
                "sku": sku,
                "location": location,
                "quantity": 3,
                "inventory_code": "INV-JSON-1",
            },
        )

        assert response.status_code in (200, 201), (
            "expected a successful save confirmation from the api boundary, "
            f"got {response.status_code}: {response.text}"
        )
        content_type = response.headers.get("content-type", "")
        assert content_type.startswith("application/json"), (
            "the boundary must return JSON, not server-rendered HTML "
            f"(got content-type={content_type!r})"
        )
        assert "<html" not in response.text.lower()
        body = response.json()
        assert isinstance(body, dict)
    finally:
        # Best-effort, FK-aware targeted-delete cleanup scoped to this test's
        # own rows; never masks a real assertion failure above (e.g. before
        # stock_records exists, cleanup itself would raise).
        try:
            db_session.execute(
                text("DELETE FROM stock_records WHERE sku = :sku AND location = :location"),
                {"sku": sku, "location": location},
            )
            db_session.commit()
        except Exception:
            db_session.rollback()
