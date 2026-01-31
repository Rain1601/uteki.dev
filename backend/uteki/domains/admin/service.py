"""
Admin domain service - 业务逻辑层
"""

from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Tuple
from cryptography.fernet import Fernet
import base64
import os

from uteki.domains.admin.models import (
    APIKey,
    User,
    SystemConfig,
    AuditLog,
    LLMProvider,
    ExchangeConfig,
    DataSourceConfig,
)
from uteki.domains.admin.repository import (
    APIKeyRepository,
    UserRepository,
    SystemConfigRepository,
    AuditLogRepository,
    LLMProviderRepository,
    ExchangeConfigRepository,
    DataSourceConfigRepository,
)
from uteki.domains.admin import schemas


class EncryptionService:
    """加密服务 - 用于敏感数据加密"""

    def __init__(self):
        # 在生产环境应该从环境变量或密钥管理服务获取
        key = os.getenv("ENCRYPTION_KEY")
        if not key:
            # 开发环境生成临时密钥
            key = Fernet.generate_key()
        elif isinstance(key, str):
            key = key.encode()

        self.fernet = Fernet(key)

    def encrypt(self, plain_text: str) -> str:
        """加密文本"""
        return self.fernet.encrypt(plain_text.encode()).decode()

    def decrypt(self, encrypted_text: str) -> str:
        """解密文本"""
        return self.fernet.decrypt(encrypted_text.encode()).decode()

    @staticmethod
    def mask_api_key(api_key: str, visible_chars: int = 4) -> str:
        """掩码API密钥，只显示前几位"""
        if len(api_key) <= visible_chars:
            return "*" * len(api_key)
        return api_key[:visible_chars] + "*" * (len(api_key) - visible_chars)


class APIKeyService:
    """API密钥服务"""

    def __init__(self, encryption_service: EncryptionService):
        self.encryption = encryption_service

    async def create_api_key(
        self, session: AsyncSession, data: schemas.APIKeyCreate
    ) -> APIKey:
        """创建API密钥"""
        # 加密敏感信息
        encrypted_key = self.encryption.encrypt(data.api_key)
        encrypted_secret = (
            self.encryption.encrypt(data.api_secret) if data.api_secret else None
        )

        api_key = APIKey(
            provider=data.provider,
            display_name=data.display_name,
            api_key=encrypted_key,
            api_secret=encrypted_secret,
            extra_config=data.extra_config,
            environment=data.environment,
            is_active=data.is_active,
            description=data.description,
        )

        return await APIKeyRepository.create(session, api_key)

    async def get_api_key(
        self, session: AsyncSession, api_key_id: str, decrypt: bool = False
    ) -> Optional[APIKey]:
        """获取API密钥"""
        api_key = await APIKeyRepository.get_by_id(session, api_key_id)
        if api_key and decrypt:
            # 解密返回（注意：仅在需要时解密）
            api_key.api_key = self.encryption.decrypt(api_key.api_key)
            if api_key.api_secret:
                api_key.api_secret = self.encryption.decrypt(api_key.api_secret)
        return api_key

    async def get_api_key_by_provider(
        self, session: AsyncSession, provider: str, environment: str = "production"
    ) -> Optional[APIKey]:
        """根据提供商获取API密钥（自动解密）"""
        api_key = await APIKeyRepository.get_by_provider(session, provider, environment)
        if api_key:
            api_key.api_key = self.encryption.decrypt(api_key.api_key)
            if api_key.api_secret:
                api_key.api_secret = self.encryption.decrypt(api_key.api_secret)
        return api_key

    async def list_api_keys(
        self, session: AsyncSession, skip: int = 0, limit: int = 100
    ) -> Tuple[List[schemas.APIKeyResponse], int]:
        """列出所有API密钥（不包含敏感信息）"""
        items, total = await APIKeyRepository.list_all(session, skip, limit)

        # 转换为响应schema
        response_items = [
            schemas.APIKeyResponse(
                id=item.id,
                provider=item.provider,
                display_name=item.display_name,
                environment=item.environment,
                description=item.description,
                is_active=item.is_active,
                has_secret=item.api_secret is not None,
                created_at=item.created_at,
                updated_at=item.updated_at,
            )
            for item in items
        ]

        return response_items, total

    async def update_api_key(
        self, session: AsyncSession, api_key_id: str, data: schemas.APIKeyUpdate
    ) -> Optional[APIKey]:
        """更新API密钥"""
        update_data = data.dict(exclude_unset=True)

        # 加密新的敏感信息
        if "api_key" in update_data:
            update_data["api_key"] = self.encryption.encrypt(update_data["api_key"])
        if "api_secret" in update_data and update_data["api_secret"]:
            update_data["api_secret"] = self.encryption.encrypt(update_data["api_secret"])

        return await APIKeyRepository.update(session, api_key_id, **update_data)

    async def delete_api_key(self, session: AsyncSession, api_key_id: str) -> bool:
        """删除API密钥"""
        return await APIKeyRepository.delete(session, api_key_id)


