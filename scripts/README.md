# 脚本说明

本目录包含项目的各种启动和管理脚本。

---

## 🚀 启动脚本

### `quickstart.sh` - Docker模式（推荐）

**适合**: 快速开发、一键启动

**要求**: Docker Desktop

**运行**:
```bash
./scripts/quickstart.sh
```

**功能**:
- ✅ 自动检查Docker和Python环境
- ✅ 启动PostgreSQL和Redis容器
- ✅ 安装Python依赖
- ✅ 初始化数据库schema
- ✅ 启动FastAPI服务器

---

### `quickstart-local.sh` - 本地模式

**适合**: 不想安装Docker、已有本地数据库

**要求**:
- Homebrew
- PostgreSQL 15+ (本地安装)
- Redis (本地安装)

**安装依赖**:
```bash
brew install postgresql@15 redis
brew services start postgresql@15 redis
```

**运行**:
```bash
./scripts/quickstart-local.sh
```

**功能**:
- ✅ 检查PostgreSQL和Redis本地服务
- ✅ 自动创建数据库和用户
- ✅ 安装Python依赖
- ✅ 初始化数据库schema
- ✅ 启动FastAPI服务器

---

## 🛠️ 管理脚本

### `init_database.py` - 数据库初始化

**用途**: 创建所有数据库表和schema

**运行**:
```bash
cd backend
poetry run python ../scripts/init_database.py
```

**功能**:
- 创建PostgreSQL schemas（admin, trading, data等）
- 创建所有表结构
- 可重复运行（幂等操作）

---

### `test_admin_api.sh` - API测试

**用途**: 测试所有Admin Domain API endpoints

**要求**: 后端服务正在运行

**运行**:
```bash
./scripts/test_admin_api.sh
```

**功能**:
- 测试API密钥管理
- 测试LLM提供商配置
- 测试交易所配置
- 测试数据源配置
- 测试系统健康检查

---

## 📊 启动模式对比

| 脚本 | 模式 | PostgreSQL | Redis | 其他服务 | Docker要求 |
|------|------|-----------|-------|---------|-----------|
| `quickstart.sh` | Docker | Docker容器 | Docker容器 | Docker容器 | ✅ 必需 |
| `quickstart-local.sh` | 本地 | 本地服务 | 本地服务 | 不需要 | ❌ 不需要 |

---

## 🎯 使用建议

### 场景1: 首次使用，想快速体验

```bash
# 安装Docker Desktop
brew install --cask docker

# 一键启动
./scripts/quickstart.sh
```

### 场景2: 不想安装Docker

```bash
# 安装PostgreSQL和Redis
brew install postgresql@15 redis
brew services start postgresql@15 redis

# 使用本地模式启动
./scripts/quickstart-local.sh
```

### 场景3: 已有本地PostgreSQL，但想用Docker Redis

```bash
# 启动Redis容器
docker compose up -d redis

# 确保本地PostgreSQL运行
brew services start postgresql@15

# 使用本地模式启动（会自动检测）
./scripts/quickstart-local.sh
```

---

## ⚠️ 故障排查

### Docker模式启动失败

**问题**: "Docker未安装"
```bash
# 安装Docker
brew install --cask docker

# 或使用本地模式
./scripts/quickstart-local.sh
```

**问题**: "PostgreSQL启动超时"
```bash
# 检查容器状态
docker compose ps

# 查看容器日志
docker compose logs postgres

# 重启容器
docker compose restart postgres
```

### 本地模式启动失败

**问题**: "PostgreSQL未安装"
```bash
brew install postgresql@15
brew services start postgresql@15
```

**问题**: "PostgreSQL启动失败"
```bash
# 检查服务状态
brew services list

# 查看日志
tail -f $(brew --prefix)/var/log/postgres.log

# 重启服务
brew services restart postgresql@15
```

**问题**: "数据库连接失败"
```bash
# 测试连接
psql -U "$USER" -d postgres -c "SELECT version();"

# 如果提示用户不存在，创建用户
psql -U "$USER" -d postgres -c "CREATE USER uteki WITH PASSWORD 'uteki_dev_pass';"
psql -U "$USER" -d postgres -c "CREATE DATABASE uteki OWNER uteki;"
```

---

## 🔗 相关文档

- [DEPLOYMENT_MODES.md](../DEPLOYMENT_MODES.md) - 详细的部署模式说明
- [STARTUP_CHECKLIST.md](../STARTUP_CHECKLIST.md) - 启动前检查清单
- [PORT_CONFIGURATION.md](../PORT_CONFIGURATION.md) - 端口配置说明

---

## 📝 脚本开发规范

### 脚本模板

```bash
#!/bin/bash
set -e  # 遇到错误立即退出

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# 检查前提条件
echo -e "${YELLOW}[1/N]${NC} 检查前提条件..."
# ...

# 执行主要任务
echo -e "${YELLOW}[2/N]${NC} 执行任务..."
# ...

# 成功提示
echo -e "${GREEN}✓ 任务完成${NC}"
```

### 命名规范

- 启动脚本: `quickstart-*.sh`
- 初始化脚本: `init-*.sh` 或 `init_*.py`
- 测试脚本: `test-*.sh` 或 `test_*.py`
- 管理脚本: `manage-*.sh`

### 最佳实践

1. ✅ 使用 `set -e` 确保错误立即停止
2. ✅ 提供彩色输出和进度提示
3. ✅ 检查前提条件并给出清晰错误信息
4. ✅ 提供详细的使用说明和故障排查建议
5. ✅ 脚本应该是幂等的（可重复运行）
