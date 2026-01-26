# Uteki.open Technical Design Document

**Change**: uteki-replatform
**Created**: 2026-01-26
**Status**: Draft

---

## Context

### Background

We are transforming `uchu_trade` (a mature but architecturally constrained quantitative trading system) into `uteki.open` - a modern, open-source platform designed for individual quantitative traders.

**Current State:**
- **Codebase**: 873 Python files, monolithic architecture
- **Database**: 176MB SQLite (production data), hitting concurrency limits
- **Agent Systems**: 5 separate implementations with overlapping functionality
- **Dependency Management**: Conda + pip hybrid causing conflicts
- **Deployment**: Manual setup, no containerization

**Stakeholders:**
- **Primary**: Individual quantitative traders (technical, self-hosted)
- **Secondary**: Open-source contributors (future)

**Constraints:**
- Must support local deployment (no cloud dependencies)
- Must migrate 176MB of production data without loss
- Must maintain compatibility with existing exchange APIs (OKX, Binance)
- Target 80%+ test coverage for production readiness
- Performance: Support 100+ concurrent agent tasks

---

## Goals / Non-Goals

### Goals

1. **Modern Architecture** - DDD with 6 domains (admin, trading, data, agent, evaluation, dashboard), clean layering, testable
2. **Multi-Database Design** - PostgreSQL (transactional), ClickHouse (analytics), Qdrant (vectors)
3. **Unified Agent Framework** - Consolidate 5 agent systems into one extensible design
4. **One-Command Deployment** - Docker Compose for new users, Poetry for developers
5. **Production Tooling** - Ruff, MyPy, pre-commit, 80%+ test coverage

### Non-Goals

- **NOT** building a SaaS (local-first only)
- **NOT** supporting multi-user authentication (single-user + profiles)
- **NOT** creating a strategy marketplace (MVP focuses on personal use)
- **NOT** mobile apps (web-responsive only)
- **NOT** blockchain/DeFi integration (CEX only)

---

## Decisions

### 1. Domain-Driven Design (DDD) Architecture

**Decision**: Organize codebase into 7 bounded contexts (domains), each self-contained with models, services, repositories, and APIs.

**Rationale:**
- **Current pain**: 30+ controller modules with unclear boundaries, tight coupling
- **DDD benefits**: Clear ownership, independent testing, easier onboarding
- **Alternative considered**: Microservices architecture
  - **Rejected**: Overkill for single-user local deployment, adds operational complexity

**Structure:**
```
backend/uteki/domains/
├── admin/       # API keys, LLM config, exchange config, system settings
├── trading/     # Orders, positions, risk management
├── data/        # Multi-asset data acquisition, storage, quality assurance
├── agent/       # Agent framework, LLM abstraction, tools, multi-agent orchestration
├── evaluation/  # Enterprise-grade metrics, A/B tests, benchmarks
└── dashboard/   # Trading visualization (merged into admin page UI)

Each domain:
├── models.py      # SQLAlchemy (data layer)
├── schemas.py     # Pydantic (API contracts)
├── repository.py  # Data access (abstracts DB)
├── service.py     # Business logic
├── api.py         # FastAPI routes
└── use_cases/     # Complex operations
```

**Domain Descriptions:**

| Domain | Responsibility | Key Components |
|--------|----------------|----------------|
| **admin** | System configuration, API key management, user settings | LLM providers (OpenAI, Claude, DeepSeek, Qwen), exchanges (OKX, Binance, 雪盈), data sources (FMP) |
| **trading** | Order execution, position tracking, risk controls | Order lifecycle, exchange adapters, fee calculation, position management |
| **data** | Multi-asset data pipeline (crypto, stocks, commodities) | Daily K-line collection, on-chain data, financial statements, data quality, storage architecture |
| **agent** | AI agent framework with unified SDK | BaseAgent, LLM adapters, tool system, concurrent execution, rate limiting, multi-agent collaboration |
| **evaluation** | OpenAI/Anthropic-grade performance evaluation | Benchmarks, A/B testing, decision quality scoring, alignment evaluation |
| **dashboard** | Trading history visualization | Charts, P&L tracking, position monitoring (UI merged with admin page) |

**NOTE on Removed Domains**:
- **Strategy Domain**: Removed - AI agents handle all trading logic instead of pre-programmed mechanical strategies
- **Workplace Domain**: Removed - Multi-agent orchestration is handled directly within the agent domain (simpler sequential/parallel execution, no complex DAG workflow needed for MVP)

**Benefits:**
- Single Responsibility: Each domain has one reason to change
- Dependency Inversion: Services depend on repository interfaces, not concrete DB
- Testability: Mock repositories in unit tests

---

### 2. Multi-Database Architecture

**Decision**: Use specialized databases for different data types instead of one-size-fits-all.

**Databases:**

