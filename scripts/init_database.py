#!/usr/bin/env python3
"""
数据库初始化脚本
创建所有表和初始数据
"""

import asyncio
import sys
from pathlib import Path

# 添加backend目录到Python路径
backend_dir = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

from uteki.common.config import settings
from uteki.common.base import Base

# 导入所有模型以确保它们被注册
from uteki.domains.admin.models import (
    APIKey,
    User,
    SystemConfig,
    AuditLog,
    LLMProvider,
    ExchangeConfig,
    DataSourceConfig,
)
from uteki.domains.agent.models import (
    ChatConversation,
    ChatMessage,
)


async def create_schemas(engine):
    """创建所有schema（SQLite会跳过此步骤）"""
    from uteki.common.config import settings

    # SQLite不支持schema，跳过此步骤
    if settings.database_type == "sqlite":
        print("✓ SQLite mode: Skipping schema creation (not supported)")
        return

    # PostgreSQL: 创建所有schema
    schemas = ["admin", "trading", "data", "agent", "evaluation", "dashboard"]

    async with engine.begin() as conn:
        for schema in schemas:
            await conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))
            print(f"✓ Schema '{schema}' created/verified")


async def create_tables(engine):
    """创建所有表"""
    async with engine.begin() as conn:
        # 创建所有表
        await conn.run_sync(Base.metadata.create_all)
    print("✓ All tables created")


async def init_database():
    """初始化数据库"""
    print("=" * 60)
    print("  Database Initialization - uteki.open")
    print("=" * 60)
    print()

    # 创建异步引擎（自动选择SQLite或PostgreSQL）
    engine = create_async_engine(
        settings.database_url,
        echo=True,
    )

    try:
        # 1. 创建schemas
        print("Step 1: Creating schemas...")
        await create_schemas(engine)
        print()

        # 2. 创建表
        print("Step 2: Creating tables...")
        await create_tables(engine)
        print()

        print("=" * 60)
        print("✓ Database initialization completed successfully!")
        print("=" * 60)
        print()
        print("Next steps:")
        print("  1. Start the backend: cd backend && poetry run python -m uteki.main")
        print("  2. Visit http://localhost:8000/docs for API documentation")
        print("  3. Check health: http://localhost:8000/health")

    except Exception as e:
        print(f"✗ Database initialization failed: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(init_database())
