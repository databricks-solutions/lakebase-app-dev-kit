"""T2 / AC2-form-accepts-input: submitted title value is redisplayed in the form.

POST /bugs/create with a title but no description triggers a validation re-render;
the re-rendered form must echo back the submitted title value so the user does not
lose their work. This exercises the server-side form-accept-input contract at the
API boundary without a browser runtime.

Design guide compliance (UI track):
  - Validation re-render must follow the "No silent failures" principle:
    inline error message under the missing field (design-guide.md: User Feedback).
  - Error text must use semantic error color token (#FF3621) or an explicit
    error indicator -- color alone must not be the only signal (accessibility).
"""


def test_submitted_title_is_redisplayed_after_validation_error(client):
    """POST /bugs/create with title only re-renders the form with the title value preserved."""
    response = client.post(
        "/bugs/create",
        data={"title": "Login fails on mobile"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        follow_redirects=False,
    )

    # Missing description triggers a validation error: 200 re-render, not a redirect.
    assert response.status_code == 200, (
        "Validation error should re-render the form (200), not redirect"
    )

    html = response.text
    # The submitted title value must appear in the title input so the user
    # does not lose their work.
    assert 'value="Login fails on mobile"' in html, (
        "Submitted title must be echoed back in the title input field"
    )

    # Design guide: no silent failures -- a description error must be named explicitly.
    assert "description" in html.lower(), (
        "Re-rendered form must include an explicit error referencing the description field"
    )
