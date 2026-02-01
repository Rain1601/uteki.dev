"""User repository for database operations."""

from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uteki.domains.user.models import User
from uteki.infrastructure.repository import BaseRepository


class UserRepository(BaseRepository[User]):
    """Repository for user database operations."""

    def __init__(self):
        super().__init__(User)

    async def get_by_username(self, session: AsyncSession, username: str) -> Optional[User]:
        """Get user by username."""
        stmt = select(User).where(User.username == username)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_email(self, session: AsyncSession, email: str) -> Optional[User]:
        """Get user by email."""
        stmt = select(User).where(User.email == email)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def username_exists(self, session: AsyncSession, username: str) -> bool:
        """Check if username already exists."""
        user = await self.get_by_username(session, username)
        return user is not None

    async def email_exists(self, session: AsyncSession, email: str) -> bool:
        """Check if email already exists."""
        user = await self.get_by_email(session, email)
        return user is not None


# Singleton instance
user_repository = UserRepository()
