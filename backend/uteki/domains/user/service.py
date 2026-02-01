"""User service with business logic."""

from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from uteki.domains.user.models import User
from uteki.domains.user.schemas import UserCreate, UserUpdate
from uteki.domains.user.repository import user_repository
from uteki.domains.user.auth import get_password_hash, verify_password, create_access_token


class UserService:
    """Service for user management and authentication."""

    def __init__(self):
        self.repository = user_repository

    async def create_user(self, session: AsyncSession, data: UserCreate) -> User:
        """Create a new user."""
        # Check if username already exists
        if await self.repository.username_exists(session, data.username):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already exists"
            )

        # Check if email already exists
        if await self.repository.email_exists(session, data.email):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already exists"
            )

        # Create user with hashed password
        user = User(
            username=data.username,
            email=data.email,
            full_name=data.full_name,
            hashed_password=get_password_hash(data.password),
            is_active=True,
            is_superuser=False,
            is_verified=False
        )

        return await self.repository.create(session, user)

    async def authenticate_user(
        self,
        session: AsyncSession,
        username: str,
        password: str
    ) -> Optional[User]:
        """Authenticate a user with username and password."""
        user = await self.repository.get_by_username(session, username)

        if not user:
            return None

        if not verify_password(password, user.hashed_password):
            return None

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive"
            )

        return user

    async def create_user_token(self, user: User) -> str:
        """Create JWT token for a user."""
        token_data = {
            "sub": user.id,
            "username": user.username,
        }
        return create_access_token(token_data)

    async def get_user(self, session: AsyncSession, user_id: str) -> Optional[User]:
        """Get user by ID."""
        return await self.repository.get_by_id(session, user_id)

    async def update_user(
        self,
        session: AsyncSession,
        user_id: str,
        data: UserUpdate
    ) -> User:
        """Update user information."""
        user = await self.repository.get_by_id(session, user_id)

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        # Update fields
        if data.email is not None:
            # Check if new email already exists
            existing = await self.repository.get_by_email(session, data.email)
            if existing and existing.id != user_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already exists"
                )
            user.email = data.email

        if data.full_name is not None:
            user.full_name = data.full_name

        if data.password is not None:
            user.hashed_password = get_password_hash(data.password)

        if data.is_active is not None:
            user.is_active = data.is_active

        return await self.repository.update(session, user)


# Singleton instance
user_service = UserService()
