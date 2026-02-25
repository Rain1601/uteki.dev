"""Bloomberg 新闻服务 - 整合 Apify 抓取和数据管理（Supabase REST API）"""

import hashlib
import logging
from datetime import datetime
from typing import List, Dict, Optional

from .bloomberg_apify import get_bloomberg_apify_client
from .sync_service import get_news_repo, backup_to_sqlite

logger = logging.getLogger(__name__)


class BloombergService:
    """
    Bloomberg 新闻服务

    策略：
    1. 通过 Apify Category Scraper 获取分类页文章列表
    2. 与 Supabase 去重，筛选新文章
    3. 通过 Apify News Scraper 获取新文章全文
    4. 写入 Supabase + SQLite 备份
    """

    def __init__(self):
        self.apify_client = get_bloomberg_apify_client()
        logger.info("Bloomberg 新闻服务初始化完成")

    async def collect_and_enrich(
        self,
        max_news: int = 20,
        category_urls: Optional[List[str]] = None,
    ) -> Dict:
        """
        完整抓取流程

        1. Category Scraper 获取文章列表
        2. Supabase URL 去重
        3. News Scraper 逐篇获取全文
        4. 写入 Supabase + SQLite 备份

        Returns:
            抓取结果统计
        """
        try:
            start_time = datetime.now()
            repo = get_news_repo()

            # 阶段 1：获取文章列表
            articles_meta = await self.apify_client.fetch_category_articles(
                search_queries=category_urls,
                max_items_per_url=max_news,
            )

            if not articles_meta:
                duration = (datetime.now() - start_time).total_seconds()
                logger.info(f"Bloomberg: 未获取到文章列表，耗时 {duration:.2f}s")
                return {
                    "success": True,
                    "new_urls_found": 0,
                    "new_articles_saved": 0,
                    "duration": duration,
                    "timestamp": datetime.now().isoformat(),
                    "method": "apify_bloomberg",
                }

            # 阶段 2：Supabase URL 去重
            new_articles = []
            for meta in articles_meta:
                url = meta.get("url", "")
                if not url:
                    continue
                existing = repo.select_one(eq={"url": url})
                if not existing:
                    new_articles.append(meta)

            logger.info(
                f"Bloomberg: {len(articles_meta)} 篇文章中 {len(new_articles)} 篇为新文章"
            )

            if not new_articles:
                duration = (datetime.now() - start_time).total_seconds()
                return {
                    "success": True,
                    "new_urls_found": 0,
                    "new_articles_saved": 0,
                    "duration": duration,
                    "timestamp": datetime.now().isoformat(),
                    "method": "apify_bloomberg",
                }

            # 阶段 3 & 4：逐篇获取全文并构建数据
            saved_count = 0
            saved_articles_data = []
            for i, meta in enumerate(new_articles, 1):
                url = meta["url"]
                try:
                    logger.info(f"[{i}/{len(new_articles)}] 获取全文: {url}")

                    # 尝试获取全文
                    full_article = await self.apify_client.fetch_article_full_text(url)

                    article_id = hashlib.md5(url.encode()).hexdigest()[:20]

                    if full_article and full_article.get("content_full"):
                        # 全文获取成功
                        article_data = {
                            "id": article_id,
                            "source": "bloomberg",
                            "title": full_article.get("title") or meta.get("title", ""),
                            "content": "",
                            "content_full": full_article["content_full"],
                            "url": url,
                            "author": full_article.get("author") or meta.get("author", ""),
                            "published_at": full_article.get("published_at") or meta.get("published_at"),
                            "category": "fixed_income",
                            "keywords": "Bloomberg,fixed income,bonds",
                            "tags": ["bloomberg", "fixed_income", "bonds"],
                            "is_full_content": True,
                            "scraped_at": datetime.utcnow().isoformat(),
                        }
                    else:
                        # 全文获取失败，降级保存元数据
                        logger.warning(f"全文获取失败，降级保存: {url}")
                        article_data = {
                            "id": article_id,
                            "source": "bloomberg",
                            "title": meta.get("title", ""),
                            "content": "",
                            "content_full": "",
                            "url": url,
                            "author": meta.get("author", ""),
                            "published_at": meta.get("published_at"),
                            "category": "fixed_income",
                            "keywords": "Bloomberg,fixed income,bonds",
                            "tags": ["bloomberg", "fixed_income", "bonds"],
                            "is_full_content": False,
                            "scraped_at": datetime.utcnow().isoformat(),
                        }

                    saved_articles_data.append(article_data)
                    saved_count += 1

                    pub_time = article_data.get("published_at")
                    pub_str = pub_time[:16] if pub_time else "未知"
                    logger.info(
                        f"保存成功: [{pub_str}] {article_data['title'][:60]}"
                    )

                except Exception as e:
                    logger.error(f"处理文章失败 {url}: {e}", exc_info=True)
                    continue

            # 批量 upsert 到 Supabase + 备份到 SQLite
            if saved_articles_data:
                repo.upsert(saved_articles_data)
                await backup_to_sqlite(saved_articles_data)

            duration = (datetime.now() - start_time).total_seconds()
            result = {
                "success": True,
                "new_urls_found": len(new_articles),
                "new_articles_saved": saved_count,
                "duration": duration,
                "timestamp": datetime.now().isoformat(),
                "method": "apify_bloomberg",
            }

            logger.info(
                f"Bloomberg 采集完成: 保存 {saved_count} 篇，耗时 {duration:.2f}s"
            )
            return result

        except Exception as e:
            logger.error(f"Bloomberg 采集流程失败: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
                "new_urls_found": 0,
                "new_articles_saved": 0,
            }

    async def get_articles(
        self,
        limit: int = 20,
        offset: int = 0,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        category: Optional[str] = None,
    ) -> List[Dict]:
        """查询 Bloomberg 文章列表"""
        try:
            repo = get_news_repo()

            eq = {"source": "bloomberg"}
            gte = {}
            lte = {}

            if start_date:
                gte["published_at"] = start_date.isoformat()
            if end_date:
                lte["published_at"] = end_date.isoformat()
            if category and category == "important":
                eq["important"] = True

            kwargs = {
                "eq": eq,
                "order": "published_at.desc",
                "limit": limit,
                "offset": offset,
            }
            if gte:
                kwargs["gte"] = gte
            if lte:
                kwargs["lte"] = lte

            return repo.select_data(**kwargs)

        except Exception as e:
            logger.error(f"查询 Bloomberg 文章失败: {e}", exc_info=True)
            return []

    async def get_monthly_news(
        self,
        year: int,
        month: int,
        category: Optional[str] = None,
    ) -> Dict[str, List[Dict]]:
        """获取指定月份的 Bloomberg 新闻（按日期分组）"""
        try:
            start_date = datetime(year, month, 1)
            if month == 12:
                end_date = datetime(year + 1, 1, 1)
            else:
                end_date = datetime(year, month + 1, 1)

            articles = await self.get_articles(
                limit=1000,
                start_date=start_date,
                end_date=end_date,
                category=category,
            )

            news_by_date: Dict[str, List[Dict]] = {}
            for article in articles:
                published_at = article.get("published_at")
                if published_at:
                    date_str = published_at[:10]
                    if date_str not in news_by_date:
                        news_by_date[date_str] = []
                    news_by_date[date_str].append(article)

            return news_by_date

        except Exception as e:
            logger.error(f"获取 Bloomberg 月度新闻失败: {e}", exc_info=True)
            return {}

    async def get_article_by_id(
        self,
        article_id: str,
    ) -> Optional[Dict]:
        """根据 ID 获取单篇文章"""
        try:
            repo = get_news_repo()
            return repo.select_one(eq={"id": article_id, "source": "bloomberg"})

        except Exception as e:
            logger.error(f"获取 Bloomberg 文章详情失败 (ID: {article_id}): {e}", exc_info=True)
            return None

    async def get_latest_news(
        self,
        limit: int = 10,
    ) -> List[Dict]:
        """获取最新 Bloomberg 新闻"""
        return await self.get_articles(limit=limit)


# 全局服务实例
_bloomberg_service: Optional[BloombergService] = None


def get_bloomberg_service() -> BloombergService:
    """获取全局 Bloomberg 新闻服务实例"""
    global _bloomberg_service
    if _bloomberg_service is None:
        _bloomberg_service = BloombergService()
    return _bloomberg_service
