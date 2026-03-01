"""DataScheduler — multi-market K-line ingestion scheduling.

Cron jobs grouped by market close times (UTC):
  - US stocks/ETF/forex:  05:00 UTC (after US close)
  - Crypto:               every 6 hours (24/7 market)
  - HK stocks:            10:00 UTC (after HK close)
  - A-shares:             08:00 UTC (after A-share close)
  - Quality check:        12:00 UTC daily
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from uteki.common.database import db_manager

logger = logging.getLogger(__name__)


class DataScheduler:
    """Multi-market data ingestion scheduler."""

    def __init__(self):
        self.scheduler: Optional[AsyncIOScheduler] = None
        self._is_running = False
        self._last_results: dict = {}

    def initialize(self):
        if self.scheduler is not None:
            return

        self.scheduler = AsyncIOScheduler(
            timezone="UTC",
            job_defaults={
                "coalesce": True,
                "max_instances": 1,
                "misfire_grace_time": 600,
            },
        )

        # US stocks/ETF + forex + futures — UTC 05:00 (Mon-Fri)
        self.scheduler.add_job(
            self._ingest_us_markets,
            trigger=CronTrigger(hour=5, minute=0, day_of_week="mon-fri"),
            id="data_us_markets",
            name="US/Forex/Futures Daily Ingest (UTC 05:00)",
            replace_existing=True,
        )

        # Crypto — every 6 hours (24/7)
        self.scheduler.add_job(
            self._ingest_crypto,
            trigger=CronTrigger(hour="0,6,12,18", minute=15),
            id="data_crypto",
            name="Crypto Ingest (every 6h)",
            replace_existing=True,
        )

        # HK stocks — UTC 10:00 (Mon-Fri)
        self.scheduler.add_job(
            self._ingest_hk,
            trigger=CronTrigger(hour=10, minute=0, day_of_week="mon-fri"),
            id="data_hk",
            name="HK Stocks Daily Ingest (UTC 10:00)",
            replace_existing=True,
        )

        # A-shares — UTC 08:00 (Mon-Fri)
        self.scheduler.add_job(
            self._ingest_ashare,
            trigger=CronTrigger(hour=8, minute=0, day_of_week="mon-fri"),
            id="data_ashare",
            name="A-Share Daily Ingest (UTC 08:00)",
            replace_existing=True,
        )

        logger.info("Data scheduler initialized with multi-market jobs")

    def start(self):
        if self.scheduler is None:
            self.initialize()

        if not self._is_running:
            self.scheduler.start()
            self._is_running = True
            logger.info("Data scheduler started")

    def stop(self):
        if self.scheduler and self._is_running:
            self.scheduler.shutdown(wait=False)
            self._is_running = False
            logger.info("Data scheduler stopped")

    # ── Job implementations ──

    async def _ingest_us_markets(self):
        """Ingest US stocks, ETFs, forex, futures."""
        await self._run_ingestion(
            ["us_stock", "us_etf", "forex", "futures"],
            "us_markets",
        )

    async def _ingest_crypto(self):
        """Ingest cryptocurrency data."""
        await self._run_ingestion(["crypto"], "crypto")

    async def _ingest_hk(self):
        """Ingest Hong Kong stocks."""
        await self._run_ingestion(["hk_stock"], "hk_stock")

    async def _ingest_ashare(self):
        """Ingest A-share (China mainland) stocks."""
        await self._run_ingestion(["a_share"], "a_share")

    async def _run_ingestion(self, asset_types: list, job_name: str):
        """Common ingestion logic."""
        if not db_manager.postgres_available:
            logger.warning(f"PostgreSQL not available, skipping {job_name} ingestion")
            return

        try:
            from uteki.domains.data.ingestion_service import get_ingestion_service
            svc = get_ingestion_service()

            result = await svc.ingest_all(asset_types=asset_types)

            self._last_results[job_name] = {
                "status": result.get("status"),
                "total": result.get("total"),
                "inserted": result.get("inserted"),
                "failed": result.get("failed"),
                "run_at": datetime.now(timezone.utc).isoformat(),
            }

            logger.info(
                f"Data ingestion [{job_name}]: "
                f"{result.get('inserted', 0)} inserted, "
                f"{result.get('failed', 0)} failed"
            )
        except Exception as e:
            logger.error(f"Data ingestion [{job_name}] failed: {e}", exc_info=True)
            self._last_results[job_name] = {
                "status": "error",
                "error": str(e),
                "run_at": datetime.now(timezone.utc).isoformat(),
            }

    def get_status(self) -> dict:
        jobs = []
        if self.scheduler:
            for job in self.scheduler.get_jobs():
                next_run = getattr(job, "next_run_time", None)
                jobs.append({
                    "id": job.id,
                    "name": job.name,
                    "next_run": next_run.isoformat() if next_run else None,
                })

        return {
            "is_running": self._is_running,
            "jobs": jobs,
            "last_results": self._last_results,
        }


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_data_scheduler: Optional[DataScheduler] = None


def get_data_scheduler() -> DataScheduler:
    global _data_scheduler
    if _data_scheduler is None:
        _data_scheduler = DataScheduler()
    return _data_scheduler
