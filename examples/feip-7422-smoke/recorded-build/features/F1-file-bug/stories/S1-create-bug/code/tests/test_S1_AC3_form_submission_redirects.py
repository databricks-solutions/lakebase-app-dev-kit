"""T3 - AC3-form-submission-redirects: submitting the form with title and
description persists the bug and redirects to its detail page.

Layer: E2E (browser + real database). Requires pytest-playwright + a running
server on BASE_URL (default http://localhost:8000).

Design guide compliance (UI track ON, design-guide.md + design-guide.json):
  - Detail page uses bg-page (#F9F7F4) as the page background
  - Bug title is displayed in a card: white bg, navy-200 border (#CCCEDB),
    12px radius (components: Cards)
  - Navbar: navy-900 (#1B3139) bg, 64px height, 2px brand-red bottom border
  - Text is navy-900 (#1B3139)
"""

import os
import re
import pytest
from playwright.sync_api import Page, expect

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")

TITLE = "Login button unresponsive on Firefox"
DESCRIPTION = "Clicking Login does nothing. Console shows TypeError: fetch is not defined."


def test_form_submission_persists_bug_and_redirects_to_detail(page: Page):
    """Fill the form, submit, and land on the bug detail page at /bugs/<id>."""
    page.goto(f"{BASE_URL}/bugs/create")

    page.locator('[name="title"], #title').first.fill(TITLE)
    page.locator('[name="description"], #description').first.fill(DESCRIPTION)
    page.locator('button[type="submit"]').click()

    # Must redirect to /bugs/<integer-id>
    expect(page).to_have_url(re.compile(r"/bugs/\d+$"))

    # Detail page must show the submitted title
    expect(page.locator("body")).to_contain_text(TITLE)


def test_detail_page_styled_per_design_guide(page: Page):
    """After submission the detail page carries the required design tokens."""
    page.goto(f"{BASE_URL}/bugs/create")
    page.locator('[name="title"], #title').first.fill(TITLE)
    page.locator('[name="description"], #description').first.fill(DESCRIPTION)
    page.locator('button[type="submit"]').click()
    expect(page).to_have_url(re.compile(r"/bugs/\d+$"))

    # Page background: bg-page (#F9F7F4 => rgb(249, 247, 244))
    bg = page.evaluate("() => getComputedStyle(document.body).backgroundColor")
    assert bg == "rgb(249, 247, 244)", (
        f"Detail page body background must be bg-page (#F9F7F4 / rgb(249,247,244)) "
        f"per design-guide.md Colors > Surfaces; got {bg!r}"
    )

    # Card border: navy-200 (#CCCEDB => rgb(204, 206, 219))
    card = page.locator(".card").first
    card_border = card.evaluate("el => getComputedStyle(el).borderColor")
    assert card_border == "rgb(204, 206, 219)", (
        f"Detail card border must be navy-200 (#CCCEDB / rgb(204,206,219)) "
        f"per design-guide.md Components > Cards; got {card_border!r}"
    )

    # Card border-radius: 12px
    card_radius = card.evaluate("el => getComputedStyle(el).borderRadius")
    assert card_radius == "12px", (
        f"Detail card border-radius must be 12px (radius.lg) "
        f"per design-guide.md Components > Cards; got {card_radius!r}"
    )
