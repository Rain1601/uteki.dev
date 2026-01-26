# Database Strategy & Degradation Guide

## Overview

uteki.open uses a **multi-database architecture** with **graceful degradation** for development flexibility and production resilience.

---

## Database Tiers

### Tier 1: Critical (必需)
Must be available for system to function.

| Database | Purpose | Port | Status Check |
|----------|---------|------|--------------|
| **PostgreSQL 17** | Transactional data (orders, positions, config) | 5432 | `pg_isready` |
| **Redis 7** | Cache, rate limiting, task queue | 6379 | `redis-cli ping` |

**Failure Impact**: System cannot start.

---

### Tier 2: Important (可降级)
System functions with degraded performance.

| Database | Purpose | Port | Fallback |
|----------|---------|------|----------|
| **ClickHouse 24** | Time-series analytics (K-lines, metrics) | 8123, 9000 | Use PostgreSQL (10-50x slower) |

**Degradation Behavior**:
- Analytics queries run on PostgreSQL
- Performance: 10-50x slower for large datasets
- ✅ Development: Fully functional
- ⚠️ Production: Not recommended for >1M rows

---

### Tier 3: Optional (可禁用)
Features disabled gracefully.

| Database | Purpose | Port | Fallback |
|----------|---------|------|----------|
| **Qdrant 1.11** | Vector embeddings (agent memory) | 6333, 6334 | Disable semantic search |
| **MinIO** | Object storage (PDFs, backups) | 9000, 9001 | Disable file uploads |

**Degradation Behavior**:
- **Qdrant down**: Agent loses semantic memory search, but task execution works
- **MinIO down**: Cannot upload financial reports (PDFs), but stock trading works

---

## Startup Options

### Option 1: Minimal (Development)
Start only Tier 1 databases for fast iteration.

```bash
./scripts/start-minimal.sh
```

**Available**:
- ✅ Admin domain (API keys, config)
- ✅ Trading domain (orders, positions)
- ✅ Agent domain (basic execution)
- ❌ Analytics (no ClickHouse)
- ❌ Agent memory (no Qdrant)
- ❌ File uploads (no MinIO)

**Use Case**: Week 3-4 development (Admin, Agent, Trading domains)

---

### Option 2: Full (Production)
Start all databases for complete functionality.

```bash
./scripts/start-full.sh
```

**Available**:
- ✅ All features
- ✅ Full analytics
- ✅ Agent semantic memory
- ✅ File storage

**Use Case**: Week 5+ (Data domain onwards), Production deployment

---

## Health Check

Verify all databases are running:

```bash
python scripts/check_databases.py
```

**Output Example**:
```
============================================================
  Database Health Check - uteki.open
============================================================

✓ PostgreSQL: Connected, all 6 schemas exist
✓ ClickHouse: Connected, all 5 tables exist
✓ Qdrant: Connected, 0 collections exist
✓ Redis: Connected, using 1.2M memory
✓ MinIO: Connected, 0 buckets exist

============================================================
✓ All 5 databases are healthy
```

**Degraded Mode Example**:
```
✓ PostgreSQL: Connected
✓ Redis: Connected
✗ ClickHouse: Connection refused
⚠ Qdrant: Connection timeout
✗ MinIO: Connection refused

============================================================
⚠ 2/5 databases are healthy (degraded mode possible)
```

---

## Implementation Timeline

### Week 1-2: Infrastructure Setup
```bash
./scripts/start-full.sh  # Start all databases
python scripts/check_databases.py  # Verify
```

**Status**: All databases running, but **empty** (no data yet).

---

### Week 3-4: Admin + Agent + Trading
**Minimal mode is sufficient**:
```bash
./scripts/start-minimal.sh  # PostgreSQL + Redis only
```

**Databases Used**:
- PostgreSQL: API keys, orders, positions
- Redis: Cache, rate limiting

**Not Used Yet**:
- ClickHouse: No analytics queries yet
- Qdrant: No agent memory yet
- MinIO: No file uploads yet

---

### Week 5-6: Data Domain
**Switch to full mode**:
```bash
./scripts/start-full.sh  # Need ClickHouse, MinIO
```

**Data Collection Starts**:
- ClickHouse: K-lines, on-chain metrics, financial data
- MinIO: Financial reports (PDFs)
- Qdrant: Document embeddings

**Initial Data Seeding**:
```bash
poetry run python scripts/seed_data.py
# Downloads 3 years BTC/ETH, SP500 stocks (10 years), etc.
```

---

### Week 7+: Evaluation + Testing
**Full mode required**:
- ClickHouse: Query historical data for evaluation
- Qdrant: Semantic search in benchmarks

---

## Fallback Logic in Code

### Example: Analytics Query

```python
from uteki.common.database import db_manager

# Automatically uses ClickHouse or PostgreSQL fallback
async with db_manager.get_analytics_db() as db:
    klines = await db.query(
        "SELECT * FROM klines WHERE symbol = 'BTC-USDT' LIMIT 1000"
    )
```

**Behavior**:
- ClickHouse available: Fast query (~50ms)
- ClickHouse down: Falls back to PostgreSQL (~500ms, warning logged)

---

### Example: Agent Memory

```python
from uteki.common.database import db_manager

if db_manager.qdrant_available:
    # Use semantic search
    similar_tasks = await agent.memory.search_similar(task)
else:
    # Skip memory, still execute task
    logger.warning("Agent memory disabled (Qdrant unavailable)")
    similar_tasks = []
```

---

## Production Recommendations

### Development
- Week 1-4: Use `start-minimal.sh` for speed
- Week 5+: Use `start-full.sh` when implementing Data domain

### Production Deployment
- ✅ Always use `start-full.sh` (all databases)
- ✅ Set up monitoring for database health
- ✅ Configure auto-restart for failed containers
- ⚠️ Tier 2/3 failures degrade gracefully (system stays up)

---

## Troubleshooting

### "PostgreSQL connection failed"
```bash
docker compose up -d postgres
docker compose logs postgres  # Check for errors
```

### "ClickHouse not available"
**If you don't need analytics yet**:
- System will use PostgreSQL fallback (slower but works)
- Continue development, start ClickHouse later

**To fix**:
```bash
docker compose up -d clickhouse
docker compose logs clickhouse
```

### "Qdrant connection timeout"
**If you don't need agent memory yet**:
- Agent tasks still work (just no semantic search)
- Continue development, start Qdrant later

**To fix**:
```bash
docker compose up -d qdrant
docker compose logs qdrant
```

---

## Summary

| Week | Mode | Required DBs | Optional DBs |
|------|------|--------------|--------------|
| 1-2 | Infrastructure | PostgreSQL, Redis | ClickHouse, Qdrant, MinIO (empty) |
| 3-4 | Development | PostgreSQL, Redis | - |
| 5-6 | Data Integration | PostgreSQL, Redis, ClickHouse, MinIO | Qdrant |
| 7+ | Full Features | All | - |

**Key Insight**: You don't need all databases from day 1. Start minimal, add databases as features require them.
