# 常见问题解答 (FAQ)

---

## 关于数据库"注册"的说明

### ❓ 问题: ClickHouse和PostgreSQL需要注册吗？

**答案: 完全不需要！**

这是一个常见的误解。让我们澄清一下:

#### 什么是"注册"？

当我们说某个服务需要"注册"时，通常指:
- 去官网创建账号
- 申请API密钥或许可证
- 填写信用卡信息
- 等待审批

**例如**: OpenAI、FMP、OKX等需要注册，因为它们是云服务。

#### 数据库不需要注册

PostgreSQL、ClickHouse、Redis、Qdrant、MinIO都是**开源软件**，它们:
- ✅ 可以免费使用
- ✅ 可以本地部署
- ✅ 不需要联网
- ✅ 不需要账号
- ✅ 不需要付费

---

### 📋 数据库配置方式对比

| 服务类型 | 示例 | 需要注册？ | 如何配置？ |
|---------|------|-----------|-----------|
| **云服务API** | OpenAI, FMP, OKX | ✅ 需要 | 去官网注册获取API key |
| **本地数据库** | PostgreSQL, Redis | ❌ 不需要 | Docker自动配置 |

---

### 🔧 uteki.open的数据库是如何配置的？

#### 方式1: Docker Compose (推荐)

所有数据库配置都在 `docker-compose.yml` 文件中:

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: uteki              # ← 用户名（我们自己设定）
      POSTGRES_PASSWORD: uteki_dev_pass # ← 密码（我们自己设定）
      POSTGRES_DB: uteki                # ← 数据库名（我们自己设定）
    ports:
      - "5432:5432"

  clickhouse:
    image: clickhouse/clickhouse-server:24-alpine
    ports:
      - "8123:8123"  # HTTP接口
      - "9000:9000"  # Native接口

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  qdrant:
    image: qdrant/qdrant:v1.11.0
    ports:
      - "6333:6333"

  minio:
    image: minio/minio:latest
    environment:
      MINIO_ROOT_USER: uteki           # ← 用户名（我们自己设定）
      MINIO_ROOT_PASSWORD: uteki_dev_pass # ← 密码（我们自己设定）
    ports:
      - "9000:9000"
      - "9001:9001"
```

#### 工作原理

1. **运行 `docker compose up -d`**
   - Docker会自动下载数据库镜像
   - 自动创建容器
   - 使用你在yml中设定的用户名和密码
   - 数据库立即可用

2. **后端自动连接**
   - `backend/uteki/common/config.py` 读取配置:
   ```python
   postgres_host: str = "localhost"
   postgres_port: int = 5432
   postgres_user: str = "uteki"           # ← 与docker-compose.yml一致
   postgres_password: str = "uteki_dev_pass" # ← 与docker-compose.yml一致
   ```
   - 后端使用这些配置连接到数据库

3. **完全本地运行**
   - 所有数据存储在本地Docker卷中
   - 不需要互联网连接（除了首次下载镜像）
   - 不需要向任何公司注册

---

### 🆚 对比：需要注册 vs 不需要注册

#### 示例1: OpenAI (需要注册)

```bash
# ❌ 错误做法 - OpenAI是云服务，不能这样用
docker run openai  # ← 这不存在

# ✅ 正确做法 - 需要注册并获取API key
1. 访问 https://platform.openai.com
2. 注册账号
3. 创建API key
4. 在代码中使用:
   OPENAI_API_KEY=sk-proj-xxxxx
```

#### 示例2: PostgreSQL (不需要注册)

```bash
# ✅ 正确做法 - 直接运行Docker容器
docker run -e POSTGRES_USER=myuser -e POSTGRES_PASSWORD=mypass postgres

# 或者使用docker-compose
docker compose up -d postgres

# 立即可用，无需任何注册
```

---

### 🎯 总结

| 组件 | 类型 | 需要注册？ | 配置方式 |
|------|------|-----------|---------|
| PostgreSQL | 开源数据库 | ❌ 不需要 | docker-compose.yml |
| ClickHouse | 开源数据库 | ❌ 不需要 | docker-compose.yml |
| Redis | 开源数据库 | ❌ 不需要 | docker-compose.yml |
| Qdrant | 开源数据库 | ❌ 不需要 | docker-compose.yml |
| MinIO | 开源存储 | ❌ 不需要 | docker-compose.yml |
| OpenAI | 云服务 | ✅ 需要 | 官网注册，API管理界面配置 |
| FMP | 云服务 | ✅ 需要 | 官网注册，API管理界面配置 |
| OKX | 云服务 | ✅ 需要 | 官网注册，API管理界面配置 |

---

## 其他常见问题

### ❓ 如何配置API密钥（OpenAI、FMP等）？

这些**云服务**确实需要注册。配置方式有两种:

#### 方式1: 环境变量 (.env文件)

```bash
# backend/.env
OPENAI_API_KEY=sk-proj-xxxxx
FMP_API_KEY=your_fmp_key
OKX_API_KEY=your_okx_key
```

#### 方式2: 通过API动态配置（推荐）

```bash
# 启动后端后，通过API配置
curl -X POST "http://localhost:8888/api/admin/api-keys" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "display_name": "OpenAI GPT-4",
    "api_key": "sk-proj-xxxxx",
    "environment": "production"
  }'
