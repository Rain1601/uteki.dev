# Implementation Tasks - uteki-replatform

**Change**: uteki-replatform
**Status**: Ready for implementation
**Estimated Duration**: 14 weeks

---

## 1. Project Initialization & Infrastructure Setup (Week 1-2)

### 1.1 Project Structure
- [ ] 1.1.1 Create backend directory structure with 6 domains (admin, trading, data, agent, evaluation, dashboard)
- [ ] 1.1.2 Initialize Poetry project with pyproject.toml
- [ ] 1.1.3 Configure Python 3.10+ environment
- [ ] 1.1.4 Create frontend/ directory with Vite + React 18 + TypeScript setup
- [ ] 1.1.5 Set up monorepo structure (backend + frontend)

### 1.2 Development Tooling
- [ ] 1.2.1 Configure Ruff for linting (backend/pyproject.toml)
- [ ] 1.2.2 Configure MyPy for type checking with strict mode
- [ ] 1.2.3 Set up pre-commit hooks (black, ruff, mypy)
- [ ] 1.2.4 Configure pytest with coverage reporting (target 80%+)
- [ ] 1.2.5 Set up ESLint + Prettier for frontend

### 1.3 Docker Compose Environment
- [ ] 1.3.1 Create docker-compose.yml with all services
- [ ] 1.3.2 Add PostgreSQL 17 service with persistent volume
- [ ] 1.3.3 Add ClickHouse service with custom config
- [ ] 1.3.4 Add Qdrant service for vector storage
- [ ] 1.3.5 Add Redis 7 service for caching
- [ ] 1.3.6 Add MinIO service for file storage
- [ ] 1.3.7 Create init scripts for database schemas
- [ ] 1.3.8 Test one-command startup: `docker compose up -d`

### 1.4 Base Dependencies
- [ ] 1.4.1 Add core dependencies to pyproject.toml (FastAPI 0.115+, SQLAlchemy 2.0, Pydantic 2.0)
- [ ] 1.4.2 Add database drivers (asyncpg, clickhouse-driver)
- [ ] 1.4.3 Add LLM SDKs as optional extras (openai, anthropic, dashscope)
- [ ] 1.4.4 Add exchange SDKs (ccxt, ib-insync for 雪盈)
- [ ] 1.4.5 Add data processing libs (pandas, numpy, ta-lib)
- [ ] 1.4.6 Install all dependencies: `poetry install --all-extras`

### 1.5 Git Setup
- [ ] 1.5.1 Create feature/replatform-uteki branch
- [ ] 1.5.2 Set up .gitignore (Python, Node, IDE files)
- [ ] 1.5.3 Create initial commit with project structure

---

## 2. Admin Domain (Week 3)

### 2.1 Database Models
- [ ] 2.1.1 Create admin/models.py with APIKey model
- [ ] 2.1.2 Add LLMProvider model (support OpenAI, Claude, DeepSeek, Qwen, Ollama)
- [ ] 2.1.3 Add ExchangeConfig model (OKX, Binance, 雪盈)
- [ ] 2.1.4 Add DataSourceConfig model (FMP)
- [ ] 2.1.5 Add UserProfile model for multi-profile support
- [ ] 2.1.6 Add SystemSettings model
- [ ] 2.1.7 Create Alembic migration for admin tables

### 2.2 Encryption & Security
- [ ] 2.2.1 Implement AES-256 encryption for API keys
- [ ] 2.2.2 Create EncryptionService with key management
- [ ] 2.2.3 Implement secure key masking (first 8 + last 4 chars visible)
- [ ] 2.2.4 Add audit logging for all admin operations

### 2.3 Repository & Service Layer
- [ ] 2.3.1 Create admin/repository.py with APIKeyRepository
- [ ] 2.3.2 Create admin/service.py with AdminService
- [ ] 2.3.3 Implement API key CRUD operations
- [ ] 2.3.4 Implement LLM provider configuration with validation
- [ ] 2.3.5 Implement exchange configuration with test connection
- [ ] 2.3.6 Implement profile switching logic
- [ ] 2.3.7 Add usage monitoring for LLM APIs

### 2.4 API Endpoints
- [ ] 2.4.1 Create admin/api.py with FastAPI router
- [ ] 2.4.2 POST /api/v1/admin/api-keys (create API key)
- [ ] 2.4.3 GET /api/v1/admin/api-keys (list masked keys)
- [ ] 2.4.4 DELETE /api/v1/admin/api-keys/{id}
- [ ] 2.4.5 POST /api/v1/admin/llm-providers (configure LLM)
- [ ] 2.4.6 POST /api/v1/admin/llm-providers/{id}/test (test connection)
- [ ] 2.4.7 POST /api/v1/admin/exchanges (configure exchange)
- [ ] 2.4.8 POST /api/v1/admin/data-sources (configure FMP)
- [ ] 2.4.9 GET /api/v1/admin/system-health (database, Redis, ClickHouse status)

### 2.5 Testing
- [ ] 2.5.1 Write unit tests for admin service (80%+ coverage)
- [ ] 2.5.2 Write integration tests for admin API endpoints
- [ ] 2.5.3 Test encryption/decryption roundtrip
- [ ] 2.5.4 Test profile isolation

---

