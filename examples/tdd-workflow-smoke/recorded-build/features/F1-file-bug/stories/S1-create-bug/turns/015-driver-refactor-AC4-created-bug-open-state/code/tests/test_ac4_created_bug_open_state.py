"""T4 / AC4-created-bug-open-state: detail page for a newly created bug shows status "open".

NFR R2: a bug's status is always one of the recognized states; an unrecognized status
is rejected at write time, never stored. The detail page is the outer-boundary proof
that "open" was stored and is rendered.

Design guide compliance (UI track):
  - Status must be rendered as a pill (design-guide.md: Components / Status pill):
    pill radius 9999px, text-xs uppercase, semantic color background, navy-900 text.
  - Color alone must not convey state -- the text label "OPEN" must be present
    (design-guide.md: Semantic colors note + accessibility constraint).
"""
import re

import pytest
from sqlalchemy import text


@pytest.fixture()
def seeded_bug_id(client, db_session):
    """Create a bug via the API, yield its ID, then clean up."""
    response = client.post(
        "/bugs/create",
        data={
            "title": "Open state smoke test",
            "description": "Verifies newly created bug has status open",
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        follow_redirects=False,
    )
    assert response.status_code in (301, 302, 303), (
        f"Fixture prerequisite: expected redirect from POST /bugs/create, got {response.status_code}"
    )
    location = response.headers.get("location", "")
    match = re.search(r"/bugs/(\d+)", location)
    assert match, f"Could not parse bug ID from Location: {location!r}"
    bug_id = int(match.group(1))

    yield bug_id

    db_session.execute(text("DELETE FROM bugs WHERE id = :id"), {"id": bug_id})
    db_session.commit()


def test_newly_created_bug_shows_open_status_on_detail_page(client, seeded_bug_id):
    """GET /bugs/{id} for a newly created bug renders the status as 'open'."""
    response = client.get(f"/bugs/{seeded_bug_id}")

    assert response.status_code == 200, (
        f"Expected 200 from GET /bugs/{seeded_bug_id}, got {response.status_code}"
    )

    html = response.text

    # NFR R2: the stored status must be the recognized value "open".
    # Design guide: status pill renders uppercase text label (text-xs uppercase).
    assert "OPEN" in html.upper(), (
        "Detail page must display the status 'open' (case-insensitive match; "
        "design guide requires uppercase pill label)"
    )

    # Design guide: status pill must be present -- the word rendered as a discrete
    # element, not just somewhere in a paragraph of text.  A data-testid or a
    # role="status" attribute is the lightest contract that survives styling changes.
    assert (
        'data-testid="status-pill"' in html or 'role="status"' in html
    ), (
        "Status must be in a labelled element (data-testid='status-pill' or "
        "role='status') per design guide pill component contract"
    )
