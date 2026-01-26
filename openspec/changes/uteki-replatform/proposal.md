# Uteki.open Replatform Proposal

**Status**: Draft
**Created**: 2026-01-26
**Author**: System Architect
**Type**: Major Replatform & Refactor

---

## Executive Summary

Transform `uchu_trade` (legacy quantitative trading system) into `uteki.open` - a modern, open-source, personal quantitative trading platform with:

- **Domain-Driven Architecture** - Clean separation of concerns across 7 core domains
- **Modern Tech Stack** - PostgreSQL, ClickHouse, Qdrant, Poetry, Ruff
- **Out-of-the-Box Experience** - One-command local deployment for individual users
- **Unified Agent Framework** - Consolidate 5+ disparate agent systems into one coherent architecture
- **Production-Ready Tooling** - Pre-commit hooks, type checking, automated testing

**Target Users**: Individual quantitative traders who want a professional-grade, self-hosted trading system without enterprise complexity.

---

## Background & Context

### Current State: uchu_trade

```
Legacy System Snapshot:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 873 Python files
• 176MB SQLite database (production data)
• 5+ different Agent implementations (buffett_agent, mongo_buffet_agent,
  trading_agent, research_agent, news_agent)
• 30+ controller modules
• Mixed dependency management (Conda + pip)
• SQLAlchemy 1.4.51 (pre-2.0 migration)
• Monolithic architecture with unclear boundaries
```

### Pain Points

1. **Architectural Debt**
   - No clear separation between domains
   - Agent systems overlap in functionality
   - Controllers directly access database models
   - Difficult to test individual components

2. **Operational Complexity**
   - Conda + pip dependency conflicts
   - 265 dependencies in environment.yml
   - No Docker support for easy deployment
   - Manual database migrations

3. **Scalability Issues**
   - SQLite limits concurrent writes
   - No time-series optimization for kline data
   - No vector search for semantic queries
   - Growing technical debt

4. **User Experience**
   - Not designed for external users
   - No onboarding flow
   - Manual configuration required
   - No built-in documentation

---

## Goals

### Primary Goals

1. **🏗️ Modern Architecture**
   - Domain-Driven Design (DDD) with 7 core domains
   - Clean separation: API → Service → Repository → Models
   - Hexagonal architecture for testability

2. **📦 Out-of-the-Box Local Deployment**
   - Clone repo → Configure keys → Start trading
   - Docker Compose for one-command startup
   - Alternative: Poetry + local installation
   - Automatic database initialization

3. **🧠 Unified Agent Framework**
   - Single `BaseAgent` abstraction
   - Pluggable Tool system
   - Shared Memory management (Qdrant-backed)
   - Consolidate 5 agent systems into one coherent design

4. **💾 Multi-Database Architecture**
   - PostgreSQL: Transactional data (orders, positions, config)
   - ClickHouse: Analytics & time-series (klines, backtest logs)
   - Qdrant: Vector search (strategy similarity, RAG)
   - Redis: Caching & real-time state

5. **🛠️ Production-Grade Tooling**
   - Poetry for dependency management
   - Ruff for linting + formatting (100x faster than Black)
   - MyPy for type safety
   - Pre-commit hooks
   - Pytest with 80%+ coverage

6. **🎨 Four Core Pages**
   - `/admin` - API keys, model config, usage monitoring
   - `/admin` - System configuration + trading dashboard (merged for better UX)
   - `/evaluate` - Agent evaluation, A/B testing, agent chat interface

### Secondary Goals

7. **📊 Enhanced Analytics**
   - ClickHouse-powered fast queries (20-60x faster than PostgreSQL)
   - Historical data compression (90% space savings)
   - Real-time dashboards

8. **🔍 Semantic Search**
   - Strategy similarity search via embeddings
   - News article clustering
   - Agent memory retrieval (RAG)

9. **📚 Comprehensive Documentation**
   - Quick Start guide (5 minutes to first backtest)
   - Cookbook with real-world examples
   - Interactive tutorials
   - API reference (auto-generated)

---

## Non-Goals

### What We're NOT Doing

1. **❌ SaaS / Cloud Deployment**
   - This is a self-hosted, local-first tool
   - No cloud infrastructure, no multi-tenancy (yet)
   - Users run it on their own machines