## 3. Agent Domain (Week 3-4)

### 3.1 LLM API Layer
- [ ] 3.1.1 Create agent/llm/base.py with BaseLLM abstract class
- [ ] 3.1.2 Implement OpenAILLM adapter (supports GPT-4, GPT-3.5)
- [ ] 3.1.3 Implement ClaudeLLM adapter (Anthropic API)
- [ ] 3.1.4 Implement DeepSeekLLM adapter (OpenAI-compatible)
- [ ] 3.1.5 Implement QwenLLM adapter (DashScope SDK)
- [ ] 3.1.6 Implement LocalLLM adapter (Ollama)
- [ ] 3.1.7 Add LLM response format normalization
- [ ] 3.1.8 Implement cost tracking for each provider

### 3.2 Agent SDK Layer
- [ ] 3.2.1 Create agent/sdk/base_agent_sdk.py with tool calling loop
- [ ] 3.2.2 Implement ReAct pattern (Reason → Act → Observe)
- [ ] 3.2.3 Add tool execution with error handling
- [ ] 3.2.4 Implement streaming support for agent responses
- [ ] 3.2.5 Add agent execution context management

### 3.3 Business Agent Layer
- [ ] 3.3.1 Create agent/agents/base.py with BaseAgent
- [ ] 3.3.2 Implement TradingAgent with market analysis tools
- [ ] 3.3.3 Implement ResearchAgent with data retrieval tools
- [ ] 3.3.4 Add agent configuration schema
- [ ] 3.3.5 Implement agent task queue

### 3.4 Tool System
- [ ] 3.4.1 Create agent/tools/base.py with Tool abstract class
- [ ] 3.4.2 Implement MarketDataTool (fetch K-lines from ClickHouse)
- [ ] 3.4.3 Implement TechnicalIndicatorTool (RSI, MACD, SMA via ta-lib)
- [ ] 3.4.4 Implement NewsSearchTool (query news database)
- [ ] 3.4.5 Implement SentimentAnalysisTool (NLP sentiment)
- [ ] 3.4.6 Implement BacktestTool (run strategy backtest)
- [ ] 3.4.7 Implement FMPDataTool (company profile, financials, valuation)
- [ ] 3.4.8 Implement StockScreenerTool (filter stocks by criteria)
- [ ] 3.4.9 Implement PlaceOrderTool (execute trades)
- [ ] 3.4.10 Add tool result caching

### 3.5 Memory System
- [ ] 3.5.1 Create agent/memory/qdrant_memory.py
- [ ] 3.5.2 Implement conversation history storage
- [ ] 3.5.3 Implement semantic search over past interactions
- [ ] 3.5.4 Add memory retention policy (last 1000 messages per agent)
- [ ] 3.5.5 Implement memory summarization for long conversations

### 3.6 Concurrent Execution & Rate Limiting
- [ ] 3.6.1 Create agent/concurrency/rate_limiter.py with token bucket algorithm
- [ ] 3.6.2 Implement per-model rate limiters (RPM, TPM limits)
- [ ] 3.6.3 Create agent/concurrency/executor.py for parallel execution
- [ ] 3.6.4 Implement priority queue for agent tasks
- [ ] 3.6.5 Add Semaphore-based concurrency control
- [ ] 3.6.6 Implement dynamic rate adjustment on 429 errors

### 3.7 Multi-Agent Orchestration
- [ ] 3.7.1 Create agent/orchestration/coordinator.py
- [ ] 3.7.2 Implement sequential agent execution (Agent1 → Agent2)
- [ ] 3.7.3 Implement parallel agent execution (gather results)
- [ ] 3.7.4 Implement agent delegation (sub-task assignment)
- [ ] 3.7.5 Add result aggregation logic

### 3.8 API Endpoints
- [ ] 3.8.1 Create agent/api.py with FastAPI router
- [ ] 3.8.2 POST /api/v1/agents/tasks (create agent task)
- [ ] 3.8.3 GET /api/v1/agents/tasks/{id} (get task status)
- [ ] 3.8.4 GET /api/v1/agents/tasks/{id}/stream (SSE for streaming)
- [ ] 3.8.5 DELETE /api/v1/agents/tasks/{id} (cancel task)
- [ ] 3.8.6 GET /api/v1/agents/tools (list available tools)

### 3.9 Testing
- [ ] 3.9.1 Write unit tests for LLM adapters (mock API responses)
- [ ] 3.9.2 Write unit tests for tool system
- [ ] 3.9.3 Write integration tests for agent execution
- [ ] 3.9.4 Test rate limiting under load
- [ ] 3.9.5 Test multi-agent orchestration

---

## 4. Trading Domain (Week 4-5)

### 4.1 Database Models
- [ ] 4.1.1 Create trading/models.py with Order model
- [ ] 4.1.2 Add Position model with P&L tracking
- [ ] 4.1.3 Add Trade model for execution records
- [ ] 4.1.4 Add AccountBalance model
- [ ] 4.1.5 Add RiskLimit model
- [ ] 4.1.6 Create Alembic migration for trading tables

