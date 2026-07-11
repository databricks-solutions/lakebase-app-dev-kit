"""AC2-file-new-stock-confirmed / T12: NFR-F1-field-named-validation. An
invalid filing (e.g. a negative quantity) returns a clear, field-named inline
error naming the offending field ("quantity"), not a bare 400. Owned at the
API boundary. Real-branch integration.
"""

import uuid


def test_invalid_filing_returns_a_field_named_error_not_a_bare_bad_request(client):
    sku = f"SKU-VAL-{uuid.uuid4().hex[:8]}"
    location = f"LOC-VAL-{uuid.uuid4().hex[:8]}"

    response = client.post(
        "/api/stock-records",
        json={
            "sku": sku,
            "location": location,
            "quantity": -1,
            "inventory_code": "INV-BAD",
        },
    )

    assert response.status_code in (400, 422), (
        "expected the boundary to reject a negative quantity with a "
        f"validation error, got {response.status_code}: {response.text}"
    )
    body = response.json()
    body_text = str(body).lower()
    assert "quantity" in body_text, (
        "the validation error must name the offending field ('quantity'), "
        f"not a bare bad-request body: {body!r}"
    )
    assert body_text.strip() not in ("bad request", "{'detail': 'bad request'}"), (
        f"a bare 'bad request' body is not field-named validation: {body!r}"
    )