```

这样配置的好处:
- 加密存储在数据库中
- 可以通过界面管理
- 支持多环境（production, sandbox）

---

### ❓ 数据存储在哪里？

所有数据存储在Docker卷中:

```bash
# 查看数据卷
docker volume ls | grep uteki

# 数据位置（Linux）
/var/lib/docker/volumes/uteki_postgres_data/_data
/var/lib/docker/volumes/uteki_clickhouse_data/_data

# 数据位置（macOS）
~/Library/Containers/com.docker.docker/Data/vms/0/
```

**重要**: 数据完全存储在本地，不会上传到云端。

---

### ❓ 如何在多台机器上部署？

uteki.open支持完全离线部署:

#### 机器A（开发机）
```bash
git clone https://github.com/yourusername/uteki.open.git
cd uteki.open
./scripts/start-full.sh
# 配置API keys，开始使用
```

#### 机器B（服务器）
```bash
# 复制整个项目目录
scp -r uteki.open user@server:/home/user/

# SSH到服务器
ssh user@server
cd uteki.open
./scripts/start-full.sh
```

每台机器的数据是独立的，互不影响。

---

### ❓ 生产环境需要修改什么？

1. **修改默认密码**
   ```yaml
   # docker-compose.yml
   POSTGRES_PASSWORD: your_strong_password_here
   MINIO_ROOT_PASSWORD: your_strong_password_here
   ```

2. **设置加密密钥**
   ```bash
   # backend/.env
   ENCRYPTION_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
   ```

3. **限制端口访问** (防火墙规则)
   ```bash
   # 只允许本地访问数据库端口
   sudo ufw allow 8000/tcp  # 后端API
   sudo ufw allow 5173/tcp  # 前端
   sudo ufw deny 5432/tcp   # PostgreSQL仅本地
   ```

---

### ❓ 如何验证系统可用性？

运行验证脚本:

```bash
# 1. 检查数据库健康状态
python scripts/check_databases.py

# 2. 初始化数据库表
cd backend
poetry run python ../scripts/init_database.py

# 3. 启动后端
poetry run python -m uteki.main

# 4. 访问健康检查接口
curl http://localhost:8888/health

# 5. 测试CRUD操作
curl -X POST "http://localhost:8888/api/admin/api-keys" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "test",
    "display_name": "测试密钥",
    "api_key": "test-key-123"
  }'

# 6. 查询刚创建的记录
curl "http://localhost:8888/api/admin/api-keys"
```

如果所有步骤都成功，系统就是完全可用的。

---

### ❓ Linux部署有什么特殊要求吗？

没有特殊要求，步骤与macOS完全相同:

1. 安装Docker和Docker Compose
2. 克隆项目
3. 运行 `./scripts/start-full.sh`
4. 启动后端和前端

详细步骤参见 [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) 的Linux部分。

---

### ❓ 为什么选择这种多数据库架构？

不同数据库擅长不同场景:

| 数据库 | 擅长场景 | 在uteki.open中的用途 |
|--------|---------|---------------------|
| PostgreSQL | 事务处理 (ACID) | 订单、持仓、用户数据 |
| ClickHouse | 时序数据分析 | K线数据、历史回测 |
| Redis | 高速缓存 | API限流、会话管理 |
| Qdrant | 向量搜索 | AI Agent记忆检索 |
| MinIO | 对象存储 | 财报PDF、备份文件 |

**降级策略**:
- ClickHouse不可用 → 使用PostgreSQL（慢但能用）
- Qdrant不可用 → 禁用Agent记忆功能（核心功能仍可用）
- MinIO不可用 → 禁用文件上传（不影响交易）

详见 [DATABASE_STRATEGY.md](./DATABASE_STRATEGY.md)

---

## 还有问题？

- 查看完整部署指南: [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- 查看数据库策略: [DATABASE_STRATEGY.md](./DATABASE_STRATEGY.md)
- 查看数据分发策略: [DATA_DISTRIBUTION.md](./DATA_DISTRIBUTION.md)
- 提交Issue: https://github.com/yourusername/uteki.open/issues