### 4.2 Exchange Abstraction
- [ ] 4.2.1 Create trading/exchanges/base.py with BaseExchange
- [ ] 4.2.2 Implement OKXExchange adapter (ccxt-based)
- [ ] 4.2.3 Implement BinanceExchange adapter (ccxt-based)
- [ ] 4.2.4 Implement IBExchange adapter for 雪盈证券 (ib-insync)
- [ ] 4.2.5 Add exchange-specific order type mapping
- [ ] 4.2.6 Implement unified error handling across exchanges

### 4.3 Order Management
- [ ] 4.3.1 Create trading/service.py with OrderService
- [ ] 4.3.2 Implement place_order() with validation
- [ ] 4.3.3 Implement cancel_order()
- [ ] 4.3.4 Implement get_order_status()
- [ ] 4.3.5 Add order state machine (pending → filled/cancelled/rejected)
- [ ] 4.3.6 Implement order history persistence

### 4.4 Position Management
- [ ] 4.4.1 Create PositionService
- [ ] 4.4.2 Implement open_position() on order fill
- [ ] 4.4.3 Implement update_position() with real-time price
- [ ] 4.4.4 Implement close_position() with realized P&L calculation
- [ ] 4.4.5 Add position averaging (add to existing position)
- [ ] 4.4.6 Implement partial close

### 4.5 Risk Management
- [ ] 4.5.1 Create trading/risk/risk_manager.py
- [ ] 4.5.2 Implement max position size check
- [ ] 4.5.3 Implement max open orders check
- [ ] 4.5.4 Implement daily loss limit check
- [ ] 4.5.5 Implement margin requirement validation
- [ ] 4.5.6 Add risk limit breach logging

### 4.6 WebSocket Real-Time Updates
- [ ] 4.6.1 Create trading/websocket/order_ws.py
- [ ] 4.6.2 Subscribe to exchange order update streams
- [ ] 4.6.3 Implement order status update handler
- [ ] 4.6.4 Subscribe to price update streams
- [ ] 4.6.5 Implement position P&L real-time calculation
- [ ] 4.6.6 Broadcast updates to frontend via SSE

### 4.7 Account Synchronization
- [ ] 4.7.1 Create trading/sync/account_sync.py
- [ ] 4.7.2 Implement initial account sync (fetch balances, positions, orders)
- [ ] 4.7.3 Implement periodic sync (every 60 seconds)
- [ ] 4.7.4 Detect and import external orders
- [ ] 4.7.5 Handle sync failures with exponential backoff

### 4.8 Fee Calculation
- [ ] 4.8.1 Create trading/fees/fee_calculator.py
- [ ] 4.8.2 Implement maker/taker fee calculation per exchange
- [ ] 4.8.3 Support VIP tier-based fee rates
- [ ] 4.8.4 Track cumulative fees per profile

### 4.9 Stop Loss / Take Profit
- [ ] 4.9.1 Create trading/conditional/stop_loss.py
- [ ] 4.9.2 Implement attach stop loss to position
- [ ] 4.9.3 Implement take profit orders
- [ ] 4.9.4 Monitor trigger conditions
- [ ] 4.9.5 Execute conditional orders on trigger

### 4.10 API Endpoints
- [ ] 4.10.1 Create trading/api.py with FastAPI router
- [ ] 4.10.2 POST /api/v1/trading/orders (place order)
- [ ] 4.10.3 GET /api/v1/trading/orders (list orders with filters)
- [ ] 4.10.4 DELETE /api/v1/trading/orders/{id} (cancel order)
- [ ] 4.10.5 GET /api/v1/trading/positions (list open positions)
- [ ] 4.10.6 POST /api/v1/trading/positions/{id}/close (close position)
- [ ] 4.10.7 GET /api/v1/trading/balances (account balances)
- [ ] 4.10.8 GET /api/v1/trading/history (trade history with pagination)

### 4.11 Testing
- [ ] 4.11.1 Write unit tests for order service
- [ ] 4.11.2 Write unit tests for risk manager
- [ ] 4.11.3 Write integration tests with mock exchange
- [ ] 4.11.4 Test WebSocket reconnection logic
- [ ] 4.11.5 Test position P&L calculations

---

## 5. Data Domain (Week 5-6)

### 5.1 Database Schema
- [ ] 5.1.1 Create ClickHouse schema for klines table (optimized MergeTree)
- [ ] 5.1.2 Create ClickHouse schema for on_chain_metrics table
- [ ] 5.1.3 Create ClickHouse schema for commodity_prices table
- [ ] 5.1.4 Create PostgreSQL schema for asset_catalog table
- [ ] 5.1.5 Create PostgreSQL schema for financial_statements table
- [ ] 5.1.6 Create PostgreSQL schema for company_events table
- [ ] 5.1.7 Create MinIO buckets (documents, backups)

### 5.2 Crypto Data Collection
- [ ] 5.2.1 Create data/collectors/crypto_collector.py
- [ ] 5.2.2 Implement fetch_historical_klines() for crypto (OKX, Binance)
- [ ] 5.2.3 Implement daily K-line update job (UTC 00:00)
- [ ] 5.2.4 Support multiple crypto pairs (BTC, ETH, etc.)
- [ ] 5.2.5 Store in ClickHouse with daily partitions
- [ ] 5.2.6 Validate OHLCV data integrity