| Database | Purpose | Data Types | Why |
|----------|---------|------------|-----|
| **PostgreSQL 17** | Primary transactional | Orders, positions, config, users | ACID guarantees, concurrent writes, JSONB support |
| **ClickHouse** | Analytics & time-series | K-line data, backtest logs, execution history | 20-60x faster aggregations, 90% compression |
| **Qdrant** | Vector search | Strategy embeddings, news vectors, agent memory | Semantic similarity, hybrid search (vector + metadata) |
| **Redis 7** | Cache & sessions | Real-time state, rate limiting, task queues | Sub-millisecond latency, pub/sub |

**Alternative considered**: Single PostgreSQL database
- **Rejected**:
  - K-line data grows to millions of rows → slow queries
  - No vector search without extensions
  - No columnar compression

**Data Flow:**
```
Write Path:
User Action → PostgreSQL (hot data, <30 days)
              ↓ (Nightly job)
          ClickHouse (cold data archive, all history)
              ↓ (On write)
          Qdrant (embeddings generated async)

Read Path:
Dashboard → ClickHouse (fast aggregations)
Similarity Search → Qdrant (vector queries)
Real-time State → Redis (cache)
Transactional Queries → PostgreSQL
```

**Migration Strategy:**
- Phase 1: Deploy all databases via Docker Compose
- Phase 2: Migrate SQLite → PostgreSQL (automated script)
- Phase 3: Backfill ClickHouse with historical data
- Phase 4: Generate embeddings → Qdrant

---

### 3. Unified Agent Framework

**Decision**: Create `BaseAgent` abstract class that all agents inherit from, with standardized Tool and Memory interfaces.

**Current Problem**: 5 different agent implementations:
- `buffett_agent/` - 12 files, custom framework
- `mongo_buffet_agent/` - 16 files, different architecture
- `trading_agent/` - 22 files, yet another pattern
- `research_agent/` - 11 files, different tools
- `news_agent/` - 8 files, minimal structure

**New Design:**

```python
# Abstract base class
class BaseAgent(ABC):
    """All agents inherit from this."""

    def __init__(
        self,
        name: str,
        llm: BaseLLM,
        tools: list[Tool],
        memory: AgentMemory,
        config: AgentConfig,
    ):
        self.name = name
        self.llm = llm
        self.tools = {tool.name: tool for tool in tools}
        self.memory = memory
        self.config = config

    @abstractmethod
    async def plan(self, task: AgentTask) -> Plan:
        """Break down task into steps."""

    async def execute(self, task: AgentTask) -> AgentResult:
        """Main execution loop (ReAct pattern)."""
        plan = await self.plan(task)

        for step in plan.steps:
            # 1. Reason: Decide which tool to use
            action = await self._reason(step)

            # 2. Act: Execute tool
            result = await self._act(action)

            # 3. Observe: Process result
            observation = await self._observe(result)

            # 4. Store in memory
            await self.memory.store(step, observation)

        return await self._finalize(plan)

    @abstractmethod
    async def _reason(self, step: Step) -> Action:
        """LLM-based reasoning."""

    @abstractmethod
    async def _act(self, action: Action) -> ToolResult:
        """Execute tool."""

    @abstractmethod
    async def _observe(self, result: ToolResult) -> Observation:
        """Process tool result."""

# Concrete implementations
class TradingAgent(BaseAgent):
    """Handles market analysis and trade execution."""

    def __init__(self, llm: BaseLLM):
        tools = [
            MarketDataTool(),
            TechnicalIndicatorTool(),
            OrderPlacementTool(),
            RiskCalculatorTool(),
        ]
        memory = QdrantMemory(collection="trading_agent")
        super().__init__("TradingAgent", llm, tools, memory)

    async def plan(self, task: AgentTask) -> Plan:
        # Trading-specific planning logic
        ...

class ResearchAgent(BaseAgent):
    """Conducts market research."""

    def __init__(self, llm: BaseLLM):
        tools = [
            NewsSearchTool(),
            SentimentAnalysisTool(),
            CompanyFilingTool(),
            WebScraperTool(),
        ]
        memory = QdrantMemory(collection="research_agent")
        super().__init__("ResearchAgent", llm, tools, memory)
```

**Tool System:**

```python
class Tool(ABC):
    """Abstract tool interface."""

    name: str
    description: str
    parameters: dict  # JSON Schema

    @abstractmethod
    async def execute(self, **kwargs) -> ToolResult:
        """Execute tool logic."""

# Example tools
class MarketDataTool(Tool):
    name = "get_market_data"
    description = "Fetch real-time market data"
    parameters = {
        "symbol": {"type": "string", "required": True},
        "interval": {"type": "string", "enum": ["1m", "5m", "1h"]},
    }

    async def execute(self, symbol: str, interval: str) -> ToolResult:
        data = await exchange_api.get_klines(symbol, interval)
        return ToolResult(success=True, data=data)

class OrderPlacementTool(Tool):
    name = "place_order"
    description = "Place a market or limit order"
    parameters = {
        "symbol": {"type": "string"},
        "side": {"type": "string", "enum": ["buy", "sell"]},
        "quantity": {"type": "number"},
        "order_type": {"type": "string", "enum": ["market", "limit"]},
    }

    async def execute(
        self,
        symbol: str,
        side: str,
        quantity: float,
        order_type: str,
        **kwargs
    ) -> ToolResult:
        # Validate with trading domain service
        order = await trading_service.place_order(...)
        return ToolResult(success=True, data=order)
```

