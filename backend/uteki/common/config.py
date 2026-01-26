"""
配置管理 - 从环境变量加载配置
"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """应用配置"""

    # 应用配置
    app_name: str = "uteki.open"
    app_version: str = "0.1.0"
    debug: bool = True

    # PostgreSQL配置
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "uteki"
    postgres_password: str = "uteki_dev_pass"
    postgres_db: str = "uteki"

    # Redis配置
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0

    # ClickHouse配置
    clickhouse_host: str = "localhost"
    clickhouse_port: int = 9000
    clickhouse_http_port: int = 8123
    clickhouse_db: str = "uteki"

    # Qdrant配置
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    qdrant_grpc_port: int = 6334

    # MinIO配置
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "uteki"
    minio_secret_key: str = "uteki_dev_pass"
    minio_secure: bool = False

    # API Keys (optional)
    fmp_api_key: Optional[str] = None
    okx_api_key: Optional[str] = None
    okx_api_secret: Optional[str] = None
    okx_passphrase: Optional[str] = None
    binance_api_key: Optional[str] = None
    binance_api_secret: Optional[str] = None

    # LLM API Keys (optional)
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    dashscope_api_key: Optional[str] = None  # Qwen

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @property
    def postgres_url(self) -> str:
        """PostgreSQL异步连接URL"""
        return f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"

    @property
    def postgres_url_sync(self) -> str:
        """PostgreSQL同步连接URL"""
        return f"postgresql://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"

    @property
    def redis_url(self) -> str:
        """Redis连接URL"""
        return f"redis://{self.redis_host}:{self.redis_port}/{self.redis_db}"


# 全局配置实例
settings = Settings()