### 5.3 On-Chain Data Collection
- [ ] 5.3.1 Create data/collectors/onchain_collector.py
- [ ] 5.3.2 Implement BTC on-chain metrics (Blockchain.com API)
- [ ] 5.3.3 Implement ETH on-chain metrics (Etherscan, Glassnode)
- [ ] 5.3.4 Track DeFi TVL, stablecoin supply
- [ ] 5.3.5 Implement whale transaction monitoring
- [ ] 5.3.6 Store daily on-chain metrics in ClickHouse

### 5.4 Stock Data Collection
- [ ] 5.4.1 Create data/collectors/stock_collector.py
- [ ] 5.4.2 Fetch SP500 constituent list from FMP
- [ ] 5.4.3 Fetch NASDAQ100 constituent list from FMP
- [ ] 5.4.4 Implement fetch_daily_klines() for stocks (FMP API)
- [ ] 5.4.5 Handle stock splits and dividend adjustments
- [ ] 5.4.6 Store in ClickHouse with symbol partitions
- [ ] 5.4.7 Implement daily update job for stock prices

### 5.5 Financial Data Collection
- [ ] 5.5.1 Create data/collectors/financial_collector.py
- [ ] 5.5.2 Fetch quarterly/annual financial statements from FMP
- [ ] 5.5.3 Extract revenue, profit, cash flow
- [ ] 5.5.4 Calculate financial ratios (PE, PB, ROE)
- [ ] 5.5.5 Store normalized financials in PostgreSQL
- [ ] 5.5.6 Store time-series financials in ClickHouse
- [ ] 5.5.7 Implement quarterly update job

### 5.6 Financial Reports (PDF)
- [ ] 5.6.1 Create data/collectors/sec_filing_collector.py
- [ ] 5.6.2 Download 10-K, 10-Q PDFs from SEC EDGAR
- [ ] 5.6.3 Store PDFs in MinIO with metadata
- [ ] 5.6.4 Extract text from PDFs
- [ ] 5.6.5 Generate embeddings (text-embedding-ada-002)
- [ ] 5.6.6 Store embeddings in Qdrant with metadata
- [ ] 5.6.7 Implement semantic search over filings

### 5.7 Commodity Data Collection
- [ ] 5.7.1 Create data/collectors/commodity_collector.py
- [ ] 5.7.2 Fetch gold, silver prices (COMEX, FMP)
- [ ] 5.7.3 Fetch industrial metals (copper, aluminum)
- [ ] 5.7.4 Fetch agricultural commodities (soybeans, wheat)
- [ ] 5.7.5 Fetch energy prices (WTI, Brent crude)
- [ ] 5.7.6 Store in ClickHouse daily
- [ ] 5.7.7 Track inventory data (EIA for oil, COMEX for metals)

### 5.8 Data Quality Assurance
- [ ] 5.8.1 Create data/quality/validator.py
- [ ] 5.8.2 Implement K-line validation (OHLCV legality checks)
- [ ] 5.8.3 Implement financial data consistency checks
- [ ] 5.8.4 Detect missing data gaps
- [ ] 5.8.5 Detect duplicate data
- [ ] 5.8.6 Implement anomaly detection (price jumps > 20%)
- [ ] 5.8.7 Log validation failures to PostgreSQL

### 5.9 Data Query API
- [ ] 5.9.1 Create data/service.py with DataService
- [ ] 5.9.2 Implement get_klines() with caching (Redis, 1h TTL)
- [ ] 5.9.3 Implement get_financials() for company data
- [ ] 5.9.4 Implement search_documents() for semantic search
- [ ] 5.9.5 Implement batch_get_klines() for multiple symbols
- [ ] 5.9.6 Optimize ClickHouse queries (< 100ms for 10M rows)

### 5.10 Initial Data Seeding
- [ ] 5.10.1 Create data/scripts/seed_data.py
- [ ] 5.10.2 Download 3 years of BTC, ETH daily K-lines
- [ ] 5.10.3 Download SP500 constituent stocks (10 years daily)
- [ ] 5.10.4 Download financial statements for SP500 (5 years)
- [ ] 5.10.5 Download commodity prices (10 years)
- [ ] 5.10.6 Create progress bar for seeding process
- [ ] 5.10.7 Implement resume from checkpoint on failure

### 5.11 Data Scheduler
- [ ] 5.11.1 Create data/scheduler.py with APScheduler
- [ ] 5.11.2 Schedule daily crypto K-line updates (UTC 00:00)
- [ ] 5.11.3 Schedule daily stock K-line updates (after market close)
- [ ] 5.11.4 Schedule quarterly financial data updates
- [ ] 5.11.5 Schedule daily on-chain metrics updates
- [ ] 5.11.6 Implement failure retry with exponential backoff

### 5.12 Data Export & Backup
- [ ] 5.12.1 Create data/export/exporter.py
- [ ] 5.12.2 Implement export_klines_csv() for user downloads
- [ ] 5.12.3 Implement export_klines_parquet() for large datasets
- [ ] 5.12.4 Implement automated daily backups (PostgreSQL, ClickHouse metadata)
- [ ] 5.12.5 Store backups in MinIO with 30-day retention