**Memory with Qdrant:**

```python
class AgentMemory(ABC):
    @abstractmethod
    async def store(self, step: Step, observation: Observation):
        """Store interaction."""

    @abstractmethod
    async def retrieve(self, query: str, limit: int = 5) -> list[Memory]:
        """Retrieve similar memories."""

class QdrantMemory(AgentMemory):
    def __init__(self, collection: str, embedding_model: str = "text-embedding-3-large"):
        self.collection = collection
        self.embedding_model = embedding_model
        self.qdrant = QdrantClient(...)

    async def store(self, step: Step, observation: Observation):
        # Generate embedding
        text = f"{step.description}\n{observation.result}"
        embedding = await openai.embeddings.create(
            model=self.embedding_model,
            input=text
        )

        # Store in Qdrant
        await self.qdrant.upsert(
            collection_name=self.collection,
            points=[{
                "id": uuid4().hex,
                "vector": embedding.data[0].embedding,
                "payload": {
                    "step": step.dict(),
                    "observation": observation.dict(),
                    "timestamp": datetime.now().isoformat(),
                }
            }]
        )

    async def retrieve(self, query: str, limit: int = 5) -> list[Memory]:
        # Semantic search
        embedding = await openai.embeddings.create(...)
        results = await self.qdrant.search(
            collection_name=self.collection,
            query_vector=embedding.data[0].embedding,
            limit=limit
        )
        return [Memory(**r.payload) for r in results]
```

**Benefits:**
- Single implementation pattern across all agents
- Shared memory system (RAG capabilities)
- Easy to add new agents (inherit from BaseAgent)
- Tools are composable and reusable

**Alternative considered**: Keep separate agent systems
- **Rejected**: Maintenance burden, duplicate code, inconsistent behavior

---

### 4. Dependency Management: Poetry

**Decision**: Use Poetry for Python dependency management, replacing Conda + pip.

**Comparison:**

| Tool | Pros | Cons | Verdict |
|------|------|------|---------|
| **Poetry** | Mature (7 years), best IDE support, lockfile, large community | Slower dependency resolution | ✅ **Selected** |
| **PDM** | PEP-compliant, faster than Poetry, good for monorepos | Smaller community, less documentation | ❌ |
| **uv** | 10-100x faster (Rust), modern | Too new (2024), evolving API | ❌ |
| **Conda + pip** | Current setup | Conflicts, slow, 265 dependencies | ❌ |

**Implementation:**
```toml
# pyproject.toml
[tool.poetry]
name = "uteki-open"
version = "1.0.0"
description = "Personal quantitative trading platform"
authors = ["Uteki Team"]

[tool.poetry.dependencies]
python = "^3.10"
fastapi = "^0.115.0"
uvicorn = {extras = ["standard"], version = "^0.34.0"}
sqlalchemy = "^2.0.36"
asyncpg = "^0.30.0"  # PostgreSQL async driver
clickhouse-connect = "^0.8.0"
qdrant-client = "^1.12.0"
redis = "^5.2.0"
pydantic = "^2.10.0"
pydantic-settings = "^2.7.0"
openai = "^2.15.0"
anthropic = "^0.64.0"
backtrader = "^1.9.78"
ta-lib = "^0.4.32"
okx = "^2.1.1"
binance-connector = "^3.10.0"

[tool.poetry.group.dev.dependencies]
ruff = "^0.8.0"
mypy = "^1.13.0"
pytest = "^8.3.0"
pytest-asyncio = "^0.24.0"
pytest-cov = "^6.0.0"
pre-commit = "^4.0.0"

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"
```

**Migration from Conda:**
```bash
# Export current environment
conda env export > environment_backup.yml

# Create new Poetry project
poetry init
poetry install

# Test compatibility
poetry run pytest
```

---

### 5. Database Schema Design

**Decision**: Use declarative SQLAlchemy 2.0 models with domain-specific schemas.

**Key Principles:**
1. **Domain-Driven**: Each domain owns its models
2. **Async-First**: Use `async_sessionmaker` for non-blocking I/O
3. **Type-Safe**: Leverage SQLAlchemy 2.0 typed mappings
4. **Migration-Friendly**: Alembic for all schema changes

**Example: Trading Domain Models**

