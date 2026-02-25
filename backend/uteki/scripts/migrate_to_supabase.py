"""
SQLite → Supabase 数据迁移脚本

Usage:
    cd backend
    python -m uteki.scripts.migrate_to_supabase

功能：
1. 从本地 SQLite 读取所有非 SNB 表的数据
2. 按 FK 依赖顺序，批量 upsert 到 Supabase REST API
3. 输出每张表的迁移统计
"""

import asyncio
import logging
from datetime import datetime, date
from typing import List, Dict, Any

from sqlalchemy import select, inspect

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 按 FK 依赖排序的表迁移顺序（Tier 0 → Tier 4）
MIGRATION_ORDER = [
    # Tier 0: 无 FK 依赖
    ("users",              "uteki.domains.admin.models",   "User"),
    ("system_config",      "uteki.domains.admin.models",   "SystemConfig"),
    ("api_keys",           "uteki.domains.admin.models",   "APIKey"),
    ("audit_logs",         "uteki.domains.admin.models",   "AuditLog"),
    ("chat_conversations", "uteki.domains.agent.models",   "ChatConversation"),
    ("prompt_version",     "uteki.domains.index.models",   "PromptVersion"),
    ("watchlist",          "uteki.domains.index.models",   "Watchlist"),
    ("index_prices",       "uteki.domains.index.models",   "IndexPrice"),
    ("agent_memory",       "uteki.domains.index.models",   "AgentMemory"),
    ("schedule_task",      "uteki.domains.index.models",   "ScheduleTask"),
    ("economic_events",    "uteki.domains.macro.models",   "EconomicEvent"),
    ("news_articles",      "uteki.domains.news.models",    "NewsArticle"),
    # Tier 1: 依赖 Tier 0
    ("data_source_configs","uteki.domains.admin.models",   "DataSourceConfig"),
    ("llm_providers",      "uteki.domains.admin.models",   "LLMProvider"),
    ("exchange_configs",   "uteki.domains.admin.models",   "ExchangeConfig"),
    ("chat_messages",      "uteki.domains.agent.models",   "ChatMessage"),
    ("decision_harness",   "uteki.domains.index.models",   "DecisionHarness"),
    ("model_score",        "uteki.domains.index.models",   "ModelScore"),
    # Tier 2
    ("model_io",           "uteki.domains.index.models",   "ModelIO"),
    # Tier 3
    ("arena_vote",         "uteki.domains.index.models",   "ArenaVote"),
    ("decision_log",       "uteki.domains.index.models",   "DecisionLog"),
    # Tier 4
    ("counterfactual",     "uteki.domains.index.models",   "Counterfactual"),
]


def serialize_value(val: Any) -> Any:
    """将 Python 值序列化为 Supabase REST API 兼容格式"""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.isoformat()
    if isinstance(val, date):
        return val.isoformat()
    # JSON 列可能存了非序列化对象（如 SQLAlchemy MetaData），降级为 None
    if not isinstance(val, (str, int, float, bool, list, dict)):
        try:
            import json
            json.dumps(val)
            return val
        except (TypeError, ValueError):
            return None
    return val


def model_to_dict(instance, model_class) -> Dict[str, Any]:
    """提取模型实例的所有列值，序列化为 REST API 格式"""
    return {
        col.key: serialize_value(getattr(instance, col.key))
        for col in model_class.__table__.columns
    }


def import_model(module_path: str, class_name: str):
    """动态导入模型类"""
    import importlib
    module = importlib.import_module(module_path)
    return getattr(module, class_name)


async def migrate_table(
    table_name: str,
    module_path: str,
    class_name: str,
    sb,
    session,
) -> Dict[str, int]:
    """迁移单张表"""
    stats = {"total": 0, "migrated": 0, "failed": 0}

    try:
        model_class = import_model(module_path, class_name)
    except Exception as e:
        logger.error(f"  [{table_name}] Failed to import model: {e}")
        return stats

    # 从 SQLite 读取所有记录
    try:
        result = await session.execute(select(model_class))
        records = list(result.scalars().all())
        stats["total"] = len(records)
    except Exception as e:
        logger.error(f"  [{table_name}] Failed to read from SQLite: {e}")
        return stats

    if not records:
        logger.info(f"  [{table_name}] Empty — skipped")
        return stats

    # 序列化
    rows = []
    for record in records:
        try:
            rows.append(model_to_dict(record, model_class))
        except Exception as e:
            logger.warning(f"  [{table_name}] Failed to serialize record: {e}")
            stats["failed"] += 1

    # 批量 upsert 到 Supabase（每批 200 条）
    batch_size = 200
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        try:
            sb.table(table_name).upsert(batch).execute()
            stats["migrated"] += len(batch)
        except Exception as e:
            logger.error(f"  [{table_name}] Batch {i // batch_size} failed: {str(e)[:200]}")
            stats["failed"] += len(batch)

    return stats


async def main():
    from uteki.common.database import db_manager

    logger.info("=" * 60)
    logger.info("SQLite → Supabase Migration")
    logger.info("=" * 60)

    # 初始化
    await db_manager.initialize()

    if not db_manager.supabase_available:
        logger.error("Supabase is not available. Check SUPABASE_URL and SUPABASE_SERVICE_KEY.")
        return

    sb = db_manager.get_supabase()
    logger.info("✓ Supabase connected")

    # 汇总统计
    total_stats = {"tables": 0, "total_rows": 0, "migrated": 0, "failed": 0, "empty": 0}

    async with db_manager.get_postgres_session() as session:
        for table_name, module_path, class_name in MIGRATION_ORDER:
            logger.info(f"  Migrating: {table_name}...")
            stats = await migrate_table(table_name, module_path, class_name, sb, session)

            total_stats["tables"] += 1
            total_stats["total_rows"] += stats["total"]
            total_stats["migrated"] += stats["migrated"]
            total_stats["failed"] += stats["failed"]
            if stats["total"] == 0:
                total_stats["empty"] += 1

            if stats["total"] > 0:
                logger.info(
                    f"  [{table_name}] {stats['migrated']}/{stats['total']} migrated"
                    + (f", {stats['failed']} failed" if stats['failed'] else "")
                )

    # 最终统计
    logger.info("=" * 60)
    logger.info("Migration Complete!")
    logger.info(f"  Tables:   {total_stats['tables']} ({total_stats['empty']} empty)")
    logger.info(f"  Rows:     {total_stats['migrated']}/{total_stats['total_rows']} migrated")
    if total_stats["failed"]:
        logger.info(f"  Failed:   {total_stats['failed']}")
    logger.info("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