### 5.13 API Endpoints
- [ ] 5.13.1 Create data/api.py with FastAPI router
- [ ] 5.13.2 GET /api/v1/data/klines (query K-lines with filters)
- [ ] 5.13.3 GET /api/v1/data/financials/{symbol} (company financials)
- [ ] 5.13.4 GET /api/v1/data/onchain/{asset} (on-chain metrics)
- [ ] 5.13.5 POST /api/v1/data/search (semantic search over documents)
- [ ] 5.13.6 GET /api/v1/data/status (data freshness dashboard)
- [ ] 5.13.7 POST /api/v1/data/export (trigger data export)

### 5.14 Testing
- [ ] 5.14.1 Write unit tests for data collectors
- [ ] 5.14.2 Write unit tests for data validators
- [ ] 5.14.3 Test ClickHouse query performance
- [ ] 5.14.4 Test data quality checks
- [ ] 5.14.5 Test semantic search accuracy

---

## 6. Evaluation Domain (Week 7-8)

### 6.1 Database Models
- [ ] 6.1.1 Create evaluation/models.py with AgentMetrics model
- [ ] 6.1.2 Add Benchmark model
- [ ] 6.1.3 Add ABTest model
- [ ] 6.1.4 Add EvaluationRun model
- [ ] 6.1.5 Create Alembic migration for evaluation tables

### 6.2 Agent Performance Metrics
- [ ] 6.2.1 Create evaluation/metrics/agent_metrics.py
- [ ] 6.2.2 Implement calculate_accuracy() (predictions vs actuals)
- [ ] 6.2.3 Implement calculate_latency() (P50, P95, P99)
- [ ] 6.2.4 Implement calculate_cost_efficiency() (tokens, cost per task)
- [ ] 6.2.5 Implement calculate_reliability() (success rate, error rate)
- [ ] 6.2.6 Implement calculate_consistency() (repeated scenario variance)
- [ ] 6.2.7 Store metrics in ClickHouse for time-series analysis

### 6.3 Benchmark Framework (OpenAI Evals-style)
- [ ] 6.3.1 Create evaluation/benchmarks/benchmark.py
- [ ] 6.3.2 Implement Benchmark class with load/save JSON
- [ ] 6.3.3 Create trading decision benchmark (100+ scenarios)
- [ ] 6.3.4 Implement run_benchmark() for agent evaluation
- [ ] 6.3.5 Calculate accuracy, F1 score per benchmark
- [ ] 6.3.6 Support layered reporting (by difficulty, market type)
- [ ] 6.3.7 Implement benchmark versioning

### 6.4 Decision Quality Scoring
- [ ] 6.4.1 Create evaluation/quality/decision_scorer.py
- [ ] 6.4.2 Implement reasoning chain extraction from agent logs
- [ ] 6.4.3 Score reasoning logic (0-100)
- [ ] 6.4.4 Score information usage (relevant, complete)
- [ ] 6.4.5 Score risk assessment compliance
- [ ] 6.4.6 Score explainability (clarity, consistency)

### 6.5 Consistency Testing
- [ ] 6.5.1 Create evaluation/consistency/consistency_tester.py
- [ ] 6.5.2 Implement repeat_scenario() (run 10 times)
- [ ] 6.5.3 Calculate consistency rate
- [ ] 6.5.4 Implement perturbation testing (±1% input changes)
- [ ] 6.5.5 Test robustness to input variations
- [ ] 6.5.6 Analyze temperature parameter impact

### 6.6 Alignment Evaluation (Anthropic-style)
- [ ] 6.6.1 Create evaluation/alignment/alignment_checker.py
- [ ] 6.6.2 Implement rule compliance checks
- [ ] 6.6.3 Implement adversarial prompt testing (safety boundaries)
- [ ] 6.6.4 Score value alignment (user goals vs agent behavior)
- [ ] 6.6.5 Score transparency (full disclosure of reasoning)
- [ ] 6.6.6 Generate post-mortem reports for failures

### 6.7 A/B Testing Framework
- [ ] 6.7.1 Create evaluation/ab_test/ab_test.py
- [ ] 6.7.2 Implement create_test() with variant definitions
- [ ] 6.7.3 Implement random task assignment (50/50 split)
- [ ] 6.7.4 Track metrics per variant
- [ ] 6.7.5 Implement statistical significance test (t-test, chi-square)
- [ ] 6.7.6 Support multi-metric weighted scoring
- [ ] 6.7.7 Implement early stopping (99% confidence)

### 6.8 Automated Evaluation Pipeline
- [ ] 6.8.1 Create evaluation/pipeline/eval_pipeline.py
- [ ] 6.8.2 Implement daily scheduled evaluation (UTC 00:00)
- [ ] 6.8.3 Implement Git commit-triggered evaluation (webhook)
- [ ] 6.8.4 Implement tiered evaluation (smoke test → core → full)
- [ ] 6.8.5 Generate HTML evaluation reports
- [ ] 6.8.6 Send email reports on completion
- [ ] 6.8.7 Block deployment on performance regression

### 6.9 Reporting
- [ ] 6.9.1 Create evaluation/reports/report_generator.py
- [ ] 6.9.2 Generate agent performance report (PDF/HTML)
- [ ] 6.9.3 Generate comparison report (multiple agents)
- [ ] 6.9.4 Generate benchmark history visualization
- [ ] 6.9.5 Include actionable recommendations