```python
# backend/uteki/domains/trading/models.py
from sqlalchemy import String, Numeric, DateTime, Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from decimal import Decimal
import enum

from uteki.core.database import Base

class OrderSide(enum.Enum):
    BUY = "buy"
    SELL = "sell"

class OrderStatus(enum.Enum):
    PENDING = "pending"
    FILLED = "filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"

class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    profile_id: Mapped[str] = mapped_column(ForeignKey("profiles.id"))

    # Order details
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    side: Mapped[OrderSide] = mapped_column(Enum(OrderSide))
    order_type: Mapped[str] = mapped_column(String(16))
    quantity: Mapped[Decimal] = mapped_column(Numeric(20, 8))
    price: Mapped[Decimal | None] = mapped_column(Numeric(20, 8))

    # Status
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), index=True)
    filled_quantity: Mapped[Decimal] = mapped_column(Numeric(20, 8), default=Decimal("0"))
    average_price: Mapped[Decimal | None] = mapped_column(Numeric(20, 8))

    # Metadata
    exchange: Mapped[str] = mapped_column(String(32))
    exchange_order_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)

    # Relationships
    profile: Mapped["Profile"] = relationship(back_populates="orders")
    position: Mapped["Position | None"] = relationship(back_populates="orders")

class Position(Base):
    __tablename__ = "positions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    profile_id: Mapped[str] = mapped_column(ForeignKey("profiles.id"))

    symbol: Mapped[str] = mapped_column(String(32), index=True)
    side: Mapped[OrderSide] = mapped_column(Enum(OrderSide))
    quantity: Mapped[Decimal] = mapped_column(Numeric(20, 8))
    entry_price: Mapped[Decimal] = mapped_column(Numeric(20, 8))
    current_price: Mapped[Decimal] = mapped_column(Numeric(20, 8))

    # P&L
    unrealized_pnl: Mapped[Decimal] = mapped_column(Numeric(20, 8))
    realized_pnl: Mapped[Decimal] = mapped_column(Numeric(20, 8), default=Decimal("0"))

    # Timestamps
    opened_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)

    # Relationships
    orders: Mapped[list["Order"]] = relationship(back_populates="position")
```

**ClickHouse Schema** (for time-series data):

```sql
-- K-line data (partitioned by month)
CREATE TABLE klines (
    symbol String,
    interval String,  -- '1m', '5m', '1h', etc.
    open_time DateTime,
    open Decimal(20, 8),
    high Decimal(20, 8),
    low Decimal(20, 8),
    close Decimal(20, 8),
    volume Decimal(20, 8),
    close_time DateTime
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(open_time)
ORDER BY (symbol, interval, open_time)
SETTINGS index_granularity = 8192;

-- Backtest results
CREATE TABLE backtest_results (
    id String,
    strategy_id String,
    symbol String,
    timeframe String,
    start_date Date,
    end_date Date,
    total_return Decimal(10, 4),
    sharpe_ratio Decimal(10, 4),
    max_drawdown Decimal(10, 4),
    win_rate Decimal(10, 4),
    total_trades UInt32,
    created_at DateTime
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(start_date)
ORDER BY (strategy_id, start_date);
```

**Qdrant Collections:**

```python
# Strategy embeddings
qdrant.create_collection(
    collection_name="strategies",
    vectors_config={
        "size": 768,  # text-embedding-3-small
        "distance": "Cosine"
    }
)

# Agent memory
qdrant.create_collection(
    collection_name="agent_memory",
    vectors_config={
        "size": 1536,  # text-embedding-3-large
        "distance": "Cosine"
    }
)
```

---

### 6. Deployment Architecture

**Decision**: Support two deployment modes - Docker Compose (recommended) and local development.

**Docker Compose** (Primary):

```yaml
# docker-compose.yml
version: '3.9'

services:
  # PostgreSQL - Primary transactional database
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: uteki_trade
      POSTGRES_USER: uteki
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U uteki"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ClickHouse - Analytics database
  clickhouse:
    image: clickhouse/clickhouse-server:24-alpine
    environment:
      CLICKHOUSE_DB: uteki_analytics
      CLICKHOUSE_USER: uteki
      CLICKHOUSE_PASSWORD: ${CLICKHOUSE_PASSWORD}
    volumes:
      - ./data/clickhouse:/var/lib/clickhouse
    ports:
      - "8123:8123"  # HTTP
      - "9000:9000"  # Native
    ulimits:
      nofile:
        soft: 262144
        hard: 262144

  # Qdrant - Vector database
  qdrant:
    image: qdrant/qdrant:v1.12.5
    volumes:
      - ./data/qdrant:/qdrant/storage
    ports:
      - "6333:6333"  # REST API
      - "6334:6334"  # gRPC

  # Redis - Cache & message broker
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - ./data/redis:/data
    ports:
      - "6379:6379"

  # Backend API
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      DATABASE_URL: postgresql+asyncpg://uteki:${POSTGRES_PASSWORD}@postgres:5432/uteki_trade
      CLICKHOUSE_URL: http://clickhouse:8123
      QDRANT_URL: http://qdrant:6333
      REDIS_URL: redis://redis:6379
    volumes:
      - ./backend:/app
    ports:
      - "8000:8000"
    depends_on:
      postgres:
        condition: service_healthy
      clickhouse:
        condition: service_started
      qdrant:
        condition: service_started
      redis:
        condition: service_started
    command: uvicorn uteki.main:app --host 0.0.0.0 --port 8000 --reload

  # Frontend (React)
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    volumes:
      - ./frontend:/app
      - /app/node_modules
    ports:
      - "3000:3000"
    environment:
      REACT_APP_API_URL: http://localhost:8000
    command: npm start
```

