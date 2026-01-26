"""
Database connection management with graceful degradation.

Tier 1 (Critical): PostgreSQL, Redis
Tier 2 (Important): ClickHouse
Tier 3 (Optional): Qdrant, MinIO
"""

from typing import Optional
import logging
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)


class DatabaseManager:
    """
    Manages database connections with fallback strategies.

    Degradation Tiers:
    - Tier 1 (Critical): PostgreSQL + Redis
      - Without these: System cannot start
    - Tier 2 (Important): ClickHouse
      - Fallback: Use PostgreSQL for analytics (slower, but functional)
    - Tier 3 (Optional): Qdrant, MinIO
      - Fallback: Disable agent memory, file uploads
    """

    def __init__(self):
        self.postgres_available = False
        self.clickhouse_available = False
        self.qdrant_available = False
        self.redis_available = False
        self.minio_available = False

        # Fallback flags
        self.use_postgres_for_analytics = False  # Fallback when ClickHouse down
        self.disable_agent_memory = False  # Fallback when Qdrant down
        self.disable_file_storage = False  # Fallback when MinIO down

    async def initialize(self):
        """Initialize all database connections and determine availability"""
        # Try PostgreSQL (Critical - Tier 1)
        self.postgres_available = await self._init_postgres()
        if not self.postgres_available:
            raise RuntimeError(
                "PostgreSQL is not available. This is a critical dependency. "
                "Please start PostgreSQL with: docker compose up -d postgres"
            )

        # Try Redis (Critical - Tier 1)
        self.redis_available = await self._init_redis()
        if not self.redis_available:
            raise RuntimeError(
                "Redis is not available. This is a critical dependency. "
                "Please start Redis with: docker compose up -d redis"
            )

        # Try ClickHouse (Important - Tier 2)
        self.clickhouse_available = await self._init_clickhouse()
        if not self.clickhouse_available:
            logger.warning(
                "ClickHouse is not available. Falling back to PostgreSQL for analytics. "
                "Performance will be degraded. Start ClickHouse with: docker compose up -d clickhouse"
            )
            self.use_postgres_for_analytics = True

        # Try Qdrant (Optional - Tier 3)
        self.qdrant_available = await self._init_qdrant()
        if not self.qdrant_available:
            logger.warning(
                "Qdrant is not available. Agent semantic memory will be disabled. "
                "Start Qdrant with: docker compose up -d qdrant"
            )
            self.disable_agent_memory = True

        # Try MinIO (Optional - Tier 3)
        self.minio_available = await self._init_minio()
        if not self.minio_available:
            logger.warning(
                "MinIO is not available. File uploads (PDFs, backups) will be disabled. "
                "Start MinIO with: docker compose up -d minio"
            )
            self.disable_file_storage = True

        self._log_status()

    async def _init_postgres(self) -> bool:
        """Initialize PostgreSQL connection"""
        try:
            # TODO: Actual connection logic
            logger.info("PostgreSQL connection established")
            return True
        except Exception as e:
            logger.error(f"PostgreSQL connection failed: {e}")
            return False

    async def _init_redis(self) -> bool:
        """Initialize Redis connection"""
        try:
            # TODO: Actual connection logic
            logger.info("Redis connection established")
            return True
        except Exception as e:
            logger.error(f"Redis connection failed: {e}")
            return False

    async def _init_clickhouse(self) -> bool:
        """Initialize ClickHouse connection"""
        try:
            # TODO: Actual connection logic
            logger.info("ClickHouse connection established")
            return True
        except Exception as e:
            logger.error(f"ClickHouse connection failed: {e}")
            return False

    async def _init_qdrant(self) -> bool:
        """Initialize Qdrant connection"""
        try:
            # TODO: Actual connection logic
            logger.info("Qdrant connection established")
            return True
        except Exception as e:
            logger.error(f"Qdrant connection failed: {e}")
            return False

    async def _init_minio(self) -> bool:
        """Initialize MinIO connection"""
        try:
            # TODO: Actual connection logic
            logger.info("MinIO connection established")
            return True
        except Exception as e:
            logger.error(f"MinIO connection failed: {e}")
            return False

    def _log_status(self):
        """Log current database availability status"""
        status = {
            "PostgreSQL": "✓" if self.postgres_available else "✗",
            "Redis": "✓" if self.redis_available else "✗",
            "ClickHouse": "✓" if self.clickhouse_available else "⚠ (using PostgreSQL fallback)",
            "Qdrant": "✓" if self.qdrant_available else "⚠ (agent memory disabled)",
            "MinIO": "✓" if self.minio_available else "⚠ (file storage disabled)",
        }

        logger.info("Database availability:")
        for db, state in status.items():
            logger.info(f"  {db}: {state}")

    def require_clickhouse(self):
        """Check if ClickHouse is required for this operation"""
        if not self.clickhouse_available:
            raise RuntimeError(
                "This operation requires ClickHouse, which is currently unavailable. "
                "Fallback to PostgreSQL is not suitable for this use case."
            )

    def require_qdrant(self):
        """Check if Qdrant is required for this operation"""
        if not self.qdrant_available:
            raise RuntimeError(
                "This operation requires Qdrant, which is currently unavailable. "
                "Agent semantic memory is disabled."
            )

    def require_minio(self):
        """Check if MinIO is required for this operation"""
        if not self.minio_available:
            raise RuntimeError(
                "This operation requires MinIO, which is currently unavailable. "
                "File storage is disabled."
            )

    @asynccontextmanager
    async def get_analytics_db(self):
        """
        Get analytics database connection (ClickHouse or PostgreSQL fallback)

        Usage:
            async with db_manager.get_analytics_db() as db:
                results = await db.query("SELECT ...")
        """
        if self.clickhouse_available:
            # TODO: Return ClickHouse connection
            yield None  # Placeholder
        elif self.use_postgres_for_analytics:
            logger.warning("Using PostgreSQL for analytics (slower performance)")
            # TODO: Return PostgreSQL connection
            yield None  # Placeholder
        else:
            raise RuntimeError("No analytics database available")


# Global database manager instance
db_manager = DatabaseManager()