### 6.10 API Endpoints
- [ ] 6.10.1 Create evaluation/api.py with FastAPI router
- [ ] 6.10.2 GET /api/v1/evaluation/metrics/{agent_id} (agent metrics)
- [ ] 6.10.3 POST /api/v1/evaluation/benchmarks/run (trigger benchmark)
- [ ] 6.10.4 GET /api/v1/evaluation/benchmarks/{id}/results
- [ ] 6.10.5 POST /api/v1/evaluation/ab-tests (create A/B test)
- [ ] 6.10.6 GET /api/v1/evaluation/ab-tests/{id}/results
- [ ] 6.10.7 GET /api/v1/evaluation/reports (list reports)
- [ ] 6.10.8 POST /api/v1/evaluation/reports/generate

### 6.11 Testing
- [ ] 6.11.1 Write unit tests for metrics calculation
- [ ] 6.11.2 Write unit tests for benchmark framework
- [ ] 6.11.3 Test A/B test statistical significance
- [ ] 6.11.4 Test evaluation pipeline end-to-end

---

## 7. Data Migration (Week 7-8)

### 7.1 SQLite to PostgreSQL Migration
- [ ] 7.1.1 Create scripts/migrate_sqlite_to_pg.py
- [ ] 7.1.2 Analyze uchu_trade SQLite schema (176MB data)
- [ ] 7.1.3 Map SQLite tables to new PostgreSQL schema
- [ ] 7.1.4 Implement table-by-table migration with progress bar
- [ ] 7.1.5 Verify data integrity (row counts, checksums)
- [ ] 7.1.6 Keep SQLite backup for 30 days
- [ ] 7.1.7 Document migration process

### 7.2 ClickHouse Historical Data Backfill
- [ ] 7.2.1 Identify data older than 30 days in PostgreSQL
- [ ] 7.2.2 Create scripts/backfill_clickhouse.py
- [ ] 7.2.3 Batch transfer K-lines to ClickHouse (10K rows/batch)
- [ ] 7.2.4 Transfer trade history
- [ ] 7.2.5 Verify ClickHouse query performance
- [ ] 7.2.6 Delete old data from PostgreSQL after verification

### 7.3 Qdrant Vector Migration
- [ ] 7.3.1 Extract agent conversation history
- [ ] 7.3.2 Generate embeddings for historical conversations
- [ ] 7.3.3 Bulk insert to Qdrant
- [ ] 7.3.4 Test semantic search on migrated data

---

## 8. Dashboard Domain (Week 9)

### 8.1 Database Models
- [ ] 8.1.1 Create dashboard/models.py with PerformanceSnapshot model
- [ ] 8.1.2 Add DashboardPreferences model

### 8.2 Service Layer
- [ ] 8.2.1 Create dashboard/service.py with DashboardService
- [ ] 8.2.2 Implement get_trading_history() with pagination
- [ ] 8.2.3 Implement get_pnl_summary() (daily, weekly, monthly)
- [ ] 8.2.4 Implement get_position_distribution()
- [ ] 8.2.5 Implement get_trade_statistics()
- [ ] 8.2.6 Cache dashboard queries (Redis, 5min TTL)

### 8.3 API Endpoints
- [ ] 8.3.1 Create dashboard/api.py
- [ ] 8.3.2 GET /api/v1/dashboard/summary (key metrics)
- [ ] 8.3.3 GET /api/v1/dashboard/pnl (P&L chart data)
- [ ] 8.3.4 GET /api/v1/dashboard/positions (position breakdown)
- [ ] 8.3.5 GET /api/v1/dashboard/trade-history (paginated)

### 8.4 Testing
- [ ] 8.4.1 Write unit tests for dashboard service
- [ ] 8.4.2 Test pagination logic
- [ ] 8.4.3 Test data aggregation correctness

---

## 9. Frontend Implementation (Week 9-10)

### 9.1 Project Setup
- [ ] 9.1.1 Initialize Vite + React 18 + TypeScript
- [ ] 9.1.2 Install dependencies (React Router, TanStack Query, Zustand, Recharts)
- [ ] 9.1.3 Set up Tailwind CSS
- [ ] 9.1.4 Configure ESLint + Prettier
- [ ] 9.1.5 Set up API client with axios

### 9.2 Shared Components
- [ ] 9.2.1 Create Button, Input, Select components
- [ ] 9.2.2 Create Table component with sorting/filtering
- [ ] 9.2.3 Create Modal, Toast notifications
- [ ] 9.2.4 Create Loading spinner, Error boundary
- [ ] 9.2.5 Create Layout with sidebar navigation

### 9.3 Admin Page (/admin)
- [ ] 9.3.1 Create AdminPage.tsx with tab navigation
- [ ] 9.3.2 Implement Configuration tab:
  - [ ] 9.3.2.1 API Keys section (list, add, delete)
  - [ ] 9.3.2.2 LLM Providers section (OpenAI, Claude, DeepSeek, Qwen)
  - [ ] 9.3.2.3 Exchanges section (OKX, Binance, 雪盈)
  - [ ] 9.3.2.4 Data Sources section (FMP)
  - [ ] 9.3.2.5 Feature flags section
