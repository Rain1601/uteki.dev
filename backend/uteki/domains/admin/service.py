"""
Admin domain service - 业务逻辑层
"""

from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Tuple
from cryptography.fernet import Fernet
import base64
import os

from uteki.domains.admin.models import APIKey, User, SystemConfig, AuditLog
from uteki.domains.admin.repository import (
    APIKeyRepository,
    UserRepository,
    SystemConfigRepository,
    AuditLogRepository,
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


# 全局服务实例
encryption_service = EncryptionService()
api_key_service = APIKeyService(encryption_service)
user_service = UserService()
system_config_service = SystemConfigService()
audit_log_service = AuditLogService()
