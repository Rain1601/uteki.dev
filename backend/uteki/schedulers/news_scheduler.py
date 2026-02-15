"""News Scheduler - 定时抓取新闻任务"""

import asyncio
import logging
from datetime import datetime
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

from uteki.common.database import db_manager
from uteki.domains.news.services import get_jeff_cox_service, get_bloomberg_service
from uteki.domains.news.services import get_translation_service

logger = logging.getLogger(__name__)


class NewsScheduler:
    """新闻抓取调度器"""

    def __init__(self):
        self.scheduler: Optional[AsyncIOScheduler] = None
        self._is_running = False
        self._last_run: Optional[datetime] = None
        self._last_result: Optional[dict] = None

    def initialize(self):
        """初始化调度器"""
        if self.scheduler is not None:
            logger.warning("Scheduler already initialized")
            return

        self.scheduler = AsyncIOScheduler(
            timezone='UTC',
            job_defaults={
                'coalesce': True,
                'max_instances': 1,
                'misfire_grace_time': 300
            }
        )

        # 添加定时任务：每 30 分钟抓取一次
        self.scheduler.add_job(
            self._scrape_news_job,
            trigger=IntervalTrigger(minutes=30),
            id='news_scrape_interval',
            name='Jeff Cox News Scraper (30min interval)',
            replace_existing=True
        )

        # 添加每日凌晨 2 点的深度抓取任务
        self.scheduler.add_job(
            self._deep_scrape_job,
            trigger=CronTrigger(hour=2, minute=0),
            id='news_deep_scrape_daily',
            name='Jeff Cox Deep Scraper (daily)',
            replace_existing=True
        )

        # Bloomberg 固收/企业债券新闻：每 2 小时抓取一次
        self.scheduler.add_job(
            self._bloomberg_scrape_job,
            trigger=IntervalTrigger(hours=2),
            id='bloomberg_scrape_interval',
            name='Bloomberg Bond News Scraper (2h interval)',
            replace_existing=True
        )

        logger.info("News scheduler initialized with jobs")

    def start(self):
        """启动调度器"""
        if self.scheduler is None:
            self.initialize()

        if not self._is_running:
            self.scheduler.start()
            self._is_running = True
            logger.info("News scheduler started")

            # 启动时执行一次抓取
            asyncio.create_task(self._startup_scrape())

    def stop(self):
        """停止调度器"""
        if self.scheduler and self._is_running:
            self.scheduler.shutdown(wait=False)
            self._is_running = False
            logger.info("News scheduler stopped")

    async def _startup_scrape(self):
        """启动时执行一次抓取（延迟 10 秒等待数据库就绪）"""
        try:
            await asyncio.sleep(10)
            logger.info("Running startup news scrape...")
            await self._scrape_news_job()
        except Exception as e:
            logger.error(f"Startup scrape failed: {e}", exc_info=True)

    async def _translate_pending(self, source: str = 'cnbc_jeff_cox'):
        """翻译所有待处理的文章"""
        try:
            async with db_manager.get_postgres_session() as session:
                svc = get_translation_service()
                stats = await svc.translate_pending_articles(session, limit=10, source_filter=source)
                if stats['success'] > 0 or stats['failed'] > 0:
                    logger.info(f"Auto-translate [{source}]: {stats['success']} ok, {stats['failed']} failed")
        except Exception as e:
            logger.error(f"Auto-translate failed: {e}", exc_info=True)

    async def _scrape_news_job(self):
        """定时抓取任务"""
        try:
            logger.info("Starting scheduled news scrape...")
            self._last_run = datetime.utcnow()

            # 检查数据库是否可用
            if not db_manager.postgres_available:
                logger.warning("PostgreSQL not available, skipping news scrape")
                return

            # 获取数据库会话
            async with db_manager.get_postgres_session() as session:
                try:
                    service = get_jeff_cox_service()
                    result = await service.collect_and_enrich(session, max_news=10)
                    self._last_result = result

                    if result.get('success'):
                        logger.info(
                            f"Scheduled scrape completed: "
                            f"{result.get('new_articles_saved', 0)} new articles, "
                            f"duration: {result.get('duration', 0):.2f}s"
                        )
                    else:
                        logger.warning(f"Scheduled scrape failed: {result.get('error')}")

                except Exception as e:
                    logger.error(f"Error in scheduled scrape: {e}", exc_info=True)
                    self._last_result = {'success': False, 'error': str(e)}

            # 采集后自动翻译待处理文章
            await self._translate_pending('cnbc_jeff_cox')

        except Exception as e:
            logger.error(f"Scheduled news scrape job failed: {e}", exc_info=True)

    async def _deep_scrape_job(self):
        """每日深度抓取任务（抓取更多文章）"""
        try:
            logger.info("Starting daily deep news scrape...")

            if not db_manager.postgres_available:
                logger.warning("PostgreSQL not available, skipping deep scrape")
                return

            async with db_manager.get_postgres_session() as session:
                try:
                    service = get_jeff_cox_service()
                    result = await service.collect_and_enrich(session, max_news=30)

                    if result.get('success'):
                        logger.info(
                            f"Daily deep scrape completed: "
                            f"{result.get('new_articles_saved', 0)} new articles"
                        )
                    else:
                        logger.warning(f"Daily deep scrape failed: {result.get('error')}")

                except Exception as e:
                    logger.error(f"Error in daily deep scrape: {e}", exc_info=True)

            # 采集后自动翻译待处理文章
            await self._translate_pending('cnbc_jeff_cox')

        except Exception as e:
            logger.error(f"Daily deep scrape job failed: {e}", exc_info=True)

    async def _bloomberg_scrape_job(self):
        """Bloomberg 定时抓取任务"""
        try:
            logger.info("Starting scheduled Bloomberg news scrape...")

            if not db_manager.postgres_available:
                logger.warning("PostgreSQL not available, skipping Bloomberg scrape")
                return

            async with db_manager.get_postgres_session() as session:
                try:
                    service = get_bloomberg_service()
                    result = await service.collect_and_enrich(session, max_news=10)

                    if result.get('success'):
                        logger.info(
                            f"Bloomberg scheduled scrape completed: "
                            f"{result.get('new_articles_saved', 0)} new articles, "
                            f"duration: {result.get('duration', 0):.2f}s"
                        )
                    else:
                        logger.warning(f"Bloomberg scheduled scrape failed: {result.get('error')}")

                except Exception as e:
                    logger.error(f"Error in Bloomberg scheduled scrape: {e}", exc_info=True)

            # 采集后自动翻译待处理文章
            await self._translate_pending('bloomberg')

        except Exception as e:
            logger.error(f"Bloomberg scheduled scrape job failed: {e}", exc_info=True)

    async def trigger_scrape_now(self, max_news: int = 10) -> dict:
        """手动触发一次抓取"""
        try:
            logger.info(f"Manual scrape triggered (max_news={max_news})")

            if not db_manager.postgres_available:
                return {'success': False, 'error': 'Database not available'}

            async with db_manager.get_postgres_session() as session:
                service = get_jeff_cox_service()
                result = await service.collect_and_enrich(session, max_news=max_news)
                self._last_result = result
                return result

            return {'success': False, 'error': 'No database session available'}

        except Exception as e:
            logger.error(f"Manual scrape failed: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}

    def get_status(self) -> dict:
        """获取调度器状态"""
        jobs = []
        if self.scheduler:
            for job in self.scheduler.get_jobs():
                jobs.append({
                    'id': job.id,
                    'name': job.name,
                    'next_run': job.next_run_time.isoformat() if job.next_run_time else None
                })

        return {
            'is_running': self._is_running,
            'last_run': self._last_run.isoformat() if self._last_run else None,
            'last_result': self._last_result,
            'jobs': jobs
        }


# 全局调度器实例
_news_scheduler: Optional[NewsScheduler] = None


def get_news_scheduler() -> NewsScheduler:
    """获取全局新闻调度器实例"""
    global _news_scheduler
    if _news_scheduler is None:
        _news_scheduler = NewsScheduler()
    return _news_scheduler
