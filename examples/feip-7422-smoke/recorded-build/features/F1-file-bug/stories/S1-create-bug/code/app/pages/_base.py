"""Shared base layout and design-guide tokens for all HTML pages."""

_FONT_LINK = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">'
)

# Base styles: reset, typography, surfaces, nav, layout, card.
# Every page includes these; page-specific rules are passed via extra_styles.
BASE_STYLES = """
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
      background-color: #F9F7F4;
      color: #1B3139;
    }
    nav {
      background-color: #1B3139;
      height: 64px;
      border-bottom: 2px solid #FF3621;
      display: flex;
      align-items: center;
      padding: 0 32px;
    }
    nav span { color: #FFFFFF; font-size: 16px; font-weight: 600; }
    main { max-width: 960px; margin: 32px auto; padding: 0 16px; }
    h1 { font-size: 24px; margin-bottom: 24px; color: #1B3139; }
    .card {
      background: #FFFFFF;
      border: 1px solid #CCCEDB;
      border-radius: 12px;
      padding: 20px;
    }
"""


def base_layout(title: str, extra_styles: str, body_content: str) -> str:
    """Wrap page content in the shared shell (doctype, head, nav, main)."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  {_FONT_LINK}
  <style>
    {BASE_STYLES}
    {extra_styles}
  </style>
</head>
<body>
  <nav><span>Bug Tracker</span></nav>
  <main>
    {body_content}
  </main>
</body>
</html>"""
