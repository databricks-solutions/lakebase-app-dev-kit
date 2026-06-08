"""Infrastructure: data access for Bug entities (architecture.md BugRepository)."""

from sqlalchemy.orm import Session

from app.models import Bug


class BugRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def add(self, bug: Bug) -> Bug:
        """Persist a new bug and return it with its generated id."""
        self._db.add(bug)
        self._db.commit()
        self._db.refresh(bug)
        return bug

    def get(self, bug_id: int) -> Bug | None:
        """Return the bug with the given id, or None if not found."""
        return self._db.get(Bug, bug_id)
