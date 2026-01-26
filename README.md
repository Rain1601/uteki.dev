# uteki.open

Open-source AI-powered quantitative trading platform for individual traders.

## Features

- **6 Domain Architecture**: Admin, Trading, Data, Agent, Evaluation, Dashboard
- **Multi-Database Strategy**: PostgreSQL + ClickHouse + Qdrant + Redis + MinIO
- **AI Agent Framework**: Unified SDK supporting OpenAI, Claude, DeepSeek, Qwen
- **Multi-Asset Support**: Crypto, Stocks (US), Commodities
- **Enterprise-Grade Evaluation**: OpenAI Evals + Anthropic alignment testing
- **One-Command Deployment**: Docker Compose for local setup

## Quick Start (5分钟)

### 🎯 一键部署

```bash
# 1. 克隆项目
git clone https://github.com/yourusername/uteki.open.git
cd uteki.open

# 2. 启动所有数据库 (PostgreSQL, Redis, ClickHouse, Qdrant, MinIO)
./scripts/start-full.sh

# 3. 初始化数据库表
cd backend
poetry install
poetry run python ../scripts/init_database.py

# 4. 启动后端
poetry run python -m uteki.main

# 5. 在新终端启动前端
cd frontend
pnpm install
pnpm dev
```

### 🔍 验证系统

```bash
# 运行完整性验证脚本
./scripts/verify_system.sh
```

### 📍 访问地址

- **后端API文档**: http://localhost:8000/docs
- **后端健康检查**: http://localhost:8000/health
- **前端界面**: http://localhost:5173
- **MinIO控制台**: http://localhost:9001 (uteki / uteki_dev_pass)

### ❓ 关于数据库"注册"

**重要**: PostgreSQL、ClickHouse、Redis等数据库**无需注册或申请账号**。它们是开源软件，通过Docker本地运行，配置信息都在`docker-compose.yml`中预定义。详见 [FAQ.md](docs/FAQ.md)

### 📚 详细文档

- **[在线文档站点](https://uteki-open.vercel.app)** (推荐)
- [快速启动](QUICKSTART.md) - 5分钟本地部署
- [贡献指南](CONTRIBUTING.md) - 代码规范和提交流程
- [架构设计](docs/ARCHITECTURE.md) - Agent扩展策略
- [完整部署指南](docs/DEPLOYMENT_GUIDE.md) - 生产环境配置

## Configuration

1. Create `.env` file in `backend/`:
   ```env
   DATABASE_URL=postgresql://uteki:uteki_dev_pass@localhost:5432/uteki
   CLICKHOUSE_HOST=localhost
   CLICKHOUSE_PORT=8123
   QDRANT_HOST=localhost
   QDRANT_PORT=6333
   REDIS_URL=redis://localhost:6379
   MINIO_ENDPOINT=localhost:9000
   MINIO_ACCESS_KEY=uteki
   MINIO_SECRET_KEY=uteki_dev_pass
   ```

2. Configure API keys in `/admin` page:
   - LLM providers (OpenAI, Claude, DeepSeek, Qwen)
   - Exchanges (OKX, Binance, Interactive Brokers)
   - Data sources (FMP)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React 18)                     │
│                   /admin /evaluate                          │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/WebSocket
┌────────────────────────┴────────────────────────────────────┐
│                    Backend (FastAPI)                        │
│  ┌──────┐  ┌────────┐  ┌──────┐  ┌───────┐  ┌──────────┐  │
│  │Admin │  │Trading │  │ Data │  │ Agent │  │Evaluation│  │
│  └──┬───┘  └───┬────┘  └───┬──┘  └───┬───┘  └────┬─────┘  │
└─────┼─────────┼───────────┼─────────┼───────────┼─────────┘
      │         │           │         │           │
┌─────┴─────────┴───────────┴─────────┴───────────┴─────────┐
│  PostgreSQL  ClickHouse  Qdrant  Redis  MinIO              │
└─────────────────────────────────────────────────────────────┘
```

## Domain Responsibilities

| Domain | Responsibility |
|--------|----------------|
| **Admin** | System configuration, API keys, LLM/exchange setup |
| **Trading** | Order execution, position tracking, risk management |
| **Data** | Multi-asset data pipeline (daily K-lines, on-chain, financials) |
| **Agent** | AI agent framework, tool system, multi-agent orchestration |
| **Evaluation** | Performance metrics, benchmarks, A/B testing |
| **Dashboard** | Trading history visualization, P&L tracking |

## Development

### Run Tests
```bash
cd backend
poetry run pytest
```

### Lint Code
```bash
poetry run ruff check .
poetry run mypy .
```

### Format Code
```bash
poetry run ruff format .
```

## Documentation

- [部署指南 Deployment Guide](docs/DEPLOYMENT_GUIDE.md) - 完整部署文档（macOS/Linux）
- [常见问题 FAQ](docs/FAQ.md) - 数据库配置、注册说明
- [数据库策略 Database Strategy](docs/DATABASE_STRATEGY.md) - 多数据库架构
- [数据分发 Data Distribution](docs/DATA_DISTRIBUTION.md) - 数据获取方案
- [API Reference](http://localhost:8000/docs) - 在线API文档

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Support

- GitHub Issues: https://github.com/yourusername/uteki.open/issues
- GitHub Discussions: https://github.com/yourusername/uteki.open/discussions
