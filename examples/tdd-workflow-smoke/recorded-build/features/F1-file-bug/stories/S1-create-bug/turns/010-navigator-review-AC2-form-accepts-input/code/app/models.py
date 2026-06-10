"""SQLAlchemy models."""

from sqlalchemy import Column, Integer, String, Text

from app.database import Base


class Bug(Base):
    __tablename__ = "bugs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String(50), nullable=False, default="open")