**Local Development** (Alternative):

```bash
# Install dependencies
poetry install
cd frontend && npm install

# Start databases only
docker compose up postgres clickhouse qdrant redis -d

# Start backend
poetry run uvicorn uteki.main:app --reload

# Start frontend
cd frontend && npm start
```

**Setup Script** (`scripts/setup.sh`):

```bash
#!/bin/bash
set -e

echo "🚀 Uteki.open Setup"
echo ""

# Detect Docker
if command -v docker &> /dev/null; then
    echo "✓ Docker detected"
    HAS_DOCKER=true
else
    echo "✗ Docker not found"
    HAS_DOCKER=false
fi

# Detect Python
if command -v python3.10 &> /dev/null || command -v python3.11 &> /dev/null; then
    echo "✓ Python 3.10+ detected"
    HAS_PYTHON=true
else
    echo "✗ Python 3.10+ not found"
    HAS_PYTHON=false
fi

echo ""
echo "Choose installation method:"
if [ "$HAS_DOCKER" = true ]; then
    echo "1) Docker Compose (Recommended - easiest setup)"
fi
if [ "$HAS_PYTHON" = true ]; then
    echo "2) Local Development (For developers)"
fi

read -p "Enter choice: " choice

case $choice in
    1)
        echo "Installing with Docker Compose..."
        cp .env.example .env
        echo "Please edit .env with your API keys"
        read -p "Press Enter when ready..."
        docker compose up -d
        echo "✓ Uteki.open is running!"
        echo "  Frontend: http://localhost:3000"
        echo "  Backend: http://localhost:8000"
        ;;
    2)
        echo "Installing for local development..."
        pip install poetry
        poetry install
        cd frontend && npm install
        docker compose up -d postgres clickhouse qdrant redis
        echo "✓ Setup complete!"
        echo "  Start backend: poetry run uvicorn uteki.main:app --reload"
        echo "  Start frontend: cd frontend && npm start"
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac
```

---

### 7. Testing Strategy

**Decision**: Pyramid testing approach with 80%+ coverage target.

**Test Levels:**

```
            /\
           /  \
          /E2E \ (10%)     End-to-end tests
         /______\
        /        \
       /Integration\ (30%)  API + DB tests
      /____________\
     /              \
    /  Unit Tests    \ (60%)  Pure logic tests
   /__________________\
```

**Unit Tests** (60% of tests):
- Pure business logic
- No external dependencies
- Fast (< 1s for all unit tests)

```python
# tests/unit/domains/strategy/test_strategy_service.py
import pytest
from unittest.mock import Mock, AsyncMock
from uteki.domains.strategy.service import StrategyService

@pytest.fixture
def mock_repository():
    repo = Mock()
    repo.get_by_id = AsyncMock(return_value=None)
    repo.create = AsyncMock()
    return repo

@pytest.mark.asyncio
async def test_create_strategy_instance(mock_repository):
    service = StrategyService(repository=mock_repository)

    instance = await service.create_instance(
        name="Test Strategy",
        strategy_chain={
            "entry": "sma_cross",
            "exit": "stop_loss_5_percent"
        }
    )

    assert instance.name == "Test Strategy"
    mock_repository.create.assert_called_once()
```

**Integration Tests** (30% of tests):
- Test API endpoints with test database
- Use Docker containers for dependencies

```python
# tests/integration/test_trading_api.py
import pytest
from httpx import AsyncClient
from uteki.main import app

@pytest.mark.asyncio
async def test_place_order(test_db):
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/trading/orders",
            json={
                "symbol": "BTC-USDT",
                "side": "buy",
                "quantity": "0.001",
                "order_type": "market"
            }
        )

        assert response.status_code == 201
        data = response.json()
        assert data["symbol"] == "BTC-USDT"
        assert data["status"] == "pending"
```

**E2E Tests** (10% of tests):
- Critical user flows
- Playwright for frontend

