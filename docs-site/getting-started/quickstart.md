# 快速启动

在本地启动uteki.open只需要5分钟。

## 前置要求

- **Docker** 20.10+
- **Python** 3.10+
- **Poetry** 1.5+
- **Node.js** 18+
- **pnpm** 8+

::: tip 检查版本
```bash
docker --version
python3 --version
poetry --version
node --version
pnpm --version
```
:::

## 启动步骤

### 1. 克隆项目

```bash
git clone https://github.com/yourusername/uteki.open.git
cd uteki.open
```

### 2. 启动数据库

```bash
./scripts/start-full.sh
```

等待看到以下输出：

```
✓ PostgreSQL: Connected, all 6 schemas exist
✓ ClickHouse: Connected
✓ Qdrant: Connected
✓ Redis: Connected
✓ MinIO: Connected

✓ Full environment ready!
```

::: details 关于数据库"注册"
PostgreSQL、ClickHouse、Redis等数据库**无需注册**。它们是开源软件，通过Docker本地运行，配置信息在`docker-compose.yml`中预定义。

**需要注册的只有云服务API**:
- OpenAI、Claude (LLM)
- OKX、Binance (交易所)
- FMP (数据源)

详见 [FAQ](/faq#database-registration)
:::

### 3. 初始化数据库

```bash
cd backend
poetry install
poetry run python ../scripts/init_database.py
```

等待看到：

```
✓ Database initialization completed successfully!
```

### 4. 启动后端

```bash
poetry run python -m uteki.main
```

看到以下输出表示成功：

```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### 5. 启动前端（新终端）

```bash
cd frontend
pnpm install
pnpm dev
```

看到以下输出表示成功：

```
➜  Local:   http://localhost:5173/
```

## 验证运行

### 自动验证

```bash
./scripts/verify_system.sh
```

### 手动验证

访问以下地址：

- **API文档**: http://localhost:8888/docs
- **健康检查**: http://localhost:8888/health
- **前端界面**: http://localhost:5173
- **MinIO控制台**: http://localhost:9001 (uteki / uteki_dev_pass)

### 测试CRUD操作

在 http://localhost:8888/docs 中测试：

1. 展开 `POST /api/admin/api-keys`
2. 点击 "Try it out"
3. 输入：

```json
{
  "provider": "test",
  "display_name": "测试密钥",
  "api_key": "test-key-123",
  "environment": "sandbox"
}
```

4. 点击 "Execute"
5. 应该看到 `200` 响应

## 下一步

- [首次配置](/getting-started/first-setup) - 配置API密钥
- [核心概念](/guide/concepts) - 理解系统架构
- [创建Agent](/guide/agent/custom-agent) - 开发你的第一个Agent

## 常见问题

### 端口被占用

```bash
# 修改后端端口
poetry run uvicorn uteki.main:app --port 8001

# 修改前端端口
pnpm dev --port 5174
```

### Docker容器启动失败

```bash
# 查看日志
docker compose logs postgres

# 重启容器
docker compose restart
```

更多问题参见 [FAQ](/faq)
