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

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    logger.info("🚀 Local Development - Application starting...")
    # 本地开发可以同步初始化数据库（没有Cloud Run的启动超时限制）
    await db_manager.initialize()
    logger.info("✅ Database initialization completed")
    yield
    logger.info("Application shutting down...")


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
from uteki.domains.admin.api import router as admin_router
from uteki.domains.agent.api import router as agent_router

app.include_router(admin_router, prefix="/api/admin", tags=["admin"])
app.include_router(agent_router, prefix="/api/agent", tags=["agent"])

logger.info("✅ All domain routers registered (admin, agent)")


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