```python
# tests/e2e/test_first_backtest.py
from playwright.async_api import async_playwright

async def test_user_runs_first_backtest():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Navigate to app
        await page.goto("http://localhost:3000")

        # Go to workplace
        await page.click("text=Workplace")

        # Select strategy
        await page.select_option("#strategy-select", "SMA Cross")

        # Run backtest
        await page.click("button:has-text('Run Backtest')")

        # Wait for results
        await page.wait_for_selector(".backtest-results")

        # Verify
        results = await page.text_content(".total-return")
        assert "%" in results

        await browser.close()
```

**CI/CD** (GitHub Actions):

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.10'

      - name: Install Poetry
        run: pip install poetry

      - name: Install dependencies
        run: poetry install

      - name: Run Ruff
        run: poetry run ruff check .

      - name: Run MyPy
        run: poetry run mypy backend

      - name: Run tests
        run: poetry run pytest --cov=backend --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          file: ./coverage.xml
```

---

## Risks / Trade-offs

### Risk 1: Data Migration Complexity

**Risk**: SQLite → PostgreSQL migration might lose data or corrupt records.

**Impact**: High (production data loss)

**Mitigation**:
1. Create full backup before migration
2. Automated migration script with validation checks
3. Dry-run mode to verify migration without committing
4. Rollback plan: Keep SQLite as read-only backup for 30 days
5. Compare row counts, checksums after migration

**Migration Script** (`scripts/migrate_sqlite_to_pg.py`):
```python
import asyncio
from sqlalchemy import create_engine, select, func
from uteki.models import all_models

async def migrate():
    sqlite_engine = create_engine("sqlite:///old.db")
    pg_engine = create_engine("postgresql://...")

    print("🔍 Validating source database...")
    # Count rows in SQLite
    sqlite_counts = {}
    for model in all_models:
        count = sqlite_engine.execute(
            select(func.count()).select_from(model)
        ).scalar()
        sqlite_counts[model.__tablename__] = count
        print(f"  {model.__tablename__}: {count} rows")

    print("\n📦 Creating PostgreSQL schema...")
    Base.metadata.create_all(pg_engine)

    print("\n🔄 Migrating data...")
    for model in all_models:
        print(f"  Migrating {model.__tablename__}...")
        rows = sqlite_engine.execute(select(model)).fetchall()

        # Batch insert to PostgreSQL
        for i in range(0, len(rows), 1000):
            batch = rows[i:i+1000]
            pg_engine.execute(model.__table__.insert(), batch)

        # Verify count
        pg_count = pg_engine.execute(
            select(func.count()).select_from(model)
        ).scalar()

        if pg_count != sqlite_counts[model.__tablename__]:
            raise ValueError(f"Count mismatch for {model.__tablename__}")

    print("\n✓ Migration complete and verified!")

if __name__ == "__main__":
    asyncio.run(migrate())
```

---

### Risk 2: ClickHouse Learning Curve

**Risk**: Team unfamiliar with ClickHouse SQL dialect, may write inefficient queries.

**Impact**: Medium (performance issues)

**Mitigation**:
1. Provide query templates for common operations
2. Abstract ClickHouse behind service layer (domain services don't write SQL directly)
3. Document query patterns in design docs
4. Use ClickHouse query analyzer to validate queries

**Example Service Abstraction**:
```python
# backend/uteki/domains/analytics/clickhouse_service.py
class ClickHouseAnalyticsService:
    """Abstracts ClickHouse queries."""

    async def get_kline_data(
        self,
        symbol: str,
        interval: str,
        start_date: datetime,
        end_date: datetime
    ) -> list[Kline]:
        """Get historical K-line data."""
        query = """
            SELECT
                symbol,
                interval,
                open_time,
                open,
                high,
                low,
                close,
                volume
            FROM klines
            WHERE symbol = {symbol:String}
              AND interval = {interval:String}
              AND open_time BETWEEN {start_date:DateTime} AND {end_date:DateTime}
            ORDER BY open_time ASC
        """

        result = await self.client.query(
            query,
            parameters={
                "symbol": symbol,
                "interval": interval,
                "start_date": start_date,
                "end_date": end_date
            }
        )

        return [Kline(**row) for row in result.result_rows]
```

---

### Risk 3: Agent Framework Adoption

**Risk**: Developers might bypass the BaseAgent framework and create ad-hoc agents.

**Impact**: Medium (architectural inconsistency)

**Mitigation**:
1. Document agent framework thoroughly
2. Provide agent templates for common patterns
3. Code review checks for agent implementations
4. Linting rule: No `class *Agent` without inheriting from `BaseAgent`

```python
# .ruff.toml custom rule (conceptual)
[tool.ruff.lint.custom]
agent-must-inherit = "All classes ending in 'Agent' must inherit from BaseAgent"
```

---

### Risk 4: Docker Compose Resource Usage

**Risk**: Running 4 databases + backend + frontend may overwhelm low-end machines.

**Impact**: Low (usability issue for some users)

**Mitigation**:
1. Provide resource limits in docker-compose.yml
2. Document minimum system requirements (8GB RAM, 4 CPU cores)
3. Offer "lite" mode: PostgreSQL only (no ClickHouse/Qdrant)
4. Provide local development alternative (Poetry + native databases)

**Lite Mode** (`docker-compose.lite.yml`):
```yaml
# Only essential services
services:
  postgres:
    # ... same config

  redis:
    # ... same config

  backend:
    environment:
      ENABLE_CLICKHOUSE: "false"
      ENABLE_QDRANT: "false"
    # ... rest of config
