"""T3 / AC3-form-submission-redirects: POST /bugs/create persists the bug and redirects to /bugs/{id}.

Architecture: POST /bugs/create -> 303 redirect -> /bugs/{bugId}. Bug row must exist
in the real Lakebase branch DB after the request. Cleanup deletes the row by ID so
subsequent runs stay idempotent (FK-aware: no child rows in S1).

Design guide compliance (UI track):
  - The redirect target /bugs/{id} must return 200 (detail page exists).
  - Detail page must reference the DM Sans font family token and navy-900 text color
    (design-guide.md: Typography / Color Palette).
"""
import re

import pytest


@pytest.fixture()
def created_bug_id(client, db_session):
    """POST the form, yield the created bug ID, then delete the row."""
    bug_id = None
    try:
        yield lambda: bug_id  # filled in by the test body via nonlocal
    finally:
        if bug_id is not None:
            db_session.execute(
                __import__("sqlalchemy").text("DELETE FROM bugs WHERE id = :id"),
                {"id": bug_id},
            )
            db_session.commit()


def test_form_submission_persists_bug_and_redirects(client, db_session):
    """POST with title + description returns a redirect to /bugs/{numeric-id}."""
    response = client.post(
        "/bugs/create",
        data={
            "title": "Login fails on mobile",
            "description": "When user opens app on iPhone, login page appears blank",
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        follow_redirects=False,
    )

    # Expect a redirect (303 See Other is idiomatic for POST/redirect/GET).
    assert response.status_code in (301, 302, 303), (
        f"Expected redirect after form POST, got {response.status_code}"
    )

    location = response.headers.get("location", "")
    match = re.fullmatch(r".*/bugs/(\d+)/?", location)
    assert match, (
        f"Location header must point to /bugs/{{numeric-id}}, got: {location!r}"
    )

    bug_id = int(match.group(1))

    # Persist check: the row must exist in the real DB.
    from sqlalchemy import text
    row = db_session.execute(
        text("SELECT id, title FROM bugs WHERE id = :id"), {"id": bug_id}
    ).fetchone()
    assert row is not None, f"Bug row id={bug_id} not found in database after POST"
    assert row.title == "Login fails on mobile"

    # Cleanup: remove the test row (no child FK rows in S1).
    db_session.execute(text("DELETE FROM bugs WHERE id = :id"), {"id": bug_id})
    db_session.commit()

    # Design guide: detail page must load and reference DM Sans font token.
    detail = client.get(f"/bugs/{bug_id}")
    assert detail.status_code == 200, (
        f"Detail page /bugs/{bug_id} must return 200 after redirect"
    )
    assert "DM Sans" in detail.text, (
        "Detail page must reference the DM Sans font family token (design-guide.md: Typography)"
    )