class UserService:
    """用户服务"""

    async def create_user(self, session: AsyncSession, data: schemas.UserCreate) -> User:
        """创建用户"""
        user = User(
            email=data.email,
            username=data.username,
            oauth_provider=data.oauth_provider,
            oauth_id=data.oauth_id,
            avatar_url=data.avatar_url,
        )
        return await UserRepository.create(session, user)

    async def get_user(self, session: AsyncSession, user_id: str) -> Optional[User]:
        """获取用户"""
        return await UserRepository.get_by_id(session, user_id)

    async def get_user_by_email(self, session: AsyncSession, email: str) -> Optional[User]:
        """根据邮箱获取用户"""
        return await UserRepository.get_by_email(session, email)

    async def get_or_create_oauth_user(
        self,
        session: AsyncSession,
        oauth_provider: str,
        oauth_id: str,
        email: str,
        username: str,
        avatar_url: Optional[str] = None,
    ) -> User:
        """获取或创建OAuth用户"""
        user = await UserRepository.get_by_oauth(session, oauth_provider, oauth_id)
        if not user:
            user = User(
                email=email,
                username=username,
                oauth_provider=oauth_provider,
                oauth_id=oauth_id,
                avatar_url=avatar_url,
            )
            user = await UserRepository.create(session, user)
        return user

    async def list_users(
        self, session: AsyncSession, skip: int = 0, limit: int = 100
    ) -> Tuple[List[User], int]:
        """列出所有用户"""
        return await UserRepository.list_all(session, skip, limit)

    async def update_user(
        self, session: AsyncSession, user_id: str, data: schemas.UserUpdate
    ) -> Optional[User]:
        """更新用户"""
        update_data = data.dict(exclude_unset=True)
        return await UserRepository.update(session, user_id, **update_data)


class SystemConfigService:
    """系统配置服务"""

    async def set_config(
        self, session: AsyncSession, data: schemas.SystemConfigCreate
    ) -> SystemConfig:
        """设置配置（创建或更新）"""
        existing = await SystemConfigRepository.get_by_key(session, data.config_key)
        if existing:
            return await SystemConfigRepository.update(
                session,
                data.config_key,
                config_value=data.config_value,
                config_type=data.config_type,
                description=data.description,
                is_sensitive=data.is_sensitive,
            )
        else:
            config = SystemConfig(
                config_key=data.config_key,
                config_value=data.config_value,
                config_type=data.config_type,
                description=data.description,
                is_sensitive=data.is_sensitive,
            )
            return await SystemConfigRepository.create(session, config)

    async def get_config(
        self, session: AsyncSession, config_key: str
    ) -> Optional[SystemConfig]:
        """获取配置"""
        return await SystemConfigRepository.get_by_key(session, config_key)

    async def list_all_configs(self, session: AsyncSession) -> List[SystemConfig]:
        """列出所有配置"""
        return await SystemConfigRepository.list_all(session)

    async def delete_config(self, session: AsyncSession, config_key: str) -> bool:
        """删除配置"""
        return await SystemConfigRepository.delete(session, config_key)


