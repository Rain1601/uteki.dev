"""
SQLAlchemy基础类定义
"""

from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import DateTime, func
from datetime import datetime
from typing import Optional, Tuple, Any
import uuid


def get_table_args(*args, schema: Optional[str] = None) -> Tuple[Any, ...]:
    """
    生成table_args，根据数据库类型决定是否使用schema

    SQLite不支持schema，PostgreSQL支持

    Args:
        *args: 索引、约束等配置
        schema: PostgreSQL schema名称（SQLite下会被忽略）

    Returns:
        适配当前数据库的table_args
    """
    from uteki.common.config import settings

    # SQLite不支持schema
    if settings.database_type == "sqlite":
        return args if args else ()
    else:
        # PostgreSQL使用schema
        return (*args, {"schema": schema}) if schema else args


def get_table_ref(table_name: str, schema: Optional[str] = None) -> str:
    """
    生成表引用名（用于ForeignKey），根据数据库类型决定是否包含schema

    Args:
        table_name: 表名
        schema: PostgreSQL schema名称（SQLite下会被忽略）

    Returns:
        适配当前数据库的表引用名
    """
    from uteki.common.config import settings

    # SQLite不支持schema
    if settings.database_type == "sqlite":
        return table_name
    else:
        # PostgreSQL使用schema.table_name
        return f"{schema}.{table_name}" if schema else table_name


class Base(DeclarativeBase):
    """所有SQLAlchemy模型的基类"""
    pass


class TimestampMixin:
    """时间戳Mixin - 自动管理created_at和updated_at"""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )


class UUIDMixin:
    """UUID主键Mixin"""

    id: Mapped[str] = mapped_column(
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
        nullable=False
    )
