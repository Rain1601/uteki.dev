"""
Database connection management with graceful degradation.

Tier 1 (Critical): PostgreSQL
Tier 2 (Important): Redis, ClickHouse
Tier 3 (Optional): Qdrant, MinIO

Note: Admin Domain currently only requires PostgreSQL.
Redis will be used for caching and task queues in future domains.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
import logging
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)


def _serialize_value(val: Any) -> Any:
    """将 Python 值序列化为 Supabase REST API 兼容格式"""
    if isinstance(val, datetime):
        return val.isoformat()
    return val


def _serialize_row(data: dict) -> dict:
    """序列化整行数据"""
    return {k: _serialize_value(v) for k, v in data.items()}


class SupabaseRepository:
    """
    Supabase REST API 通用数据访问层。

    封装 supabase-py 的 table().select/insert/upsert/update/delete() 调用，
    提供统一的过滤、排序、分页接口。

    Usage:
        repo = SupabaseRepository("news_articles")
        rows = repo.select(eq={"source": "jeff-cox"}, order="published_at.desc", limit=10)
        repo.insert({"id": "xxx", "title": "test"})
        repo.upsert([row1, row2])
        repo.update(eq={"id": "xxx"}, data={"title": "new"})
        repo.delete(eq={"id": "xxx"})
    """

    def __init__(self, table_name: str):
        self.table_name = table_name

    def _get_client(self):
        return db_manager.get_supabase()

    def _apply_filters(self, query, *, eq=None, neq=None, gt=None, lt=None,
                        gte=None, lte=None, like=None, ilike=None, is_=None,
                        in_=None):
        """Apply filter parameters to a Supabase query builder."""
        if eq:
            for k, v in eq.items():
                query = query.eq(k, v)
        if neq:
            for k, v in neq.items():
                query = query.neq(k, v)
        if gt:
            for k, v in gt.items():
                query = query.gt(k, v)
        if lt:
            for k, v in lt.items():
                query = query.lt(k, v)
        if gte:
            for k, v in gte.items():
                query = query.gte(k, v)
        if lte:
            for k, v in lte.items():
                query = query.lte(k, v)
        if like:
            for k, v in like.items():
                query = query.like(k, v)
        if ilike:
            for k, v in ilike.items():
                query = query.ilike(k, v)
        if is_:
            for k, v in is_.items():
                query = query.is_(k, v)
        if in_:
            for k, v in in_.items():
                query = query.in_(k, v)
        return query

    def select(
        self,
        columns: str = "*",
        *,
        eq: Optional[Dict[str, Any]] = None,
        neq: Optional[Dict[str, Any]] = None,
        gt: Optional[Dict[str, Any]] = None,
        lt: Optional[Dict[str, Any]] = None,
        gte: Optional[Dict[str, Any]] = None,
        lte: Optional[Dict[str, Any]] = None,
        like: Optional[Dict[str, Any]] = None,
        ilike: Optional[Dict[str, Any]] = None,
        is_: Optional[Dict[str, Any]] = None,
        in_: Optional[Dict[str, Any]] = None,
        order: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        single: bool = False,
        count: Optional[str] = None,
    ) -> Any:
        """
        SELECT with filters, ordering, pagination.

        Args:
            columns: Comma-separated column names or "*"
            eq/neq/gt/lt/gte/lte/like/ilike/is_/in_: Filter dicts {column: value}
            order: "column.asc" or "column.desc"
            limit: Max rows
            offset: Skip rows
            single: Return single row (raises if not exactly one)
            count: "exact" to include total count in response

        Returns:
            List[dict] or single dict (if single=True)
        """
        sb = self._get_client()
        query = sb.table(self.table_name).select(columns, count=count)

        query = self._apply_filters(
            query, eq=eq, neq=neq, gt=gt, lt=lt, gte=gte, lte=lte,
            like=like, ilike=ilike, is_=is_, in_=in_,
        )

        if order:
            # Parse "column.desc" → order("column", desc=True)
            parts = order.split(".")
            col = parts[0]
            desc = len(parts) > 1 and parts[1].lower() == "desc"
            query = query.order(col, desc=desc)

        if limit is not None:
            query = query.limit(limit)
        if offset is not None:
            query = query.offset(offset)

        if single:
            result = query.single().execute()
        else:
            result = query.execute()

        return result

    def select_data(self, *args, **kwargs) -> List[dict]:
        """Shortcut: select().data — returns just the data list."""
        return self.select(*args, **kwargs).data

    def select_one(self, **kwargs) -> Optional[dict]:
        """Shortcut: select first row or None."""
        kwargs["limit"] = 1
        rows = self.select_data(**kwargs)
        return rows[0] if rows else None

    def insert(self, data: dict | list, *, upsert: bool = False) -> Any:
        """
        INSERT one or many rows.

        Args:
            data: Single dict or list of dicts
            upsert: If True, use upsert instead of insert
        """
        sb = self._get_client()
        if isinstance(data, list):
            rows = [_serialize_row(d) for d in data]
        else:
            rows = _serialize_row(data)

        if upsert:
            return sb.table(self.table_name).upsert(rows).execute()
        return sb.table(self.table_name).insert(rows).execute()

    def upsert(self, data: dict | list) -> Any:
        """UPSERT (insert or update on conflict)."""
        return self.insert(data, upsert=True)

    def update(
        self,
        data: dict,
        *,
        eq: Optional[Dict[str, Any]] = None,
        neq: Optional[Dict[str, Any]] = None,
        gt: Optional[Dict[str, Any]] = None,
        lt: Optional[Dict[str, Any]] = None,
        gte: Optional[Dict[str, Any]] = None,
        lte: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """
        UPDATE rows matching filters.

        Args:
            data: Dict of column→value to set
            eq/neq/gt/lt/gte/lte: Filter dicts
        """
        sb = self._get_client()
        query = sb.table(self.table_name).update(_serialize_row(data))
        query = self._apply_filters(query, eq=eq, neq=neq, gt=gt, lt=lt, gte=gte, lte=lte)
        return query.execute()

    def delete(
        self,
        *,
        eq: Optional[Dict[str, Any]] = None,
        neq: Optional[Dict[str, Any]] = None,
        gt: Optional[Dict[str, Any]] = None,
        lt: Optional[Dict[str, Any]] = None,
        gte: Optional[Dict[str, Any]] = None,
        lte: Optional[Dict[str, Any]] = None,
        in_: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """DELETE rows matching filters."""
        sb = self._get_client()
        query = sb.table(self.table_name).delete()
        query = self._apply_filters(query, eq=eq, neq=neq, gt=gt, lt=lt, gte=gte, lte=lte, in_=in_)
        return query.execute()

    def rpc(self, function_name: str, params: Optional[dict] = None) -> Any:
        """Call a Supabase RPC function."""
        sb = self._get_client()
        return sb.rpc(function_name, params or {}).execute()


async def write_with_backup(
    table_name: str,
    data: dict | list,
    model_class=None,
    *,
    upsert: bool = True,
) -> Any:
    """
    写入 Supabase 后异步备份到 SQLite。

    Args:
        table_name: Supabase table name
        data: Single dict or list of dicts
        model_class: SQLAlchemy model class for SQLite backup (optional)
        upsert: Use upsert (default) or insert

    Returns:
        Supabase response
    """
    # 1. 主写入 Supabase
    repo = SupabaseRepository(table_name)
    if upsert:
        result = repo.upsert(data)
    else:
        result = repo.insert(data)

    # 2. 异步备份到 SQLite（不阻断主流程）
    if model_class is not None:
        try:
            rows = data if isinstance(data, list) else [data]
            async with db_manager.get_postgres_session() as session:
                for row in rows:
                    instance = model_class(**row)
                    await session.merge(instance)
        except Exception as e:
            logger.warning(f"SQLite backup failed for {table_name}: {e}")

    return result


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

        # Supabase REST API (HTTPS, 不受代理限制)
        self.supabase_client = None
        self.supabase_available = False

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

        # Try Supabase REST API（非阻断，不可用则只用本地 SQLite）
        self.supabase_available = await self._init_supabase()
        if not self.supabase_available:
            logger.warning(
                "Supabase is not available. Remote sync will be disabled."
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

    async def _init_supabase(self) -> bool:
        """Initialize Supabase REST API client (HTTPS, proxy-friendly)"""
        try:
            from uteki.common.config import settings

            if not settings.supabase_url or not settings.supabase_service_key:
                logger.info("Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY missing)")
                return False

            from supabase import create_client

            self.supabase_client = create_client(
                settings.supabase_url,
                settings.supabase_service_key
            )

            # 测试连接：查询 schema 验证 API 可用
            self.supabase_client.table('_ping_test').select('*').limit(1).execute()
            # 表不存在会抛异常，但只要不是网络错误就说明 API 通了
            logger.info("✓ Supabase REST API connection established")
            return True
        except Exception as e:
            err_str = str(e)
            # PGRST 错误码说明 API 正常工作，只是表不存在
            if 'PGRST' in err_str:
                logger.info("✓ Supabase REST API connection established")
                return True
            logger.warning(f"✗ Supabase connection failed: {e}")
            self.supabase_client = None
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
            "Supabase": "✓" if self.supabase_available else "⚠ (remote sync disabled)",
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

    def get_supabase(self):
        """
        Get Supabase REST API client.

        Usage:
            sb = db_manager.get_supabase()
            sb.table('news_articles').select('*').execute()
        """
        if not self.supabase_available:
            raise RuntimeError("Supabase is not available")
        return self.supabase_client

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


async def get_session():
    """
    FastAPI dependency for database session.

    Usage:
        @router.get("/")
        async def endpoint(session: AsyncSession = Depends(get_session)):
            ...
    """
    async with db_manager.get_postgres_session() as session:
        yield session


async def get_news_session():
    """
    FastAPI dependency for News domain session.
    Uses local database (SQLite/PostgreSQL). Supabase sync is handled separately.

    Usage:
        @router.get("/")
        async def endpoint(session: AsyncSession = Depends(get_news_session)):
            ...
    """
    async with db_manager.get_postgres_session() as session:
        yield session
