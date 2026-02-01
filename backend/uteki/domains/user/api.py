"""User API endpoints for authentication."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from uteki.domains.user.schemas import (
    UserCreate,
    UserResponse,
    UserLogin,
    Token,
    UserUpdate
)
from uteki.domains.user.service import user_service
from uteki.domains.user.dependencies import get_current_user, get_current_user_id
from uteki.domains.user.models import User
from uteki.infrastructure.database import get_db_session

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: UserCreate,
    session: AsyncSession = Depends(get_db_session)
):
    """Register a new user."""
    user = await user_service.create_user(session, data)
    await session.commit()
    return user


@router.post("/login", response_model=Token)
async def login(
    data: UserLogin,
    session: AsyncSession = Depends(get_db_session)
):
    """Login with username and password."""
    user = await user_service.authenticate_user(session, data.username, data.password)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = await user_service.create_user_token(user)

    return Token(access_token=access_token, token_type="bearer")


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """Get current user information."""
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_current_user(
    data: UserUpdate,
    current_user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db_session)
):
    """Update current user information."""
    user = await user_service.update_user(session, current_user_id, data)
    await session.commit()
    return user