2. **❌ Strategy Marketplace (MVP)**
   - No strategy sharing/selling in initial release
   - Architecture will support future extension
   - Focus on personal use first

3. **❌ Multi-User Authentication (Initially)**
   - Single-user mode + Profile switching
   - Can add multi-user later if needed

4. **❌ Mobile App**
   - Web-first responsive design only
   - No native iOS/Android apps

5. **❌ Blockchain/DeFi Integration**
   - Focus on CEX (OKX, Binance) only
   - DEX integration is out of scope

---

## Proposal Overview

### Core Domains (Domain-Driven Design)

```
┌──────────────────────────────────────────────────────────────┐
│                    Uteki.open Domain Map                     │
└──────────────────────────────────────────────────────────────┘

1. admin/          - API keys, model config, system settings
2. trading/        - Orders, positions, account management
3. strategy/       - Strategy engine, atoms, backtest, scheduler
4. agent/          - Unified agent framework, tools, memory
5. evaluation/     - Metrics, A/B testing, benchmarks, reports
6. dashboard/      - Trading history, performance visualization

Each domain contains:
├── models.py      - SQLAlchemy models
├── schemas.py     - Pydantic request/response schemas
├── repository.py  - Data access layer
├── service.py     - Business logic
├── api.py         - FastAPI routes
└── use_cases/     - Specific business operations
```

### Technology Stack

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Layer              | Current          | New              | Rationale
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Dependency Mgmt    | Conda + pip      | Poetry           | Standard, lockfile, faster
ORM                | SQLAlchemy 1.4   | SQLAlchemy 2.0   | Modern API, async support
Primary DB         | SQLite           | PostgreSQL 17    | ACID, concurrency, JSON
Analytics DB       | -                | ClickHouse       | 20-60x faster queries
Vector DB          | -                | Qdrant           | Semantic search, RAG
Cache              | -                | Redis 7          | Session, real-time state
Linter/Formatter   | -                | Ruff             | 100x faster than Black
Type Checker       | -                | MyPy (strict)    | Catch bugs early
Testing            | Manual           | Pytest + Coverage| 80%+ coverage target
API Framework      | FastAPI 0.110    | FastAPI 0.115    | Latest features
Python Version     | 3.10.9           | 3.10+            | Compatible, modern
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Deployment Model

**Hybrid Approach** (supports both):

```bash
# Option 1: Docker Compose (Recommended for new users)
git clone https://github.com/yourusername/uteki.open
cd uteki.open
cp .env.example .env  # Configure API keys
docker compose up     # Start all services
# → http://localhost:3000

# Option 2: Local Development (For developers)
git clone https://github.com/yourusername/uteki.open
cd uteki.open
make install          # Poetry + npm install
make dev              # Start backend + frontend
# → http://localhost:3000
```

**Smart Setup Script**:
```bash
./scripts/setup.sh
# Detects environment:
# - Has Docker? → Offer Docker Compose
# - Has Python 3.10+? → Offer local install
# - Let user choose
```

---

