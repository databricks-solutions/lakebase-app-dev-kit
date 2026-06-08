"""T4 - AC4-created-bug-open-state: newly created bug displays status "open"
on the detail page.

Layer: E2E (browser + real database). Requires pytest-playwright + a running
server on BASE_URL (default http://localhost:8000).

NFR compliance:
  - R2: status stored is always a recognized value; "open" is the initial state
    (architecture.md Decisions > Status field initialization)

Design guide compliance (UI track ON, design-guide.md + design-guide.json):
  - Status pill: pill radius 9999px, text-xs (10px) uppercase, semantic success
    background (#2E844A => rgb(46,132,74)), navy-900 text (#1B3139)
  - Color alone never conveys state: the text label "open" must be visible in
    the DOM (design-guide.md Components > Status pill)
"""

import os
import re
import pytest
from playwright.sync_api import Page, expect

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")


def _create_bug(page: Page, title: str, description: str = "repro steps") -> None:
    """Helper: submit the create form and wait for the detail redirect."""
    page.goto(f"{BASE_URL}/bugs/create")
    page.locator('[name="title"], #title').first.fill(title)
    page.locator('[name="description"], #description').first.fill(description)
    page.locator('button[type="submit"]').click()
    expect(page).to_have_url(re.compile(r"/bugs/\d+$"))


def test_newly_created_bug_shows_status_open(page: Page):
    """Status 'open' must be present in the DOM on the detail page (R2 + design guide)."""
    _create_bug(page, "Sidebar collapses on page refresh")

    status_pill = page.locator(".status-pill").first
    expect(status_pill).to_be_visible()

    # Text content of the element must carry the word "open" regardless of CSS casing
    raw_text = status_pill.inner_text().strip().lower()
    assert raw_text == "open", (
        f"Status pill text must be 'open' for a newly created bug (R2 + AC4); "
        f"got {raw_text!r}"
    )


def test_open_status_pill_styled_per_design_guide(page: Page):
    """Status pill carries the semantic success color, pill radius, and text-xs size."""
    _create_bug(page, "Sidebar collapses on page refresh - styling check")

    pill = page.locator(".status-pill").first

    # Semantic success background: #2E844A => rgb(46, 132, 74)
    bg = pill.evaluate("el => getComputedStyle(el).backgroundColor")
    assert bg == "rgb(46, 132, 74)", (
        f"Open status pill background must be success (#2E844A / rgb(46,132,74)) "
        f"per design-guide.md Components > Status pill; got {bg!r}"
    )

    # navy-900 text: #1B3139 => rgb(27, 49, 57)
    color = pill.evaluate("el => getComputedStyle(el).color")
    assert color == "rgb(27, 49, 57)", (
        f"Status pill text must be navy-900 (#1B3139 / rgb(27,49,57)) "
        f"per design-guide.md Components > Status pill; got {color!r}"
    )

    # pill radius: 9999px
    radius = pill.evaluate("el => getComputedStyle(el).borderRadius")
    assert radius == "9999px", (
        f"Status pill border-radius must be 9999px (radius.pill) "
        f"per design-guide.md Components > Status pill; got {radius!r}"
    )

    # text-xs: 10px
    font_size = pill.evaluate("el => getComputedStyle(el).fontSize")
    assert font_size == "10px", (
        f"Status pill font-size must be 10px (text-xs) "
        f"per design-guide.md Components > Status pill; got {font_size!r}"
    )