class AuditLogService:
    """审计日志服务"""

    async def log_action(
        self,
        session: AsyncSession,
        action: str,
        resource_type: str,
        status: str,
        user_id: Optional[str] = None,
        resource_id: Optional[str] = None,
        details: Optional[dict] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> AuditLog:
        """记录审计日志"""
        log = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent,
            status=status,
            error_message=error_message,
        )
        return await AuditLogRepository.create(session, log)

    async def list_user_logs(
        self, session: AsyncSession, user_id: str, skip: int = 0, limit: int = 100
    ) -> Tuple[List[AuditLog], int]:
        """列出用户的审计日志"""
        return await AuditLogRepository.list_by_user(session, user_id, skip, limit)

    async def list_all_logs(
        self, session: AsyncSession, skip: int = 0, limit: int = 100
    ) -> Tuple[List[AuditLog], int]:
        """列出所有审计日志"""
        return await AuditLogRepository.list_all(session, skip, limit)


class LLMProviderService:
    """LLM提供商服务"""

    async def create_provider(
        self, session: AsyncSession, data: schemas.LLMProviderCreate
    ) -> LLMProvider:
        """创建LLM提供商配置"""
        provider = LLMProvider(
            provider=data.provider,
            model=data.model,
            api_key_id=data.api_key_id,
            display_name=data.display_name,
            config=data.config,
            is_default=data.is_default,
            is_active=data.is_active,
            priority=data.priority,
            description=data.description,
        )
        return await LLMProviderRepository.create(session, provider)

    async def get_provider(
        self, session: AsyncSession, provider_id: str
    ) -> Optional[LLMProvider]:
        """获取LLM提供商"""
        return await LLMProviderRepository.get_by_id(session, provider_id)

    async def get_default_provider(
        self, session: AsyncSession
    ) -> Optional[LLMProvider]:
        """获取默认LLM提供商"""
        return await LLMProviderRepository.get_default_provider(session)

    async def list_providers(
        self, session: AsyncSession, skip: int = 0, limit: int = 100
    ) -> Tuple[List[LLMProvider], int]:
        """列出所有LLM提供商"""
        return await LLMProviderRepository.list_all(session, skip, limit)

    async def list_active_providers(
        self, session: AsyncSession
    ) -> List[LLMProvider]:
        """列出激活的LLM提供商"""
        return await LLMProviderRepository.list_active_providers(session)

    async def update_provider(
        self, session: AsyncSession, provider_id: str, data: schemas.LLMProviderUpdate
    ) -> Optional[LLMProvider]:
        """更新LLM提供商"""
        update_data = data.dict(exclude_unset=True)
        return await LLMProviderRepository.update(session, provider_id, **update_data)

    async def delete_provider(
        self, session: AsyncSession, provider_id: str
    ) -> bool:
        """删除LLM提供商"""
        return await LLMProviderRepository.delete(session, provider_id)


class ExchangeConfigService:
    """交易所配置服务"""

    async def create_exchange(
        self, session: AsyncSession, data: schemas.ExchangeConfigCreate
    ) -> ExchangeConfig:
        """创建交易所配置"""
        exchange = ExchangeConfig(
            exchange=data.exchange,
            api_key_id=data.api_key_id,
            display_name=data.display_name,
            trading_enabled=data.trading_enabled,
            spot_enabled=data.spot_enabled,
            futures_enabled=data.futures_enabled,
            max_position_size=data.max_position_size,
            risk_config=data.risk_config,
            exchange_config=data.exchange_config,
            is_active=data.is_active,
            description=data.description,
        )
        return await ExchangeConfigRepository.create(session, exchange)

    async def get_exchange(
        self, session: AsyncSession, config_id: str
    ) -> Optional[ExchangeConfig]:
        """获取交易所配置"""
        return await ExchangeConfigRepository.get_by_id(session, config_id)

    async def get_exchange_by_name(
        self, session: AsyncSession, exchange: str
    ) -> Optional[ExchangeConfig]:
        """根据交易所名称获取配置"""
        return await ExchangeConfigRepository.get_by_exchange(session, exchange)

    async def list_exchanges(
        self, session: AsyncSession, skip: int = 0, limit: int = 100
    ) -> Tuple[List[ExchangeConfig], int]:
        """列出所有交易所配置"""
        return await ExchangeConfigRepository.list_all(session, skip, limit)

    async def list_active_exchanges(
        self, session: AsyncSession
    ) -> List[ExchangeConfig]:
        """列出激活的交易所配置"""
        return await ExchangeConfigRepository.list_active_exchanges(session)

    async def update_exchange(
        self, session: AsyncSession, config_id: str, data: schemas.ExchangeConfigUpdate
    ) -> Optional[ExchangeConfig]:
        """更新交易所配置"""
        update_data = data.dict(exclude_unset=True)
        return await ExchangeConfigRepository.update(session, config_id, **update_data)

    async def delete_exchange(
        self, session: AsyncSession, config_id: str
    ) -> bool:
        """删除交易所配置"""
        return await ExchangeConfigRepository.delete(session, config_id)