```

---

### Risk 5: LLM API Rate Limits

**Risk**: Agent tasks might hit OpenAI/Claude rate limits during heavy usage.

**Impact**: Medium (degraded user experience)

**Mitigation**:
1. Implement exponential backoff with retries
2. Use Redis-based rate limiter to throttle requests
3. Queue system for agent tasks (Celery + Redis)
4. Support local LLMs (Ollama) as fallback
5. Monitor usage in `/admin` page

**Rate Limiter** (Redis-based):
```python
# backend/uteki/infrastructure/llm/rate_limiter.py
import asyncio
from redis import asyncio as aioredis

class RateLimiter:
    def __init__(self, redis: aioredis.Redis, model: str):
        self.redis = redis
        self.model = model
        self.limits = {
            "gpt-4": (500, 60),  # 500 requests per 60 seconds
            "claude-3-opus": (50, 60),
            "gpt-3.5-turbo": (3500, 60),
        }

    async def acquire(self):
        """Wait until rate limit allows request."""
        max_requests, window = self.limits.get(self.model, (100, 60))

        key = f"rate_limit:{self.model}"
        current = await self.redis.incr(key)

        if current == 1:
            await self.redis.expire(key, window)

        if current > max_requests:
            # Wait until window resets
            ttl = await self.redis.ttl(key)
            await asyncio.sleep(ttl)
            return await self.acquire()
