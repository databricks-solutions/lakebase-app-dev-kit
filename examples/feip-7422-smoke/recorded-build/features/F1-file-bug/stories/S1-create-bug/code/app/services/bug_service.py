"""Application: bug creation logic and status initialization (architecture.md BugService)."""

from app.models import Bug
from app.repositories.bug_repository import BugRepository


class BugService:
    def __init__(self, repo: BugRepository) -> None:
        self._repo = repo

    def create(self, title: str, description: str = "") -> Bug:
        """Validate inputs, initialize status to 'open', and persist.

        Raises ValueError with a field-naming message when title is blank,
        per nfrs.md Preferences (clear, specific error messages).
        """
        if not title or not title.strip():
            raise ValueError("title: must not be blank")
        bug = Bug(title=title.strip(), description=description, status="open")
        return self._repo.add(bug)
