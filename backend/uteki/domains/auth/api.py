"""
Auth API - OAuth登录端点
"""
from fastapi import APIRouter, Depends, Response, Request, HTTPException, Query
from fastapi.responses import RedirectResponse
from typing import Optional
import logging
import os

from uteki.common.config import settings
from uteki.domains.admin.service import UserService
from .service import AuthService
from .deps import get_current_user_optional, get_current_user, AUTH_COOKIE_NAME

logger = logging.getLogger(__name__)

router = APIRouter()

# Initialize services
auth_service = AuthService()
user_service = UserService()


def get_frontend_url() -> str:
    """获取前端URL，用于登录后重定向"""
    return os.getenv("FRONTEND_URL", "http://localhost:5173")


# =============================================================================
# GitHub OAuth
# =============================================================================

@router.get("/github/login")
async def github_login(
    redirect_url: Optional[str] = Query(None, description="登录成功后重定向的URL")
):
    """发起 GitHub OAuth 登录"""
    if not settings.github_client_id:
        raise HTTPException(status_code=500, detail="GitHub OAuth not configured")

    state = redirect_url or get_frontend_url()
    login_url = auth_service.get_github_login_url(state=state)
    return RedirectResponse(url=login_url)


@router.get("/github/callback")
async def github_callback(
    code: str = Query(...),
    state: Optional[str] = Query(None),
):
    """GitHub OAuth 回调处理"""
    frontend_url = state or get_frontend_url()

    try:
        user_info = await auth_service.exchange_github_code(code)
        if not user_info:
            logger.error("GitHub OAuth: Failed to get user info")
            return RedirectResponse(url=f"{frontend_url}/login?error=github_auth_failed")

        logger.info(f"GitHub OAuth: Got user info for {user_info.get('email')}")

        user = await user_service.get_or_create_oauth_user(
            oauth_provider=user_info["provider"],
            oauth_id=user_info["provider_id"],
            email=user_info.get("email"),
            username=user_info.get("name"),
            avatar_url=user_info.get("avatar"),
        )

        logger.info(f"GitHub OAuth: User created/found with id {user['id']}")

        token = auth_service.create_user_token(str(user["id"]), user_info)

        redirect_url = f"{frontend_url}#token={token}"
        response = RedirectResponse(url=redirect_url)
        response.set_cookie(
            key=AUTH_COOKIE_NAME,
            value=token,
            httponly=True,
            samesite="lax",
            secure=settings.environment == "production",
            max_age=60 * 60 * 24 * 7,
        )
        return response

    except Exception as e:
        logger.error(f"GitHub OAuth callback error: {str(e)}", exc_info=True)
        return RedirectResponse(url=f"{frontend_url}/login?error=github_callback_error&detail={str(e)[:100]}")


# =============================================================================
# Google OAuth
# =============================================================================

@router.get("/google/login")
async def google_login(
    redirect_url: Optional[str] = Query(None, description="登录成功后重定向的URL")
):
    """发起 Google OAuth 登录"""
    if not settings.google_client_id:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    state = redirect_url or get_frontend_url()
    login_url = auth_service.get_google_login_url(state=state)
    return RedirectResponse(url=login_url)


@router.get("/google/callback")
async def google_callback(
    code: str = Query(...),
    state: Optional[str] = Query(None),
):
    """Google OAuth 回调处理"""
    frontend_url = state or get_frontend_url()

    try:
        user_info = await auth_service.exchange_google_code(code)
        if not user_info:
            logger.error("Google OAuth: Failed to get user info")
            return RedirectResponse(url=f"{frontend_url}/login?error=google_auth_failed")

        logger.info(f"Google OAuth: Got user info for {user_info.get('email')}")

        user = await user_service.get_or_create_oauth_user(
            oauth_provider=user_info["provider"],
            oauth_id=user_info["provider_id"],
            email=user_info.get("email"),
            username=user_info.get("name"),
            avatar_url=user_info.get("avatar"),
        )

        logger.info(f"Google OAuth: User created/found with id {user['id']}")

        token = auth_service.create_user_token(str(user["id"]), user_info)

        redirect_url = f"{frontend_url}#token={token}"
        response = RedirectResponse(url=redirect_url)
        response.set_cookie(
            key=AUTH_COOKIE_NAME,
            value=token,
            httponly=True,
            samesite="lax",
            secure=settings.environment == "production",
            max_age=60 * 60 * 24 * 7,
        )
        return response

    except Exception as e:
        logger.error(f"Google OAuth callback error: {str(e)}", exc_info=True)
        return RedirectResponse(url=f"{frontend_url}/login?error=google_callback_error&detail={str(e)[:100]}")


# =============================================================================
# Session Management
# =============================================================================

@router.get("/me")
async def get_current_user_info(
    user: Optional[dict] = Depends(get_current_user_optional)
):
    """获取当前登录用户信息"""
    if user is None:
        return {"authenticated": False, "user": None}
    return {"authenticated": True, "user": user}


@router.post("/logout")
async def logout(response: Response):
    """用户登出"""
    response.delete_cookie(key=AUTH_COOKIE_NAME)
    return {"message": "Logged out successfully"}


@router.get("/debug/test-user-creation")
async def debug_test_user_creation():
    """Debug: 测试用户创建流程"""
    try:
        user = await user_service.get_or_create_oauth_user(
            oauth_provider="test",
            oauth_id="test-123",
            email="test@example.com",
            username="Test User",
            avatar_url=None,
        )
        return {
            "success": True,
            "user_id": str(user["id"]),
            "email": user["email"],
            "username": user["username"],
        }
    except Exception as e:
        logger.error(f"Debug user creation error: {str(e)}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__,
        }
