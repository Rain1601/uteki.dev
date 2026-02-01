"""User domain models for authentication and authorization."""

from typing import Optional
from sqlalchemy import String, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from uteki.infrastructure.database import Base
from uteki.infrastructure.database.mixins import UUIDMixin, TimestampMixin


class User(Base, UUIDMixin, TimestampMixin):
    """User model for authentication and multi-tenancy."""

    __tablename__ = "users"
    __table_args__ = {"schema": "auth"}

    # Basic info
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    full_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Authentication
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username} email={self.email}>"
