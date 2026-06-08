"""FastAPI application entry point. Route handlers only; rendering delegates to app/pages/."""

from fastapi import FastAPI, Form, Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.repositories.bug_repository import BugRepository
from app.services.bug_service import BugService
from app.pages import create_bug_form, bug_detail

app = FastAPI(title="bug-tracker-20260608-133114", version="0.1.0")


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    """Return 422 with a field-naming message for validation failures (nfrs.md Preferences)."""
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/bugs/create", response_class=HTMLResponse)
def get_create_bug_form():
    """Serve the Create Bug form (AC1-create-form-accessible)."""
    return create_bug_form.render()


@app.post("/bugs")
def create_bug(
    title: str = Form(...),
    description: str = Form(""),
    db: Session = Depends(get_db),
):
    """Delegate to BugService and redirect to the new bug's detail page."""
    service = BugService(BugRepository(db))
    bug = service.create(title, description)
    return RedirectResponse(url=f"/bugs/{bug.id}", status_code=303)


@app.get("/bugs/{bug_id}", response_class=HTMLResponse)
def get_bug_detail(bug_id: int, db: Session = Depends(get_db)):
    """Render the bug detail page."""
    bug = BugRepository(db).get(bug_id)
    if bug is None:
        return HTMLResponse(content="<h1>Not Found</h1>", status_code=404)
    return bug_detail.render(bug)
