"""Presentation: Bug detail page."""

from app.models import Bug
from app.pages._base import base_layout

_DETAIL_STYLES = """
    .label {
      font-size: 13px;
      color: #7F8590;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .value {
      font-size: 15px;
      color: #1B3139;
      margin-bottom: 16px;
    }
    .status-pill {
      display: inline-block;
      background: #2E844A;
      color: #1B3139;
      font-size: 10px;
      text-transform: uppercase;
      border-radius: 9999px;
      padding: 2px 8px;
    }
"""


def render(bug: Bug) -> str:
    """Return the full HTML for the bug detail page."""
    body = f"""
    <h1>Bug #{bug.id}</h1>
    <div class="card">
      <div class="label">Title</div>
      <div class="value">{bug.title}</div>
      <div class="label">Description</div>
      <div class="value">{bug.description or ""}</div>
      <div class="label">Status</div>
      <div class="value"><span class="status-pill">{bug.status}</span></div>
    </div>
"""
    return base_layout(f"Bug #{bug.id}", _DETAIL_STYLES, body)
