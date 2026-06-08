"""T2 - AC2-form-accepts-input: text entered in the title input is captured and
redisplayed in the form.

Layer: E2E (browser). Requires pytest-playwright + a running server on
BASE_URL (default http://localhost:8000).

Design guide compliance (UI track ON, design-guide.md + design-guide.json):
  - Input renders with navy-300 border (#B2B9C2) and focus ring info-blue (#0176D3)
  - Font "DM Sans" is applied to the input element (typography.fontFamily.system)
"""

import os
import pytest
from playwright.sync_api import Page, expect

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")


def test_title_input_captures_and_redisplays_value(page: Page):
    """Typing in the title field stores and shows the value (controlled input)."""
    page.goto(f"{BASE_URL}/bugs/create")

    title_input = page.locator('[name="title"], #title').first
    title_input.fill("Cannot reproduce login failure")

    expect(title_input).to_have_value("Cannot reproduce login failure")


def test_title_input_styled_per_design_guide(page: Page):
    """Title input carries the design-guide border color and font family."""
    page.goto(f"{BASE_URL}/bugs/create")

    title_input = page.locator('[name="title"], #title').first

    border_color = title_input.evaluate(
        "el => getComputedStyle(el).borderColor"
    )
    # navy-300 = #B2B9C2 => browsers normalise to rgb(178, 185, 194)
    assert border_color == "rgb(178, 185, 194)", (
        f"Title input border must be navy-300 (#B2B9C2 / rgb(178,185,194)) "
        f"per design-guide.md Components > Form inputs; got {border_color!r}"
    )

    font_family = title_input.evaluate(
        "el => getComputedStyle(el).fontFamily"
    )
    assert "DM Sans" in font_family, (
        f"Title input font-family must include 'DM Sans' "
        f"per design-guide.md Typography; got {font_family!r}"
    )
