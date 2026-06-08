"""Presentation: Create Bug form page (architecture.md: pages/CreateBugForm)."""

from app.pages._base import base_layout

_FORM_STYLES = """
    .field { margin-bottom: 16px; }
    label {
      display: block;
      font-size: 16px;
      font-weight: 500;
      color: #1B3139;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    input[type="text"], textarea {
      width: 100%;
      background: #FFFFFF;
      border: 1px solid #B2B9C2;
      border-radius: 4px;
      color: #1B3139;
      font-family: "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
      font-size: 15px;
      padding: 12px;
    }
    input[type="text"]:focus, textarea:focus {
      outline: 2px solid #0176D3;
      outline-offset: 0;
    }
    textarea { min-height: 120px; resize: vertical; }
    button[type="submit"] {
      background-color: #FF3621;
      color: #1B3139;
      border: none;
      border-radius: 0;
      font-family: "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
      font-size: 15px;
      font-weight: 600;
      padding: 12px 24px;
      cursor: pointer;
    }
    button[type="submit"]:hover { background-color: #EB1600; }
"""

_BODY = """
    <h1>File a Bug</h1>
    <div class="card">
      <form method="post" action="/bugs">
        <div class="field">
          <label for="title">Title</label>
          <input type="text" id="title" name="title" placeholder="Short summary of the bug" required>
        </div>
        <div class="field">
          <label for="description">Description</label>
          <textarea id="description" name="description" placeholder="Steps to reproduce, expected vs actual behavior"></textarea>
        </div>
        <button type="submit">File Bug</button>
      </form>
    </div>
"""


def render() -> str:
    """Return the full HTML for the Create Bug form."""
    return base_layout("File a Bug", _FORM_STYLES, _BODY)