```

---

## Migration Plan

### Phase 1: Infrastructure Setup (Week 1-2)

1. **Docker Compose Environment**
   - PostgreSQL 17, ClickHouse, Qdrant, Redis
   - Verify connectivity between services
   - Test backup/restore procedures

2. **Project Structure**
   - Create DDD directory structure (7 domains)
   - Set up Poetry with pyproject.toml
   - Configure Ruff, MyPy, pre-commit

3. **Database Initialization**
   - Alembic setup for migrations
   - Create initial schema for all domains
   - Seed test data

**Deliverable**: Docker Compose environment running with empty databases

---

### Phase 2: Core Domains (Week 3-6)

**Week 3: Admin + Agent Framework**
- Admin domain models, services, APIs
- BaseAgent abstract class
- Tool system with 5 example tools
- QdrantMemory implementation

**Week 4: Trading Domain**
- Order/Position models
- Exchange abstraction (OKX, Binance)
- Order placement service
- WebSocket integration

**Week 5-6: Data Domain**
- Multi-asset data acquisition (crypto, stocks, commodities)
- ClickHouse storage architecture with time-series optimization
- Real-time data updates (WebSocket streams)
- Data quality validation pipeline
- Non-structured data management (financial reports in MinIO)
- Initial data seeding for common assets (BTC, ETH, SP500 index)

**Deliverable**: Comprehensive data pipeline with multi-asset support

---

### Phase 3: Data Migration (Week 7-8)

1. **SQLite → PostgreSQL**
   - Run `scripts/migrate_sqlite_to_pg.py`
   - Verify data integrity
   - Keep SQLite as backup for 30 days

2. **Historical Data → ClickHouse**
   - Identify data older than 30 days
   - Batch transfer to ClickHouse
   - Verify query performance (should be 20x+ faster)

3. **Generate Embeddings → Qdrant**
   - Create embeddings for existing strategies
   - Backfill agent conversation history
   - Test similarity search

**Deliverable**: All production data migrated successfully

---

### Phase 4: Frontend & Testing (Week 9-12)

**Week 9-10: UI Pages**

Two main pages (dashboard + admin merged for better UX):

1. **`/admin` - System Control Center**
   - Left sidebar navigation with two sections:
     - **Configuration Tab**: API keys, LLM models, exchanges, data sources, feature flags
     - **Dashboard Tab**: Trading history charts, P&L visualization, position monitoring, system health
   - Unified page provides both control and monitoring in one place
   - Reduces context switching for users managing personal deployments

2. **`/evaluate` - Performance Analytics & Agent Interface**
   - Agent performance metrics (accuracy, latency, cost, reliability)
   - A/B testing framework
   - OpenAI Evals-style benchmarks
   - Agent chat interface for ad-hoc queries
   - Agent task execution monitoring

**Rationale for Simplified UI:**
- Personal deployment context: same user manages config and monitors results
- Admin+Dashboard merge: Configuration and monitoring are tightly coupled workflows
- No Workplace page: Multi-agent orchestration is code-based (agent domain), not requiring visual workflow editor for MVP
- Backend domains remain separate for clean separation of concerns

**Week 11-12: Testing**
- Unit tests (60% of tests)
- Integration tests (30%)
- E2E tests (10%)
- Achieve 80%+ coverage

**Deliverable**: Complete application with tests

---

### Phase 5: Launch Preparation (Week 13-14)

1. **Documentation**
   - Quick Start guide
   - API reference (auto-generated)
   - Cookbook with examples
   - Video tutorials

2. **CI/CD**
   - GitHub Actions workflows
   - Automated releases
   - Docker image publishing

3. **Beta Testing**
   - 5-10 external testers
   - Collect feedback
   - Fix critical bugs

**Deliverable**: v1.0.0 release on GitHub

---

## Open Questions

### Technical Questions

**Q1: Agent Memory Retention Policy**
- **Question**: How long should agent conversation history be stored in Qdrant?
- **Options**:
  - A) Keep all history (unlimited)
  - B) Keep last N messages per agent (e.g., 1000)
  - C) Time-based retention (e.g., 90 days)
- **Resolution Needed By**: Week 4 (before agent framework implementation)

**Q2: ClickHouse Partitioning Strategy**
- **Question**: How to partition K-line data for optimal query performance?
- **Options**:
  - A) Partition by month (`toYYYYMM(open_time)`)
  - B) Partition by symbol and month
  - C) Partition by interval (1m, 5m, 1h)
- **Resolution Needed By**: Week 7 (before data migration)
- **Recommendation**: Option A (partition by month) - simplest, good performance

**Q3: LLM Fallback Strategy**
- **Question**: What happens when OpenAI/Claude APIs are down?
- **Options**:
  - A) Fail fast (return error to user)
  - B) Fall back to local LLM (Ollama)
  - C) Queue task for retry later
- **Resolution Needed By**: Week 4 (agent framework)
- **Recommendation**: Option B + C (try local LLM, queue if that fails too)

---

### Product Questions

**Q4: Profile Switching Behavior**
- **Question**: What happens to running agent tasks and workflows when user switches profiles?
- **Options**:
  - A) Auto-cancel all agent tasks
  - B) Show warning, require manual stop
  - C) Keep tasks running (isolate by profile)
- **Resolution Needed By**: Week 10 (frontend)
- **Recommendation**: Option B (explicit > implicit)

**Q6: Data Export Format**
- **Question**: What format should strategy export/import use?
- **Options**:
  - A) JSON (human-readable)
  - B) YAML (more compact)
  - C) Custom binary format
- **Resolution Needed By**: Week 10 (workplace page)
- **Recommendation**: Option A (JSON with JSON Schema validation)

---

## Appendix

### A. Technology Evaluation Summary

See proposal.md Appendix A for full evaluation matrix.

**Key Decisions:**
- **Poetry** > PDM/uv (stability & community)
- **PostgreSQL** > SQLite (concurrency & scale)
- **ClickHouse** > DuckDB (performance & maturity)
- **Qdrant** > ChromaDB (features & performance)
- **Ruff** > Black (speed)

---

### B. API Design Principles

1. **RESTful**: Use HTTP verbs correctly (GET, POST, PUT, DELETE)
2. **Versioned**: All routes under `/api/v1/`
3. **Consistent**: Pydantic schemas for all request/response
4. **Documented**: OpenAPI/Swagger auto-generated
5. **Secure**: API key authentication, rate limiting

**Example Endpoint:**
```python
@router.post("/orders", response_model=OrderResponse, status_code=201)
async def place_order(
    order: OrderCreate,
    profile: Profile = Depends(get_current_profile),
    service: TradingService = Depends(get_trading_service),
) -> OrderResponse:
    """Place a new order."""
    result = await service.place_order(order, profile)
    return OrderResponse.from_orm(result)
```

---

### C. Database Connection Pooling

**PostgreSQL** (asyncpg):
```python
# backend/uteki/core/database.py
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

engine = create_async_engine(
    DATABASE_URL,
    pool_size=30,
    max_overflow=20,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    expire_on_commit=False,
    class_=AsyncSession,
)
```

**ClickHouse** (clickhouse-connect):
```python
from clickhouse_connect import get_async_client

clickhouse_client = get_async_client(
    host="localhost",
    port=8123,
    username="uteki",
    password=os.getenv("CLICKHOUSE_PASSWORD"),
    database="uteki_analytics",
)
```

**Qdrant** (qdrant-client):
```python
from qdrant_client import AsyncQdrantClient

qdrant_client = AsyncQdrantClient(
    url="http://localhost:6333",
    timeout=30,
)
```

---

**End of Design Document**

_Next: Create specs/ for each domain and tasks.md for implementation._
