#!/usr/bin/env python3
"""
数据库初始化脚本 - 创建所有表
"""

import asyncio
import sys
from pathlib import Path

# 添加项目根目录到路径
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from uteki.common.base import Base
from uteki.common.database import db_manager

# 导入所有模型确保它们被注册
from uteki.domains.admin import models as admin_models
from uteki.domains.agent import models as agent_models


async def init_database():
    """初始化数据库 - 创建所有表"""
    print("🔧 Initializing database...")

    # 初始化数据库连接
    await db_manager.initialize()

    print(f"📦 Creating tables...")
    print(f"  Admin models: {len([x for x in dir(admin_models) if x[0].isupper()])} classes")
    print(f"  Agent models: {len([x for x in dir(agent_models) if x[0].isupper()])} classes")

    # 创建所有表
    async with db_manager.postgres_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    print("✅ All tables created successfully!")

    # 显示创建的表
    print("\n📋 Created tables:")
    for table in sorted(Base.metadata.tables.keys()):
        print(f"  - {table}")


if __name__ == "__main__":
    asyncio.run(init_database())
