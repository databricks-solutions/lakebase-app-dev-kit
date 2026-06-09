"""FastAPI application entry point."""

from fastapi import FastAPI, Form, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models import Bug

app = FastAPI(title="bug-tracker-ff-20260608-235044", version="0.1.0")

_PAGE_SHELL = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{page_title}</title>
  <style>
    body {{
      font-family: "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
      background-color: #F9F7F4;
      color: #1B3139;
      margin: 0;
      padding: 0;
    }}
    nav {{
      background-color: #1B3139;
      height: 64px;
      border-bottom: 2px solid #FF3621;
      display: flex;
      align-items: center;
      padding: 0 32px;
    }}
    nav a {{ color: #FFFFFF; text-decoration: none; font-size: 16px; }}
    main {{
      max-width: 960px;
      margin: 32px auto;
      padding: 0 16px;
    }}
    h1 {{ font-size: 29px; line-height: 1.25; margin-bottom: 24px; }}
    .card {{
      background: #FFFFFF;
      border: 1px solid #CCCEDB;
      border-radius: 12px;
      box-shadow: 0 4px 8px rgba(27,49,57,0.12);
      padding: 20px;
    }}
    .field {{ margin-bottom: 16px; }}
    label {{
      display: block;
      font-size: 16px;
      color: #1B3139;
      text-transform: uppercase;
      margin-bottom: 8px;
    }}
    input[type="text"], textarea {{
      width: 100%;
      box-sizing: border-box;
      background: #FFFFFF;
      border: 1px solid #B2B9C2;
      border-radius: 4px;
      color: #1B3139;
      font-size: 15px;
      padding: 12px;
      font-family: inherit;
    }}
    input[type="text"]:focus, textarea:focus {{
      outline: 2px solid #0176D3;
    }}
    .input-error {{ border-color: #FF3621 !important; }}
    .field-error {{
      color: #FF3621;
      font-size: 13px;
      margin-top: 4px;
    }}
    button[type="submit"] {{
      background: #FF3621;
      color: #FFFFFF;
      border: none;
      border-radius: 0;
      font-size: 16px;
      padding: 12px 24px;
      cursor: pointer;
    }}
    button[type="submit"]:hover {{ background: #EB1600; }}
    .status-pill {{
      display: inline-block;
      padding: 2px 10px;
      border-radius: 9999px;
      font-size: 10px;
      text-transform: uppercase;
      background: #2E844A;
      color: #1B3139;
    }}
    .detail-row {{
      margin-bottom: 16px;
    }}
    .detail-label {{
      font-size: 13px;
      color: #666D7A;
      text-transform: uppercase;
      margin-bottom: 4px;
    }}
    .detail-value {{
      font-size: 15px;
      color: #1B3139;
      line-height: 1.5;
    }}
  </style>
</head>
<body>
  <nav><a href="/">Bug Tracker</a></nav>
  <main>
    <h1>{heading}</h1>
    <div class="card">
      {body}
    </div>
  </main>
</body>
</html>"""


def _page(title: str, heading: str, body: str) -> str:
    return _PAGE_SHELL.format(page_title=title, heading=heading, body=body)


def _render_create_form(title: str = "", desc_error: str = "") -> str:
    title_val = title.replace('"', "&quot;")
    error_html = (
        '<p class="field-error" role="alert">description is required</p>'
        if desc_error else ""
    )
    desc_class = ' class="input-error"' if desc_error else ""
    body = (
        f'<form method="POST" action="/bugs/create">'
        f'<div class="field">'
        f'<label for="title">TITLE</label>'
        f'<input type="text" id="title" name="title" value="{title_val}" required />'
        f'</div>'
        f'<div class="field">'
        f'<label for="description">DESCRIPTION</label>'
        f'<textarea id="description" name="description" rows="5"{desc_class} required></textarea>'
        f'{error_html}'
        f'</div>'
        f'<button type="submit">Submit</button>'
        f'</form>'
    )
    return _page("File a Bug", "File a Bug", body)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/bugs/create", response_class=HTMLResponse)
def create_bug_form():
    return _render_create_form()


@app.post("/bugs/create")
async def submit_bug_form(
    title: Optional[str] = Form(default=None),
    description: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
):
    if not description or not description.strip():
        return HTMLResponse(
            content=_render_create_form(title=title or "", desc_error="required"),
            status_code=200,
        )
    bug = Bug(title=title.strip(), description=description.strip(), status="open")
    db.add(bug)
    db.commit()
    db.refresh(bug)
    return RedirectResponse(url=f"/bugs/{bug.id}", status_code=303)


@app.get("/bugs/{bug_id}", response_class=HTMLResponse)
def bug_detail(bug_id: int, db: Session = Depends(get_db)):
    bug = db.query(Bug).filter(Bug.id == bug_id).first()
    if bug is None:
        body = (
            '<div style="text-align:center;padding:32px;">'
            '<p style="font-size:20px;color:#666D7A;">Bug not found</p>'
            '</div>'
        )
        return HTMLResponse(content=_page(f"Bug #{bug_id}", f"Bug #{bug_id}", body), status_code=200)
    body = (
        f'<div class="detail-row">'
        f'<div class="detail-label">Title</div>'
        f'<div class="detail-value">{bug.title}</div>'
        f'</div>'
        f'<div class="detail-row">'
        f'<div class="detail-label">Description</div>'
        f'<div class="detail-value">{bug.description}</div>'
        f'</div>'
        f'<div class="detail-row">'
        f'<div class="detail-label">Status</div>'
        f'<div class="detail-value"><span class="status-pill">{bug.status}</span></div>'
        f'</div>'
    )
    return _page(f"Bug #{bug.id}", f"Bug #{bug.id}", body)
