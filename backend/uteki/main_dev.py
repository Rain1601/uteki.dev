"""
uteki.open - 本地开发版本
启用所有 domain 路由用于本地开发和测试
"""

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from uteki.common.database import db_manager
from uteki.common.config import settings
from uteki.common.logging_config import setup_logging

# 配置日志系统
setup_logging(
    log_level="DEBUG",  # 开发环境使用 DEBUG 级别
    log_dir="./logs",
    log_file_prefix="uteki_dev",  # 日志文件: uteki_dev.log, uteki_dev.log.2026-02-01
    backup_count=30  # 保留30天的日志
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    logger.info("🚀 Local Development - Application starting...")
    # 本地开发可以同步初始化数据库（没有Cloud Run的启动超时限制）
    await db_manager.initialize()
    logger.info("✅ Database initialization completed")

    # Start news scheduler (CNBC Jeff Cox + Bloomberg)
    from uteki.schedulers import get_news_scheduler
    news_sched = get_news_scheduler()
    news_sched.start()
    logger.info("✅ News scheduler started")

    # Start index scheduler (daily price update)
    from uteki.schedulers import get_index_scheduler
    idx_sched = get_index_scheduler()
    idx_sched.start()

    yield

    logger.info("Application shutting down...")
    news_sched.stop()
    idx_sched.stop()


# 创建FastAPI应用
app = FastAPI(
    title="uteki.open (Local Dev)",
    description="开源量化交易平台 - 本地开发环境（包含所有功能）",
    version="0.1.0-dev",
    lifespan=lifespan
)

# CORS中间件配置（本地开发允许所有来源）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """根路径"""
    return {
        "name": "uteki.open (Local Dev)",
        "version": "0.1.0-dev",
        "environment": "development",
        "description": "AI-driven quantitative trading platform - Local Development",
        "docs": "/docs",
        "health": "/health"
    }


@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {
        "status": "healthy",
        "environment": "local_development",
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
        }
    }


# 导入并注册所有domain路由（本地开发版本）
from uteki.domains.auth.api import router as auth_router
from uteki.domains.admin.api import router as admin_router
from uteki.domains.agent.api import router as agent_router
from uteki.domains.news.api import router as news_router
from uteki.domains.news.analysis_api import router as news_analysis_router
from uteki.domains.news.bloomberg_api import router as bloomberg_news_router
from uteki.domains.macro.api import router as macro_router
from uteki.domains.macro.fred_api import router as fred_router
from uteki.domains.macro.dashboard_api import router as dashboard_router
from uteki.domains.snb.api import router as snb_router
from uteki.domains.index.api import router as index_router

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(admin_router, prefix="/api/admin", tags=["admin"])
app.include_router(agent_router, prefix="/api/agent", tags=["agent"])
app.include_router(news_router, prefix="/api/news", tags=["news"])
app.include_router(news_analysis_router, prefix="/api/news-analysis", tags=["news-analysis"])
app.include_router(bloomberg_news_router, prefix="/api/news", tags=["bloomberg-news"])
app.include_router(macro_router, prefix="/api/economic-calendar", tags=["economic-calendar"])
app.include_router(fred_router, prefix="/api/macro/fred", tags=["fred"])
app.include_router(dashboard_router, prefix="/api/macro/dashboard", tags=["market-dashboard"])
app.include_router(snb_router, prefix="/api/snb", tags=["snb"])
app.include_router(index_router, prefix="/api/index", tags=["index"])

logger.info("✅ All domain routers registered (auth, admin, agent, news, snb, index)")


if __name__ == "__main__":
    import uvicorn

    logger.info("="*60)
    logger.info("🎯 Starting uteki.open Local Development Server")
    logger.info("="*60)
    logger.info("📍 API Server: http://localhost:8888")
    logger.info("📚 API Docs: http://localhost:8888/docs")
    logger.info("💚 Health Check: http://localhost:8888/health")
    logger.info("🤖 Agent Chat: http://localhost:8888/api/agent/chat")
    logger.info("="*60)

    uvicorn.run(
        "uteki.main_dev:app",
        host="0.0.0.0",
        port=8888,
        reload=True,
        log_level="info"
    )
