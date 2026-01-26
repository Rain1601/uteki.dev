"""
Admin domain Pydantic schemas - API请求/响应模型
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Dict, Any
from datetime import datetime


# ============================================================================
# API Key Schemas
# ============================================================================

class APIKeyBase(BaseModel):
    """API密钥基础schema"""
    provider: str = Field(..., description="服务提供商 (okx, binance, fmp, openai, etc.)")
    display_name: str = Field(..., description="显示名称")
    environment: str = Field(default="production", description="环境 (production, sandbox, testnet)")
    description: Optional[str] = Field(None, description="描述")


class APIKeyCreate(APIKeyBase):
    """创建API密钥"""
    api_key: str = Field(..., description="API密钥")
    api_secret: Optional[str] = Field(None, description="API密钥Secret (可选)")
    extra_config: Optional[Dict[str, Any]] = Field(None, description="额外配置")
    is_active: bool = Field(default=True, description="是否启用")


class APIKeyUpdate(BaseModel):
    """更新API密钥"""
    display_name: Optional[str] = None
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    extra_config: Optional[Dict[str, Any]] = None
    environment: Optional[str] = None
    is_active: Optional[bool] = None
    description: Optional[str] = None


class APIKeyResponse(APIKeyBase):
    """API密钥响应 (不包含敏感信息)"""
    id: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    # 注意：不返回api_key和api_secret
    has_secret: bool = Field(..., description="是否配置了secret")

    class Config:
        from_attributes = True


class APIKeyDetailResponse(APIKeyResponse):
    """API密钥详细响应 (包含掩码后的密钥)"""
    api_key_masked: str = Field(..., description="掩码后的API密钥")
    extra_config: Optional[Dict[str, Any]] = None


# ============================================================================
# User Schemas
# ============================================================================

class UserBase(BaseModel):
    """用户基础schema"""
    email: EmailStr
    username: str


class UserCreate(UserBase):
    """创建用户"""
    oauth_provider: str = Field(..., description="OAuth提供商 (google, github, email)")
    oauth_id: Optional[str] = None
    avatar_url: Optional[str] = None


class UserUpdate(BaseModel):
    """更新用户"""
    username: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: Optional[bool] = None
    preferences: Optional[Dict[str, Any]] = None


class UserResponse(UserBase):
    """用户响应"""
    id: str
    oauth_provider: str
    avatar_url: Optional[str]
    is_active: bool
    is_admin: bool
    preferences: Optional[Dict[str, Any]]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# System Config Schemas
# ============================================================================

class SystemConfigBase(BaseModel):
    """系统配置基础schema"""
    config_key: str
    config_value: Any
    config_type: str = Field(default="system", description="配置类型")
    description: Optional[str] = None
    is_sensitive: bool = Field(default=False, description="是否敏感信息")


class SystemConfigCreate(SystemConfigBase):
    """创建系统配置"""
    pass


class SystemConfigUpdate(BaseModel):
    """更新系统配置"""
    config_value: Optional[Any] = None
    config_type: Optional[str] = None
    description: Optional[str] = None
    is_sensitive: Optional[bool] = None


class SystemConfigResponse(SystemConfigBase):
    """系统配置响应"""
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# Audit Log Schemas
# ============================================================================

class AuditLogBase(BaseModel):
    """审计日志基础schema"""
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class AuditLogCreate(AuditLogBase):
    """创建审计日志"""
    user_id: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    status: str
    error_message: Optional[str] = None


class AuditLogResponse(AuditLogBase):
    """审计日志响应"""
    id: str
    user_id: Optional[str]
    ip_address: Optional[str]
    status: str
    error_message: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# Common Response Schemas
# ============================================================================

class MessageResponse(BaseModel):
    """通用消息响应"""
    message: str


class PaginatedResponse(BaseModel):
    """分页响应基类"""
    total: int = Field(..., description="总记录数")
    page: int = Field(..., description="当前页码")
    page_size: int = Field(..., description="每页记录数")
    total_pages: int = Field(..., description="总页数")


class PaginatedAPIKeysResponse(PaginatedResponse):
    """分页API密钥响应"""
    items: list[APIKeyResponse]


class PaginatedUsersResponse(PaginatedResponse):
    """分页用户响应"""
    items: list[UserResponse]


class PaginatedAuditLogsResponse(PaginatedResponse):
    """分页审计日志响应"""
    items: list[AuditLogResponse]
