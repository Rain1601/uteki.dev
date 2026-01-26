# uteki.open 部署指南

完整的本地和Linux服务器部署文档

---

## 快速开始 (5分钟)

### 前置要求

- **Docker** 20.10+ 和 **Docker Compose** 2.0+
- **Python** 3.10+
- **Poetry** 1.5+ (Python包管理)
- **Node.js** 18+ 和 **pnpm** (前端开发)

### 一键部署

```bash
# 1. 克隆项目
git clone https://github.com/yourusername/uteki.open.git
cd uteki.open

# 2. 启动所有数据库
./scripts/start-full.sh

# 3. 初始化数据库表
cd backend
poetry install
poetry run python ../scripts/init_database.py

# 4. 启动后端
poetry run python -m uteki.main

# 5. 在新终端启动前端
cd ../frontend
pnpm install
pnpm dev
```

访问:
- **后端API**: http://localhost:8000
- **API文档**: http://localhost:8000/docs
- **前端**: http://localhost:5173

---

## 详细部署步骤

### 步骤 1: 系统要求检查

#### macOS
```bash
# 安装Homebrew (如果未安装)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装Docker Desktop
brew install --cask docker

# 安装Python和Poetry
brew install python@3.10
brew install poetry

# 安装Node.js和pnpm
brew install node@18
npm install -g pnpm
```

#### Ubuntu/Debian Linux
```bash
# 更新包列表
sudo apt update

# 安装Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# 注销并重新登录以使docker组生效

# 安装Docker Compose
sudo apt install docker-compose-plugin

# 安装Python 3.10
sudo apt install python3.10 python3.10-venv python3-pip

# 安装Poetry
curl -sSL https://install.python-poetry.org | python3 -

# 安装Node.js 18和pnpm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g pnpm
```

#### CentOS/RHEL Linux
```bash
# 安装Docker
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo yum install docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER

# 安装Python 3.10
sudo yum install python3.10 python3.10-pip

# 安装Poetry
curl -sSL https://install.python-poetry.org | python3 -

# 安装Node.js和pnpm
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install nodejs
npm install -g pnpm
```

---

### 步骤 2: 克隆项目

```bash
git clone https://github.com/yourusername/uteki.open.git
cd uteki.open
```

---

### 步骤 3: 数据库服务启动

uteki.open使用5个数据库服务，**无需任何注册或额外配置**。所有数据库配置都在 `docker-compose.yml` 中预定义。

#### 理解"无需注册"

**重要说明**: ClickHouse、PostgreSQL、Redis等数据库通过Docker容器运行，**不需要去官网注册账号或申请许可证**。它们是开源软件，可以直接使用。

配置信息都在 `docker-compose.yml` 中:
```yaml
postgres:
  environment:
    POSTGRES_USER: uteki              # 用户名
    POSTGRES_PASSWORD: uteki_dev_pass # 密码
    POSTGRES_DB: uteki                # 数据库名

# 其他数据库类似，都是预配置的
```

#### 启动数据库

```bash
# 方式1: 启动所有数据库（生产模式，推荐）
./scripts/start-full.sh

# 方式2: 仅启动核心数据库（开发模式）
./scripts/start-minimal.sh

# 方式3: 手动启动
docker compose up -d
```

**输出示例:**
```
Starting full uteki.open environment...
All databases: PostgreSQL + Redis + ClickHouse + Qdrant + MinIO

[+] Running 5/5
 ✔ Container uteki-postgres    Started
 ✔ Container uteki-redis       Started
 ✔ Container uteki-clickhouse  Started
 ✔ Container uteki-qdrant      Started
 ✔ Container uteki-minio       Started

Waiting for all databases to be ready...

✓ PostgreSQL: Connected, all 6 schemas exist
✓ ClickHouse: Connected, all 5 tables exist
✓ Qdrant: Connected, 0 collections exist
✓ Redis: Connected, using 1.2M memory
✓ MinIO: Connected, 0 buckets exist

✓ Full environment ready!
```

#### 验证数据库状态

```bash
# 运行健康检查脚本
python scripts/check_databases.py
```

**健康状态示例:**
```
============================================================
  Database Health Check - uteki.open
============================================================

Tier 1 (Critical):
✓ PostgreSQL: Connected (localhost:5432)
✓ Redis: Connected (localhost:6379)

Tier 2 (Important):
✓ ClickHouse: Connected (localhost:8123, 9000)

Tier 3 (Optional):
✓ Qdrant: Connected (localhost:6333)
✓ MinIO: Connected (localhost:9000, 9001)

============================================================
✓ All 5 databases are healthy
```

#### 数据库访问信息

所有数据库的访问信息:

| 数据库 | 地址 | 端口 | 用户名 | 密码 | 用途 |
|--------|------|------|--------|------|------|
| PostgreSQL | localhost | 5432 | uteki | uteki_dev_pass | 事务数据 |
| Redis | localhost | 6379 | - | - | 缓存/队列 |
| ClickHouse | localhost | 8123 (HTTP)<br>9000 (Native) | default | - | 时序分析 |
| Qdrant | localhost | 6333 (REST)<br>6334 (gRPC) | - | - | 向量搜索 |
| MinIO | localhost | 9000 (API)<br>9001 (Console) | uteki | uteki_dev_pass | 对象存储 |

