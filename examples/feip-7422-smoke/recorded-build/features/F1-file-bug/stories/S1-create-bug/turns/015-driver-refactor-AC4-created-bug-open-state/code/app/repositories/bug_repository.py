"""BugRepository: data access for Bug entities with R2 status enforcement."""

from sqlalchemy.orm import Session

from app.models import Bug

RECOGNIZED_STATUSES = frozenset({"open"})


class InvalidStatusError(ValueError):
    pass


class BugRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def create(self, title: str, description: str, status: str) -> Bug:
        if status not in RECOGNIZED_STATUSES:
            raise InvalidStatusError(
                f"status '{status}' is not recognized; allowed: {sorted(RECOGNIZED_STATUSES)}"
            )
        bug = Bug(title=title, description=description, status=status)
        self._db.add(bug)
        self._db.commit()
        self._db.refresh(bug)
        return bug

    def get_by_id(self, bug_id: int) -> Bug | None:
        return self._db.query(Bug).filter(Bug.id == bug_id).first()
