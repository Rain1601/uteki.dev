"""
Auth Dependencies - 依赖注入函数
"""
from fastapi import Depends, HTTPException, Request, status
from typing import Optional
import logging

from .jwt import verify_token

logger = logging.getLogger(__name__)

# Cookie name for JWT token
AUTH_COOKIE_NAME = "auth_token"


async def get_current_user_optional(request: Request) -> Optional[dict]:
    """
    获取当前用户（可选，未登录返回None）
    从 Cookie 中读取 JWT token 并验证
    """
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        return None

    payload = verify_token(token)
    if payload is None:
        return None

    # 返回用户信息
    return {
        "user_id": payload.get("sub"),
        "email": payload.get("email"),
        "name": payload.get("name"),
        "avatar": payload.get("avatar"),
        "provider": payload.get("provider"),
    }


async def get_current_user(
    user: Optional[dict] = Depends(get_current_user_optional)
) -> dict:
    """获取当前用户（必须登录，未登录返回401）"""
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
