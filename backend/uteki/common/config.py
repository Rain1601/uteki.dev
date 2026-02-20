"""
配置管理 - 从环境变量加载配置
"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """应用配置"""
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "allow"}

    # 应用配置
    app_name: str = "uteki.open"
    app_version: str = "0.1.0"
    debug: bool = True

    # 数据库模式: sqlite | postgresql
    database_type: str = "sqlite"  # 默认使用SQLite（开发环境）

    # SQLite配置（开发环境）
    sqlite_db_path: str = "./data/uteki.db"  # SQLite数据库文件路径

    # PostgreSQL配置（生产环境或本地完整模式）
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
    deepseek_api_key: Optional[str] = None
    minimax_api_key: Optional[str] = None
    minimax_group_id: Optional[str] = None
    google_api_key: Optional[str] = None  # Gemini
    google_api_base_url: Optional[str] = None  # Gemini proxy, e.g. https://your-proxy.com/v1beta/openai

    # Google Search API (for Research mode)
    google_search_api_key: Optional[str] = None
    google_search_engine_id: Optional[str] = None

    # LLM Provider Configuration
    llm_provider: str = "anthropic"  # 默认使用 Anthropic
    llm_model: str = "claude-sonnet-4-20250514"
    openai_model: str = "gpt-4o-mini"
    anthropic_model: str = "claude-sonnet-4-20250514"
    openai_api_base: str = "https://api.openai.com/v1"

    # 其他配置
    environment: str = "development"
    log_level: str = "INFO"

    # ClickHouse额外配置
    clickhouse_user: Optional[str] = "default"
    clickhouse_password: Optional[str] = None

    # JWT配置
    jwt_secret_key: str = "your-secret-key-here-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 43200

    # 雪盈证券 SNB (仅本地部署)
    snb_account: Optional[str] = None
    snb_api_key: Optional[str] = None
    snb_env: str = "prod"
    snb_totp_secret: Optional[str] = None

    # API配置
    api_host: str = "0.0.0.0"
    api_port: int = 8888
    cors_origins: str = "http://localhost:5173,http://localhost:5174"

    # 分页配置
    default_page_size: int = 100
    max_page_size: int = 1000

    # 功能开关
    enable_agent: bool = True
    enable_trading: bool = False
    enable_data_collection: bool = False
    enable_audit_log: bool = True

    # 开发配置
    sqlalchemy_echo: bool = False
    reload: bool = True
    enable_profiling: bool = False

    # 其他数据源API Keys
    alpha_vantage_api_key: Optional[str] = None
    coingecko_api_key: Optional[str] = None
    fred_api_key: Optional[str] = None

    # 安全配置
    encryption_key: Optional[str] = None
    secret_key: str = "your-secret-key-here-change-in-production"

    # OAuth配置
    github_client_id: Optional[str] = None
    github_client_secret: Optional[str] = None
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None
    oauth_redirect_base: str = "http://localhost:8888"  # 后端基础URL，用于OAuth回调

    @property
    def database_url(self) -> str:
        """数据库连接URL（根据database_type自动选择）"""
        if self.database_type == "sqlite":
            return f"sqlite+aiosqlite:///{self.sqlite_db_path}"
        else:  # postgresql
            return self.postgres_url

    @property
    def sqlite_url(self) -> str:
        """SQLite异步连接URL"""
        import os
        # 确保目录存在
        db_dir = os.path.dirname(self.sqlite_db_path)
        if db_dir and not os.path.exists(db_dir):
            os.makedirs(db_dir, exist_ok=True)
        return f"sqlite+aiosqlite:///{self.sqlite_db_path}"

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