class DataSourceConfigService:
    """数据源配置服务"""

    async def create_data_source(
        self, session: AsyncSession, data: schemas.DataSourceConfigCreate
    ) -> DataSourceConfig:
        """创建数据源配置"""
        data_source = DataSourceConfig(
            source_type=data.source_type,
            api_key_id=data.api_key_id,
            display_name=data.display_name,
            data_types=data.data_types,
            refresh_interval=data.refresh_interval,
            priority=data.priority,
            source_config=data.source_config,
            is_active=data.is_active,
            description=data.description,
        )
        return await DataSourceConfigRepository.create(session, data_source)

    async def get_data_source(
        self, session: AsyncSession, config_id: str
    ) -> Optional[DataSourceConfig]:
        """获取数据源配置"""
        return await DataSourceConfigRepository.get_by_id(session, config_id)

    async def get_data_source_by_type(
        self, session: AsyncSession, source_type: str
    ) -> Optional[DataSourceConfig]:
        """根据数据源类型获取配置"""
        return await DataSourceConfigRepository.get_by_source_type(session, source_type)

    async def list_data_sources(
        self, session: AsyncSession, skip: int = 0, limit: int = 100
    ) -> Tuple[List[DataSourceConfig], int]:
        """列出所有数据源配置"""
        return await DataSourceConfigRepository.list_all(session, skip, limit)

    async def list_active_data_sources(
        self, session: AsyncSession
    ) -> List[DataSourceConfig]:
        """列出激活的数据源配置"""
        return await DataSourceConfigRepository.list_active_sources(session)

    async def list_by_data_type(
        self, session: AsyncSession, data_type: str
    ) -> List[DataSourceConfig]:
        """根据数据类型列出数据源"""
        return await DataSourceConfigRepository.list_by_data_type(session, data_type)

    async def update_data_source(
        self, session: AsyncSession, config_id: str, data: schemas.DataSourceConfigUpdate
    ) -> Optional[DataSourceConfig]:
        """更新数据源配置"""
        update_data = data.dict(exclude_unset=True)
        return await DataSourceConfigRepository.update(session, config_id, **update_data)

    async def delete_data_source(
        self, session: AsyncSession, config_id: str
    ) -> bool:
        """删除数据源配置"""
        return await DataSourceConfigRepository.delete(session, config_id)


# 依赖注入工厂函数（用于 FastAPI Depends）
# 这些函数在请求时才创建服务实例，避免模块导入时的性能开销

def get_encryption_service() -> EncryptionService:
    """获取加密服务实例"""
    return EncryptionService()


def get_api_key_service(
    encryption_service: EncryptionService = None
) -> APIKeyService:
    """获取 API Key 服务实例"""
    if encryption_service is None:
        encryption_service = get_encryption_service()
    return APIKeyService(encryption_service)


def get_user_service() -> UserService:
    """获取用户服务实例"""
    return UserService()


def get_system_config_service() -> SystemConfigService:
    """获取系统配置服务实例"""
    return SystemConfigService()


def get_audit_log_service() -> AuditLogService:
    """获取审计日志服务实例"""
    return AuditLogService()


def get_llm_provider_service() -> LLMProviderService:
    """获取 LLM Provider 服务实例"""
    return LLMProviderService()


def get_exchange_config_service() -> ExchangeConfigService:
    """获取交易所配置服务实例"""
    return ExchangeConfigService()


def get_data_source_config_service() -> DataSourceConfigService:
    """获取数据源配置服务实例"""
    return DataSourceConfigService()
