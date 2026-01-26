# 快速启动指南 (5分钟)

本地启动uteki.open的最简单方式。

---

## 前置检查

```bash
# 检查必需工具
docker --version       # 需要 20.10+
python3 --version      # 需要 3.10+
poetry --version       # 需要 1.5+
node --version         # 需要 18+
pnpm --version         # 需要 8+

# 如果缺少工具，参考 docs/DEPLOYMENT_GUIDE.md 安装
```

---

## 启动步骤

### 步骤1: 启动数据库 (1分钟)

```bash
./scripts/start-full.sh
```

等待输出：
```
✓ PostgreSQL: Connected, all 6 schemas exist
✓ ClickHouse: Connected
✓ Qdrant: Connected
✓ Redis: Connected
✓ MinIO: Connected
```

### 步骤2: 初始化数据库 (30秒)

```bash
cd backend
poetry install
poetry run python ../scripts/init_database.py
```

等待输出：
```
✓ Database initialization completed successfully!
```

### 步骤3: 启动后端 (30秒)

```bash
poetry run python -m uteki.main
```

看到以下输出表示成功：
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### 步骤4: 启动前端 (新终端, 1分钟)

```bash
cd frontend
pnpm install
pnpm dev
```

看到以下输出表示成功：
```
➜  Local:   http://localhost:5173/
```

---

## 验证运行

### 方式1: 自动验证脚本

```bash
./scripts/verify_system.sh
```

### 方式2: 手动验证

```bash
# 检查后端健康
curl http://localhost:8000/health

# 访问API文档
open http://localhost:8000/docs

# 访问前端
open http://localhost:5173

# 测试CRUD操作
curl -X POST "http://localhost:8000/api/admin/api-keys" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "test",
    "display_name": "测试",
    "api_key": "test-key-123"
  }'
```

---

## 常见问题

### 端口被占用

```bash
# 修改后端端口
cd backend
poetry run uvicorn uteki.main:app --port 8001

# 修改前端端口
cd frontend
pnpm dev --port 5174
```

### Docker容器启动失败

```bash
# 查看日志
docker compose logs postgres
docker compose logs clickhouse

# 重启容器
docker compose restart
```

### 数据库连接失败

```bash
# 确认容器运行
docker compose ps

# 重新初始化
cd backend
poetry run python ../scripts/init_database.py
```

---

## 下一步

1. **配置API密钥**: 访问 http://localhost:8000/docs，在 `/api/admin/api-keys` 添加：
   - OKX/Binance 交易所API
   - OpenAI/Claude LLM API
   - FMP 数据源API

2. **开始开发**: 参考 `openspec/changes/uteki-replatform/tasks.md`

3. **阅读文档**: 访问 http://localhost:3000 (文档站点，待搭建)

---

## 完整文档

- [部署指南](docs/DEPLOYMENT_GUIDE.md) - 生产环境部署
- [架构文档](docs/ARCHITECTURE.md) - 系统架构设计
- [开发规范](CONTRIBUTING.md) - 代码贡献指南
- [常见问题](docs/FAQ.md) - 疑难解答
