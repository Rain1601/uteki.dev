"""FastAPI dependencies for authentication."""

from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from uteki.domains.user.models import User
from uteki.domains.user.auth import decode_access_token
from uteki.domains.user.repository import user_repository
from uteki.infrastructure.database import get_db_session

# HTTP Bearer token scheme
security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_db_session)
) -> User:
    """
    Get current authenticated user from JWT token.

    Raises:
        HTTPException 401: If token is invalid or user not found
        HTTPException 403: If user account is inactive
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Decode token
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise credentials_exception

    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    # Get user from database
    user = await user_repository.get_by_id(session, user_id)
    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account"
        )

    return user


async def get_current_user_id(
    current_user: User = Depends(get_current_user)
) -> str:
    """Get current user ID (convenience dependency)."""
    return current_user.id


async def get_current_superuser(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Get current user and verify they are a superuser.

    Raises:
        HTTPException 403: If user is not a superuser
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions"
        )
    return current_user


# Optional authentication (for public endpoints that benefit from user context)
async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    session: AsyncSession = Depends(get_db_session)
) -> Optional[User]:
    """Get current user if token is provided, otherwise return None."""
    if credentials is None:
        return None

    try:
        payload = decode_access_token(credentials.credentials)
        if payload is None:
            return None

        user_id = payload.get("sub")
        if user_id is None:
            return None

        user = await user_repository.get_by_id(session, user_id)
        if user is None or not user.is_active:
            return None

        return user
    except Exception:
        return None