- [ ] 9.3.3 Implement Dashboard tab:
  - [ ] 9.3.3.1 Trading history chart (Recharts)
  - [ ] 9.3.3.2 P&L summary cards
  - [ ] 9.3.3.3 Position breakdown table
  - [ ] 9.3.3.4 System health indicators
- [ ] 9.3.4 Add profile switcher dropdown
- [ ] 9.3.5 Connect to backend APIs

### 9.4 Evaluate Page (/evaluate)
- [ ] 9.4.1 Create EvaluatePage.tsx
- [ ] 9.4.2 Implement Agent Metrics section:
  - [ ] 9.4.2.1 KPI cards (accuracy, latency, cost, reliability)
  - [ ] 9.4.2.2 Trend charts (time-series)
  - [ ] 9.4.2.3 Task breakdown by type
- [ ] 9.4.3 Implement Benchmarks section:
  - [ ] 9.4.3.1 Run benchmark button
  - [ ] 9.4.3.2 Results table with scores
  - [ ] 9.4.3.3 History comparison
- [ ] 9.4.4 Implement A/B Tests section:
  - [ ] 9.4.4.1 Create test form
  - [ ] 9.4.4.2 Results visualization
- [ ] 9.4.5 Implement Agent Chat Interface:
  - [ ] 9.4.5.1 Chat input with submit button
  - [ ] 9.4.5.2 Message history display
  - [ ] 9.4.5.3 Streaming response (SSE)
  - [ ] 9.4.5.4 Tool execution indicators

### 9.5 State Management
- [ ] 9.5.1 Create Zustand stores for:
  - [ ] 9.5.1.1 Auth store (profile switching)
  - [ ] 9.5.1.2 Admin config store
  - [ ] 9.5.1.3 Trading store (orders, positions)
  - [ ] 9.5.1.4 Agent store (tasks, chat history)

### 9.6 WebSocket / SSE Integration
- [ ] 9.6.1 Implement SSE client for agent streaming
- [ ] 9.6.2 Implement real-time position updates
- [ ] 9.6.3 Auto-reconnect on disconnect

### 9.7 OAuth Login (Google/GitHub)
- [ ] 9.7.1 Implement OAuth2 flow in backend (FastAPI)
- [ ] 9.7.2 Create LoginPage.tsx with OAuth buttons
- [ ] 9.7.3 Store JWT token in localStorage
- [ ] 9.7.4 Add token refresh logic

### 9.8 Testing
- [ ] 9.8.1 Write component tests with React Testing Library
- [ ] 9.8.2 Write E2E tests with Playwright (critical flows)
- [ ] 9.8.3 Test responsive design (mobile, tablet, desktop)

---

## 10. Integration Testing (Week 11)

### 10.1 API Integration Tests
- [ ] 10.1.1 Test admin domain APIs end-to-end
- [ ] 10.1.2 Test agent domain APIs (task creation, execution)
- [ ] 10.1.3 Test trading domain APIs (order placement, position tracking)
- [ ] 10.1.4 Test data domain APIs (K-line queries, semantic search)
- [ ] 10.1.5 Test evaluation domain APIs (benchmark runs)

### 10.2 Multi-Domain Integration
- [ ] 10.2.1 Test agent → trading workflow (agent places order)
- [ ] 10.2.2 Test data → agent workflow (agent queries data)
- [ ] 10.2.3 Test agent → evaluation workflow (agent performance tracking)
- [ ] 10.2.4 Test profile switching isolation

### 10.3 Database Integration
- [ ] 10.3.1 Test PostgreSQL transactions
- [ ] 10.3.2 Test ClickHouse query performance under load
- [ ] 10.3.3 Test Qdrant semantic search accuracy
- [ ] 10.3.4 Test Redis cache hit rates

### 10.4 Load Testing
- [ ] 10.4.1 Test 100+ concurrent agent tasks
- [ ] 10.4.2 Test WebSocket connection stability (1000+ clients)
- [ ] 10.4.3 Test ClickHouse query with 10M+ rows
- [ ] 10.4.4 Identify and fix performance bottlenecks

---

## 11. Unit Testing & Coverage (Week 11-12)

### 11.1 Admin Domain Tests
- [ ] 11.1.1 Test encryption/decryption service
- [ ] 11.1.2 Test API key validation
- [ ] 11.1.3 Test profile switching logic
- [ ] 11.1.4 Achieve 80%+ coverage

### 11.2 Agent Domain Tests
- [ ] 11.2.1 Test LLM adapters with mocked responses
- [ ] 11.2.2 Test tool execution (mock tool calls)
- [ ] 11.2.3 Test rate limiter (token bucket algorithm)
- [ ] 11.2.4 Test multi-agent orchestration
- [ ] 11.2.5 Achieve 80%+ coverage

### 11.3 Trading Domain Tests
- [ ] 11.3.1 Test order placement validation
- [ ] 11.3.2 Test position P&L calculations
- [ ] 11.3.3 Test risk limit checks
- [ ] 11.3.4 Test fee calculations
- [ ] 11.3.5 Achieve 80%+ coverage

### 11.4 Data Domain Tests
- [ ] 11.4.1 Test K-line validation logic
- [ ] 11.4.2 Test data quality checks
- [ ] 11.4.3 Test ClickHouse query builder
- [ ] 11.4.4 Test semantic search ranking
- [ ] 11.4.5 Achieve 80%+ coverage

