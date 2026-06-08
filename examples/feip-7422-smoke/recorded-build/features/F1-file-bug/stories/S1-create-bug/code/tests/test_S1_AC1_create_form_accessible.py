"""T1 - AC1-create-form-accessible: form with title and description fields is
displayed when user navigates to /bugs/create.

Design guide compliance (UI track ON, design-guide.md + design-guide.json):
  - Font family: "DM Sans" (typography.fontFamily.system)
  - Form inputs: navy-300 border (#B2B9C2), 4px radius (components: Form inputs)
  - Primary submit button: brand-red (#FF3621), sharp corners radius 0 (components: Buttons)
  - Page background: bg-page (#F9F7F4) (colors.surfaces.page)
  - Navbar: navy-900 (#1B3139) background, 64px height, brand-red 2px bottom border
"""


def test_create_bug_form_is_accessible(client):
    """GET /bugs/create returns 200 and renders a form with title and description
    inputs styled per the design guide."""
    response = client.get("/bugs/create")

    assert response.status_code == 200, (
        "GET /bugs/create must return HTTP 200; got %d" % response.status_code
    )
    html = response.text

    # Form fields - title and description inputs must be present
    assert 'name="title"' in html or 'id="title"' in html, (
        "Response HTML must contain a title input field"
    )
    assert 'name="description"' in html or 'id="description"' in html, (
        "Response HTML must contain a description input/textarea field"
    )

    # Design guide - Typography: DM Sans font family must be referenced
    assert "DM Sans" in html, (
        "Response HTML must reference 'DM Sans' font per design-guide.md Typography"
    )

    # Design guide - Buttons: primary submit uses brand-red (#FF3621)
    assert "#FF3621" in html, (
        "Response HTML must reference brand-red (#FF3621) for the primary submit button "
        "per design-guide.md Components > Buttons"
    )

    # Design guide - Components > Form inputs: navy-300 border (#B2B9C2)
    assert "#B2B9C2" in html, (
        "Response HTML must reference navy-300 (#B2B9C2) as the form input border color "
        "per design-guide.md Components > Form inputs"
    )
