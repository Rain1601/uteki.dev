# 数据库策略与降级方案

::: info 原始文档
本文档从 `docs/DATABASE_STRATEGY.md` 迁移而来
:::

## 概述

uteki.open使用**多数据库架构**，具备**平滑降级能力**，在开发和生产环境都能保持灵活性和弹性。

---

## 数据库分层

### Tier 1: 关键服务（必需）

| 数据库 | 用途 | 端口 | 状态检查 |
|--------|------|------|----------|
| **PostgreSQL 17** | 事务数据（订单、持仓、配置） | 5432 | `pg_isready` |
| **Redis 7** | 缓存、限流、任务队列 | 6379 | `redis-cli ping` |

**影响**: 系统无法启动

---

### Tier 2: 重要服务（可降级）

| 数据库 | 用途 | 端口 | 降级方案 |
|--------|------|------|----------|
| **ClickHouse 24** | 时序分析（K线、指标） | 8123, 9000 | 使用PostgreSQL（慢10-50倍）|

**降级行为**:
- 分析查询运行在PostgreSQL上
- 性能: 大数据集慢10-50倍
- ✅ 开发环境: 完全可用
- ⚠️ 生产环境: 不推荐超过100万行

---

### Tier 3: 可选服务（可禁用）

| 数据库 | 用途 | 端口 | 降级方案 |
|--------|------|------|----------|
| **Qdrant 1.11** | 向量嵌入（Agent记忆） | 6333, 6334 | 禁用语义搜索 |
| **MinIO** | 对象存储（PDF、备份） | 9000, 9001 | 禁用文件上传 |

**降级行为**:
- **Qdrant不可用**: Agent失去语义记忆搜索，但任务执行正常
- **MinIO不可用**: 无法上传财报PDF，但股票交易正常

---

## 启动模式

### 模式1: 最小化（开发）

仅启动Tier 1数据库，快速迭代：

```bash
./scripts/start-minimal.sh
```

**可用功能**:
- ✅ Admin domain（API密钥、配置）
- ✅ Trading domain（订单、持仓）
- ✅ Agent domain（基础执行）
- ❌ 分析功能（无ClickHouse）
- ❌ Agent记忆（无Qdrant）
- ❌ 文件上传（无MinIO）

**使用场景**: Week 3-4开发（Admin、Agent、Trading）

---

### 模式2: 完整（生产）

启动所有数据库，完整功能：

```bash
./scripts/start-full.sh
```

**可用功能**:
- ✅ 所有功能
- ✅ 完整分析
- ✅ Agent语义记忆
- ✅ 文件存储

**使用场景**: Week 5+（Data domain开始）、生产部署

---

## 健康检查

验证所有数据库运行状态：

```bash
python scripts/check_databases.py
```

**正常输出示例**:
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

**降级模式示例**:
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

## 实施时间线

### Week 1-2: 基础设施搭建

```bash
./scripts/start-full.sh  # 启动所有数据库
python scripts/check_databases.py  # 验证
```

**状态**: 所有数据库运行中，但**空的**（无数据）

---

### Week 3-4: Admin + Agent + Trading

**最小化模式足够**:
```bash
./scripts/start-minimal.sh  # 仅PostgreSQL + Redis
```

**使用的数据库**:
- PostgreSQL: API密钥、订单、持仓
- Redis: 缓存、限流

**尚未使用**:
- ClickHouse: 还没有分析查询
- Qdrant: 还没有Agent记忆
- MinIO: 还没有文件上传

---

### Week 5-6: Data Domain

**切换到完整模式**:
```bash
./scripts/start-full.sh  # 需要ClickHouse、MinIO
```

**数据采集开始**:
- ClickHouse: K线、链上指标、财务数据
- MinIO: 财报PDF
- Qdrant: 文档嵌入

**初始数据填充**:
```bash
poetry run python scripts/seed_data.py
# 下载3年BTC/ETH、SP500股票（10年）等
```

---

### Week 7+: 评估 + 测试

**需要完整模式**:
- ClickHouse: 查询历史数据进行评估
- Qdrant: 基准测试中的语义搜索

---

## 代码中的降级逻辑

### 示例: 分析查询

```python
from uteki.common.database import db_manager

# 自动使用ClickHouse或PostgreSQL降级
async with db_manager.get_analytics_db() as db:
    klines = await db.query(
        "SELECT * FROM klines WHERE symbol = 'BTC-USDT' LIMIT 1000"
    )
```

**行为**:
- ClickHouse可用: 快速查询（约50ms）
- ClickHouse不可用: 降级到PostgreSQL（约500ms，记录警告）

---

### 示例: Agent记忆

```python
from uteki.common.database import db_manager

if db_manager.qdrant_available:
    # 使用语义搜索
    similar_tasks = await agent.memory.search_similar(task)
else:
    # 跳过记忆，仍执行任务
    logger.warning("Agent memory disabled (Qdrant unavailable)")
    similar_tasks = []
```

---

## 生产环境建议

### 开发环境
- Week 1-4: 使用 `start-minimal.sh` 提速
- Week 5+: 使用 `start-full.sh` 实现Data domain

### 生产部署
- ✅ 始终使用 `start-full.sh`（所有数据库）
- ✅ 设置数据库健康监控
- ✅ 配置失败容器自动重启
- ⚠️ Tier 2/3失败时平滑降级（系统保持运行）

---

## 故障排除

### "PostgreSQL连接失败"

```bash
docker compose up -d postgres
docker compose logs postgres  # 检查错误
```

### "ClickHouse不可用"

**如果还不需要分析功能**:
- 系统将使用PostgreSQL降级（慢但能用）
- 继续开发，稍后启动ClickHouse

**修复方法**:
```bash
docker compose up -d clickhouse
docker compose logs clickhouse
```

### "Qdrant连接超时"

**如果还不需要Agent记忆**:
- Agent任务仍能正常工作（只是没有语义搜索）
- 继续开发，稍后启动Qdrant

**修复方法**:
```bash
docker compose up -d qdrant
docker compose logs qdrant
```

---

## 总结

| Week | 模式 | 必需数据库 | 可选数据库 |
|------|------|------------|------------|
| 1-2 | 基础设施 | PostgreSQL, Redis | ClickHouse, Qdrant, MinIO（空） |
| 3-4 | 开发 | PostgreSQL, Redis | - |
| 5-6 | 数据集成 | PostgreSQL, Redis, ClickHouse, MinIO | Qdrant |
| 7+ | 完整功能 | 所有 | - |

**关键洞察**: 不需要第一天就准备好所有数据库。最小化启动，根据功能需求逐步添加。

---

## 相关文档

- [快速启动指南](/getting-started/quickstart)
- [完整部署指南](/getting-started/deployment)
- [数据分发策略](/architecture/data-distribution)
