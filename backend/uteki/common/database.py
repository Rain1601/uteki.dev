"""
Database connection management with graceful degradation.

Tier 1 (Critical): PostgreSQL
Tier 2 (Important): Redis, ClickHouse
Tier 3 (Optional): Qdrant, MinIO

Note: Admin Domain currently only requires PostgreSQL.
Redis will be used for caching and task queues in future domains.
"""

from typing import Optional
import logging
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)


class DatabaseManager:
    """
    Manages database connections with fallback strategies.

    Degradation Tiers:
    - Tier 1 (Critical): PostgreSQL
      - Without it: System cannot start
    - Tier 2 (Important): Redis, ClickHouse
      - Redis Fallback: Use in-memory cache, synchronous task execution
      - ClickHouse Fallback: Use PostgreSQL for analytics (slower, but functional)
    - Tier 3 (Optional): Qdrant, MinIO
      - Fallback: Disable agent memory, file uploads
    """

    def __init__(self):
        self.postgres_available = False
        self.clickhouse_available = False
        self.qdrant_available = False
        self.redis_available = False
        self.minio_available = False

        # Database clients
        self.postgres_engine = None
        self.postgres_session_factory = None
        self.redis_pool = None
        self.redis_client = None
        self.clickhouse_client = None
        self.qdrant_client = None
        self.minio_client = None

        # Fallback flags
        self.use_postgres_for_analytics = False  # Fallback when ClickHouse down
        self.disable_agent_memory = False  # Fallback when Qdrant down
        self.disable_file_storage = False  # Fallback when MinIO down

    async def initialize(self):
        """Initialize all database connections and determine availability"""
        # Try database (Critical - Tier 1) - SQLite or PostgreSQL
        self.postgres_available = await self._init_postgres()
        if not self.postgres_available:
            from uteki.common.config import settings
            db_type = "SQLite" if settings.database_type == "sqlite" else "PostgreSQL"
            raise RuntimeError(
                f"{db_type} is not available. This is a critical dependency. "
                f"Check your configuration and database setup."
            )

        # Try Redis (Important - Tier 2)
        self.redis_available = await self._init_redis()
        if not self.redis_available:
            logger.warning(
                "Redis is not available. Caching and async tasks will be degraded. "
                "For better performance, start Redis with: docker compose up -d redis"
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
        """Initialize database connection (PostgreSQL or SQLite)"""
        try:
            from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
            from sqlalchemy.orm import sessionmaker
            from uteki.common.config import settings

            # 根据配置选择数据库类型
            database_url = settings.database_url
            is_sqlite = settings.database_type == "sqlite"

            # 创建异步引擎
            engine_kwargs = {
                "echo": settings.debug,
            }

            # SQLite和PostgreSQL的配置不同
            if not is_sqlite:
                import ssl
                ssl_context = ssl.create_default_context()
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE

                engine_kwargs.update({
                    "pool_size": 10,
                    "max_overflow": 20,
                    "pool_pre_ping": True,
                    "connect_args": {"ssl": ssl_context}  # Supabase需要SSL连接
                })

            self.postgres_engine = create_async_engine(database_url, **engine_kwargs)

            # 创建会话工厂
            self.postgres_session_factory = sessionmaker(
                self.postgres_engine,
                class_=AsyncSession,
                expire_on_commit=False
            )

            # 测试连接
            from sqlalchemy import text
            async with self.postgres_engine.begin() as conn:
                await conn.execute(text("SELECT 1"))

            db_type = "SQLite" if is_sqlite else "PostgreSQL"
            logger.info(f"✓ {db_type} connection established")
            return True
        except Exception as e:
            db_type = "SQLite" if settings.database_type == "sqlite" else "PostgreSQL"
            logger.error(f"✗ {db_type} connection failed: {e}")
            return False

    async def _init_redis(self) -> bool:
        """Initialize Redis connection"""
        try:
            import redis.asyncio as redis
            from uteki.common.config import settings

            # 创建Redis连接池
            self.redis_pool = redis.ConnectionPool.from_url(
                settings.redis_url,
                max_connections=10,
                decode_responses=True
            )
            self.redis_client = redis.Redis(connection_pool=self.redis_pool)

            # 测试连接
            await self.redis_client.ping()

            logger.info("✓ Redis connection established")
            return True
        except Exception as e:
            logger.error(f"✗ Redis connection failed: {e}")
            return False

    async def _init_clickhouse(self) -> bool:
        """Initialize ClickHouse connection"""
        try:
            from clickhouse_driver import Client
            from uteki.common.config import settings

            # 创建ClickHouse客户端
            self.clickhouse_client = Client(
                host=settings.clickhouse_host,
                port=settings.clickhouse_port,
                database=settings.clickhouse_db
            )

            # 测试连接
            self.clickhouse_client.execute("SELECT 1")

            logger.info("✓ ClickHouse connection established")
            return True
        except Exception as e:
            logger.error(f"✗ ClickHouse connection failed: {e}")
            return False

    async def _init_qdrant(self) -> bool:
        """Initialize Qdrant connection"""
        try:
            from qdrant_client import QdrantClient
            from uteki.common.config import settings

            # 创建Qdrant客户端
            self.qdrant_client = QdrantClient(
                host=settings.qdrant_host,
                port=settings.qdrant_port,
                timeout=5.0
            )

            # 测试连接
            self.qdrant_client.get_collections()

            logger.info("✓ Qdrant connection established")
            return True
        except Exception as e:
            logger.error(f"✗ Qdrant connection failed: {e}")
            return False

    async def _init_minio(self) -> bool:
        """Initialize MinIO connection"""
        try:
            from minio import Minio
            from uteki.common.config import settings

            # 创建MinIO客户端
            self.minio_client = Minio(
                settings.minio_endpoint,
                access_key=settings.minio_access_key,
                secret_key=settings.minio_secret_key,
                secure=settings.minio_secure
            )

            # 测试连接
            self.minio_client.list_buckets()

            logger.info("✓ MinIO connection established")
            return True
        except Exception as e:
            logger.error(f"✗ MinIO connection failed: {e}")
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
    async def get_postgres_session(self):
        """
        Get PostgreSQL session

        Usage:
            async with db_manager.get_postgres_session() as session:
                result = await session.execute(stmt)
        """
        if not self.postgres_available:
            raise RuntimeError("PostgreSQL is not available")

        async with self.postgres_session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def get_redis(self):
        """
        Get Redis client

        Usage:
            redis = await db_manager.get_redis()
            await redis.set("key", "value")
        """
        if not self.redis_available:
            raise RuntimeError("Redis is not available")
        return self.redis_client

    def get_clickhouse(self):
        """
        Get ClickHouse client

        Usage:
            ch = db_manager.get_clickhouse()
            result = ch.execute("SELECT ...")
        """
        if not self.clickhouse_available:
            raise RuntimeError("ClickHouse is not available")
        return self.clickhouse_client

    def get_qdrant(self):
        """
        Get Qdrant client

        Usage:
            qdrant = db_manager.get_qdrant()
            qdrant.search(...)
        """
        if not self.qdrant_available:
            raise RuntimeError("Qdrant is not available")
        return self.qdrant_client

    def get_minio(self):
        """
        Get MinIO client

        Usage:
            minio = db_manager.get_minio()
            minio.put_object(...)
        """
        if not self.minio_available:
            raise RuntimeError("MinIO is not available")
        return self.minio_client

    @asynccontextmanager
    async def get_analytics_db(self):
        """
        Get analytics database connection (ClickHouse or PostgreSQL fallback)

        Usage:
            async with db_manager.get_analytics_db() as db:
                results = await db.query("SELECT ...")
        """
        if self.clickhouse_available:
            yield self.clickhouse_client
        elif self.use_postgres_for_analytics:
            logger.warning("Using PostgreSQL for analytics (slower performance)")
            async with self.get_postgres_session() as session:
                yield session
        else:
            raise RuntimeError("No analytics database available")


# Global database manager instance
db_manager = DatabaseManager()
