"""
Admin domain API routes - FastAPI路由
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from uteki.common.database import db_manager
from uteki.domains.admin import schemas
from uteki.domains.admin.service import (
    APIKeyService,
    UserService,
    SystemConfigService,
    AuditLogService,
    LLMProviderService,
    ExchangeConfigService,
    DataSourceConfigService,
    get_api_key_service,
    get_user_service,
    get_system_config_service,
    get_audit_log_service,
    get_llm_provider_service,
    get_exchange_config_service,
    get_data_source_config_service,
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
    data: schemas.APIKeyCreate, session: AsyncSession = Depends(get_db_session),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
    api_key_svc: APIKeyService = Depends(get_api_key_service),
):
    """
    创建新的API密钥配置

    - **provider**: 服务提供商 (okx, binance, fmp, openai, anthropic, dashscope)
    - **api_key**: API密钥（会被加密存储）
    - **api_secret**: API密钥Secret（可选，会被加密存储）
    - **environment**: 环境 (production, sandbox, testnet)
    """
    api_key = await api_key_svc.create_api_key(session, data)

    # 记录审计日志
    await audit_svc.log_action(
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
    api_key_svc: APIKeyService = Depends(get_api_key_service),
):
    """列出所有API密钥配置（不包含敏感信息）"""
    items, total = await api_key_svc.list_api_keys(session, skip, limit)

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
    api_key = await api_key_svc.get_api_key(session, api_key_id, decrypt=False)
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
    audit_svc: AuditLogService = Depends(get_audit_log_service),
    api_key_svc: APIKeyService = Depends(get_api_key_service),
):
    """更新API密钥配置"""
    api_key = await api_key_svc.update_api_key(session, api_key_id, data)
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    # 记录审计日志
    await audit_svc.log_action(
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
    success = await api_key_svc.delete_api_key(session, api_key_id)
    if not success:
        raise HTTPException(status_code=404, detail="API key not found")

    # 记录审计日志
    await audit_svc.log_action(
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
    data: schemas.UserCreate, session: AsyncSession = Depends(get_db_session),
    user_svc: UserService = Depends(get_user_service),
):
    """创建新用户"""
    # 检查邮箱是否已存在
    existing = await user_svc.get_user_by_email(session, data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = await user_svc.create_user(session, data)
    return user


@router.get("/users", response_model=schemas.PaginatedUsersResponse, summary="列出所有用户")
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: AsyncSession = Depends(get_db_session),
    user_svc: UserService = Depends(get_user_service),
):
    """列出所有用户"""
    items, total = await user_svc.list_users(session, skip, limit)

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
    user = await user_svc.get_user(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/users/{user_id}", response_model=schemas.UserResponse, summary="更新用户")
async def update_user(
    user_id: str, data: schemas.UserUpdate, session: AsyncSession = Depends(get_db_session),
    user_svc: UserService = Depends(get_user_service),
):
    """更新用户信息"""
    user = await user_svc.update_user(session, user_id, data)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# ============================================================================
# System Config Routes
# ============================================================================


@router.post("/config", response_model=schemas.SystemConfigResponse, summary="设置系统配置")
async def set_config(
    data: schemas.SystemConfigCreate, session: AsyncSession = Depends(get_db_session),
    config_svc: SystemConfigService = Depends(get_system_config_service),
):
    """设置系统配置（创建或更新）"""
    config = await config_svc.set_config(session, data)
    return config


@router.get("/config", response_model=List[schemas.SystemConfigResponse], summary="列出所有配置")
async def list_configs(session: AsyncSession = Depends(get_db_session)):
    """列出所有系统配置"""
    configs = await config_svc.list_all_configs(session)
    return configs


@router.get("/config/{config_key}", response_model=schemas.SystemConfigResponse, summary="获取配置")
async def get_config(config_key: str, session: AsyncSession = Depends(get_db_session)):
    """获取指定配置"""
    config = await config_svc.get_config(session, config_key)
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    return config


@router.delete("/config/{config_key}", response_model=schemas.MessageResponse, summary="删除配置")
async def delete_config(config_key: str, session: AsyncSession = Depends(get_db_session)):
    """删除配置"""
    success = await config_svc.delete_config(session, config_key)
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
    audit_svc: AuditLogService = Depends(get_audit_log_service),
):
    """列出所有审计日志"""
    items, total = await audit_svc.list_all_logs(session, skip, limit)

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
    audit_svc: AuditLogService = Depends(get_audit_log_service),
):
    """列出指定用户的审计日志"""
    items, total = await audit_svc.list_user_logs(session, user_id, skip, limit)

    return schemas.PaginatedAuditLogsResponse(
        items=items,
        total=total,
        page=skip // limit + 1,
        page_size=limit,
        total_pages=(total + limit - 1) // limit,
    )


# ============================================================================
# LLM Provider Routes
# ============================================================================


@router.post(
    "/llm-providers",
    response_model=schemas.LLMProviderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建LLM提供商配置",
)
async def create_llm_provider(
    data: schemas.LLMProviderCreate, session: AsyncSession = Depends(get_db_session),
    llm_svc: LLMProviderService = Depends(get_llm_provider_service),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
):
    """
    创建LLM提供商配置

    - **provider**: 提供商 (openai, anthropic, dashscope, deepseek)
    - **model**: 模型名称 (gpt-4, claude-3-5-sonnet-20241022, qwen-max)
    - **api_key_id**: 关联的API密钥ID
    """
    provider = await llm_svc.create_provider(session, data)

    await audit_svc.log_action(
        session,
        action="llm_provider.create",
        resource_type="llm_provider",
        resource_id=provider.id,
        status="success",
        details={"provider": data.provider, "model": data.model},
    )

    return provider


@router.get(
    "/llm-providers",
    response_model=schemas.PaginatedLLMProvidersResponse,
    summary="列出所有LLM提供商",
)
async def list_llm_providers(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: AsyncSession = Depends(get_db_session),
    llm_svc: LLMProviderService = Depends(get_llm_provider_service),
):
    """列出所有LLM提供商配置"""
    items, total = await llm_svc.list_providers(session, skip, limit)

    return schemas.PaginatedLLMProvidersResponse(
        items=items,
        total=total,
        page=skip // limit + 1,
        page_size=limit,
        total_pages=(total + limit - 1) // limit,
    )


@router.get(
    "/llm-providers/active",
    response_model=List[schemas.LLMProviderResponse],
    summary="列出激活的LLM提供商",
)
async def list_active_llm_providers(session: AsyncSession = Depends(get_db_session)):
    """列出所有激活的LLM提供商（按优先级排序）"""
    providers = await llm_svc.list_active_providers(session)
    return providers


@router.get(
    "/llm-providers/default",
    response_model=schemas.LLMProviderResponse,
    summary="获取默认LLM提供商",
)
async def get_default_llm_provider(session: AsyncSession = Depends(get_db_session)):
    """获取默认LLM提供商"""
    provider = await llm_svc.get_default_provider(session)
    if not provider:
        raise HTTPException(status_code=404, detail="No default LLM provider configured")
    return provider


@router.get(
    "/llm-providers/{provider_id}",
    response_model=schemas.LLMProviderResponse,
    summary="获取LLM提供商",
)
async def get_llm_provider(
    provider_id: str, session: AsyncSession = Depends(get_db_session),
    llm_svc: LLMProviderService = Depends(get_llm_provider_service),
):
    """获取指定LLM提供商"""
    provider = await llm_svc.get_provider(session, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="LLM provider not found")
    return provider


@router.patch(
    "/llm-providers/{provider_id}",
    response_model=schemas.LLMProviderResponse,
    summary="更新LLM提供商",
)
async def update_llm_provider(
    provider_id: str,
    data: schemas.LLMProviderUpdate,
    session: AsyncSession = Depends(get_db_session),
    llm_svc: LLMProviderService = Depends(get_llm_provider_service),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
):
    """更新LLM提供商配置"""
    provider = await llm_svc.update_provider(session, provider_id, data)
    if not provider:
        raise HTTPException(status_code=404, detail="LLM provider not found")

    await audit_svc.log_action(
        session,
        action="llm_provider.update",
        resource_type="llm_provider",
        resource_id=provider_id,
        status="success",
    )

    return provider


@router.delete(
    "/llm-providers/{provider_id}",
    response_model=schemas.MessageResponse,
    summary="删除LLM提供商",
)
async def delete_llm_provider(
    provider_id: str, session: AsyncSession = Depends(get_db_session),
    llm_svc: LLMProviderService = Depends(get_llm_provider_service),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
):
    """删除LLM提供商"""
    success = await llm_svc.delete_provider(session, provider_id)
    if not success:
        raise HTTPException(status_code=404, detail="LLM provider not found")

    await audit_svc.log_action(
        session,
        action="llm_provider.delete",
        resource_type="llm_provider",
        resource_id=provider_id,
        status="success",
    )

    return schemas.MessageResponse(message="LLM provider deleted successfully")


# ============================================================================
# Exchange Config Routes
# ============================================================================


@router.post(
    "/exchanges",
    response_model=schemas.ExchangeConfigResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建交易所配置",
)
async def create_exchange_config(
    data: schemas.ExchangeConfigCreate, session: AsyncSession = Depends(get_db_session),
    exchange_svc: ExchangeConfigService = Depends(get_exchange_config_service),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
):
    """
    创建交易所配置

    - **exchange**: 交易所名称 (okx, binance, xueying)
    - **api_key_id**: 关联的API密钥ID
    - **trading_enabled**: 是否启用交易
    """
    exchange = await exchange_svc.create_exchange(session, data)

    await audit_svc.log_action(
        session,
        action="exchange_config.create",
        resource_type="exchange_config",
        resource_id=exchange.id,
        status="success",
        details={"exchange": data.exchange},
    )

    return exchange


@router.get(
    "/exchanges",
    response_model=schemas.PaginatedExchangeConfigsResponse,
    summary="列出所有交易所配置",
)
async def list_exchange_configs(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: AsyncSession = Depends(get_db_session),
    exchange_svc: ExchangeConfigService = Depends(get_exchange_config_service),
):
    """列出所有交易所配置"""
    items, total = await exchange_svc.list_exchanges(session, skip, limit)

    return schemas.PaginatedExchangeConfigsResponse(
        items=items,
        total=total,
        page=skip // limit + 1,
        page_size=limit,
        total_pages=(total + limit - 1) // limit,
    )


@router.get(
    "/exchanges/active",
    response_model=List[schemas.ExchangeConfigResponse],
    summary="列出激活的交易所",
)
async def list_active_exchanges(session: AsyncSession = Depends(get_db_session)):
    """列出所有激活的交易所配置"""
    exchanges = await exchange_svc.list_active_exchanges(session)
    return exchanges


@router.get(
    "/exchanges/{config_id}",
    response_model=schemas.ExchangeConfigResponse,
    summary="获取交易所配置",
)
async def get_exchange_config(
    config_id: str, session: AsyncSession = Depends(get_db_session),
    exchange_svc: ExchangeConfigService = Depends(get_exchange_config_service),
):
    """获取指定交易所配置"""
    exchange = await exchange_svc.get_exchange(session, config_id)
    if not exchange:
        raise HTTPException(status_code=404, detail="Exchange config not found")
    return exchange


@router.patch(
    "/exchanges/{config_id}",
    response_model=schemas.ExchangeConfigResponse,
    summary="更新交易所配置",
)
async def update_exchange_config(
    config_id: str,
    data: schemas.ExchangeConfigUpdate,
    session: AsyncSession = Depends(get_db_session),
    exchange_svc: ExchangeConfigService = Depends(get_exchange_config_service),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
):
    """更新交易所配置"""
    exchange = await exchange_svc.update_exchange(session, config_id, data)
    if not exchange:
        raise HTTPException(status_code=404, detail="Exchange config not found")

    await audit_svc.log_action(
        session,
        action="exchange_config.update",
        resource_type="exchange_config",
        resource_id=config_id,
        status="success",
    )

    return exchange


@router.delete(
    "/exchanges/{config_id}",
    response_model=schemas.MessageResponse,
    summary="删除交易所配置",
)
async def delete_exchange_config(
    config_id: str, session: AsyncSession = Depends(get_db_session),
    exchange_svc: ExchangeConfigService = Depends(get_exchange_config_service),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
):
    """删除交易所配置"""
    success = await exchange_svc.delete_exchange(session, config_id)
    if not success:
        raise HTTPException(status_code=404, detail="Exchange config not found")

    await audit_svc.log_action(
        session,
        action="exchange_config.delete",
        resource_type="exchange_config",
        resource_id=config_id,
        status="success",
    )

    return schemas.MessageResponse(message="Exchange config deleted successfully")


# ============================================================================
# Data Source Config Routes
# ============================================================================


@router.post(
    "/data-sources",
    response_model=schemas.DataSourceConfigResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建数据源配置",
)
async def create_data_source_config(
    data: schemas.DataSourceConfigCreate, session: AsyncSession = Depends(get_db_session),
    datasource_svc: DataSourceConfigService = Depends(get_data_source_config_service),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
):
    """
    创建数据源配置

    - **source_type**: 数据源类型 (fmp, yahoo, coingecko)
    - **data_types**: 支持的数据类型 (["stock", "crypto", "forex"])
    - **api_key_id**: 关联的API密钥ID（可选）
    """
    data_source = await datasource_svc.create_data_source(session, data)

    await audit_svc.log_action(
        session,
        action="data_source_config.create",
        resource_type="data_source_config",
        resource_id=data_source.id,
        status="success",
        details={"source_type": data.source_type},
    )

    return data_source


@router.get(
    "/data-sources",
    response_model=schemas.PaginatedDataSourceConfigsResponse,
    summary="列出所有数据源配置",
)
async def list_data_source_configs(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: AsyncSession = Depends(get_db_session),
    datasource_svc: DataSourceConfigService = Depends(get_data_source_config_service),
):
    """列出所有数据源配置"""
    items, total = await datasource_svc.list_data_sources(session, skip, limit)

    return schemas.PaginatedDataSourceConfigsResponse(
        items=items,
        total=total,
        page=skip // limit + 1,
        page_size=limit,
        total_pages=(total + limit - 1) // limit,
    )


@router.get(
    "/data-sources/active",
    response_model=List[schemas.DataSourceConfigResponse],
    summary="列出激活的数据源",
)
async def list_active_data_sources(session: AsyncSession = Depends(get_db_session)):
    """列出所有激活的数据源配置（按优先级排序）"""
    data_sources = await datasource_svc.list_active_data_sources(session)
    return data_sources


@router.get(
    "/data-sources/by-type/{data_type}",
    response_model=List[schemas.DataSourceConfigResponse],
    summary="根据数据类型列出数据源",
)
async def list_data_sources_by_type(
    data_type: str, session: AsyncSession = Depends(get_db_session),
    datasource_svc: DataSourceConfigService = Depends(get_data_source_config_service),
):
    """根据数据类型列出数据源（如"stock", "crypto"）"""
    data_sources = await datasource_svc.list_by_data_type(session, data_type)
    return data_sources


@router.get(
    "/data-sources/{config_id}",
    response_model=schemas.DataSourceConfigResponse,
    summary="获取数据源配置",
)
async def get_data_source_config(
    config_id: str, session: AsyncSession = Depends(get_db_session),
    datasource_svc: DataSourceConfigService = Depends(get_data_source_config_service),
):
    """获取指定数据源配置"""
    data_source = await datasource_svc.get_data_source(session, config_id)
    if not data_source:
        raise HTTPException(status_code=404, detail="Data source config not found")
    return data_source


@router.patch(
    "/data-sources/{config_id}",
    response_model=schemas.DataSourceConfigResponse,
    summary="更新数据源配置",
)
async def update_data_source_config(
    config_id: str,
    data: schemas.DataSourceConfigUpdate,
    session: AsyncSession = Depends(get_db_session),
    datasource_svc: DataSourceConfigService = Depends(get_data_source_config_service),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
):
    """更新数据源配置"""
    data_source = await datasource_svc.update_data_source(session, config_id, data)
    if not data_source:
        raise HTTPException(status_code=404, detail="Data source config not found")

    await audit_svc.log_action(
        session,
        action="data_source_config.update",
        resource_type="data_source_config",
        resource_id=config_id,
        status="success",
    )

    return data_source


@router.delete(
    "/data-sources/{config_id}",
    response_model=schemas.MessageResponse,
    summary="删除数据源配置",
)
async def delete_data_source_config(
    config_id: str, session: AsyncSession = Depends(get_db_session),
    datasource_svc: DataSourceConfigService = Depends(get_data_source_config_service),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
):
    """删除数据源配置"""
    success = await datasource_svc.delete_data_source(session, config_id)
    if not success:
        raise HTTPException(status_code=404, detail="Data source config not found")

    await audit_svc.log_action(
        session,
        action="data_source_config.delete",
        resource_type="data_source_config",
        resource_id=config_id,
        status="success",
    )

    return schemas.MessageResponse(message="Data source config deleted successfully")


# ============================================================================
# Debug Routes
# ============================================================================


@router.post("/debug/create-admin-tables", summary="创建Admin域所有表")
async def create_admin_tables(session: AsyncSession = Depends(get_db_session)):
    """
    创建Admin域的所有数据库表
    """
    from sqlalchemy import text

    sqls = [
        # 创建 admin schema
        "CREATE SCHEMA IF NOT EXISTS admin;",
        # 创建 users 表
        """
        CREATE TABLE IF NOT EXISTS admin.users (
            id VARCHAR(36) PRIMARY KEY,
            email VARCHAR(255) NOT NULL UNIQUE,
            username VARCHAR(100) NOT NULL,
            oauth_provider VARCHAR(50) NOT NULL DEFAULT 'local',
            oauth_id VARCHAR(255),
            avatar_url VARCHAR(500),
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            is_admin BOOLEAN NOT NULL DEFAULT FALSE,
            preferences JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """,
        # 创建索引
        "CREATE INDEX IF NOT EXISTS idx_users_email ON admin.users (email);",
        "CREATE INDEX IF NOT EXISTS idx_users_oauth ON admin.users (oauth_provider, oauth_id);",
        # 创建 api_keys 表
        """
        CREATE TABLE IF NOT EXISTS admin.api_keys (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL DEFAULT 'default',
            provider VARCHAR(50) NOT NULL,
            display_name VARCHAR(200) NOT NULL,
            api_key VARCHAR(500) NOT NULL,
            api_secret VARCHAR(500),
            extra_config JSONB,
            environment VARCHAR(20) NOT NULL DEFAULT 'production',
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            description VARCHAR(500),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_api_keys_provider_env ON admin.api_keys (provider, environment);",
        "CREATE INDEX IF NOT EXISTS idx_api_keys_user ON admin.api_keys (user_id);",
    ]

    results = []
    for sql in sqls:
        try:
            await session.execute(text(sql))
            await session.commit()
            results.append({"sql": sql[:60] + "...", "status": "success"})
        except Exception as e:
            await session.rollback()
            results.append({"sql": sql[:60] + "...", "status": "error", "error": str(e)})

    return {
        "status": "completed",
        "message": "Admin tables creation completed",
        "results": results
    }


# ============================================================================
# System Health Check Routes
# ============================================================================


@router.get("/system/server-ip", summary="获取服务器公网IP")
async def get_server_ip():
    """获取服务器的公网IP地址"""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get("https://api.ipify.org?format=json")
            data = response.json()
            return {"ip": data["ip"]}
    except Exception as e:
        return {"ip": None, "error": str(e)}


@router.get("/system/health", summary="系统健康检查")
async def system_health_check(
    session: AsyncSession = Depends(get_db_session),
    api_key_svc: APIKeyService = Depends(get_api_key_service),
    llm_svc: LLMProviderService = Depends(get_llm_provider_service),
    exchange_svc: ExchangeConfigService = Depends(get_exchange_config_service),
    datasource_svc: DataSourceConfigService = Depends(get_data_source_config_service),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
):
    """
    详细的系统健康检查

    检查项：
    - 数据库连接状态
    - 配置完整性（API密钥、LLM提供商、交易所配置等）
    - 审计日志功能
    """
    health_info = {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "components": {},
        "configurations": {},
        "warnings": []
    }

    # 检查API密钥配置
    try:
        api_keys, total = await api_key_svc.list_api_keys(session, 0, 100)
        active_keys = [k for k in api_keys if k.is_active]
        health_info["configurations"]["api_keys"] = {
            "total": total,
            "active": len(active_keys),
            "status": "ok" if active_keys else "warning"
        }
        if not active_keys:
            health_info["warnings"].append("No active API keys configured")
    except Exception as e:
        health_info["configurations"]["api_keys"] = {"status": "error", "error": str(e)}
        health_info["status"] = "degraded"

    # 检查LLM提供商配置
    try:
        llm_providers = await llm_svc.list_active_providers(session)
        default_provider = await llm_svc.get_default_provider(session)
        health_info["configurations"]["llm_providers"] = {
            "total_active": len(llm_providers),
            "has_default": default_provider is not None,
            "status": "ok" if default_provider else "warning"
        }
        if not default_provider:
            health_info["warnings"].append("No default LLM provider configured")
    except Exception as e:
        health_info["configurations"]["llm_providers"] = {"status": "error", "error": str(e)}
        health_info["status"] = "degraded"

    # 检查交易所配置
    try:
        exchanges = await exchange_svc.list_active_exchanges(session)
        health_info["configurations"]["exchanges"] = {
            "total_active": len(exchanges),
            "trading_enabled": sum(1 for e in exchanges if e.trading_enabled),
            "status": "ok" if exchanges else "info"
        }
        if not exchanges:
            health_info["warnings"].append("No exchange configurations (optional)")
    except Exception as e:
        health_info["configurations"]["exchanges"] = {"status": "error", "error": str(e)}

    # 检查数据源配置
    try:
        data_sources = await datasource_svc.list_active_data_sources(session)
        health_info["configurations"]["data_sources"] = {
            "total_active": len(data_sources),
            "status": "ok" if data_sources else "info"
        }
        if not data_sources:
            health_info["warnings"].append("No data source configurations (optional)")
    except Exception as e:
        health_info["configurations"]["data_sources"] = {"status": "error", "error": str(e)}

    # 检查审计日志功能
    try:
        logs, total = await audit_svc.list_all_logs(session, 0, 1)
        health_info["components"]["audit_log"] = {
            "total_logs": total,
            "status": "ok"
        }
    except Exception as e:
        health_info["components"]["audit_log"] = {"status": "error", "error": str(e)}
        health_info["status"] = "degraded"

    # 数据库连接状态（从db_manager获取）
    from uteki.common.database import db_manager
    health_info["databases"] = {
        "postgresql": {"status": "connected" if db_manager.postgres_available else "disconnected"},
        "redis": {"status": "connected" if db_manager.redis_available else "disconnected"},
        "clickhouse": {"status": "connected" if db_manager.clickhouse_available else "disabled"},
        "qdrant": {"status": "connected" if db_manager.qdrant_available else "disabled"},
        "minio": {"status": "connected" if db_manager.minio_available else "disabled"}
    }

    return health_info
