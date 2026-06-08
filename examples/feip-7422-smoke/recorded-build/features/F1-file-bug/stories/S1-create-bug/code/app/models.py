"""SQLAlchemy models. Add your entities here."""

from sqlalchemy import Column, Integer, String, Text, CheckConstraint

from app.database import Base

ALLOWED_STATUSES = ("open", "in_progress", "closed")


class Bug(Base):
    __tablename__ = "bug"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(
        String(32),
        nullable=False,
        default="open",
        server_default="open",
    )

    __table_args__ = (
        CheckConstraint(
            "status IN (%s)" % ", ".join(f"'{s}'" for s in ALLOWED_STATUSES),
            name="ck_bug_status_valid",
        ),
    )
