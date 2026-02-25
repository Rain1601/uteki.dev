"""News Sync Service - Supabase REST API 主库 + SQLite 备份"""

import logging
from datetime import datetime
from typing import List, Dict, Optional

from uteki.common.database import db_manager, SupabaseRepository

logger = logging.getLogger(__name__)

# Supabase table name for news
NEWS_TABLE = "news_articles"


def _serialize_value(val):
    """将 Python 值序列化为 Supabase REST API 兼容格式"""
    if isinstance(val, datetime):
        return val.isoformat()
    return val


def _article_dict_to_row(data: dict) -> dict:
    """序列化一行数据（dict→Supabase REST API 格式）"""
    return {k: _serialize_value(v) for k, v in data.items()}


def _article_to_dict(article) -> dict:
    """Extract all column values from a NewsArticle ORM instance."""
    from uteki.domains.news.models import NewsArticle
    return {
        col.key: _serialize_value(getattr(article, col.key))
        for col in NewsArticle.__table__.columns
    }


def get_news_repo() -> SupabaseRepository:
    """获取 news_articles 表的 SupabaseRepository"""
    return SupabaseRepository(NEWS_TABLE)


async def backup_to_sqlite(articles_data: List[dict]):
    """
    异步备份到 SQLite（不阻断主流程）。
    articles_data: list of dicts（Supabase 格式）
    """
    if not articles_data:
        return
    try:
        from uteki.domains.news.models import NewsArticle
        async with db_manager.get_postgres_session() as session:
            for row in articles_data:
                try:
                    article = NewsArticle(**row)
                    await session.merge(article)
                except Exception as e:
                    logger.warning(f"SQLite backup single row failed: {e}")
    except Exception as e:
        logger.warning(f"SQLite backup failed: {e}")


async def sync_articles_to_supabase(articles) -> None:
    """
    将文章写入 Supabase（主库）+ SQLite 备份。
    兼容 ORM 实例列表 或 dict 列表。
    """
    if not articles or not db_manager.supabase_available:
        return

    try:
        # 支持 ORM 实例或 dict
        if hasattr(articles[0], '__table__'):
            rows = [_article_to_dict(a) for a in articles]
        else:
            rows = [_article_dict_to_row(a) for a in articles]

        repo = get_news_repo()
        repo.upsert(rows)
        logger.info(f"Upserted {len(rows)} articles to Supabase")

        # 异步备份到 SQLite
        await backup_to_sqlite(rows)

    except Exception as e:
        logger.warning(f"Failed to sync articles to Supabase: {e}")


async def sync_article_to_supabase(article) -> None:
    """同步单篇文章到 Supabase + SQLite 备份"""
    await sync_articles_to_supabase([article])


async def migrate_local_to_supabase() -> Dict[str, int]:
    """将本地 SQLite 中的所有 NewsArticle 迁移到 Supabase"""
    from sqlalchemy import select
    from uteki.domains.news.models import NewsArticle

    stats = {"total": 0, "success": 0, "failed": 0}

    if not db_manager.supabase_available:
        logger.warning("Supabase not available, cannot migrate")
        return stats

    try:
        async with db_manager.get_postgres_session() as session:
            result = await session.execute(select(NewsArticle))
            articles = list(result.scalars().all())
            stats["total"] = len(articles)

            if not articles:
                logger.info("No articles in local DB to migrate")
                return stats

            articles_data = [_article_to_dict(a) for a in articles]

    except Exception as e:
        logger.error(f"Failed to read from local DB: {e}")
        return stats

    # 批量 upsert 到 Supabase
    repo = get_news_repo()
    batch_size = 100
    for i in range(0, len(articles_data), batch_size):
        batch = articles_data[i:i + batch_size]
        try:
            repo.upsert(batch)
            stats["success"] += len(batch)
        except Exception as e:
            logger.warning(f"Failed to upsert batch {i // batch_size}: {e}")
            stats["failed"] += len(batch)

    logger.info(f"Migration Local→Supabase complete: {stats}")
    return stats


async def migrate_supabase_to_local() -> Dict[str, int]:
    """将 Supabase 中的所有 NewsArticle 同步到本地 SQLite"""
    from uteki.domains.news.models import NewsArticle

    stats = {"total": 0, "success": 0, "failed": 0}

    if not db_manager.supabase_available:
        logger.warning("Supabase not available, cannot sync")
        return stats

    try:
        repo = get_news_repo()
        all_rows = []
        offset = 0
        page_size = 1000

        while True:
            result = repo.select(offset=offset, limit=page_size)
            rows = result.data
            if not rows:
                break
            all_rows.extend(rows)
            if len(rows) < page_size:
                break
            offset += page_size

        stats["total"] = len(all_rows)
        if not all_rows:
            logger.info("No articles in Supabase to sync")
            return stats

    except Exception as e:
        logger.error(f"Failed to read from Supabase: {e}")
        return stats

    # 写入本地 SQLite
    try:
        async with db_manager.get_postgres_session() as session:
            for row in all_rows:
                try:
                    article = NewsArticle(**row)
                    await session.merge(article)
                    stats["success"] += 1
                except Exception as e:
                    logger.warning(f"Failed to sync article {row.get('id')}: {e}")
                    stats["failed"] += 1

        logger.info(f"Sync Supabase→Local complete: {stats}")
    except Exception as e:
        logger.error(f"Failed to write to local DB: {e}")

    return stats