## Technical Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React 18)                     │
│                   /admin /evaluate                          │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/WebSocket
┌────────────────────────▼────────────────────────────────────┐
│                  FastAPI Application                        │
│                     (Python 3.10+)                          │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │          API Layer (FastAPI Routers)               │    │
│  │  /api/v1/admin  /trading  /strategy  /agent ...    │    │
│  └───────────────────────┬────────────────────────────┘    │
│                          │                                   │
│  ┌───────────────────────▼────────────────────────────┐    │
│  │              Domain Services                       │    │
│  │  AdminService | TradingService | StrategyService   │    │
│  │  AgentService | EvaluationService | ...            │    │
│  └───────────────────────┬────────────────────────────┘    │
│                          │                                   │
│  ┌───────────────────────▼────────────────────────────┐    │
│  │            Repository Layer                        │    │
│  │  Data access abstraction (SQLAlchemy)              │    │
│  └───────────────────────┬────────────────────────────┘    │
└──────────────────────────┼──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼──────┐   ┌───────▼──────┐   ┌──────▼─────────┐
│ PostgreSQL   │   │ ClickHouse   │   │    Qdrant      │
│              │   │              │   │                │
│ • Orders     │   │ • K-lines    │   │ • Strategy     │
│ • Positions  │   │ • Backtest   │   │   embeddings   │
│ • Config     │   │   logs       │   │ • News vectors │
│ • Users      │   │ • Analytics  │   │ • Agent memory │
└──────────────┘   └──────────────┘   └────────────────┘
```

### Database Design Philosophy

**Data Classification**:

```
Hot Data (PostgreSQL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Active orders & positions (< 30 days)
• User configurations
• API keys (encrypted)
• Strategy instances
• Real-time account state
• Agent tasks (pending/running)

→ Optimized for: ACID transactions, concurrent writes, data integrity

Cold Data (ClickHouse)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Historical K-line data (years of data)
• Completed backtest records
• Execution logs (millions of rows)
• Performance metrics time-series
• Archived orders/positions (> 30 days)

→ Optimized for: Fast aggregations, compression, time-series queries

Vector Data (Qdrant)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Strategy embeddings (semantic similarity)
• News article vectors (clustering)
• Agent conversation history (RAG)
• Market analysis summaries

→ Optimized for: Vector similarity search, hybrid queries
```

### Agent Framework Architecture

**Unified Design** (consolidates 5 legacy systems):

```python
# Abstract base class
class BaseAgent:
    """All agents inherit from this"""

    def __init__(
        self,
        name: str,
        llm: BaseLLM,  # OpenAI/Claude/Local
        tools: list[Tool],
        memory: AgentMemory,  # Qdrant-backed
    ):
        ...

    async def execute(self, task: AgentTask) -> AgentResult:
        """Main execution loop"""
        # 1. Plan - break down task
        # 2. Execute - use tools
        # 3. Reflect - evaluate result
        # 4. Memory - store in Qdrant
        ...

# Specific implementations
class TradingAgent(BaseAgent):
    """Handles market analysis and trade execution"""
    tools = [
        MarketDataTool(),
        TechnicalIndicatorTool(),
        OrderPlacementTool(),
    ]

class ResearchAgent(BaseAgent):
    """Conducts market research"""
    tools = [
        NewsSearchTool(),
        SentimentAnalysisTool(),
        CompanyFilingTool(),
    ]

class EvaluationAgent(BaseAgent):
    """Evaluates strategy and agent performance"""
    tools = [
        BacktestTool(),
        StatisticalAnalysisTool(),
        ReportGeneratorTool(),
    ]
```

**Tool System**:

```python
class Tool:
    """Abstract tool interface"""

    name: str
    description: str
    parameters: dict  # JSON Schema

    async def execute(self, **kwargs) -> ToolResult:
        """Execute tool logic"""
        raise NotImplementedError

# Example: Market Data Tool
class MarketDataTool(Tool):
    name = "get_market_data"
    description = "Fetch real-time market data for a symbol"
    parameters = {
        "symbol": {"type": "string"},
        "interval": {"type": "string", "enum": ["1m", "5m", "1h"]},
        "limit": {"type": "integer"},
    }

    async def execute(
        self,
        symbol: str,
        interval: str,
        limit: int = 100,
    ) -> ToolResult:
        # Fetch from exchange API
        data = await exchange.get_klines(symbol, interval, limit)
        return ToolResult(success=True, data=data)
```

---

## Key Design Decisions

### 1. Why Poetry over PDM/uv?

```
Decision: Poetry
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Rationale:
• Most mature (7 years, 27k+ stars)
• Best IDE integration (PyCharm, VSCode)
• Largest community → easier troubleshooting
• Stable API, proven at scale
• Easy migration path to uv later (pyproject.toml compatible)

Trade-offs:
• Slower than uv (acceptable for this use case)
• Dependency resolution can be conservative

Alternatives Considered:
• PDM - Good, but smaller community
• uv - Too new (2024), prefer stability
```

### 2. Why PostgreSQL over SQLite?

```
Decision: PostgreSQL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Rationale:
• Concurrent writes (multiple agents writing simultaneously)
• Better data integrity (ACID guarantees)
• JSON/JSONB support (flexible schema)
• Room to grow (SQLite limits at ~100GB)
• Industry standard for this architecture

Local Deployment:
• Docker Compose handles PostgreSQL automatically
• Provide SQLite→PostgreSQL migration script
• Zero manual setup for users

Alternatives Considered:
• SQLite - Current choice, but hitting limits
• MySQL - Less modern than PostgreSQL
```

### 3. Why ClickHouse for Analytics?

```
Decision: ClickHouse
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Rationale:
• 20-60x faster queries for time-series data
• 90% data compression (save disk space)
• Columnar storage perfect for analytics
• Single-server mode (no cluster needed)
• Mature, battle-tested at scale

Use Cases:
• K-line historical data (millions of rows)
• Backtest result analysis
• Performance metrics aggregation
• Log analytics

Alternatives Considered:
• TimescaleDB - PostgreSQL extension, good but slower
• DuckDB - Fast, but newer, less proven
• Keep in PostgreSQL - Too slow for large datasets
```

### 4. Why Qdrant for Vector Search?

```
Decision: Qdrant
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Rationale:
• Rust-based, high performance
• Docker single-container deployment
• Excellent Python SDK
• Hybrid search (vector + metadata filters)
• Open source, active development

Use Cases:
• Strategy similarity search
• News article clustering
• Agent memory (RAG)
• Semantic search in trading history

Alternatives Considered:
• ChromaDB - Simpler, but less performant
• Milvus - Enterprise-grade, too complex for personal use
• pgvector - PostgreSQL extension, limited features
```

### 5. Single-User vs Multi-User?

```
Decision: Single-User + Profile Switching
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Rationale:
• Aligns with "personal tool" vision
• Simpler architecture (no auth/permissions initially)
• Profile switching enables:
  - Production trading profile
  - Demo/testnet profile
  - Backtesting-only profile

Implementation:
• Profile stored in database
• UI dropdown to switch profiles
• Each profile has isolated:
  - API keys
  - Strategy instances
  - Trading history

Future Extension:
• Easy to add multi-user later if needed
• Architecture doesn't prevent it
```

---

## Implementation Plan

### Phase 1: Foundation (Week 1-2)

**Goal**: Set up project structure and infrastructure

```
□ Create uteki.open repository
□ Initialize Poetry project with pyproject.toml
□ Set up Docker Compose (PostgreSQL, ClickHouse, Qdrant, Redis)
□ Configure Ruff + MyPy + Pre-commit hooks
□ Create DDD directory structure (7 domains)
□ Set up Alembic for database migrations
□ Configure logging and monitoring
□ Create .env.example with all configuration options
```

**Deliverables**:
- Working Docker Compose environment
- Project skeleton with DDD structure
- Development tooling configured

### Phase 2: Core Domains (Week 3-6)

**Goal**: Implement foundational domains

```
Week 3: Admin Domain
□ API key management (CRUD)
□ Encrypted storage (cryptography library)
□ Model configuration (OpenAI, Claude, Local)
□ Usage tracking and limits
□ /admin frontend page

Week 4: Agent Framework
□ BaseAgent abstract class
□ Tool system with 10+ built-in tools
□ AgentMemory with Qdrant integration
□ Task execution engine
□ Error handling and retries

Week 5: Trading Domain
□ Exchange abstraction (OKX, Binance)
□ Order placement and management
□ Position tracking
□ Account synchronization
□ WebSocket real-time updates

Week 6: Data Domain (Part 1)
□ Multi-asset data acquisition architecture (crypto, stocks, commodities)
□ ClickHouse time-series storage optimization
□ Real-time WebSocket data streams
□ Data quality validation pipeline
```

**Deliverables**:
- Working /admin page with API key configuration
- Functional agent framework with tool system
- Trading operations (place orders, track positions)

### Phase 3: Data & Evaluation (Week 7-8)

**Goal**: Build comprehensive data pipeline and enterprise-grade evaluation

```
Week 7: Data Domain (Part 2)
□ Stock market data (SP500, NASDAQ100, individual stocks)
□ On-chain data collection (BTC, ETH)
□ Commodity data (gold, silver, crude oil, agricultural)
□ Financial report storage (PDF in MinIO, embeddings in Qdrant)
□ Initial data seeding for common assets

Week 8: Evaluation Domain
□ Evaluation metrics framework
□ Agent performance tracking
□ A/B testing system
□ /evaluate frontend page
□ Report generation
```

**Deliverables**:
- Comprehensive multi-asset data pipeline
- Enterprise-grade agent evaluation framework (OpenAI/Anthropic-level)
- Data quality assurance system

### Phase 4: User Experience (Week 9-10)

**Goal**: Polish UI/UX and documentation

```
Week 9: Frontend Pages
□ /admin page - configuration + dashboard tabs
□ /evaluate page - agent evaluation + chat interface
□ Trading history visualization
□ Profile switching UI

Week 10: Documentation & Onboarding
□ Quick Start guide (5-min to first backtest)
□ Cookbook with 10+ examples
□ API documentation (auto-generated)
□ Interactive tutorial on first launch
□ Video walkthrough
```

**Deliverables**:
- Complete 4-page UI
- Comprehensive documentation
- Onboarding flow

### Phase 5: Data Migration & Testing (Week 11-12)

**Goal**: Migrate data and ensure quality

```
Week 11: Data Migration
□ SQLite → PostgreSQL migration script
□ Historical data → ClickHouse archival
□ Generate embeddings → Qdrant
□ Validate data integrity

Week 12: Testing & Polish
□ Unit tests (80%+ coverage)
□ Integration tests for all domains
□ E2E tests for critical flows
□ Performance testing and optimization
□ Bug fixes and polish
```

**Deliverables**:
- Automated migration scripts
- 80%+ test coverage
- Production-ready system

### Phase 6: Launch Preparation (Week 13-14)

**Goal**: Prepare for public release

```
Week 13: Deployment & CI/CD
□ GitHub Actions workflows
□ Automated releases
□ Docker image publishing
□ Installation scripts for all platforms
□ Backup and restore utilities

Week 14: Final Polish & Documentation
□ README with clear instructions
□ CONTRIBUTING guide
□ LICENSE file
□ Security audit
□ Performance profiling
□ Beta testing with 5-10 users
```

**Deliverables**:
- Public GitHub repository
- v1.0.0 release
- Complete documentation

---

## Success Metrics

### User Experience Metrics

```
Onboarding Success:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Target: 90% of users complete first backtest within 15 minutes
Measure:
  - Time from `git clone` to first backtest execution
  - User drop-off at each step (setup, config, first run)

Deployment Success:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Target: One-command startup works on 95% of systems
Measure:
  - macOS (Intel & Apple Silicon)
  - Linux (Ubuntu, Debian, Arch)
  - Windows (WSL2)
```

### Technical Performance Metrics

```
Query Performance:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Target: 10x improvement over legacy system
Measure:
  - Backtest query time (100k rows): < 2s (vs 20s in SQLite)
  - Dashboard load time: < 1s
  - Strategy similarity search: < 500ms

System Reliability:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Target: 99.9% uptime for core services
Measure:
  - Database connection failures
  - Agent task success rate: > 95%
  - API error rate: < 1%

Code Quality:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Target: Professional-grade codebase
Measure:
  - Test coverage: > 80%
  - MyPy strict mode: 0 errors
  - Ruff linting: 0 violations
  - Documentation coverage: 100% of public APIs
```

### Community Metrics (Post-Launch)

```
Adoption:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Target: 100 GitHub stars in first month
Measure:
  - GitHub stars, forks, watchers
  - Docker Hub pulls
  - Documentation page views

Engagement:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Target: Active community forming
Measure:
  - GitHub issues/PRs
  - Discord server activity
  - Number of user-contributed strategies
```

---

## Risks & Mitigation

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Database migration data loss** | High | Low | • Automated migration scripts<br>• Comprehensive testing<br>• Backup before migration<br>• Rollback plan |
| **Performance regressions** | Medium | Medium | • Benchmark suite<br>• Performance testing in CI<br>• Profiling tools<br>• Monitor in production |
| **Docker compatibility issues** | Medium | Medium | • Test on multiple platforms<br>• Provide non-Docker alternative<br>• Detailed troubleshooting docs |
| **Agent framework complexity** | Medium | Low | • Start with simple agents<br>• Iterative development<br>• Extensive testing |
| **ClickHouse learning curve** | Low | Medium | • Provide query templates<br>• Abstract behind service layer<br>• Document common patterns |

### Project Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Scope creep** | High | Medium | • Strict Non-Goals enforcement<br>• MVP-first approach<br>• Feature freezes per phase |
| **Timeline delays** | Medium | Medium | • 2-week buffer built in<br>• Weekly progress reviews<br>• Parallel workstreams |
| **User adoption low** | Medium | Low | • Beta testing before launch<br>• Focus on documentation<br>• Active community engagement |
| **Dependency vulnerabilities** | Medium | Low | • Automated security scanning<br>• Poetry lock file<br>• Regular dependency updates |

---

## Open Questions

### Technical Questions

1. **Agent Memory Size Limits**
   - How much conversation history to store per agent?
   - Retention policy? (e.g., keep last 1000 messages)
   - Resolution: Test with different limits, measure performance impact

2. **ClickHouse Partitioning Strategy**
   - Partition by date? By symbol?
   - Retention policy for old data?
   - Resolution: Start with date partitioning (monthly), adjust based on usage

3. **LLM Rate Limiting**
   - How to handle OpenAI/Claude API rate limits?
   - Queue system? Retry logic?
   - Resolution: Implement exponential backoff + Redis queue

### Product Questions

4. **Strategy Versioning**
   - How to handle strategy updates without breaking running instances?
   - Semantic versioning for strategies?
   - Resolution: Strategy instances are immutable snapshots

5. **Data Export Format**
   - What format for strategy sharing? JSON? YAML?
   - Include backtests results in export?
   - Resolution: JSON with JSON Schema validation

6. **Profile Switching Behavior**
   - What happens to running strategies when switching profiles?
   - Auto-pause? Warning?
   - Resolution: Warn user, require explicit stop before switch

### Community Questions

7. **License Choice**
   - MIT (permissive) vs AGPL (copyleft)?
   - Commercial use allowed?
   - Resolution: MIT for maximum adoption

8. **Contribution Guidelines**
   - How to accept community strategies?
   - Code review process?
   - Resolution: Define CONTRIBUTING.md with clear standards

---

## Appendix

### A. Technology Evaluation Matrix

```
┌─────────────────┬──────────┬──────────┬──────────┬──────────┐
│ Category        │ Option 1 │ Option 2 │ Option 3 │ Selected │
├─────────────────┼──────────┼──────────┼──────────┼──────────┤
│ Dependency Mgmt │ Poetry   │ PDM      │ uv       │ Poetry   │
│ Primary DB      │ SQLite   │ Postgres │ MySQL    │ Postgres │
│ Analytics DB    │ Postgres │ ClickH.  │ DuckDB   │ ClickH.  │
│ Vector DB       │ Qdrant   │ Chroma   │ Milvus   │ Qdrant   │
│ Cache           │ Redis    │ Memcache │ None     │ Redis    │
│ Linter          │ Ruff     │ Black    │ Pylint   │ Ruff     │
│ Type Checker    │ MyPy     │ Pyright  │ None     │ MyPy     │
└─────────────────┴──────────┴──────────┴──────────┴──────────┘
```

### B. Directory Structure Reference

See [Technical Architecture](#technical-architecture) section for complete directory tree.

### C. Migration Scripts

```python
# Example: SQLite to PostgreSQL migration
# Location: scripts/migrate_sqlite_to_pg.py

import asyncio
from sqlalchemy import create_engine
from backend.models import all_models

async def migrate():
    # 1. Connect to both databases
    sqlite_engine = create_engine("sqlite:///data/old.db")
    pg_engine = create_engine("postgresql://...")

    # 2. Create tables in PostgreSQL
    Base.metadata.create_all(pg_engine)

    # 3. Copy data table by table
    for model in all_models:
        print(f"Migrating {model.__tablename__}...")
        # Batch copy with progress bar
        ...

    print("✓ Migration complete!")

if __name__ == "__main__":
    asyncio.run(migrate())
```

### D. Configuration Template

See `.env.example` in project root for complete configuration template.

---

## Approval & Next Steps

### Stakeholder Sign-Off

- [ ] Technical Architect - _Pending_
- [ ] Product Owner - _Pending_
- [ ] Community Lead - _Pending_

### Next Artifacts (OpenSpec Workflow)

1. **Design Document** (`design.md`)
   - Detailed API specifications
   - Database schema designs
   - Agent framework class diagrams
   - UI/UX mockups

2. **Technical Specification** (`specs/`)
   - Per-domain specifications
   - API contracts
   - Data models

3. **Task Breakdown** (`tasks.md`)
   - Detailed implementation tasks
   - Dependencies between tasks
   - Time estimates

### Questions for Stakeholders

1. Do you agree with the single-user + profile approach? Or should we prioritize multi-user from day 1?
2. Is the 14-week timeline acceptable? Should we cut scope for faster MVP?
3. Any critical features missing from the proposal?

---

**End of Proposal**

_This proposal will evolve based on feedback. Please submit comments via GitHub Issues._
