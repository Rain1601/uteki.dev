"""
Admin domain API routes - FastAPI路由
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from uteki.common.database import db_manager
from uteki.domains.admin import schemas
from uteki.domains.admin.service import (
    api_key_service,
    user_service,
    system_config_service,
    audit_log_service,
)

router = APIRouter()


# ============================================================================
# Dependency: 获取数据库会话
# ============================================================================


async def get_db_session():
    """获取数据库会话依赖"""
    async with db_manager.get_postgres_session() as session:
        yield session


# ============================================================================
# API Key Routes
# ============================================================================


@router.post(
    "/api-keys",
    response_model=schemas.APIKeyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建API密钥",
)
async def create_api_key(
    data: schemas.APIKeyCreate, session: AsyncSession = Depends(get_db_session)
):
    """
    创建新的API密钥配置

    - **provider**: 服务提供商 (okx, binance, fmp, openai, anthropic, dashscope)
    - **api_key**: API密钥（会被加密存储）
    - **api_secret**: API密钥Secret（可选，会被加密存储）
    - **environment**: 环境 (production, sandbox, testnet)
    """
    api_key = await api_key_service.create_api_key(session, data)

    # 记录审计日志
    await audit_log_service.log_action(
        session,
        action="api_key.create",
        resource_type="api_key",
        resource_id=api_key.id,
        status="success",
        details={"provider": data.provider, "environment": data.environment},
    )

    # 返回响应（不包含敏感信息）
    return schemas.APIKeyResponse(
        id=api_key.id,
        provider=api_key.provider,
        display_name=api_key.display_name,
        environment=api_key.environment,
        description=api_key.description,
        is_active=api_key.is_active,
        has_secret=api_key.api_secret is not None,
        created_at=api_key.created_at,
        updated_at=api_key.updated_at,
    )


@router.get(
    "/api-keys", response_model=schemas.PaginatedAPIKeysResponse, summary="列出所有API密钥"
)
async def list_api_keys(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: AsyncSession = Depends(get_db_session),
):
    """列出所有API密钥配置（不包含敏感信息）"""
    items, total = await api_key_service.list_api_keys(session, skip, limit)

    return schemas.PaginatedAPIKeysResponse(
        items=items,
        total=total,
        page=skip // limit + 1,
        page_size=limit,
        total_pages=(total + limit - 1) // limit,
    )


@router.get("/api-keys/{api_key_id}", response_model=schemas.APIKeyResponse, summary="获取API密钥")
async def get_api_key(api_key_id: str, session: AsyncSession = Depends(get_db_session)):
    """获取指定API密钥（不包含敏感信息）"""
    api_key = await api_key_service.get_api_key(session, api_key_id, decrypt=False)
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    return schemas.APIKeyResponse(
        id=api_key.id,
        provider=api_key.provider,
        display_name=api_key.display_name,
        environment=api_key.environment,
        description=api_key.description,
        is_active=api_key.is_active,
        has_secret=api_key.api_secret is not None,
        created_at=api_key.created_at,
        updated_at=api_key.updated_at,
    )


@router.patch("/api-keys/{api_key_id}", response_model=schemas.APIKeyResponse, summary="更新API密钥")
async def update_api_key(
    api_key_id: str,
    data: schemas.APIKeyUpdate,
    session: AsyncSession = Depends(get_db_session),
):
    """更新API密钥配置"""
    api_key = await api_key_service.update_api_key(session, api_key_id, data)
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    # 记录审计日志
    await audit_log_service.log_action(
        session,
        action="api_key.update",
        resource_type="api_key",
        resource_id=api_key_id,
        status="success",
    )

    return schemas.APIKeyResponse(
        id=api_key.id,
        provider=api_key.provider,
        display_name=api_key.display_name,
        environment=api_key.environment,
        description=api_key.description,
        is_active=api_key.is_active,
        has_secret=api_key.api_secret is not None,
        created_at=api_key.created_at,
        updated_at=api_key.updated_at,
    )


@router.delete("/api-keys/{api_key_id}", response_model=schemas.MessageResponse, summary="删除API密钥")
async def delete_api_key(api_key_id: str, session: AsyncSession = Depends(get_db_session)):
    """删除API密钥"""
    success = await api_key_service.delete_api_key(session, api_key_id)
    if not success:
        raise HTTPException(status_code=404, detail="API key not found")

    # 记录审计日志
    await audit_log_service.log_action(
        session,
        action="api_key.delete",
        resource_type="api_key",
        resource_id=api_key_id,
        status="success",
    )

    return schemas.MessageResponse(message="API key deleted successfully")


# ============================================================================
# User Routes
# ============================================================================


@router.post("/users", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED, summary="创建用户")
async def create_user(
    data: schemas.UserCreate, session: AsyncSession = Depends(get_db_session)
):
    """创建新用户"""
    # 检查邮箱是否已存在
    existing = await user_service.get_user_by_email(session, data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = await user_service.create_user(session, data)
    return user


@router.get("/users", response_model=schemas.PaginatedUsersResponse, summary="列出所有用户")
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: AsyncSession = Depends(get_db_session),
):
    """列出所有用户"""
    items, total = await user_service.list_users(session, skip, limit)

    return schemas.PaginatedUsersResponse(
        items=items,
        total=total,
        page=skip // limit + 1,
        page_size=limit,
        total_pages=(total + limit - 1) // limit,
    )


@router.get("/users/{user_id}", response_model=schemas.UserResponse, summary="获取用户")
async def get_user(user_id: str, session: AsyncSession = Depends(get_db_session)):
    """获取指定用户"""
    user = await user_service.get_user(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/users/{user_id}", response_model=schemas.UserResponse, summary="更新用户")
async def update_user(
    user_id: str, data: schemas.UserUpdate, session: AsyncSession = Depends(get_db_session)
):
    """更新用户信息"""
    user = await user_service.update_user(session, user_id, data)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# ============================================================================
# System Config Routes
# ============================================================================


@router.post("/config", response_model=schemas.SystemConfigResponse, summary="设置系统配置")
async def set_config(
    data: schemas.SystemConfigCreate, session: AsyncSession = Depends(get_db_session)
):
    """设置系统配置（创建或更新）"""
    config = await system_config_service.set_config(session, data)
    return config


@router.get("/config", response_model=List[schemas.SystemConfigResponse], summary="列出所有配置")
async def list_configs(session: AsyncSession = Depends(get_db_session)):
    """列出所有系统配置"""
    configs = await system_config_service.list_all_configs(session)
    return configs


@router.get("/config/{config_key}", response_model=schemas.SystemConfigResponse, summary="获取配置")
async def get_config(config_key: str, session: AsyncSession = Depends(get_db_session)):
    """获取指定配置"""
    config = await system_config_service.get_config(session, config_key)
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    return config


@router.delete("/config/{config_key}", response_model=schemas.MessageResponse, summary="删除配置")
async def delete_config(config_key: str, session: AsyncSession = Depends(get_db_session)):
    """删除配置"""
    success = await system_config_service.delete_config(session, config_key)
    if not success:
        raise HTTPException(status_code=404, detail="Config not found")
    return schemas.MessageResponse(message="Config deleted successfully")


# ============================================================================
# Audit Log Routes
# ============================================================================


@router.get("/audit-logs", response_model=schemas.PaginatedAuditLogsResponse, summary="列出审计日志")
async def list_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: AsyncSession = Depends(get_db_session),
):
    """列出所有审计日志"""
    items, total = await audit_log_service.list_all_logs(session, skip, limit)

    return schemas.PaginatedAuditLogsResponse(
        items=items,
        total=total,
        page=skip // limit + 1,
        page_size=limit,
        total_pages=(total + limit - 1) // limit,
    )


@router.get("/audit-logs/user/{user_id}", response_model=schemas.PaginatedAuditLogsResponse, summary="列出用户审计日志")
async def list_user_audit_logs(
    user_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: AsyncSession = Depends(get_db_session),
):
    """列出指定用户的审计日志"""
    items, total = await audit_log_service.list_user_logs(session, user_id, skip, limit)

    return schemas.PaginatedAuditLogsResponse(
        items=items,
        total=total,
        page=skip // limit + 1,
        page_size=limit,
        total_pages=(total + limit - 1) // limit,
    )