**MinIO管理控制台**: http://localhost:9001
- 用户名: `uteki`
- 密码: `uteki_dev_pass`

---

### 步骤 4: 后端部署

#### 4.1 安装依赖

```bash
cd backend

# 安装Python依赖
poetry install

# (可选) 安装LLM支持
poetry install --extras llm-full

# (可选) 安装所有额外依赖
poetry install --extras all
```

#### 4.2 配置环境变量（可选）

创建 `backend/.env` 文件:

```bash
cat > backend/.env <<EOF
# 应用配置
DEBUG=true

# 数据库配置（使用默认值即可，无需修改）
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=uteki
POSTGRES_PASSWORD=uteki_dev_pass
POSTGRES_DB=uteki

REDIS_HOST=localhost
REDIS_PORT=6379

CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=9000

QDRANT_HOST=localhost
QDRANT_PORT=6333

MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=uteki
MINIO_SECRET_KEY=uteki_dev_pass

# API密钥（稍后通过API配置，这里可选）
# FMP_API_KEY=your_fmp_key
# OKX_API_KEY=your_okx_key
# OKX_API_SECRET=your_okx_secret
# OKX_PASSPHRASE=your_passphrase
# BINANCE_API_KEY=your_binance_key
# BINANCE_API_SECRET=your_binance_secret

# LLM API密钥（稍后通过API配置，这里可选）
# OPENAI_API_KEY=your_openai_key
# ANTHROPIC_API_KEY=your_anthropic_key
# DASHSCOPE_API_KEY=your_qwen_key

# 加密密钥（生产环境必须设置）
# ENCRYPTION_KEY=your_32_byte_base64_key
EOF
```

**注意**:
- 数据库配置使用docker-compose.yml中的默认值即可
- API密钥可以后续通过管理API动态配置
- 如果不设置.env，系统会使用默认配置

#### 4.3 初始化数据库表

```bash
# 运行数据库初始化脚本
poetry run python ../scripts/init_database.py
```

**输出示例:**
```
============================================================
  Database Initialization - uteki.open
============================================================

Step 1: Creating schemas...
✓ Schema 'admin' created/verified
✓ Schema 'trading' created/verified
✓ Schema 'data' created/verified
✓ Schema 'agent' created/verified
✓ Schema 'evaluation' created/verified
✓ Schema 'dashboard' created/verified

Step 2: Creating tables...
CREATE TABLE admin.api_keys (...)
CREATE TABLE admin.users (...)
CREATE TABLE admin.system_config (...)
CREATE TABLE admin.audit_logs (...)
✓ All tables created

============================================================
✓ Database initialization completed successfully!
============================================================

Next steps:
  1. Start the backend: cd backend && poetry run python -m uteki.main
  2. Visit http://localhost:8000/docs for API documentation
  3. Check health: http://localhost:8000/health
```

#### 4.4 启动后端服务

```bash
# 开发模式（自动重载）
poetry run python -m uteki.main

# 或使用uvicorn直接启动
poetry run uvicorn uteki.main:app --reload --host 0.0.0.0 --port 8000
```

**输出示例:**
```
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

#### 4.5 验证后端运行

```bash
# 健康检查
curl http://localhost:8000/health

# 预期输出:
{
  "status": "healthy",
  "databases": {
    "postgres": {
      "available": true,
      "status": "✓ connected"
    },
    "redis": {
      "available": true,
      "status": "✓ connected"
    },
    "clickhouse": {
      "available": true,
      "status": "✓ connected"
    },
    "qdrant": {
      "available": true,
      "status": "✓ connected"
    },
    "minio": {
      "available": true,
      "status": "✓ connected"
    }
  }
}
```

访问API文档: http://localhost:8000/docs

---

### 步骤 5: 前端部署

```bash
# 切换到前端目录
cd ../frontend

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

**输出示例:**
```
  VITE v5.0.0  ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

访问前端: http://localhost:5173

---

## CRUD操作验证

### 验证数据库读写

#### 方式1: 使用API文档 (推荐)

访问 http://localhost:8000/docs，测试以下API:

1. **创建API密钥** (POST `/api/admin/api-keys`)
   ```json
   {
     "provider": "okx",
     "display_name": "OKX生产环境",
     "api_key": "test-api-key-12345",
     "api_secret": "test-secret",
     "environment": "production",
     "description": "测试API密钥"
   }
   ```

2. **列出API密钥** (GET `/api/admin/api-keys`)

3. **更新API密钥** (PATCH `/api/admin/api-keys/{id}`)

4. **删除API密钥** (DELETE `/api/admin/api-keys/{id}`)

#### 方式2: 使用curl

```bash
# 创建API密钥
curl -X POST "http://localhost:8000/api/admin/api-keys" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "okx",
    "display_name": "OKX测试",
    "api_key": "test-key",
    "environment": "sandbox"
  }'

# 列出所有API密钥
curl "http://localhost:8000/api/admin/api-keys"

