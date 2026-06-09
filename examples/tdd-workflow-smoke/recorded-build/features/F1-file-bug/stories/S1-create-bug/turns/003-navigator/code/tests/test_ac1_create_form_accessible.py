"""T1 / AC1-create-form-accessible: GET /bugs/create returns a form with title and description inputs.

Design guide compliance (UI track):
  - Labels must be uppercase (design-guide.md: Form labels: text-md, navy-900, uppercase).
  - Font family must reference DM Sans (design-guide.md: Typography).
"""


def test_create_bug_form_is_accessible(client):
    """GET /bugs/create responds 200 with a form containing title and description inputs."""
    response = client.get("/bugs/create")

    assert response.status_code == 200, "Expected HTTP 200 from GET /bugs/create"

    html = response.text
    assert 'name="title"' in html, "Form must include an input with name='title'"
    assert 'name="description"' in html, "Form must include an input with name='description'"

    # Design guide: form labels are uppercase (text-md, navy-900, uppercase).
    # Check the rendered label text, not CSS, so this stays an outer-boundary assertion.
    assert "TITLE" in html, "Label for title must be uppercase per design guide"
    assert "DESCRIPTION" in html, "Label for description must be uppercase per design guide"
