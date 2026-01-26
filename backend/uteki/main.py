"""
uteki.open - FastAPI主应用程序
提供健康检查、数据库状态和基础API端点
"""

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from uteki.common.database import db_manager
from uteki.common.config import settings

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时初始化数据库连接
    logger.info("Initializing database connections...")
    try:
        await db_manager.initialize()
        logger.info("Database initialization complete")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise

    yield

    # 关闭时清理资源
    logger.info("Shutting down...")


# 创建FastAPI应用
app = FastAPI(
    title="uteki.open",
    description="开源量化交易平台 - AI驱动的多资产交易系统",
    version="0.1.0",
    lifespan=lifespan
)

# CORS中间件配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Vite和其他前端
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """根路径 - 欢迎信息"""
    return {
        "name": "uteki.open",
        "version": "0.1.0",
        "description": "AI-driven quantitative trading platform",
        "docs": "/docs",
        "health": "/health"
    }


@app.get("/health")
async def health_check():
    """
    健康检查端点
    返回所有数据库的连接状态
    """
    return {
        "status": "healthy",
        "databases": {
            "postgres": {
                "available": db_manager.postgres_available,
                "status": "✓ connected" if db_manager.postgres_available else "✗ disconnected"
            },
            "redis": {
                "available": db_manager.redis_available,
                "status": "✓ connected" if db_manager.redis_available else "✗ disconnected"
            },
            "clickhouse": {
                "available": db_manager.clickhouse_available,
                "status": "✓ connected" if db_manager.clickhouse_available else "⚠ using PostgreSQL fallback"
            },
            "qdrant": {
                "available": db_manager.qdrant_available,
                "status": "✓ connected" if db_manager.qdrant_available else "⚠ agent memory disabled"
            },
            "minio": {
                "available": db_manager.minio_available,
                "status": "✓ connected" if db_manager.minio_available else "⚠ file storage disabled"
            }
        },
        "degradation": {
            "use_postgres_for_analytics": db_manager.use_postgres_for_analytics,
            "disable_agent_memory": db_manager.disable_agent_memory,
            "disable_file_storage": db_manager.disable_file_storage
        }
    }


@app.get("/api/status")
async def api_status():
    """
    API状态端点
    返回系统整体状态和可用功能
    """
    critical_dbs_ok = db_manager.postgres_available and db_manager.redis_available

    features = {
        "admin": critical_dbs_ok,
        "trading": critical_dbs_ok,
        "agent": critical_dbs_ok,
        "dashboard": critical_dbs_ok,
        "analytics": db_manager.clickhouse_available or db_manager.use_postgres_for_analytics,
        "agent_memory": db_manager.qdrant_available,
        "file_storage": db_manager.minio_available
    }

    return {
        "system_status": "operational" if critical_dbs_ok else "degraded",
        "available_features": features,
        "warnings": [
            msg for msg in [
                "ClickHouse unavailable - using PostgreSQL fallback" if db_manager.use_postgres_for_analytics else None,
                "Qdrant unavailable - agent memory disabled" if db_manager.disable_agent_memory else None,
                "MinIO unavailable - file storage disabled" if db_manager.disable_file_storage else None
            ] if msg
        ]
    }


# 导入domain路由
from uteki.domains.admin.api import router as admin_router
from uteki.domains.trading.api import router as trading_router
from uteki.domains.data.api import router as data_router
from uteki.domains.agent.api import router as agent_router
from uteki.domains.evaluation.api import router as evaluation_router
from uteki.domains.dashboard.api import router as dashboard_router

# 注册domain路由
app.include_router(admin_router, prefix="/api/admin", tags=["admin"])
app.include_router(trading_router, prefix="/api/trading", tags=["trading"])
app.include_router(data_router, prefix="/api/data", tags=["data"])
app.include_router(agent_router, prefix="/api/agent", tags=["agent"])
app.include_router(evaluation_router, prefix="/api/evaluation", tags=["evaluation"])
app.include_router(dashboard_router, prefix="/api/dashboard", tags=["dashboard"])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "uteki.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
