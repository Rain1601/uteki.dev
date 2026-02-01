"""
CSRF Protection Utilities
使用 SameSite=Lax Cookie + Origin 验证
"""
from fastapi import Request, HTTPException, status
from typing import Optional
import secrets
import logging

logger = logging.getLogger(__name__)


def generate_csrf_token() -> str:
    """生成 CSRF token"""
    return secrets.token_urlsafe(32)


def verify_origin(request: Request, allowed_origins: list[str]) -> bool:
    """
    验证请求来源
    对于状态修改请求(POST/PUT/DELETE)，验证 Origin 或 Referer header
    """
    # GET 请求不需要验证
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return True

    origin = request.headers.get("origin")
    referer = request.headers.get("referer")

    # 检查 Origin header
    if origin:
        for allowed in allowed_origins:
            if origin.startswith(allowed):
                return True
        logger.warning(f"Origin mismatch: {origin} not in {allowed_origins}")
        return False

    # 如果没有 Origin，检查 Referer
    if referer:
        for allowed in allowed_origins:
            if referer.startswith(allowed):
                return True
        logger.warning(f"Referer mismatch: {referer} not in {allowed_origins}")
        return False

    # 没有 Origin 和 Referer，可能是同源请求或非浏览器请求
    # 由于使用 SameSite=Lax，允许通过
    return True