### 11.5 Evaluation Domain Tests
- [ ] 11.5.1 Test metrics calculation accuracy
- [ ] 11.5.2 Test benchmark scoring
- [ ] 11.5.3 Test A/B test statistical significance
- [ ] 11.5.4 Achieve 80%+ coverage

### 11.6 Coverage Report
- [ ] 11.6.1 Generate coverage report: `pytest --cov`
- [ ] 11.6.2 Verify 80%+ total coverage
- [ ] 11.6.3 Identify and test uncovered code paths

---

## 12. Documentation (Week 13)

### 12.1 User Documentation
- [ ] 12.1.1 Write README.md with project overview
- [ ] 12.1.2 Write INSTALL.md (Docker Compose quick start)
- [ ] 12.1.3 Write CONFIGURATION.md (API keys, LLM setup)
- [ ] 12.1.4 Write USER_GUIDE.md (how to use each page)
- [ ] 12.1.5 Create architecture diagram (domains, databases)

### 12.2 Developer Documentation
- [ ] 12.2.1 Write CONTRIBUTING.md
- [ ] 12.2.2 Write DEVELOPMENT.md (local setup, testing)
- [ ] 12.2.3 Document API endpoints (auto-generate with FastAPI docs)
- [ ] 12.2.4 Document database schemas (ERD diagrams)
- [ ] 12.2.5 Write agent development guide (custom tools, agents)

### 12.3 API Reference
- [ ] 12.3.1 Use FastAPI auto-generated docs (/docs, /redoc)
- [ ] 12.3.2 Add docstrings to all public APIs
- [ ] 12.3.3 Generate Swagger JSON export

### 12.4 Video Tutorials
- [ ] 12.4.1 Record "Quick Start" video (5min)
- [ ] 12.4.2 Record "Creating Your First Agent" video (10min)
- [ ] 12.4.3 Record "Backtesting a Strategy" video (10min)

---

## 13. CI/CD & Launch Preparation (Week 13-14)

### 13.1 GitHub Actions Workflows
- [ ] 13.1.1 Create .github/workflows/test.yml (run tests on push)
- [ ] 13.1.2 Create .github/workflows/lint.yml (ruff, mypy, prettier)
- [ ] 13.1.3 Create .github/workflows/docker.yml (build Docker images)
- [ ] 13.1.4 Set up test coverage reporting (Codecov)

### 13.2 Docker Images
- [ ] 13.2.1 Create Dockerfile for backend (multi-stage build)
- [ ] 13.2.2 Create Dockerfile for frontend (Nginx serve)
- [ ] 13.2.3 Optimize image sizes (< 500MB each)
- [ ] 13.2.4 Push to GitHub Container Registry

### 13.3 Release Preparation
- [ ] 13.3.1 Create CHANGELOG.md
- [ ] 13.3.2 Tag v0.1.0 release
- [ ] 13.3.3 Generate release notes
- [ ] 13.3.4 Create pre-seeded data package (optional, for offline users)

### 13.4 Security Audit
- [ ] 13.4.1 Run dependency vulnerability scan (Safety, Snyk)
- [ ] 13.4.2 Review API key encryption implementation
- [ ] 13.4.3 Test SQL injection protection
- [ ] 13.4.4 Verify CORS configuration

### 13.5 Performance Optimization
- [ ] 13.5.1 Profile backend API endpoints
- [ ] 13.5.2 Optimize ClickHouse queries
- [ ] 13.5.3 Optimize frontend bundle size
- [ ] 13.5.4 Add CDN caching for static assets

### 13.6 Launch Checklist
- [ ] 13.6.1 All tests passing (unit, integration, E2E)
- [ ] 13.6.2 80%+ code coverage achieved
- [ ] 13.6.3 Documentation complete
- [ ] 13.6.4 Docker Compose one-command setup works
- [ ] 13.6.5 Create GitHub repository (public)
- [ ] 13.6.6 Write launch blog post
- [ ] 13.6.7 Announce on social media

---

## 14. Post-Launch (Week 14+)

### 14.1 Monitoring Setup
- [ ] 14.1.1 Set up error tracking (Sentry)
- [ ] 14.1.2 Set up metrics dashboard (Prometheus + Grafana)
- [ ] 14.1.3 Set up log aggregation (Loki)
- [ ] 14.1.4 Configure alerting rules

### 14.2 Community Support
- [ ] 14.2.1 Create GitHub Discussions board
- [ ] 14.2.2 Set up issue templates (bug, feature request)
- [ ] 14.2.3 Write first-time contributor guide
- [ ] 14.2.4 Respond to issues within 48 hours

### 14.3 Future Enhancements
- [ ] 14.3.1 Collect user feedback
- [ ] 14.3.2 Prioritize feature requests
- [ ] 14.3.3 Plan v0.2.0 roadmap

---

**Total Tasks**: 430+
**Estimated Timeline**: 14 weeks
**Critical Path**: Infrastructure → Data → Agent → Trading → Frontend → Testing

**Next Steps**: Start with Section 1 (Project Initialization). Run `/opsx:apply` to begin implementation!
