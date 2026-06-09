"""BugService: encapsulates bug creation logic and field validation (AC3, architecture.md)."""

from sqlalchemy.orm import Session

from app.models import Bug
from app.repositories.bug_repository import BugRepository


class BugValidationError(ValueError):
    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


class BugService:
    def __init__(self, db: Session) -> None:
        self._repo = BugRepository(db)

    def create_bug(self, title: str | None, description: str | None) -> Bug:
        if not title or not title.strip():
            raise BugValidationError("title", "title is required")
        if not description or not description.strip():
            raise BugValidationError("description", "description is required")
        return self._repo.create(
            title=title.strip(),
            description=description.strip(),
            status="open",
        )
