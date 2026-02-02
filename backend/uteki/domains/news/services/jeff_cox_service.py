"""Jeff Cox 新闻服务 - 整合 RSS 监控和网页爬虫"""

import asyncio
import hashlib
import logging
from typing import List, Dict, Optional
from datetime import datetime
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from uteki.domains.news.models import NewsArticle
from .cnbc_scraper import CNBCWebScraper
from .cnbc_graphql import CNBCGraphQLCollector, get_graphql_collector

logger = logging.getLogger(__name__)


class JeffCoxService:
    """
    Jeff Cox 新闻服务

    策略：
    1. 从作者页面监控新文章
    2. 爬取新文章的完整内容
    3. 统一存储到 NewsArticle 表
    """

    def __init__(self):
        self.web_scraper = CNBCWebScraper()
        self.graphql_collector = get_graphql_collector()
        logger.info("Jeff Cox 新闻服务初始化完成")

    async def collect_from_author_page(
        self,
        session: AsyncSession,
        max_news: int = 20
    ) -> List[str]:
        """
        从 Jeff Cox 作者页面获取新文章 URL

        Returns:
            数据库中不存在的新文章 URL 列表
        """
        try:
            article_urls = await self.web_scraper.get_article_links(max_news * 2)

            if not article_urls:
                return []

            # 过滤出数据库中不存在的
            missing_urls = []
            for url in article_urls[:max_news]:
                stmt = select(NewsArticle).where(NewsArticle.url == url)
                result = await session.execute(stmt)
                exists = result.scalar_one_or_none()
                if not exists:
                    missing_urls.append(url)

            logger.info(f"发现 {len(missing_urls)} 篇新文章待采集")
            return missing_urls

        except Exception as e:
            logger.error(f"从作者页面获取文章失败: {e}", exc_info=True)
            return []

    async def collect_from_urls(
        self,
        session: AsyncSession,
        urls: List[str]
    ) -> int:
        """
        从指定 URL 列表爬取文章

        Returns:
            成功采集的文章数
        """
        if not urls:
            return 0

        success_count = 0

        for i, url in enumerate(urls, 1):
            try:
                logger.info(f"[{i}/{len(urls)}] 正在爬取: {url}")

                article_data = await self.web_scraper.scrape_article(url)

                if not article_data:
                    logger.warning(f"爬取失败: {url}")
                    continue

                article_id = hashlib.md5(url.encode()).hexdigest()[:20]

                # 检查是否已存在
                stmt = select(NewsArticle).where(NewsArticle.url == url)
                result = await session.execute(stmt)
                existing = result.scalar_one_or_none()

                if existing:
                    logger.info(f"文章已存在，跳过: {url}")
                    continue

                # 判断是否重要
                important_keywords = ['fed', 'powell', 'federal reserve', 'fomc', 'interest rate']
                title_lower = article_data.get('title', '').lower()
                is_important = any(kw in title_lower for kw in important_keywords)

                # 创建新文章
                new_article = NewsArticle(
                    id=article_id,
                    source='cnbc_jeff_cox',
                    title=article_data.get('title', ''),
                    content='',
                    content_full=article_data.get('content_full', ''),
                    summary_keypoints=article_data.get('summary_keypoints', ''),
                    url=url,
                    author=article_data.get('author', 'Jeff Cox'),
                    published_at=article_data.get('published_at'),
                    category='finance',
                    keywords='Jeff Cox,CNBC,经济',
                    tags=['finance', 'economy'],
                    is_full_content=True,
                    scraped_at=datetime.utcnow(),
                    important=is_important
                )

                session.add(new_article)
                await session.flush()

                pub_time = article_data.get('published_at')
                pub_str = pub_time.strftime('%Y-%m-%d %H:%M') if pub_time else '未知'
                logger.info(f"保存成功: [{pub_str}] {article_data.get('title', '')[:60]}")

                success_count += 1

                # 延迟避免频繁请求
                await asyncio.sleep(2.5)

            except Exception as e:
                logger.error(f"处理文章失败 {url}: {e}", exc_info=True)
                continue

        await session.commit()
        logger.info(f"从 URL 列表采集完成: 成功 {success_count} 篇")
        return success_count

    async def collect_and_enrich(
        self,
        session: AsyncSession,
        max_news: int = 10
    ) -> Dict:
        """
        完整采集流程

        1. 访问作者页面获取最新文章列表
        2. 对比数据库，发现新文章 URL
        3. 爬取新文章的完整内容
        4. 保存到数据库

        Returns:
            采集结果统计
        """
        try:
            start_time = datetime.now()

            author_page_urls = await self.collect_from_author_page(session, max_news)

            new_articles_count = 0
            if author_page_urls:
                logger.info(f"发现 {len(author_page_urls)} 篇新文章，开始爬取...")
                new_articles_count = await self.collect_from_urls(session, author_page_urls)

            duration = (datetime.now() - start_time).total_seconds()

            result = {
                'success': True,
                'new_urls_found': len(author_page_urls) if author_page_urls else 0,
                'new_articles_saved': new_articles_count,
                'duration': duration,
                'timestamp': datetime.now().isoformat(),
                'method': 'author_page_monitoring'
            }

            if new_articles_count > 0:
                logger.info(f"采集完成: 保存 {new_articles_count} 篇，耗时 {duration:.2f}s")
            else:
                logger.info(f"暂无新文章，耗时 {duration:.2f}s")

            return result

        except Exception as e:
            logger.error(f"采集流程失败: {e}", exc_info=True)
            return {
                'success': False,
                'error': str(e),
                'new_urls_found': 0,
                'new_articles_saved': 0
            }

    async def get_articles(
        self,
        session: AsyncSession,
        limit: int = 20,
        offset: int = 0,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        full_content_only: bool = False,
        category: Optional[str] = None
    ) -> List[NewsArticle]:
        """查询 Jeff Cox 文章列表"""
        try:
            stmt = select(NewsArticle).where(
                NewsArticle.source == 'cnbc_jeff_cox'
            )

            if start_date:
                stmt = stmt.where(NewsArticle.published_at >= start_date)
            if end_date:
                stmt = stmt.where(NewsArticle.published_at <= end_date)
            if full_content_only:
                stmt = stmt.where(NewsArticle.is_full_content == True)
            if category:
                # 根据 category 过滤 tags 或 important
                if category == 'important':
                    stmt = stmt.where(NewsArticle.important == True)
                # 其他分类可以通过 tags 过滤

            stmt = stmt.order_by(NewsArticle.published_at.desc())
            stmt = stmt.offset(offset).limit(limit)

            result = await session.execute(stmt)
            return list(result.scalars().all())

        except Exception as e:
            logger.error(f"查询文章失败: {e}", exc_info=True)
            return []

    async def get_monthly_news(
        self,
        session: AsyncSession,
        year: int,
        month: int,
        category: Optional[str] = None
    ) -> Dict[str, List[Dict]]:
        """
        获取指定月份的 Jeff Cox 新闻（按日期分组）

        Returns:
            按日期分组的新闻字典 {"2024-01-15": [...], ...}
        """
        try:
            start_date = datetime(year, month, 1)
            if month == 12:
                end_date = datetime(year + 1, 1, 1)
            else:
                end_date = datetime(year, month + 1, 1)

            articles = await self.get_articles(
                session,
                limit=1000,
                start_date=start_date,
                end_date=end_date,
                category=category
            )

            # 按日期分组
            news_by_date: Dict[str, List[Dict]] = {}
            for article in articles:
                if article.published_at:
                    date_str = article.published_at.strftime('%Y-%m-%d')
                    if date_str not in news_by_date:
                        news_by_date[date_str] = []
                    news_by_date[date_str].append(article.to_dict())

            return news_by_date

        except Exception as e:
            logger.error(f"获取月度新闻失败: {e}", exc_info=True)
            return {}

    async def get_article_by_id(
        self,
        session: AsyncSession,
        article_id: str
    ) -> Optional[NewsArticle]:
        """根据 ID 获取单篇文章"""
        try:
            stmt = select(NewsArticle).where(
                NewsArticle.id == article_id,
                NewsArticle.source == 'cnbc_jeff_cox'
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

        except Exception as e:
            logger.error(f"获取文章详情失败 (ID: {article_id}): {e}", exc_info=True)
            return None

    async def get_latest_news(
        self,
        session: AsyncSession,
        limit: int = 10
    ) -> List[NewsArticle]:
        """获取最新新闻"""
        return await self.get_articles(session, limit=limit)


# 全局服务实例
_jeff_cox_service: Optional[JeffCoxService] = None


def get_jeff_cox_service() -> JeffCoxService:
    """获取全局 Jeff Cox 新闻服务实例"""
    global _jeff_cox_service
    if _jeff_cox_service is None:
        _jeff_cox_service = JeffCoxService()
    return _jeff_cox_service
