"""
Admin domain repository - 数据访问层
"""

from sqlalchemy import select, func, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Tuple

from uteki.domains.admin.models import (
    APIKey,
    User,
    SystemConfig,
    AuditLog,
    LLMProvider,
    ExchangeConfig,
    DataSourceConfig,
)


class APIKeyRepository:
    """API密钥数据访问"""

    @staticmethod
    async def create(session: AsyncSession, api_key: APIKey) -> APIKey:
        """创建API密钥"""
        session.add(api_key)
        await session.flush()
        await session.refresh(api_key)
        return api_key

    @staticmethod
    async def get_by_id(session: AsyncSession, api_key_id: str) -> Optional[APIKey]:
        """根据ID获取API密钥"""
        stmt = select(APIKey).where(APIKey.id == api_key_id)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_provider(
        session: AsyncSession, provider: str, environment: str = "production"
    ) -> Optional[APIKey]:
        """根据提供商获取API密钥"""
        stmt = (
            select(APIKey)
            .where(APIKey.provider == provider)
            .where(APIKey.environment == environment)
            .where(APIKey.is_active == True)
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_all(
        session: AsyncSession, skip: int = 0, limit: int = 100
    ) -> Tuple[List[APIKey], int]:
        """列出所有API密钥（分页）"""
        # 查询总数
        count_stmt = select(func.count()).select_from(APIKey)
        total = await session.scalar(count_stmt)

        # 查询数据
        stmt = select(APIKey).offset(skip).limit(limit)
        result = await session.execute(stmt)
        items = list(result.scalars().all())

        return items, total or 0

    @staticmethod
    async def update(session: AsyncSession, api_key_id: str, **kwargs) -> Optional[APIKey]:
        """更新API密钥"""
        stmt = (
            update(APIKey)
            .where(APIKey.id == api_key_id)
            .values(**kwargs)
            .returning(APIKey)
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def delete(session: AsyncSession, api_key_id: str) -> bool:
        """删除API密钥"""
        stmt = delete(APIKey).where(APIKey.id == api_key_id)
        result = await session.execute(stmt)
        return result.rowcount > 0


class UserRepository:
    """用户数据访问"""

    @staticmethod
    async def create(session: AsyncSession, user: User) -> User:
        """创建用户"""
        session.add(user)
        await session.flush()
        await session.refresh(user)
        return user

    @staticmethod
    async def get_by_id(session: AsyncSession, user_id: str) -> Optional[User]:
        """根据ID获取用户"""
        stmt = select(User).where(User.id == user_id)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_email(session: AsyncSession, email: str) -> Optional[User]:
        """根据邮箱获取用户"""
        stmt = select(User).where(User.email == email)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_oauth(
        session: AsyncSession, oauth_provider: str, oauth_id: str
    ) -> Optional[User]:
        """根据OAuth信息获取用户"""
        stmt = (
            select(User)
            .where(User.oauth_provider == oauth_provider)
            .where(User.oauth_id == oauth_id)
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_all(
        session: AsyncSession, skip: int = 0, limit: int = 100
    ) -> Tuple[List[User], int]:
        """列出所有用户（分页）"""
        count_stmt = select(func.count()).select_from(User)
        total = await session.scalar(count_stmt)

        stmt = select(User).offset(skip).limit(limit)
        result = await session.execute(stmt)
        items = list(result.scalars().all())

        return items, total or 0

    @staticmethod
    async def update(session: AsyncSession, user_id: str, **kwargs) -> Optional[User]:
        """更新用户"""
        stmt = update(User).where(User.id == user_id).values(**kwargs).returning(User)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()


class SystemConfigRepository:
    """系统配置数据访问"""

    @staticmethod
    async def create(session: AsyncSession, config: SystemConfig) -> SystemConfig:
        """创建配置"""
        session.add(config)
        await session.flush()
        await session.refresh(config)
        return config

    @staticmethod
    async def get_by_key(session: AsyncSession, config_key: str) -> Optional[SystemConfig]:
        """根据键获取配置"""
        stmt = select(SystemConfig).where(SystemConfig.config_key == config_key)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_all(session: AsyncSession) -> List[SystemConfig]:
        """列出所有配置"""
        stmt = select(SystemConfig)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def update(
        session: AsyncSession, config_key: str, **kwargs
    ) -> Optional[SystemConfig]:
        """更新配置"""
        stmt = (
            update(SystemConfig)
            .where(SystemConfig.config_key == config_key)
            .values(**kwargs)
            .returning(SystemConfig)
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def delete(session: AsyncSession, config_key: str) -> bool:
        """删除配置"""
        stmt = delete(SystemConfig).where(SystemConfig.config_key == config_key)
        result = await session.execute(stmt)
        return result.rowcount > 0


class AuditLogRepository:
    """审计日志数据访问"""

    @staticmethod
    async def create(session: AsyncSession, log: AuditLog) -> AuditLog:
        """创建审计日志"""
        session.add(log)
        await session.flush()
        await session.refresh(log)
        return log

    @staticmethod
    async def list_by_user(
        session: AsyncSession, user_id: str, skip: int = 0, limit: int = 100
    ) -> Tuple[List[AuditLog], int]:
        """列出用户的审计日志"""
        count_stmt = (
            select(func.count()).select_from(AuditLog).where(AuditLog.user_id == user_id)
        )
        total = await session.scalar(count_stmt)

        stmt = (
            select(AuditLog)
            .where(AuditLog.user_id == user_id)
            .order_by(AuditLog.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await session.execute(stmt)
        items = list(result.scalars().all())

        return items, total or 0

    @staticmethod
    async def list_all(
        session: AsyncSession, skip: int = 0, limit: int = 100
    ) -> Tuple[List[AuditLog], int]:
        """列出所有审计日志"""
        count_stmt = select(func.count()).select_from(AuditLog)
        total = await session.scalar(count_stmt)

        stmt = (
            select(AuditLog)
            .order_by(AuditLog.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await session.execute(stmt)
        items = list(result.scalars().all())

        return items, total or 0


class LLMProviderRepository:
    """LLM提供商数据访问"""

    @staticmethod
    async def create(session: AsyncSession, provider: LLMProvider) -> LLMProvider:
        """创建LLM提供商配置"""
        session.add(provider)
        await session.flush()
        await session.refresh(provider)
        return provider

    @staticmethod
    async def get_by_id(session: AsyncSession, provider_id: str) -> Optional[LLMProvider]:
        """根据ID获取LLM提供商"""
        stmt = select(LLMProvider).where(LLMProvider.id == provider_id)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_default_provider(session: AsyncSession) -> Optional[LLMProvider]:
        """获取默认LLM提供商"""
        stmt = (
            select(LLMProvider)
            .where(LLMProvider.is_default == True)
            .where(LLMProvider.is_active == True)
            .order_by(LLMProvider.priority)
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_active_providers(session: AsyncSession) -> List[LLMProvider]:
        """列出所有激活的LLM提供商（按优先级排序）"""
        stmt = (
            select(LLMProvider)
            .where(LLMProvider.is_active == True)
            .order_by(LLMProvider.priority)
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def list_all(
        session: AsyncSession, skip: int = 0, limit: int = 100
    ) -> Tuple[List[LLMProvider], int]:
        """列出所有LLM提供商（分页）"""
        count_stmt = select(func.count()).select_from(LLMProvider)
        total = await session.scalar(count_stmt)

        stmt = (
            select(LLMProvider)
            .order_by(LLMProvider.priority, LLMProvider.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await session.execute(stmt)
        items = list(result.scalars().all())

        return items, total or 0

    @staticmethod
    async def update(
        session: AsyncSession, provider_id: str, **kwargs
    ) -> Optional[LLMProvider]:
        """更新LLM提供商"""
        stmt = (
            update(LLMProvider)
            .where(LLMProvider.id == provider_id)
            .values(**kwargs)
            .returning(LLMProvider)
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def delete(session: AsyncSession, provider_id: str) -> bool:
        """删除LLM提供商"""
        stmt = delete(LLMProvider).where(LLMProvider.id == provider_id)
        result = await session.execute(stmt)
        return result.rowcount > 0


class ExchangeConfigRepository:
    """交易所配置数据访问"""

    @staticmethod
    async def create(session: AsyncSession, exchange: ExchangeConfig) -> ExchangeConfig:
        """创建交易所配置"""
        session.add(exchange)
        await session.flush()
        await session.refresh(exchange)
        return exchange

    @staticmethod
    async def get_by_id(session: AsyncSession, config_id: str) -> Optional[ExchangeConfig]:
        """根据ID获取交易所配置"""
        stmt = select(ExchangeConfig).where(ExchangeConfig.id == config_id)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_exchange(
        session: AsyncSession, exchange: str
    ) -> Optional[ExchangeConfig]:
        """根据交易所名称获取配置"""
        stmt = (
            select(ExchangeConfig)
            .where(ExchangeConfig.exchange == exchange)
            .where(ExchangeConfig.is_active == True)
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_active_exchanges(session: AsyncSession) -> List[ExchangeConfig]:
        """列出所有激活的交易所配置"""
        stmt = select(ExchangeConfig).where(ExchangeConfig.is_active == True)
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def list_all(
        session: AsyncSession, skip: int = 0, limit: int = 100
    ) -> Tuple[List[ExchangeConfig], int]:
        """列出所有交易所配置（分页）"""
        count_stmt = select(func.count()).select_from(ExchangeConfig)
        total = await session.scalar(count_stmt)

        stmt = select(ExchangeConfig).offset(skip).limit(limit)
        result = await session.execute(stmt)
        items = list(result.scalars().all())

        return items, total or 0

    @staticmethod
    async def update(
        session: AsyncSession, config_id: str, **kwargs
    ) -> Optional[ExchangeConfig]:
        """更新交易所配置"""
        stmt = (
            update(ExchangeConfig)
            .where(ExchangeConfig.id == config_id)
            .values(**kwargs)
            .returning(ExchangeConfig)
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def delete(session: AsyncSession, config_id: str) -> bool:
        """删除交易所配置"""
        stmt = delete(ExchangeConfig).where(ExchangeConfig.id == config_id)
        result = await session.execute(stmt)
        return result.rowcount > 0


class DataSourceConfigRepository:
    """数据源配置数据访问"""

    @staticmethod
    async def create(
        session: AsyncSession, data_source: DataSourceConfig
    ) -> DataSourceConfig:
        """创建数据源配置"""
        session.add(data_source)
        await session.flush()
        await session.refresh(data_source)
        return data_source

    @staticmethod
    async def get_by_id(
        session: AsyncSession, config_id: str
    ) -> Optional[DataSourceConfig]:
        """根据ID获取数据源配置"""
        stmt = select(DataSourceConfig).where(DataSourceConfig.id == config_id)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_source_type(
        session: AsyncSession, source_type: str
    ) -> Optional[DataSourceConfig]:
        """根据数据源类型获取配置"""
        stmt = (
            select(DataSourceConfig)
            .where(DataSourceConfig.source_type == source_type)
            .where(DataSourceConfig.is_active == True)
            .order_by(DataSourceConfig.priority)
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_active_sources(session: AsyncSession) -> List[DataSourceConfig]:
        """列出所有激活的数据源配置（按优先级排序）"""
        stmt = (
            select(DataSourceConfig)
            .where(DataSourceConfig.is_active == True)
            .order_by(DataSourceConfig.priority)
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def list_by_data_type(
        session: AsyncSession, data_type: str
    ) -> List[DataSourceConfig]:
        """根据数据类型列出数据源（如"stock", "crypto"）"""
        stmt = (
            select(DataSourceConfig)
            .where(DataSourceConfig.data_types.contains([data_type]))
            .where(DataSourceConfig.is_active == True)
            .order_by(DataSourceConfig.priority)
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def list_all(
        session: AsyncSession, skip: int = 0, limit: int = 100
    ) -> Tuple[List[DataSourceConfig], int]:
        """列出所有数据源配置（分页）"""
        count_stmt = select(func.count()).select_from(DataSourceConfig)
        total = await session.scalar(count_stmt)

        stmt = (
            select(DataSourceConfig)
            .order_by(DataSourceConfig.priority, DataSourceConfig.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await session.execute(stmt)
        items = list(result.scalars().all())

        return items, total or 0

    @staticmethod
    async def update(
        session: AsyncSession, config_id: str, **kwargs
    ) -> Optional[DataSourceConfig]:
        """更新数据源配置"""
        stmt = (
            update(DataSourceConfig)
            .where(DataSourceConfig.id == config_id)
            .values(**kwargs)
            .returning(DataSourceConfig)
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def delete(session: AsyncSession, config_id: str) -> bool:
        """删除数据源配置"""
        stmt = delete(DataSourceConfig).where(DataSourceConfig.id == config_id)
        result = await session.execute(stmt)
        return result.rowcount > 0