# 查看健康状态
curl "http://localhost:8000/health"
```

#### 方式3: 直接连接PostgreSQL验证

```bash
# 使用psql连接
docker exec -it uteki-postgres psql -U uteki -d uteki

# 在psql中执行:
\dt admin.*           -- 查看admin schema的所有表
SELECT * FROM admin.api_keys;  -- 查询API密钥
SELECT * FROM admin.audit_logs; -- 查询审计日志
\q                    -- 退出
```

---

## Linux服务器部署

### 使用systemd管理服务（生产环境推荐）

#### 1. 创建systemd服务文件

```bash
# 后端服务
sudo tee /etc/systemd/system/uteki-backend.service > /dev/null <<EOF
[Unit]
Description=uteki.open Backend API
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=$USER
WorkingDirectory=/home/$USER/uteki.open/backend
Environment="PATH=/home/$USER/.local/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=/home/$USER/.local/bin/poetry run uvicorn uteki.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 前端服务
sudo tee /etc/systemd/system/uteki-frontend.service > /dev/null <<EOF
[Unit]
Description=uteki.open Frontend
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/home/$USER/uteki.open/frontend
Environment="PATH=/usr/local/bin:/usr/bin:/bin"
ExecStart=/usr/bin/pnpm dev --host 0.0.0.0 --port 5173
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
```

#### 2. 启动服务

```bash
# 重载systemd配置
sudo systemctl daemon-reload

# 启动数据库
cd /home/$USER/uteki.open
./scripts/start-full.sh

# 启动后端
sudo systemctl start uteki-backend
sudo systemctl enable uteki-backend

# 启动前端
sudo systemctl start uteki-frontend
sudo systemctl enable uteki-frontend

# 查看状态
sudo systemctl status uteki-backend
sudo systemctl status uteki-frontend

# 查看日志
sudo journalctl -u uteki-backend -f
sudo journalctl -u uteki-frontend -f
```

#### 3. 使用Nginx反向代理（可选）

```bash
# 安装Nginx
sudo apt install nginx  # Ubuntu/Debian
sudo yum install nginx  # CentOS/RHEL

# 创建Nginx配置
sudo tee /etc/nginx/sites-available/uteki <<EOF
server {
    listen 80;
    server_name your-domain.com;

    # 前端
    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    # 后端API
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    # API文档
    location /docs {
        proxy_pass http://localhost:8000;
    }
}
EOF

# 启用配置
sudo ln -s /etc/nginx/sites-available/uteki /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 常见问题

### Q1: Docker容器启动失败

```bash
# 检查Docker是否运行
docker ps

# 查看容器日志
docker compose logs postgres
docker compose logs clickhouse

# 重启容器
docker compose restart postgres
```

### Q2: 端口被占用

```bash
# 检查端口占用
sudo lsof -i :8000  # 后端端口
sudo lsof -i :5432  # PostgreSQL端口

# 修改docker-compose.yml中的端口映射
# 例如: "5433:5432" 改为宿主机5433端口
```

### Q3: PostgreSQL连接失败

```bash
# 检查PostgreSQL是否启动
docker compose ps postgres

# 查看日志
docker compose logs postgres

# 手动测试连接
docker exec -it uteki-postgres psql -U uteki -d uteki -c "SELECT 1"
```

### Q4: 如何重置数据库

```bash
# 停止所有服务
docker compose down

# 删除数据卷（警告：会删除所有数据）
docker compose down -v

# 重新启动
./scripts/start-full.sh
poetry run python scripts/init_database.py
```

### Q5: 如何备份数据

```bash
# 备份PostgreSQL
docker exec uteki-postgres pg_dump -U uteki uteki > backup_$(date +%Y%m%d).sql

# 恢复PostgreSQL
docker exec -i uteki-postgres psql -U uteki uteki < backup_20240115.sql

# 备份ClickHouse
docker exec uteki-clickhouse clickhouse-client --query="SELECT * FROM uteki.klines FORMAT CSVWithNames" > klines_backup.csv
```

---

## 生产环境部署清单

- [ ] 修改所有默认密码
- [ ] 设置 `ENCRYPTION_KEY` 环境变量
- [ ] 配置SSL/TLS证书
- [ ] 设置防火墙规则
- [ ] 配置日志轮转
- [ ] 设置数据库定期备份
- [ ] 配置监控和告警
- [ ] 使用环境变量管理敏感信息
- [ ] 启用systemd自动重启
- [ ] 配置Nginx反向代理

---

## 总结

现在你已经完成了uteki.open的完整部署:

✅ **数据库**: 5个数据库服务运行中，**无需注册或额外配置**
✅ **后端**: FastAPI服务运行在 http://localhost:8000
✅ **前端**: React应用运行在 http://localhost:5173
✅ **CRUD**: 数据库读写操作正常
✅ **Linux兼容**: 完全支持Linux服务器部署

下一步:
1. 配置API密钥 (通过 `/api/admin/api-keys` 接口)
2. 开始开发domain功能
3. 参考 `openspec/changes/uteki-replatform/tasks.md` 继续实现
