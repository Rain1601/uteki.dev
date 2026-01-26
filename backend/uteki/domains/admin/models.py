"""
Admin domain models - 系统管理相关数据模型
"""

from sqlalchemy import String, Boolean, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional, Dict, Any

from uteki.common.base import Base, TimestampMixin, UUIDMixin


class APIKey(Base, UUIDMixin, TimestampMixin):
    """
    API密钥配置表
    存储交易所、数据源、LLM等第三方服务的API密钥
    """

    __tablename__ = "api_keys"
    __table_args__ = (
        Index("idx_api_keys_provider_env", "provider", "environment"),
        {"schema": "admin"}
    )

    # 服务提供商 (okx, binance, fmp, openai, anthropic, dashscope, etc.)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)

    # 显示名称
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)

    # API Key (加密存储)
    api_key: Mapped[str] = mapped_column(String(500), nullable=False)

    # API Secret (可选，加密存储)
    api_secret: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # 额外配置 (如OKX的passphrase, 或其他provider特定配置)
    extra_config: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    # 环境 (production, sandbox, testnet)
    environment: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="production"
    )

    # 是否启用
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # 描述
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    def __repr__(self):
        return f"<APIKey(id={self.id}, provider={self.provider}, environment={self.environment})>"


class User(Base, UUIDMixin, TimestampMixin):
    """
    用户表 (预留多用户支持)
    支持OAuth登录 (Google, GitHub)
    """

    __tablename__ = "users"
    __table_args__ = (
        Index("idx_users_email", "email", unique=True),
        Index("idx_users_oauth", "oauth_provider", "oauth_id"),
        {"schema": "admin"}
    )

    # 用户邮箱
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)

    # 用户名
    username: Mapped[str] = mapped_column(String(100), nullable=False)

    # OAuth提供商 (google, github, email)
    oauth_provider: Mapped[str] = mapped_column(String(50), nullable=False)

    # OAuth ID
    oauth_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # 头像URL
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # 是否激活
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # 是否管理员
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # 用户配置 (偏好设置等)
    preferences: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    def __repr__(self):
        return f"<User(id={self.id}, email={self.email}, oauth_provider={self.oauth_provider})>"


class SystemConfig(Base, UUIDMixin, TimestampMixin):
    """
    系统配置表
    键值对存储系统级配置
    """

    __tablename__ = "system_config"
    __table_args__ = (
        Index("idx_system_config_key", "config_key", unique=True),
        {"schema": "admin"}
    )

    # 配置键
    config_key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)

    # 配置值
    config_value: Mapped[Any] = mapped_column(JSON, nullable=False)

    # 配置类型 (system, feature, integration)
    config_type: Mapped[str] = mapped_column(String(50), nullable=False, default="system")

    # 描述
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # 是否敏感信息
    is_sensitive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    def __repr__(self):
        return f"<SystemConfig(key={self.config_key}, type={self.config_type})>"


class AuditLog(Base, UUIDMixin, TimestampMixin):
    """
    审计日志表
    记录系统关键操作
    """

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("idx_audit_logs_user_action", "user_id", "action"),
        Index("idx_audit_logs_created", "created_at"),
        {"schema": "admin"}
    )

    # 用户ID (可选，系统操作时为None)
    user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    # 操作类型 (api_key.create, trade.execute, agent.run, etc.)
    action: Mapped[str] = mapped_column(String(100), nullable=False)

    # 资源类型 (api_key, order, agent_task, etc.)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # 资源ID
    resource_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # 操作详情
    details: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    # IP地址
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)

    # User Agent
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # 操作结果 (success, failure)
    status: Mapped[str] = mapped_column(String(20), nullable=False)

    # 错误信息 (如果失败)
    error_message: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)

    def __repr__(self):
        return f"<AuditLog(action={self.action}, resource={self.resource_type}, status={self.status})>"
